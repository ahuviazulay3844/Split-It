const express = require('express');

const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { createExpenseSchema } = require('../validators/expense.validators');
const { create } = require('../controllers/expense.controller');

// POST /api/expenses  — add an expense; balances + debt graph recalculated atomically
router.post('/', authMiddleware, validate(createExpenseSchema), create);

module.exports = router;
