const bcrypt = require('bcryptjs');
const db = require('../config/database');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

class AuthController {
    // Login ve Authentication
    showLoginForm(req, res) {
        res.render('auth/login');
    }

    async login(req, res) {
        const { username, password } = req.body;

        try {
            const user = db.get('users')
                .find({ username })
                .value();

            if (user && (await bcrypt.compare(password, user.password))) {
                req.session.user = user;
                res.redirect('/dashboard');
            } else {
                res.render('auth/login', { error: 'Invalid credentials' });
            }
        } catch (error) {
            res.render('auth/login', { error: 'Login failed' });
        }
    }

    logout(req, res) {
        req.session.destroy();
        res.redirect('/login');
    }

    // User Management
    async showUsers(req, res) {
        try {
            const users = db.get('users').value();
            res.render('auth/users', { users });
        } catch (error) {
            res.status(500).send('Error fetching users');
        }
    }

    async createUser(req, res) {
        try {
            const { username, password, role } = req.body;
            const hashedPassword = await bcrypt.hash(password, 10);
            
            const newUser = {
                id: uuidv4(),
                username,
                password: hashedPassword,
                role: role || 'user',
                createdAt: new Date()
            };

            db.get('users')
                .push(newUser)
                .write();

            res.redirect('/users');
        } catch (error) {
            res.status(500).send('Error creating user');
        }
    }

    async updateUser(req, res) {
        try {
            const { id } = req.params;
            const { username, role } = req.body;

            db.get('users')
                .find({ id })
                .assign({ username, role })
                .write();

            res.redirect('/users');
        } catch (error) {
            res.status(500).send('Error updating user');
        }
    }

    async deleteUser(req, res) {
        try {
            const { id } = req.params;
            
            db.get('users')
                .remove({ id })
                .write();

            res.redirect('/users');
        } catch (error) {
            res.status(500).send('Error deleting user');
        }
    }

    // Password Management
    showChangePasswordForm(req, res) {
        res.render('auth/change-password');
    }

    async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            const user = db.get('users')
                .find({ id: req.session.user.id })
                .value();

            if (await bcrypt.compare(currentPassword, user.password)) {
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                
                db.get('users')
                    .find({ id: req.session.user.id })
                    .assign({ password: hashedPassword })
                    .write();

                res.redirect('/dashboard');
            } else {
                res.render('auth/change-password', { error: 'Current password is incorrect' });
            }
        } catch (error) {
            res.status(500).send('Error changing password');
        }
    }

    async resetPassword(req, res) {
        try {
            const { email } = req.body;
            const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });
            // Implement password reset email sending logic here
            res.send('Password reset instructions sent to your email');
        } catch (error) {
            res.status(500).send('Error initiating password reset');
        }
    }

    showResetPasswordForm(req, res) {
        const { token } = req.params;
        res.render('auth/reset-password', { token });
    }

    async updatePassword(req, res) {
        try {
            const { token } = req.params;
            const { password } = req.body;
            
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const hashedPassword = await bcrypt.hash(password, 10);

            db.get('users')
                .find({ email: decoded.email })
                .assign({ password: hashedPassword })
                .write();

            res.redirect('/login');
        } catch (error) {
            res.status(500).send('Error resetting password');
        }
    }

    // Profile Management
    showProfile(req, res) {
        res.render('auth/profile', { user: req.session.user });
    }

    async updateProfile(req, res) {
        try {
            const { username, email } = req.body;
            
            db.get('users')
                .find({ id: req.session.user.id })
                .assign({ username, email })
                .write();

            req.session.user = { ...req.session.user, username, email };
            res.redirect('/profile');
        } catch (error) {
            res.status(500).send('Error updating profile');
        }
    }

    // API Key Management
    showApiKeys(req, res) {
        const apiKeys = db.get('apiKeys')
            .filter({ userId: req.session.user.id })
            .value();
        res.render('auth/api-keys', { apiKeys });
    }

    createApiKey(req, res) {
        const apiKey = {
            id: uuidv4(),
            userId: req.session.user.id,
            key: uuidv4(),
            createdAt: new Date()
        };

        db.get('apiKeys')
            .push(apiKey)
            .write();

        res.redirect('/api-keys');
    }

    deleteApiKey(req, res) {
        const { id } = req.params;
        
        db.get('apiKeys')
            .remove({ id, userId: req.session.user.id })
            .write();

        res.redirect('/api-keys');
    }

    // Two-Factor Authentication
    show2FASetup(req, res) {
        res.render('auth/2fa-setup');
    }

    setup2FA(req, res) {
        // Implement 2FA setup logic
        res.redirect('/profile');
    }

    verify2FA(req, res) {
        // Implement 2FA verification logic
        res.redirect('/dashboard');
    }

    disable2FA(req, res) {
        // Implement 2FA disable logic
        res.redirect('/profile');
    }

    // Session Management
    showSessions(req, res) {
        const sessions = db.get('sessions')
            .filter({ userId: req.session.user.id })
            .value();
        res.render('auth/sessions', { sessions });
    }

    terminateSession(req, res) {
        const { id } = req.params;
        
        db.get('sessions')
            .remove({ id, userId: req.session.user.id })
            .write();

        res.redirect('/sessions');
    }

    terminateAllSessions(req, res) {
        db.get('sessions')
            .remove({ userId: req.session.user.id })
            .write();

        req.session.destroy();
        res.redirect('/login');
    }

    // Activity Log
    showActivityLog(req, res) {
        const activities = db.get('activities')
            .filter({ userId: req.session.user.id })
            .value();
        res.render('auth/activity-log', { activities });
    }
}

module.exports = new AuthController(); 