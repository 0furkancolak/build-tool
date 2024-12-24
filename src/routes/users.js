const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/users', requireAuth, requireAdmin, userController.showUsers);
router.post('/api/users', requireAuth, requireAdmin, userController.createUser);
router.delete('/api/users/:id', requireAuth, requireAdmin, userController.deleteUser);

module.exports = router; 