const patientData = `
rahul22
Age: 20
Weight: 58 kg
Prediction of disease:
1. Tonsillitis: 80 
2. Adenoiditis: 70 
3. Sinusitis: 60 
Patient Symptoms: Ta-ta
Severity: medium
Specialist Recommended: ENT Specialist
`;

// Function to extract information
function extractPatientInfo(data) {
    // Extract severity
    const severityMatch = data.match(/Severity:\s*(\w+)/);
    const severity = severityMatch ? severityMatch[1] : 'Unknown';

    // Extract specialist recommendation
    const specialistMatch = data.match(/Specialist Recommended:\s*([\w\s]+)/);
    const specialist = specialistMatch ? specialistMatch[1].trim() : 'Unknown';

    // Extract prediction of diseases
    const predictionMatch = data.match(/Prediction of disease:([\s\S]*?)Patient Symptoms:/);
    const predictionText = predictionMatch ? predictionMatch[1].trim() : '';

    // Find the disease with the highest percentage
    const diseasePattern = /(\d+)\.\s*([A-Za-z]+):\s*(\d+)/g;
    let highestDisease = '';
    let highestPercentage = -1;
    let match;

    while ((match = diseasePattern.exec(predictionText)) !== null) {
        const disease = match[2];
        const percentage = parseInt(match[3], 10);

        if (percentage > highestPercentage) {
            highestDisease = disease;
            highestPercentage = percentage;
        }
    }

    return {
        highestDisease,
        specialist,
        severity
    };
}

// Extract information from the string
const patientInfo = extractPatientInfo(patientData);

console.log("Highest Prediction of Disease:", patientInfo.highestDisease);
console.log("Specialist Recommended:", patientInfo.specialist);
console.log("Severity:", patientInfo.severity);
