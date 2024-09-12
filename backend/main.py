from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx
from transformers import pipeline
import tempfile
import os
import json
import asyncio
import logging
import ollama
# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
class ChatRequest(BaseModel):
    transcription: str

class ChatResponse(BaseModel):
    response: str

class FinalPredictionRequest(BaseModel):
    name: str
    age: int
    weight: float
    symptoms: str

class FinalPredictionResponse(BaseModel):
    final_output: str

OLLAMA_API_URL = "http://localhost:11434/api/generate" 
# Initialize the Whisper pipeline
whisper_pipeline = pipeline("automatic-speech-recognition", model="openai/whisper-base")

async def query_ollama(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=30000) as client:  # increase timeout to 30 seconds
        try:
            response = await client.post(
                OLLAMA_API_URL,
                json={
                    "model": "phi3:mini-128k",
                    "prompt": prompt,
                    "stream": False
                }
            )
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Ollama API error")
            print(response)
            return response.json()["response"]
        except httpx.ReadTimeout:
            logger.warning("Timeout error occurred. Retrying...")
            # retry the request or handle the error
            

@app.get("/")
async def read_root():
    return FileResponse('static/book-appointment.ejs')


@app.post("/process_audio", response_model=ChatResponse)
async def process_audio(file: UploadFile = File(...)):
    try:
        logger.info("Received audio file for processing")

        # Save the uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            contents = await file.read()
            temp_file.write(contents)
            temp_file_path = temp_file.name

        logger.info(f"Saved temporary file: {temp_file_path}")

        # Transcribe the audio file using Whisper
        logger.info("Starting transcription with Whisper")
        result = whisper_pipeline(temp_file_path)
        transcription = result["text"]
        logger.info(f"Transcription completed: {transcription}")

        # Delete the temporary file
        os.unlink(temp_file_path)
        logger.info("Temporary file deleted")
        print('works')
        # Generate the follow-up question based on the transcription
        prompt = f"""You are a helpful medical assistant chatbot. Based on the following transcription of a patient's symptoms, generate the next most relevant follow-up question to gather more information about their symptoms. Format your response as a JSON object with a single key 'question'.

Patient's transcription: {transcription}

Your question:"""
        
        response = await query_ollama(prompt)
        print(response)
        #question = json.loads(response)
        #print(question)
        return ChatResponse(response=json.dumps({"transcription": transcription, "question": response}))

    except Exception as e:
        logger.exception("Error in process_audio")
        raise HTTPException(status_code=500, detail=f"Error processing audio: {str(e)}")

@app.post("/final_prediction", response_model=FinalPredictionResponse)
async def final_prediction(request: FinalPredictionRequest):
    try:
        prompt = f"""You are a medical diagnosis assistant. Based on the following patient information and symptoms, suggest possible diseases or conditions with their severity levels. Format your response as a string with the following structure:

Name: {request.name}
Age: {request.age}
Weight: {request.weight} kg
Predictions for possible diseases:
1. [Disease Name]: [Confidence percentage] 
2. [Disease Name]: [Confidence percentage] 
3. [Disease Name]: [Confidence percentage] 

Patient Symptoms: {request.symptoms}

Severity:[based on the symptoms]

Your diagnosis:"""

        response = await query_ollama(prompt)
        return FinalPredictionResponse(final_output=response)

    except Exception as e:
        logger.exception("Error in final_prediction")
        raise HTTPException(status_code=500, detail=f"Error making final prediction: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)