const bcrypt = require('bcryptjs');
const db = require('../config/database');
const fs = require('fs').promises;
const path = require('path');

async function setup() {
    try {
        // Create data directory if it doesn't exist
        await fs.mkdir(path.join(__dirname, '../../data'), { recursive: true });
        await fs.mkdir(path.join(__dirname, '../../data/projects'), { recursive: true });

        // Create admin user if it doesn't exist
        const adminExists = db.get('users')
            .find({ username: 'admin' })
            .value();

        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin', 10);
            db.get('users')
                .push({
                    id: 'admin',
                    username: 'admin',
                    password: hashedPassword,
                    isAdmin: true
                })
                .write();
            console.log('Admin user created successfully');
        }

        console.log('Setup completed successfully');
    } catch (error) {
        console.error('Setup failed:', error);
        process.exit(1);
    }
}

setup(); 