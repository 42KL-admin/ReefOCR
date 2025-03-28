// Main application entry point - sets up server, middleware, routes, scheduler
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const routes = require('./routes');
const { purgeDirectories } = require('./utils'); // For scheduler

const app = express();

// --- Directory Setup ---
[config.uploadDir, config.outputDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
        console.log(`Created directory: ${dir}`);
    }
});

// --- Middleware Setup ---
app.use(express.static('public')); // Optional: If you have static assets
app.use(cors({
    origin: '*', // Be more specific in production!
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-return-json'],
    exposedHeaders: ['Content-Disposition'] // Allow client to read filename
}));
// Note: express.json() is applied specifically in routes.js for the URL endpoint

// --- Routes ---
app.use('/', routes);

// --- Scheduler Setup ---
cron.schedule('0 0 * * *', () => {
  console.log('Running daily purge task');
  purgeDirectories([config.uploadDir, config.outputDir]);
});
console.log('Cron job scheduled for daily cleanup.');

// --- Error Handling (Basic Example) ---
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).send('Something broke!');
});

// --- Start Server ---
app.listen(config.port, () => {
  console.log(`Server is running on http://localhost:${config.port}`);
});