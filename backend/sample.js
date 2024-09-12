const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://root:0AVbRHR6vw5AowCnQvsNy0DtoAGTFE0W@dpg-cr0ejrrv2p9s73a6ob3g-a.singapore-postgres.render.com/med_test_db",
  ssl: {
    rejectUnauthorized: false
  }
});

// Function to get all tables in the database
async function showTables() {
  try {
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public'`
    );
    console.log("Tables in the database:");
    result.rows.forEach(row => console.log(row.table_name));
  } catch (error) {
    console.error("Error fetching tables:", error);
  }
}

// Function to get data from the patients table
async function showPatients() {
  try {
    const result = await pool.query('SELECT * FROM patients');
    console.log("Data from patients table:");
    result.rows.forEach(row => console.log(row));
  } catch (error) {
    console.error("Error fetching patients data:", error);
  }
}

// Execute both functions
(async () => {
  await showTables();
  await showPatients();
  pool.end();
})();
