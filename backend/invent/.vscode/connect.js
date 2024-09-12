const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

// Initialize Express app and PostgreSQL connection
const app = express();
app.use(bodyParser.json());

const pool = new Pool({
    user: 'psql postgresql://root:0AVbRHR6vw5AowCnQvsNy0DtoAGTFE0W@dpg-cr0ejrrv2p9s73a6ob3g-a.singapore-postgres.render.com/med_test_db',
    host: 'localhost',
    database: 'med_test_db',
    password: 'root',
    port: 5432,
});

// Endpoint to handle form submission and update database
app.post('/update', async (req, res) => {
    const { name, email } = req.body;

    try {
        const query = 'UPDATE users SET name = $1 WHERE email = $2';
        const values = [name, email];

        await pool.query(query, values);
        res.status(200).json({ message: 'Data updated successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update data.' });
    }
});

// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
