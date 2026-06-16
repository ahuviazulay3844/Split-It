const express = require('express');

const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { settleSchema } = require('../validators/settlement.validators');
const { settle } = require('../controllers/settlement.controller');

// POST /api/settlements/settle  — mark a debt settled + adjust balances atomically
router.post('/settle', authMiddleware, validate(settleSchema), settle);

module.exports = router;
