const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

class UserController {
    showUsers(req, res) {
        const users = db.get('users').value();
        res.render('users', { 
            user: req.session.user,
            users: users.map(u => ({ ...u, password: undefined }))
        });
    }

    async createUser(req, res) {
        try {
            const { username, password, isAdmin } = req.body;

            // Check if user already exists
            const existingUser = db.get('users')
                .find({ username })
                .value();

            if (existingUser) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Username already exists' 
                });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create new user
            const newUser = {
                id: uuidv4(),
                username,
                password: hashedPassword,
                isAdmin: Boolean(isAdmin),
                createdAt: new Date().toISOString()
            };

            // Save to database
            db.get('users')
                .push(newUser)
                .write();

            // Return user without password
            const { password: _, ...userWithoutPassword } = newUser;
            res.json({ 
                success: true, 
                user: userWithoutPassword 
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }

    deleteUser(req, res) {
        try {
            const { id } = req.params;

            // Prevent deleting the last admin user
            const adminUsers = db.get('users')
                .filter({ isAdmin: true })
                .value();

            const userToDelete = db.get('users')
                .find({ id })
                .value();

            if (userToDelete.isAdmin && adminUsers.length <= 1) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot delete the last admin user'
                });
            }

            // Delete user
            db.get('users')
                .remove({ id })
                .write();

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = new UserController(); 