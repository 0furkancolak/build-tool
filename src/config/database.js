const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Create db.json if it doesn't exist
const dbPath = path.join(dataDir, 'db.json');
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({
        users: [],
        projects: [],
        domains: [],
        sessions: [],
        apiKeys: [],
        activities: []
    }));
}

const adapter = new FileSync(dbPath, {
    defaultValue: {
        users: [],
        projects: [],
        domains: [],
        sessions: [],
        apiKeys: [],
        activities: []
    },
    serialize: (data) => JSON.stringify(data, null, 2),
    deserialize: JSON.parse
});

const db = low(adapter);

// Ensure defaults
db.defaults({
    users: [],
    projects: [],
    domains: [],
    sessions: [],
    apiKeys: [],
    activities: []
}).write();

module.exports = db; 