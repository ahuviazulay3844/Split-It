const express = require('express');

const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { chatSchema } = require('../validators/assistant.validators');
const { handleChat } = require('../controllers/assistant.controller');

// POST /api/assistant/chat — natural-language chat that recognises and runs an action
router.post('/chat', authMiddleware, validate(chatSchema), handleChat);

module.exports = router;
