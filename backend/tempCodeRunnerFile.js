require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const app = express();

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.use(express.static('public')); // For static files like CSS
app.use(express.urlencoded({ extended: true })); // To parse form data

// Set up PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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

// Show the booking form
app.get('/book-appointment', (req, res) => {
  res.render('book-appointment');
});

// Book an appointment with priority queue assignment
app.post('/book-appointment', async (req, res) => {
  const { patient_name, disease, severity } = req.body;

  try {
    const client = await pool.connect();

    // Get specialization based on disease
    const specialization = diseaseSpecializationMap[disease];
    if (!specialization) {
      client.release();
      return res.status(404).send('No specialization found for the entered disease.');
    }

    // Check if patient exists, otherwise insert new patient
    let patientQuery = `SELECT * FROM patients WHERE patient_name = $1 LIMIT 1;`;
    let patientResult = await client.query(patientQuery, [patient_name]);
    let patient_id;

    if (patientResult.rows.length === 0) {
      // Insert new patient if not exists
      const insertPatientQuery = `
        INSERT INTO patients (patient_id, patient_name, disease, severity)
        VALUES (gen_random_uuid(), $1, $2, $3)
        RETURNING patient_id;
      `;
      const insertPatientResult = await client.query(insertPatientQuery, [patient_name, disease, severity]);
      patient_id = insertPatientResult.rows[0].patient_id;
    } else {
      // Use existing patient_id
      patient_id = patientResult.rows[0].patient_id;
    }

    // Determine the appropriate queue number for the appointment based on severity
    const appointmentDate = new Date(); // Customize the date selection logic if needed
    const severityOrder = severityLevel[severity]; // Set severity order

    // Find the best available doctor for the given specialization
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

    // Insert the appointment into the database
    const insertAppointmentQuery = `
      INSERT INTO appointments (doctor_id, doctor_name, specialization, appointment_date, patient_id, patient_name, queue_number, disease, severity, severity_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
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
    ]);

    client.release();
    res.redirect('/appointments'); // Redirect to the appointments page after booking
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
    // Query to find doctors based on pincode1, pincode2, or pincode3
    const doctorsQuery = `
      SELECT doctor_id, doctor_name, specialization, timing, years_of_experience, department
      FROM doctors
      WHERE pincode1 = $1 OR pincode2 = $1 OR pincode3 = $1;
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


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
