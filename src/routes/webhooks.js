const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// GitHub webhook
router.post('/api/webhooks/github/:projectId', express.json(), webhookController.handleGithubWebhook.bind(webhookController));

// Jenkins webhook
router.post('/api/webhooks/jenkins/:projectId', express.json(), webhookController.handleJenkinsWebhook.bind(webhookController));

module.exports = router; 