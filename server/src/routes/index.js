const express = require('express');

const router = express.Router();
const health = require('../controllers/healthController');

router.get('/health', health.health);

router.use('/api/auth', require('./auth.routes'));
router.use('/api/users', require('./user.routes'));
router.use('/api/groups', require('./group.routes'));
router.use('/api/expenses', require('./expense.routes'));
router.use('/api/categories', require('./category.routes'));
router.use('/api/dashboard', require('./dashboard.routes'));
router.use('/api/settlements', require('./settlement.routes'));

// Catch-all: any unmatched route is forwarded to the centralized error handler.
router.use((req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
});

module.exports = router;
