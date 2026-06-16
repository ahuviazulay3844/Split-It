const express = require('express');

const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { get } = require('../controllers/dashboard.controller');

// GET /api/dashboard  — unified snapshot: active groups, net balance, pending settlements
router.get('/', authMiddleware, get);

module.exports = router;
