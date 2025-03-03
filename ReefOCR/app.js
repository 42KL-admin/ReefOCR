const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes/api');
const uiRoutes = require('./routes/ui');

// Initialize express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(cors(config.cors));

// Routes
app.use('/', uiRoutes);
app.use('/api', apiRoutes);

// Error handling middleware
app.use(errorHandler);

// Directory purge function
const purgeDirectories = (directories) => {
  const now = new Date().getTime();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  directories.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      return;
    }

    fs.readdir(dirPath, (err, files) => {
      if (err) {
        console.error(`Error reading directory ${dir}:`, err);
        return;
      }
      
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        fs.stat(filePath, (err, stats) => {
          if (err) {
            console.error(`Error getting stats for ${filePath}:`, err);
            return;
          }
          
          // Delete files older than 1 day
          if (now - stats.mtimeMs > ONE_DAY) {
            fs.unlink(filePath, err => {
              if (err) console.error(`Error deleting ${filePath}:`, err);
              else console.log(`Deleted old file: ${filePath}`);
            });
          }
        });
      });
    });
  });
};

// Schedule daily cleanup
cron.schedule('0 0 * * *', () => {
  console.log('Running daily purge task');
  purgeDirectories(['../uploads', '../output']);
});

// Create required directories if they don't exist
['uploads', 'output'].forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Start server
app.listen(config.port, () => {
  console.log(`Server is running on http://localhost:${config.port}`);
});