const express = require('express');
const router = express.Router();
const { renderHomePage } = require('../controllers/uiController');

// Home page route
router.get('/', renderHomePage);

module.exports = router;