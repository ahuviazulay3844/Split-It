const express = require('express');

const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { list } = require('../controllers/category.controller');

// GET /api/categories — list all expense categories (authenticated)
router.get('/', authMiddleware, list);

module.exports = router;
