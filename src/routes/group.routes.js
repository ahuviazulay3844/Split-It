const express = require('express');

const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { createGroupSchema } = require('../validators/group.validators');
const { create, getMyGroups } = require('../controllers/group.controller');

// POST /api/groups  — create a new group (atomic transaction)
router.post('/', authMiddleware, validate(createGroupSchema), create);

// GET /api/groups/dashboard  — get all active groups the logged-in user belongs to
router.get('/dashboard', authMiddleware, getMyGroups);

module.exports = router;
