const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
require('dotenv').config();

// Debugging to verify environment variables
console.log('JWT_SECRET Loaded:', process.env.JWT_SECRET ? 'YES' : 'NO');
console.log('Database:', process.env.DB_NAME);

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('combined'));

// PostgreSQL Pool configuration
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Nodemailer configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Swagger documentation setup
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Auto Service API',
            version: '1.0.0',
            description: 'API documentation for the Auto Service application.',
        },
        servers: [{ url: 'http://127.0.0.1:3000' }],
    },
    apis: ['./server.js'], // File location for Swagger docs
};
const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Middleware to authenticate users
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).send('Access denied. No token provided.');
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT Verification Error:', err.message);
            return res.status(403).send('Invalid token.');
        }
        req.user = user; // Attach user info to the request object
        next();
    });
};

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
    } else {
        console.log('Database connected successfully:', res.rows[0]);
    }
});

// Serve static files (for frontend)
app.use(express.static(path.join(__dirname, 'frontend-build')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend-build', 'index.html'));
});

// Root route
app.get('/', (req, res) => {
    res.send('Server is working!');
});

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: User already exists
 *       500:
 *         description: Server error
 */
app.post('/register', async (req, res) => {
    const { username, email, password, role } = req.body;

    try {
        if (!username || !email || !password || !role) {
            return res.status(400).send('All fields are required');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
            [username, email, hashedPassword, role]
        );

        res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).send('User with this username or email already exists');
        } else {
            console.error('Error registering user:', err.message);
            res.status(500).send('Server error');
        }
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).send('Email and password are required');
        }

        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).send('Invalid credentials');
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).send('Invalid credentials');
        }

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.json({ message: 'Login successful', token });
    } catch (err) {
        console.error('Error logging in:', err.message);
        res.status(500).send('Server error');
    }
});

// Fetch services
app.get('/services', async (req, res) => {
    const { location, maxRate, availableDay } = req.query;

    try {
        let query = 'SELECT * FROM service WHERE 1=1';
        const values = [];

        if (location) {
            query += ' AND LOWER(location) LIKE LOWER($1)';
            values.push(`%${location}%`);
        }

        if (maxRate) {
            query += ` AND hourly_rate <= $${values.length + 1}`;
            values.push(maxRate);
        }

        if (availableDay) {
            query += ` AND available_slots->>'${availableDay}' IS NOT NULL`;
        }

        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching services:', err.message);
        res.status(500).send('Server error');
    }
});

// Add new service
app.post('/services', async (req, res) => {
    try {
        const { name, location, contact_info, hourly_rate, available_slots } = req.body;

        const result = await pool.query(
            'INSERT INTO service (name, location, contact_info, hourly_rate, available_slots) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, location, contact_info, hourly_rate, available_slots]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding service:', err.message);
        res.status(500).send('Server error');
    }
});

// Book a service with email notification
app.post('/services/:id/book', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { client_name, client_email, date, time } = req.body;

    try {
        const serviceResult = await pool.query('SELECT * FROM service WHERE id = $1', [id]);
        if (serviceResult.rows.length === 0) {
            return res.status(404).send('Service not found');
        }

        const bookingCheck = await pool.query(
            'SELECT * FROM bookings WHERE service_id = $1 AND date = $2 AND time = $3',
            [id, date, time]
        );
        if (bookingCheck.rows.length > 0) {
            return res.status(400).send('This slot is already booked');
        }

        const bookingResult = await pool.query(
            'INSERT INTO bookings (service_id, client_name, date, time) VALUES ($1, $2, $3, $4) RETURNING *',
            [id, client_name, date, time]
        );

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: client_email,
            subject: 'Booking Confirmation',
            text: `Dear ${client_name},\n\nYour booking for ${serviceResult.rows[0].name} on ${date} at ${time} has been confirmed.\n\nThank you for choosing our service!`,
        };

        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error('Error sending email:', err.message);
                return res.status(500).send('Booking confirmed, but email failed');
            }
            console.log('Email sent:', info.response);
        });

        res.status(201).json({
            message: 'Booking confirmed and email sent',
            booking: bookingResult.rows[0],
        });
    } catch (err) {
        console.error('Error booking service:', err.message);
        res.status(500).send('Server error');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://127.0.0.1:${port}`);
});

