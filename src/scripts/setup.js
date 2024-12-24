const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

async function setup() {
    try {
        // Check if admin user exists
        const adminUser = db.get('users')
            .find({ username: 'admin' })
            .value();

        if (!adminUser) {
            // Create admin user
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const admin = {
                id: uuidv4(),
                username: 'admin',
                password: hashedPassword,
                role: 'admin',
                email: 'admin@example.com',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            db.get('users')
                .push(admin)
                .write();

            console.log('Admin user created successfully');
            console.log('Username: admin');
            console.log('Password: admin123');
        } else {
            console.log('Admin user already exists');
        }

        // Initialize other collections if needed
        const collections = ['projects', 'domains', 'sessions', 'apiKeys', 'activities'];
        collections.forEach(collection => {
            if (!db.has(collection).value()) {
                db.set(collection, []).write();
                console.log(`Initialized ${collection} collection`);
            }
        });

        console.log('Setup completed successfully');
    } catch (error) {
        console.error('Setup failed:', error);
        process.exit(1);
    }
}

setup(); 