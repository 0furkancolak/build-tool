const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, adminMiddleware } = require('../authMiddleware');

// Get all domains
router.get('/', async (req, res) => {
    try {
        const domains = db.get('domains')
            .filter({ userId: req.user.id })
            .value();
        res.json(domains);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch domains' });
    }
});

// Get domain by ID
router.get('/:id', async (req, res) => {
    try {
        const domain = db.get('domains')
            .find({ id: req.params.id, userId: req.user.id })
            .value();

        if (!domain) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        res.json(domain);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch domain' });
    }
});

// Create new domain
router.post('/', async (req, res) => {
    try {
        const { name, type, config } = req.body;

        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }

        const domain = {
            id: uuidv4(),
            name,
            type,
            config: config || {},
            userId: req.user.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        db.get('domains')
            .push(domain)
            .write();

        res.status(201).json(domain);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create domain' });
    }
});

// Update domain
router.put('/:id', async (req, res) => {
    try {
        const { name, type, config } = req.body;
        const domain = db.get('domains')
            .find({ id: req.params.id, userId: req.user.id })
            .value();

        if (!domain) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        const updatedDomain = {
            ...domain,
            name: name || domain.name,
            type: type || domain.type,
            config: config || domain.config,
            updatedAt: new Date().toISOString()
        };

        db.get('domains')
            .find({ id: req.params.id })
            .assign(updatedDomain)
            .write();

        res.json(updatedDomain);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update domain' });
    }
});

// Delete domain
router.delete('/:id', async (req, res) => {
    try {
        const domain = db.get('domains')
            .find({ id: req.params.id, userId: req.user.id })
            .value();

        if (!domain) {
            return res.status(404).json({ error: 'Domain not found' });
        }

        db.get('domains')
            .remove({ id: req.params.id })
            .write();

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete domain' });
    }
});

module.exports = router; 