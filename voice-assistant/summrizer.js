const Tesseract = require('tesseract.js');
const axios = require('axios');

async function extractTextFromImage(imagePath) {
    try {
        const { data: { text } } = await Tesseract.recognize(
            imagePath,
            'eng',
            {
                logger: m => console.log(m) // Log progress
            }
        );

        // Clean the text
        const cleanedText = text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
        return cleanedText;
    } catch (error) {
        console.error('Error extracting text:', error);
        return '';
    }
}

async function summarizeText(text, maxLength = 300, minLength = 200) {
    try {
        const response = await axios.post('https://api.openai.com/v1/engines/davinci-codex/completions', {
            prompt: `Summarize the following text: ${text}`,
            max_tokens: maxLength,
            temperature: 0.7,
            top_p: 1,
            n: 1
        }, {
            headers: {
                'Authorization': `Bearer YOUR_OPENAI_API_KEY`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].text.trim();
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

// Example usage
const imagePath = "C:\\Users\\kodat\\Downloads\\original.jpg";
summarizeImage(imagePath).then(summary => console.log(summary)).catch(console.error);

