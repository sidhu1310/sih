const multer = require('multer');
const path = require('path');
const ollama = require('ollama');  // Use require if ollama is a Node.js package
const Tesseract = require('tesseract.js');

// Multer setup for image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Save with timestamp to avoid name conflicts
    }
});

const upload = multer({ storage: storage });

app.get('/summarize-image', (req, res) => {
    res.render('summarize-image', { summary: null });
});

app.post('/summarize-image', upload.single('image'), async (req, res) => {
    const imagePath = req.file.path; // Path to the uploaded image

    try {
        const summary = await summarizeImage(imagePath);
        res.render('summarize-image', { summary });
    } catch (error) {
        console.error('Error:', error);
        res.render('summarize-image', { summary: 'Error processing the image.' });
    }
});

async function extractTextFromImage(imagePath) {
    try {
        const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
            logger: m => console.log(m) // Log progress
        });

        const cleanedText = text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
        return cleanedText;
    } catch (error) {
        console.error('Error extracting text:', error);
        return '';
    }
}

async function summarizeText(text, maxLength = 150, minLength = 200) {
    try {
        const response = await ollama.chat({
            model: 'phi3:mini-128k',
            messages: [{ role: 'user', content: "Summarize the following. Make sure it's as dense as possible: " + text }],
        });

        return response.message.content;
    } catch (error) {
        console.error('Error summarizing text:', error);
        return '';
    }
}

async function summarizeImage(imagePath, maxLength = 300, minLength = 200) {
    const text = await extractTextFromImage(imagePath);
    if (text) {
        const summary = await summarizeText(text, maxLength, minLength);
        return summary;
    } else {
        return "No text found in the image.";
    }
}
