const express = require('express');
const router = express.Router();

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login');
});

// Login process
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        console.log(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
        if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Set session
        req.session.user = {
            username: process.env.ADMIN_USERNAME,
            isAdmin: true
        };

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ message: 'Login successful' });
        }

        res.redirect('/dashboard');
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

module.exports = router; 