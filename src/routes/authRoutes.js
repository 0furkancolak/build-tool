const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Authentication routes
router.get('/login', authController.showLoginForm);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

// User management routes (admin only)
router.get('/users', authMiddleware, authController.showUsers);
router.post('/users', authMiddleware, authController.createUser);
router.put('/users/:id', authMiddleware, authController.updateUser);
router.delete('/users/:id', authMiddleware, authController.deleteUser);

// Password management
router.get('/change-password', authMiddleware, authController.showChangePasswordForm);
router.post('/change-password', authMiddleware, authController.changePassword);
router.post('/reset-password', authController.resetPassword);
router.get('/reset-password/:token', authController.showResetPasswordForm);
router.post('/reset-password/:token', authController.updatePassword);

// Profile management
router.get('/profile', authMiddleware, authController.showProfile);
router.put('/profile', authMiddleware, authController.updateProfile);

// API key management
router.get('/api-keys', authMiddleware, authController.showApiKeys);
router.post('/api-keys', authMiddleware, authController.createApiKey);
router.delete('/api-keys/:id', authMiddleware, authController.deleteApiKey);

// Two-factor authentication
router.get('/2fa/setup', authMiddleware, authController.show2FASetup);
router.post('/2fa/setup', authMiddleware, authController.setup2FA);
router.post('/2fa/verify', authMiddleware, authController.verify2FA);
router.post('/2fa/disable', authMiddleware, authController.disable2FA);

// Session management
router.get('/sessions', authMiddleware, authController.showSessions);
router.delete('/sessions/:id', authMiddleware, authController.terminateSession);
router.delete('/sessions', authMiddleware, authController.terminateAllSessions);

// Activity log
router.get('/activity-log', authMiddleware, authController.showActivityLog);

module.exports = router; 