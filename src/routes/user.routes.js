const express = require('express');

const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { search } = require('../controllers/user.controller');

// GET /api/users/search?q=<term>  — search users by name or email
router.get('/search', authMiddleware, search);

module.exports = router;
