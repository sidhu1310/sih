//Importin Libraries
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const app = express();
const path = require('path');
const { default: ollama } = require('ollama');  // Use require if ollama is a Node.js package
const Tesseract = require('tesseract.js');
const winston = require('winston'); // Logging
const { v4: uuidv4 } = require('uuid'); // For generating unique temp file names
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const cors=require('cors');
const router = express.Router();
const pgSession = require('connect-pg-simple')(session);
const axios=require('axios');

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'static'));  // Point Express to use 'static' for views
app.use(express.static('public')); // For static files like CSS
app.use(express.urlencoded({ extended: true })); // To parse form data



// Set up PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});


app.use(session({
  store: new pgSession({
    pool: pool,  // Reuse existing PostgreSQL pool
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }  // 30 days
}));


async function fetchUserFromDatabase(username) {
  try {
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (result.rows.length > 0) {
          return result.rows[0]; // Return user object if found
      } else {
          return null; // Return null if user not found
      }
  } catch (error) {
      console.error('Database query error:', error);
      throw error; // Throw error to handle it in the login route
  }
}


// Mapping of diseases to doctor specializations
const diseaseSpecializationMap = {
  'Heart Attack': 'Cardiologist',
  'Skin Rash': 'Dermatologist',
  'Child Fever': 'Pediatrician',
  'Migraine': 'Neurologist',
  'Fracture': 'Orthopedics',
  'Kidney Stones': 'Nephrologist',
  'Diabetes': 'Endocrinologist',
  'Depression': 'Psychiatrist',
  'Cancer': 'Oncologist',
  'Asthma': 'Pulmonologist',
  'Arthritis': 'Rheumatologist',
  'UTI': 'Urologist',
  'Pregnancy': 'Gynecologist',
  'Hearing Loss': 'ENT Specialist',
};

// Severity levels mapping for priority
const severityLevel = {
  'High': 1,
  'Medium': 2,
  'Low': 3,
};

// Display the home page (index.ejs)
app.get('/', (req, res) => {
  res.render('index'); // Render index.ejs as the homepage
});

// Display all appointments with priority ordering
app.get('/appointments', async (req, res) => {
  try {
    const client = await pool.connect();
    const appointmentsQuery = `
      SELECT * FROM appointments 
      ORDER BY severity_order, appointment_date, appointment_time;
    `;
    const appointments = await client.query(appointmentsQuery);
    client.release();
    res.render('appointments', { appointments: appointments.rows });
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).send('Internal Server Error');
  }
});

//////////////////////////////////////////////
// Show the initial booking form


app.get('/book-appointment', (req, res) => {
  res.render('book-appointment');
});
app.post('/book-appointment', (req, res) => {
  const { patient_name, age, weight, pincode } = req.body;
  res.render('severity-disease', { patient_name, age, weight, pincode });
});

app.post('/confirm-appointment', async (req, res) => {
  const { patient_name, disease, severity, age, weight, pincode } = req.body;

  try {
    const client = await pool.connect();

    const specialization = diseaseSpecializationMap[disease];
    if (!specialization) {
      client.release();
      return res.status(404).send('No specialization found for the entered disease.');
    }

    let patientQuery = `SELECT * FROM patients WHERE patient_name = $1 LIMIT 1;`;
    let patientResult = await client.query(patientQuery, [patient_name]);
    let patient_id;

    if (patientResult.rows.length === 0) {
      const insertPatientQuery = `
        INSERT INTO patients (patient_id, patient_name, disease, severity, age, weight, pincode)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
        RETURNING patient_id;
      `;
      const insertPatientResult = await client.query(insertPatientQuery, [patient_name, disease, severity, age, weight, pincode]);
      patient_id = insertPatientResult.rows[0].patient_id;
    } else {
      patient_id = patientResult.rows[0].patient_id;
    }

    const appointmentDate = new Date(); 
    const severityOrder = severityLevel[severity]; 

    const findDoctorQuery = `
      SELECT * FROM doctors 
      WHERE specialization = $1 
      AND doctor_id NOT IN (
        SELECT doctor_id FROM appointments 
        WHERE appointment_date = $2
      )
      ORDER BY years_of_experience DESC 
      LIMIT 1;
    `;
    const doctorResult = await client.query(findDoctorQuery, [specialization, appointmentDate]);

    if (doctorResult.rows.length === 0) {
      client.release();
      return res.status(404).send('No available doctors for this specialization.');
    }

    const doctor = doctorResult.rows[0];
    const doctor_id = doctor.doctor_id;
    const doctor_name = doctor.doctor_name;

    const timeSlotQuery = `
      SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_queue_number
      FROM appointments
      WHERE severity_order <= $1;
    `;
    const timeSlotResult = await client.query(timeSlotQuery, [severityOrder]);
    const queue_number = timeSlotResult.rows[0].next_queue_number;

    const insertAppointmentQuery = `
      INSERT INTO appointments (doctor_id, doctor_name, specialization, appointment_date, patient_id, patient_name, queue_number, disease, severity, severity_order, age, weight, pincode)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
    `;
    await client.query(insertAppointmentQuery, [
      doctor_id,
      doctor_name,
      specialization,
      appointmentDate,
      patient_id,
      patient_name,
      queue_number,
      disease,
      severity,
      severityOrder,
      age,
      weight,
      pincode,
    ]);

    client.release();
    res.redirect('/appointments'); 
  } catch (err) {
    console.error('Error booking appointment:', err);
    res.status(500).send('Internal Server Error');
  }
});



/////////////////////////////////
// Display the bed booking form
app.get('/book-bed', (req, res) => {
  const diseaseSpecializationMap = {
    'Heart Attack': 'Cardiologist',
    'Skin Rash': 'Dermatologist',
    'Child Fever': 'Pediatrician',
    'Migraine': 'Neurologist',
    'Fracture': 'Orthopedics',
    'Kidney Stones': 'Nephrologist',
    'Diabetes': 'Endocrinologist',
    'Depression': 'Psychiatrist',
    'Cancer': 'Oncologist',
    'Asthma': 'Pulmonologist',
    'Arthritis': 'Rheumatologist',
    'UTI': 'Urologist',
    'Pregnancy': 'Gynecologist',
    'Hearing Loss': 'ENT Specialist',
  };

  res.render('book-bed', { diseaseSpecializationMap, availableBeds: null });
});

// Handle the booking request and show available beds
app.post('/book-bed', async (req, res) => {
  const { disease, bedType } = req.body;
  const specialization = diseaseSpecializationMap[disease];

  // Pseudo data for hospitals and bed availability
  const hospitals = [
    { hospital_name: 'City Hospital', specialization: 'Cardiologist', bed_type: 'ICU', available_beds: 5 },
    { hospital_name: 'Green Valley Hospital', specialization: 'Dermatologist', bed_type: 'General', available_beds: 2 },
    { hospital_name: 'Sunshine Clinic', specialization: 'Pediatrician', bed_type: 'Emergency', available_beds: 1 },
    { hospital_name: 'Health Care Center', specialization: 'Neurologist', bed_type: 'ICU', available_beds: 0 },
    { hospital_name: 'Metro Hospital', specialization: 'Orthopedics', bed_type: 'General', available_beds: 3 },
  ];

  // Filter available beds based on specialization and bed type
  const availableBeds = hospitals.filter(
    (hospital) =>
      hospital.specialization === specialization &&
      hospital.bed_type === bedType &&
      hospital.available_beds > 0
  );

  res.render('book-bed', { diseaseSpecializationMap, availableBeds });
});

//////////////////////////////
//      ALL THOSE DOCTORS
// Route to display all doctors
app.get('/doctors', async (req, res) => {
  try {
    const client = await pool.connect();
    const doctorsQuery = 'SELECT doctor_id, doctor_name, specialization, timing, years_of_experience, department FROM doctors;';
    const doctorsResult = await client.query(doctorsQuery);
    client.release();
    res.render('doctors', { doctors: doctorsResult.rows });
  } catch (err) {
    console.error('Error fetching doctors:', err);
    res.status(500).send('Internal Server Error');
  }
});
///////////////////////////////////////////
// Route to display the form for searching doctors by pincode
app.get('/doctors-by-pincode', (req, res) => {
  res.render('doctors-by-pincode', { doctors: null, pincode: null });
});

// Route to handle pincode search
app.post('/doctors-by-pincode', async (req, res) => {
  const { pincode } = req.body;

  try {
    const client = await pool.connect();

    // Query to find doctors based on pincode1, pincode2, or pincode3, and associate with hospitals
    const doctorsQuery = `
      SELECT 
        d.doctor_id, 
        d.doctor_name, 
        d.specialization, 
        d.timing, 
        d.years_of_experience, 
        d.department,
        COALESCE(h1.hospital_name, '') AS hospital_for_pincode1,
        COALESCE(h2.hospital_name, '') AS hospital_for_pincode2,
        COALESCE(h3.hospital_name, '') AS hospital_for_pincode3
      FROM 
        doctors d
      LEFT JOIN 
        hospitals h1 ON d.pincode1 = h1.pincode
      LEFT JOIN 
        hospitals h2 ON d.pincode2 = h2.pincode
      LEFT JOIN 
        hospitals h3 ON d.pincode3 = h3.pincode
      WHERE 
        d.pincode1 = $1
        OR d.pincode2 = $1
        OR d.pincode3 = $1;
    `;

    const doctorsResult = await client.query(doctorsQuery, [pincode]);
    client.release();

    res.render('doctors-by-pincode', {
      doctors: doctorsResult.rows,
      pincode: pincode
    });
  } catch (err) {
    console.error('Error fetching doctors by pincode:', err);
    res.status(500).send('Internal Server Error');
  }
});

/////////////////////////////////////////////
        // this is bed section


        app.get('/allocate-beds', async (req, res) => {
          try {
            const result = await pool.query(`
              WITH severity_allocation AS (
                SELECT 
                    a.patient_id,
                    p.patient_name,
                    a.doctor_id,
                    d.doctor_name,
                    a.disease,
                    a.severity,
                    a.severity_order,
                    a.queue_number
                FROM appointments a
                JOIN patients p ON a.patient_id = p.patient_id
                JOIN doctors d ON a.doctor_id = d.doctor_id
                JOIN severity_ranking s ON a.severity = s.severity
                ORDER BY s.priority, a.queue_number
              )
              INSERT INTO beds (patient_id, patient_name, doctor_id, doctor_name, disease, severity, severity_order, queue_number)
              SELECT 
                  patient_id,
                  patient_name,
                  doctor_id,
                  doctor_name,
                  disease,
                  severity,
                  severity_order,
                  queue_number
              FROM severity_allocation
              RETURNING *;
            `);
            res.render('beds', { beds: result.rows });
          } catch (err) {
            console.error('Error allocating beds:', err);
            res.status(500).send('Internal Server Error');
          }
        });

//////////////////////////////////////////
//summerizer.js
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname)); 
  }
});
const upload = multer({ storage: storage });


// Route to render the form
app.get('/summerizer-image', (req, res) => {
  res.render('severity-disease', { summary: null,patient_name });
});

// Route to handle image upload and summarization
app.post('/summerizer-image', upload.single('image'), async (req, res) => {
  const { patient_name } = req.body;
  const imagePath = req.file.path;

  try {
    const summary = await summarizeImage(imagePath,patient_name);
    res.render('severity-disease', { summary });
  } catch (error) {
    console.error('Error:', error);
    res.render('severity-disease', { summary: 'Error processing the image.' });
  }
});

async function extractTextFromImage(imagePath) {
  try {
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
      logger: m => console.log(m)
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
    console.log(Object.keys(ollama));
    const response = await ollama.chat({
      model: 'llama3.1',
      messages: [{ role: 'user', content: "Summarize the following text such that only the medical related information should be concentrated and given it in a concise manner covering everything: " + text }],
    });

    return response.message.content;
  } catch (error) {
    console.error('Error summarizing text:', error);
    return '';
  }
}
async function summarizeImage(imagePath, patient_name, maxLength = 300, minLength = 200) {
  try {
    // Extract text from the image using Tesseract or another method
    const text = await extractTextFromImage(imagePath);
    
    if (text) {
      // Summarize the extracted text
      const summary = await summarizeText(text, maxLength, minLength);
      
      // Update the 'summarizer' column in the 'patients' table for the given patient_name
     
      return summary;
    } else {
      return "No text found in the image.";
    }
  } catch (error) {
    console.error("Error in summarizing image or updating the database:", error);
    throw error;  // Re-throw the error to be handled further up in the call chain
  }
}

//end
//////////////////////////////////////
// chat assistant.js

const OLLAMA_API_URL = "http://localhost:11434/api/generate";

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'app.log' })
  ]
});
// CORS middleware
app.use(cors());

async function queryOllama(prompt) {
  try {
      const response = await axios.post(OLLAMA_API_URL, {
          model: "llama3.1",
          prompt: prompt,
          stream: false
      }, {
          timeout: 6000000// Timeout in milliseconds (e.g., 60 seconds
          
      });
      console.log(response.data.response);
      if (response.status !== 200) {
          throw new Error('Ollama API error');
      }

      return response.data.response;
  } catch (error) {
      logger.error('Error querying Ollama API', error);
      throw error;
  }
}
app.post('/final_prediction', express.json(), async (req, res) => {
  const { name, age, weight, symptoms } = req.body;
  
  try {
      const prompt = `You are a medical diagnosis assistant. Based on the following patient information and symptoms, suggest possible diseases or conditions with their severity levels. Format your response as a string with the following structure:
      
      Name: ${name}
      Age: ${age}
      Weight: ${weight} kg
      Prediction of disease:
      1. [Disease Name]: [Confidence percentage] 
      2. [Disease Name]: [Confidence percentage] 
      3. [Disease Name]: [Confidence percentage] 
      {don't  give  any extra discription}
      Patient Symptoms: ${symptoms}
      
      Severity:[low/medium/high]
      Specialist Recomended:[ENT Specialist/ Urologist/ Oncologist/ Endocrinologist/ Gynecologist/ Cardiologist/ Ophthalmologist/ Orthopedics/ Pediatrician/ Gastroenterologist/ Neurologist/ Nephrology/ Pulmonologist/ Psychiatrist/ Rheumatologist/ Hematologist/General Medicine/Dermatologist] choose only one Specialist
      {the output is limited to 100 words only}`;

      const ollamaResponse = await queryOllama(prompt);

      await pool.query(
        'UPDATE patients SET chatbot = $1 WHERE patient_name = $2',
        [ollamaResponse, name]
      );

      res.json({ final_output: ollamaResponse });

  } catch (error) {
      logger.error('Error in final_prediction', error);
      res.status(500).json({ detail: `Error making final prediction: ${error.message}` });
  }
});

app.post('/process_audio', upload.single('file'), async (req, res) => {
  try {
      const file_path = req.file.path;         
      const file = fs.readFileSync(file_path);
      const response = await fetch(
      "https://api-inference.huggingface.co/models/openai/whisper-large-v3",          
        {
          headers: {
          Authorization:`Bearer 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`,
          'Content-Type': 'audio/wav',
        },
        method : 'POST',
        body: file,
      });
      const result = await response.json();
      console.log('Transcription:', result.text);
    
  
      const transcription = result.text;
      logger.info(`Transcription completed: ${transcription}`);

      // Remove temporary file
      fs.unlinkSync(file_path);
      logger.info('Temporary file deleted');

      // Generate the follow-up question based on the transcription
      const prompt = `You are a helpful medical assistant chatbot. Based on the following transcription of a patient's symptoms, generate the next most relevant follow-up question to gather more information about their symptoms. Format your response as a JSON object with a single key 'question'.

      Patient's transcription: ${transcription}
      
      Your question:`;

      const ollamaResponse = await queryOllama(prompt);
      let symptomslist = [];
      symptomslist.push(transcription);
      res.json({
          transcription: symptomslist.join('\n'),
          question: ollamaResponse
      });
      
  } catch (error) {
      logger.error('Error in process_audio', error);
      res.status(500).json({ detail:` Error processing audio: ${error.message}` });
  }
});
////////////////////////////////////////////////
// Route to display the registration page

// Register route

app.get('/register', (req, res) => {
  res.render('register'); // Render register.ejs page
});

app.post('/register', async (req, res) => {
  const { username, password, age, weight, mail, pincode } = req.body; // Patient name is the same as username

  try {
    // Check if the username already exists
    const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (userExists.rows.length > 0) {
      return res.status(400).send('Username already exists');
    }

    // Hash the password for security
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into users table
    await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hashedPassword]);

    // Insert into patients table with patient_id as the username
    await pool.query(
      'INSERT INTO patients (patient_id, patient_name, age, weight, mail, pincode) VALUES ($1, $2, $3, $4, $5, $6)',
      [username, username, age, weight, mail, pincode]
    );

    // Redirect to login page after successful registration
    res.redirect('/login');
  } catch (error) {
    console.error('Error during user registration:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/login', (req, res) => {
  res.render('login'); // Render login.ejs page
});
// Login Route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Fetch user from the 'users' table
    const userQuery = 'SELECT * FROM users WHERE username = $1';
    const userResult = await pool.query(userQuery, [username]);

    if (userResult.rows.length === 0) {
      return res.render('login', { error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Verify password (hashing assumed)
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.render('login', { error: 'Invalid credentials' });
    }

    // Fetch patient details
    const patientQuery = 'SELECT * FROM patients WHERE patient_name = $1';
    const patientResult = await pool.query(patientQuery, [username]);

    if (patientResult.rows.length === 0) {
      return res.render('login', { error: 'Patient details not found' });
    }

    const patient = patientResult.rows[0];

    // Store patient details in session
    req.session.userId = user.user_id;
    req.session.patientDetails = {
      patient_name: patient.patient_name,
      age: patient.age,
      weight: patient.weight,
      pincode: patient.pincode,
    };

    // Redirect to severity-disease
    res.redirect('/severity-disease');

  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Protected route - Severity Disease Page
// Example route handling in server.js
// Protected route - Severity Disease Page
// Severity Disease Page Route
// Route to render the form
app.get('/severity-disease', async (req, res) => {
  if (!req.session.userId || !req.session.patientDetails) {
    return res.redirect('/login');
  }

  const { patient_name } = req.session.patientDetails;

  try {
    // Fetch patient's summarizer and chatbot data from the database
    const patientQuery = 'SELECT summarizer, chatbot FROM patients WHERE patient_name = $1';
    const patientResult = await pool.query(patientQuery, [patient_name]);

    if (patientResult.rows.length === 0) {
      return res.status(404).send('Patient details not found');
    }

    const { summarizer, chatbot } = patientResult.rows[0];

    // Render severity-disease page with patient details
    res.render('severity-disease', {
      patient_name,
      age: req.session.patientDetails.age,
      weight: req.session.patientDetails.weight,
      pincode: req.session.patientDetails.pincode,
      summarizer,
      chatbot,
      summary: null // Ensure summary is defined here
      
    });
  } catch (err) {
    console.error('Error fetching patient details:', err);
    res.status(500).send('Internal Server Error');
  }
});
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
app.post('/severity-disease', upload.single('image'), async (req, res) => {
  if (!req.session.userId || !req.session.patientDetails) {
    return res.redirect('/login');
  }

  const { summarizer, chatbot } = req.body;
  const { patient_name } = req.session.patientDetails;

  try {
    // Handle image upload if file is present
    let summary = null;
    if (req.file) {
      const imagePath = req.file.path;
      summary = await summarizeImage(imagePath);
    }

    // Update session details
    req.session.patientDetails.summarizer = summarizer;
    req.session.patientDetails.chatbot = chatbot;
    await pool.query(
      'UPDATE patients SET summarizer = $1 WHERE patient_name = $2',
      [summary, patient_name]
    );
    
    // Render severity-disease page with updated data and summary
    res.render('severity-disease', {
      patient_name,
      age: req.session.patientDetails.age,
      weight: req.session.patientDetails.weight,
      pincode: req.session.patientDetails.pincode,
      summarizer,
      chatbot,
      summary
      // Pass the summary result to the template
    });
  } catch (err) {
    console.error('Error:', err);
    res.render('severity-disease', {
      patient_name: req.session.patientDetails.patient_name,
      age: req.session.patientDetails.age,
      weight: req.session.patientDetails.weight,
      pincode: req.session.patientDetails.pincode,
      summarizer: req.session.patientDetails.summarizer,
      chatbot: req.session.patientDetails.chatbot,
      summary: 'Error processing the image.' // Pass an error message
    });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect('/severity-disease');
    }
    res.clearCookie('connect.sid'); // Clear the session cookie
    res.redirect('/login'); // Redirect to login page after logout
  });
});

//////////////////////////////////////
// In your backend route (e.g., app.js)
// In your backend route (e.g., app.js)app.get('/patient-dashboard', async (req, res) => {
  app.get('/patient-dashboard', async (req, res) => {
    const name = req.query.name;
  
    if (!name) {
      return res.status(400).send('Name query parameter is required');
    }
  
    try {
      const query = 'SELECT patient_name, age, weight, mail, pincode, chatbot,summarizer,severity, disease FROM patients WHERE patient_name = $1';
      const result = await pool.query(query, [name]);
  
      if (result.rows.length === 0) {
        return res.status(404).send('Patient not found');
      }
  
      console.log('Query Result:', result.rows[0]);
  
      const patientData = result.rows[0];
      const data = extractPatientInfo(patientData.chatbot);
      
      // Update severity based on extracted data
      const updateQuery = 'UPDATE patients SET severity = $1,disease = $2 WHERE patient_name= $3 RETURNING *';
      const updateResult = await pool.query(updateQuery, [data.severity, data.highestDisease,name]);
  
      console.log('Update Result:', updateResult.rows[0]); 
      const refreshedResult = await pool.query(query, [name]);
      const refreshedPatientData = refreshedResult.rows[0];
  
      // Determine specialist based on disease or other logic
      const specialist = data.specialist || 'General Practitioner'; // Use extracted specialist or default
  
      // Render the patient-dashboard.ejs template and pass the patient data to it
      res.render('patient-dashboard', { patient: refreshedPatientData, specialist });
  
    } catch (error) {
      console.error('Error fetching patient data:', error);
      res.status(500).send('Server error');
    }
  });

// module.exports = router;
/////////////////////////////////////
//inventory
app.get('/', async (req, res) => {
  try {
      const result = await pool.query('SELECT * FROM medicines_stock');
      res.render('/dispenser', { medicines: result.rows });
  } catch (error) {
      console.error('Error fetching medicines:', error);
      res.status(500).send('Internal Server Error');
  }
});
app.get('/dispenser', async (req, res) => {
  try {
      const result = await pool.query('SELECT * FROM medicines_stock');
      res.render('dispenser', { medicines: result.rows }); // Ensure this file exists in your views directory
  } catch (error) {
      console.error('Error fetching medicines:', error);
      res.status(500).send('Internal Server Error');
  }
});

// Route to handle dispensing form submission
app.post('/dispense', async (req, res) => {
  const { medicine_name, quantity, dosage } = req.body;
  try {
      // Check if the medicine exists and has enough quantity
      const result = await pool.query('SELECT quantity FROM medicines_stock WHERE medicine_name = $1', [medicine_name]);
      const medicine = result.rows[0];

      if (medicine && medicine.quantity >= quantity) {
          await pool.query(`
              UPDATE medicines_stock
              SET quantity = quantity - $1,
                  dispensed = TRUE,
                  dispensed_date = CURRENT_DATE
              WHERE medicine_name = $2
                AND quantity >= $1
          `, [quantity, medicine_name]);
          res.redirect('/dashboard');
      } else {
          res.status(400).send('Not enough quantity or medicine not found');
      }
  } catch (error) {
      console.error('Error dispensing medicine:', error);
      res.status(500).send('Internal Server Error');
  }
});

// Route to show all medicines (dashboard)
app.get('/dashboard', async (req, res) => {
  try {
      const result = await pool.query('SELECT * FROM medicines_stock');
      res.render('med_dash', { medicines: result.rows });
  } catch (error) {
      console.error('Error fetching medicines:', error);
      res.status(500).send('Internal Server Error');
  }
});



///////////////////////////////////////////////////////
/////////////////////////////////////////
          // live consultancy

          app.get('/live-consultation', async (req, res) => {
            const { pincode, name, specialist } = req.query;
        
            if (!pincode || !name || !specialist) {
                return res.status(400).send('Pincode, name, and specialization query parameters are required');
            }
        
            try {
                // Fetch hospitals based on pincode
                const hospitalsQuery = 'SELECT * FROM hospitals WHERE pincode = $1';
                const hospitalsResult = await pool.query(hospitalsQuery, [pincode]);
        
                // Fetch doctors based on pincode and specialization
                const doctorsQuery = `
                  SELECT 
                    d.doctor_id, 
                    d.doctor_name, 
                    d.specialization, 
                    d.timing, 
                    d.years_of_experience, 
                    d.department,
                    COALESCE(h1.hospital_name, '') AS hospital_for_pincode1
                  FROM 
                    doctors d
                  LEFT JOIN 
                    hospitals h1 ON d.pincode1 = h1.pincode
                  WHERE 
                    (d.pincode1 = $1 OR d.pincode2 = $1 OR d.pincode3 = $1)
                    AND d.specialization = $2;
                `;
                const doctorsResult = await pool.query(doctorsQuery, [pincode, specialist]);
        
                // If no doctors are found for the pincode, fetch doctors based on specialization only
                let doctors = doctorsResult.rows;
                if (doctors.length === 0) {
                    const fallbackDoctorsQuery = `
                      SELECT 
                        d.doctor_id, 
                        d.doctor_name, 
                        d.specialization, 
                        d.timing, 
                        d.years_of_experience, 
                        d.department,
                        COALESCE(h1.hospital_name, '') AS hospital_for_pincode1
                      FROM 
                        doctors d
                      LEFT JOIN 
                        hospitals h1 ON d.pincode1 = h1.pincode
                      WHERE 
                        d.specialization = $1;
                    `;
                    const fallbackDoctorsResult = await pool.query(fallbackDoctorsQuery, [specialist]);
                    doctors = fallbackDoctorsResult.rows;
                }
        
                // Render the live-consultation.ejs template and pass the data
                res.render('live-consultation', {
                    pincode,
                    hospitals: hospitalsResult.rows,
                    doctors: doctors,
                    specialist
                });
            } catch (error) {
                console.error('Error fetching data:', error);
                res.status(500).send('Server error');
            }
        });
        
        // Route to handle live consultation by pincode
// live consultancy route to handle both displaying doctors and booking appointments
// live consultancy route to handle both displaying doctors and booking appointments
app.post('/live-consultation', async (req, res) => {
  const { doctor_id, doctor_name, specialization, pincode, patient_name, age, weight, mail, severity, disease } = req.body;

  // If doctor_id exists, it means the form was submitted for booking
  if (doctor_id) {
    try {
      const query = `
        INSERT INTO appointments (
          doctor_id, 
          doctor_name, 
          specialization, 
          appointment_date, 
          pincode,
          patient_name,
          age,
          weight,
          mail,
          severity,
          disease
       
        ) 
        VALUES (
          $1, 
          $2, 
          $3, 
          CURRENT_DATE, 
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10

        );
      `;
      const values = [doctor_id, doctor_name, specialization, pincode, patient_name, age, weight, mail, severity, disease];
      await pool.query(query, values);

      res.send('Appointment booked successfully!');
    } catch (error) {
      console.error('Error booking appointment:', error);
      res.status(500).send('Internal Server Error');
    }
  } else {
    // Display doctors as usual if no form data is submitted
    const { pincode, name, specialist } = req.query;

    if (!pincode || !name || !specialist) {
      return res.status(400).send('Pincode, name, and specialization query parameters are required');
    }

    try {
      const hospitalsQuery = 'SELECT * FROM hospitals WHERE pincode = $1';
      const hospitalsResult = await pool.query(hospitalsQuery, [pincode]);

      const doctorsQuery = `
        SELECT 
          d.doctor_id, 
          d.doctor_name, 
          d.specialization, 
          d.timing, 
          d.years_of_experience, 
          d.department,
          COALESCE(h1.hospital_name, '') AS hospital_for_pincode1
        FROM 
          doctors d
        LEFT JOIN 
          hospitals h1 ON d.pincode1 = h1.pincode
        WHERE 
          (d.pincode1 = $1 OR d.pincode2 = $1 OR d.pincode3 = $1)
          AND d.specialization = $2;
      `;
      const doctorsResult = await pool.query(doctorsQuery, [pincode, specialist]);

      let doctors = doctorsResult.rows;
      if (doctors.length === 0) {
        const fallbackDoctorsQuery = `
          SELECT 
            d.doctor_id, 
            d.doctor_name, 
            d.specialization, 
            d.timing, 
            d.years_of_experience, 
            d.department,
            COALESCE(h1.hospital_name, '') AS hospital_for_pincode1
          FROM 
            doctors d
          LEFT JOIN 
            hospitals h1 ON d.pincode1 = h1.pincode
          WHERE 
            d.specialization = $1;
        `;
        const fallbackDoctorsResult = await pool.query(fallbackDoctorsQuery, [specialist]);
        doctors = fallbackDoctorsResult.rows;
      }

      res.render('live-consultation', {
        pincode,
        hospitals: hospitalsResult.rows,
        doctors: doctors,
        specialist
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      res.status(500).send('Server error');
    }
  }
});

/////////////////////////////////////
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on https://localhost:${PORT}`);
});
