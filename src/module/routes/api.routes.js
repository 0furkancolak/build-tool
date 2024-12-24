const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, adminMiddleware } = require('../authMiddleware');

// Get all API keys for the user
router.get('/keys', authMiddleware, async (req, res) => {
    try {
        const apiKeys = db.get('apiKeys')
            .filter({ userId: req.user.id })
            .value();
        
        // Remove actual key from response for security
        const safeApiKeys = apiKeys.map(key => ({
            id: key.id,
            name: key.name,
            active: key.active,
            createdAt: key.createdAt,
            expiresAt: key.expiresAt
        }));

        res.json(safeApiKeys);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

// Generate new API key
router.post('/keys', authMiddleware, async (req, res) => {
    try {
        const { name, expiresIn } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const apiKey = {
            id: uuidv4(),
            key: uuidv4(),
            name,
            userId: req.user.id,
            active: true,
            createdAt: new Date().toISOString(),
            expiresAt: expiresIn ? new Date(Date.now() + expiresIn).toISOString() : null
        };

        db.get('apiKeys')
            .push(apiKey)
            .write();

        // Return the API key only once during creation
        res.status(201).json({
            message: 'API key created successfully. Please save this key as it won\'t be shown again.',
            apiKey: apiKey.key,
            id: apiKey.id,
            name: apiKey.name,
            expiresAt: apiKey.expiresAt
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create API key' });
    }
});

// Revoke API key
router.delete('/keys/:id', authMiddleware, async (req, res) => {
    try {
        const apiKey = db.get('apiKeys')
            .find({ id: req.params.id, userId: req.user.id })
            .value();

        if (!apiKey) {
            return res.status(404).json({ error: 'API key not found' });
        }

        db.get('apiKeys')
            .remove({ id: req.params.id })
            .write();

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to revoke API key' });
    }
});

// Update API key (activate/deactivate)
router.put('/keys/:id', authMiddleware, async (req, res) => {
    try {
        const { active } = req.body;
        const apiKey = db.get('apiKeys')
            .find({ id: req.params.id, userId: req.user.id })
            .value();

        if (!apiKey) {
            return res.status(404).json({ error: 'API key not found' });
        }

        if (typeof active !== 'boolean') {
            return res.status(400).json({ error: 'Active status must be a boolean' });
        }

        const updatedApiKey = {
            ...apiKey,
            active,
            updatedAt: new Date().toISOString()
        };

        db.get('apiKeys')
            .find({ id: req.params.id })
            .assign(updatedApiKey)
            .write();

        // Remove actual key from response
        const { key, ...safeApiKey } = updatedApiKey;
        res.json(safeApiKey);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update API key' });
    }
});

// Get API usage statistics
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const activities = db.get('activities')
            .filter({ userId: req.user.id })
            .value();

        const stats = {
            totalRequests: activities.length,
            requestsByEndpoint: {},
            requestsByDate: {}
        };

        activities.forEach(activity => {
            // Count requests by endpoint
            const endpoint = activity.action;
            stats.requestsByEndpoint[endpoint] = (stats.requestsByEndpoint[endpoint] || 0) + 1;

            // Count requests by date
            const date = activity.timestamp.split('T')[0];
            stats.requestsByDate[date] = (stats.requestsByDate[date] || 0) + 1;
        });

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch API statistics' });
    }
});

module.exports = router; 