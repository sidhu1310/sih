const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();
require('dotenv').config(); // Load environment variables from .env

// Setup PostgreSQL client
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Enable SSL
    }
});

// Middleware to parse request bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Home route to show dispensing form
app.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM medicines_stock');
        res.render('dispenser', { medicines: result.rows });
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

// Start the server
app.listen(process.env.PORT || 3000, () => {
    console.log('Server is running...');
});
