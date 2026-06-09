const express = require('express');

const router = express.Router();
const validate = require('../middleware/validate.middleware');
const { registerSchema, loginSchema } = require('../validators/auth.validators');
const { registerUser, loginUser } = require('../controllers/auth.controller');

// POST /api/auth/register — create an account and return a JWT
router.post('/register', validate(registerSchema), registerUser);

// POST /api/auth/login — authenticate and return a JWT
router.post('/login', validate(loginSchema), loginUser);

module.exports = router;
