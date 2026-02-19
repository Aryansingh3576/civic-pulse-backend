const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.json({ message: 'Civic Issue Reporting API is running', status: 'OK' });
});

app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/complaints', require('./routes/complaintRoutes'));

app.use((req, res) => {
    res.status(404).json({ status: 'fail', message: 'Route not found: ' + req.originalUrl });
});

app.use((err, req, res, next) => {
    var statusCode = err.statusCode || 500;
    var status = err.status || 'error';
    var message = err.isOperational ? err.message : 'Something went wrong!';

    // Handle Mongoose CastError (invalid ObjectId)
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        statusCode = 400;
        status = 'fail';
        message = 'Invalid ID format';
    }
    // Handle Mongoose ValidationError
    if (err.name === 'ValidationError') {
        statusCode = 400;
        status = 'fail';
        message = Object.values(err.errors).map(e => e.message).join(', ');
    }
    // Handle payload too large
    if (err.type === 'entity.too.large') {
        statusCode = 413;
        status = 'fail';
        message = 'Request payload too large. Please use a smaller image.';
    }

    // Always log errors so they appear in Render/deployment logs
    console.error('ERROR:', err.message);
    if (err.stack) console.error(err.stack);
    res.status(statusCode).json({ status: status, message: message });
});

app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
