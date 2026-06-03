
const express = require('express');
const router = express.Router();
const health = require('../controllers/healthController');

router.get('/health', health.health);

module.exports = router;
