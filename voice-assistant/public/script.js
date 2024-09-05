document.addEventListener('DOMContentLoaded', () => {
  const recordButton = document.getElementById('recordButton');
  const resultDiv = document.getElementById('result');
  let mediaRecorder;
  let audioChunks = [];

  recordButton.addEventListener('click', () => {
    if (recordButton.innerText === 'Start Recording') {
      startRecording();
    } else {
      stopRecording();
    }
  });

  const startRecording = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });

          try {
            const transcript = await uploadAndTranscribeAudio(audioBlob);
            resultDiv.innerText = transcript;
          } catch (error) {
            console.error('Error during transcription:', error);
            resultDiv.innerText = 'Transcription failed. Please try again.';
          }
        };

        mediaRecorder.start();
        recordButton.innerText = 'Stop Recording';
      } catch (error) {
        console.error('Error accessing microphone:', error);
        resultDiv.innerText = 'Error accessing microphone. Please check permissions.';
      }
    } else {
      console.error('Browser does not support getUserMedia');
      resultDiv.innerText = 'Browser does not support recording.';
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      recordButton.innerText = 'Start Recording';
    } else {
      resultDiv.innerText = 'No recording in progress.';
    }
  };

  const uploadAndTranscribeAudio = async (audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');

    const uploadResponse = await fetch('/upload', {  // Backend endpoint to handle file upload
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    const { upload_url } = await uploadResponse.json();

    const transcriptResponse = await fetch('/transcribe', {  // Backend endpoint for transcription
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audio_url: upload_url }),
    });

    if (!transcriptResponse.ok) {
      throw new Error(`Transcription request failed: ${transcriptResponse.statusText}`);
    }

    const { text } = await transcriptResponse.json();
    return text;
  };
});
