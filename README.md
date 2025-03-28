# CareConnect - A Medical Assistance Web App

## Project Description

**Medicure** is a web-based application that leverages AI, OCR, and cloud APIs to assist users in efficiently managing medical records, prescriptions, and health-related documents. The platform includes **text extraction from images (OCR), secure data storage, speech recognition, AI-based medical diagnosis, bed allocation management, and inventory management.**

## Features

- **OCR Integration:** Uses Tesseract.js to extract text from medical prescriptions and reports.
- **Speech Recognition:** Utilizes Whisper Small for accurate speech-to-text conversion.
- **Medical Diagnosis:** Implements LLaMA 3.1 8B as an AI agent for medical analysis and recommendations.
- **Bed Allocation Management:** Helps hospitals efficiently assign and track bed usage.
- **Inventory Management:** Monitors medical supplies and ensures timely restocking.
- **Secure Authentication:** Uses bcrypt for password hashing and express-session for session management.
- **File Upload & Storage:** Supports document uploads with Multer and express-fileupload.
- **Speech Synthesis:** Converts extracted text to speech using gtts (Google Text-to-Speech).
- **Database Management:** Stores data securely using PostgreSQL with connect-pg-simple.

## Tech Stack

- **Backend:** Node.js, Express.js
- **Frontend:** EJS (Embedded JavaScript), HTML, CSS
- **Database:** PostgreSQL
- **OCR & AI:** Tesseract.js, Google APIs, Whisper Small, LLaMA 3.1 8B
- **Security:** bcrypt, express-session
- **AI Model Management:** Ollama

## Installation & Execution

### Prerequisites

- **Node.js** (v14+ recommended)
- **PostgreSQL** (for database management)
- **Tesseract-OCR** (for text recognition)
- **Google Cloud API Key** (for Google services)
- **Ollama** (for AI model execution)
- **Whisper Small** (for speech recognition)
- **LLaMA 3.1 8B** (for medical diagnosis)

### Steps to Run the Project

1. **Clone the Repository**

   ```sh
   git clone https://github.com/sidhu1310/sih.git
   cd sih
   ```

2. **Install Dependencies**

   ```sh
   npm install
   ```

3. **Set Up Environment Variables**

   Create a `.env` file in the project root and add:

   ```sh
   DATABASE_URL=postgres://username:password@localhost:5432/medicure_db
   GOOGLE_API_KEY=your_google_api_key
   SESSION_SECRET=your_secret_key
   ```

4. **Start PostgreSQL & Create Database**

   ```sh
   psql -U postgres -c "CREATE DATABASE medicure_db;"
   ```

5. **Run the Server**

   ```sh
   node server.js
   ```

6. **Access the Application**

   Open your browser and visit `http://localhost:3000`

7. **Run AI Services (Optional)**

   - Start Ollama to manage AI models.
   - Deploy Whisper Small for speech recognition.
   - Use LLaMA 3.1 8B for medical diagnosis.

## Contributors

- **K. Sidhartha Rao** ([GitHub](https://github.com/sidhu1310))
- **S. Srinija** ([GitHub](https://github.com/Srinija1102))
- **P. Rahul** ([GitHub](https://github.com/rahul5892))
- **U. Sathwik** ([GitHub](https://github.com/Sathwik0862))

## License

This project is licensed under the MIT License.
