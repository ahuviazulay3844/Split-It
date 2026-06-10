const express = require('express');

const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { createGroupSchema } = require('../validators/group.validators');
const { create, getMyGroups } = require('../controllers/group.controller');
const { getMyBalance, getOverview } = require('../controllers/balance.controller');
const { list: listExpenses } = require('../controllers/expense.controller');

// POST /api/groups  — create a new group (atomic transaction)
router.post('/', authMiddleware, validate(createGroupSchema), create);

// GET /api/groups/dashboard  — get all active groups the logged-in user belongs to
router.get('/dashboard', authMiddleware, getMyGroups);

// GET /api/groups/:groupId/expenses  — list the group's expenses (members only)
router.get('/:groupId/expenses', authMiddleware, listExpenses);

// GET /api/groups/:groupId/balance  — personal "who I owe / who owes me" snapshot
router.get('/:groupId/balance', authMiddleware, getMyBalance);

// GET /api/groups/:groupId/overview  — full group view: balances + simplified transfers
router.get('/:groupId/overview', authMiddleware, getOverview);

module.exports = router;
