const express = require('express');

const router = express.Router();
const health = require('../controllers/healthController');

router.get('/health', health.health);

router.use('/api/users', require('./user.routes'));
router.use('/api/groups', require('./group.routes'));

module.exports = router;
