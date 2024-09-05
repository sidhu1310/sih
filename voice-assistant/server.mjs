import express from 'express';
import fileUpload from 'express-fileupload';
import fetch from 'node-fetch';  // Import fetch as an ESM module
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));  // Serve static files (e.g., HTML, CSS, JS)

const API_KEY = '20f72b5bbef14e7ab265c48aec019de3';
const ASSEMBLYAI_UPLOAD_URL = 'https://api.assemblyai.com/v2/upload';
const ASSEMBLYAI_TRANSCRIBE_URL = 'https://api.assemblyai.com/v2/transcript';

app.post('/upload', async (req, res) => {
  const file = req.files.file;
  const filePath = path.join(__dirname, 'uploads', file.name);

  file.mv(filePath, async (err) => {
    if (err) return res.status(500).send(err);

    try {
      const response = await fetch(ASSEMBLYAI_UPLOAD_URL, {
        method: 'POST',
        headers: {
          Authorization: API_KEY,
        },
        body: fs.createReadStream(filePath),
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const { upload_url } = await response.json();
      res.json({ upload_url });
    } catch (error) {
      res.status(500).send(error.message);
    } finally {
      fs.unlinkSync(filePath);  // Clean up the uploaded file
    }
  });
});

app.post('/transcribe', async (req, res) => {
  const { audio_url } = req.body;

  try {
    const response = await fetch(ASSEMBLYAI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: {
        Authorization: API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audio_url }),
    });

    if (!response.ok) {
      throw new Error(`Transcription request failed: ${response.statusText}`);
    }

    const { id } = await response.json();
    const transcriptResult = await checkTranscriptionStatus(id);
    res.json(transcriptResult);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

const checkTranscriptionStatus = async (id) => {
  const response = await fetch(`${ASSEMBLYAI_TRANSCRIBE_URL}/${id}`, {
    headers: {
      Authorization: API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.status === 'completed') {
    return { text: result.text };
  } else if (result.status === 'failed') {
    throw new Error('Transcription failed.');
  } else {
    await new Promise(resolve => setTimeout(resolve, 5000));  // Wait 5 seconds before polling again
    return checkTranscriptionStatus(id);  // Recursive call to check status
  }
};

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
