const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { handleUpload, handleImageUrl } = require('../controllers/imageController');

// Handle file uploads
router.post('/upload', upload.single('file'), handleUpload);

// Handle image URL processing
router.post('/process-url', handleImageUrl);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;