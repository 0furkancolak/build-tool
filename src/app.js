const express = require('express');
const session = require('express-session');
const path = require('path');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

// Routes
const authRoutes = require('./middleware/routes/authRoutes');
const projectRoutes = require('./middleware/routes/projectRoutes');
const domainRoutes = require('./middleware/routes/domainRoutes');
const apiRoutes = require('./middleware/routes/apiRoutes');

// Middleware
const { authMiddleware, logActivity } = require('./middleware/authMiddleware');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Logger configuration
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(logsDir, 'combined.log') })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Express app
const app = express();

// Security settings
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'https:'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Access log
const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    { flags: 'a' }
);
app.use(morgan('combined', { stream: accessLogStream }));

// Activity logging
app.use(logActivity);

// Routes
app.use('/', authRoutes);
app.use('/api', apiRoutes);
app.use('/projects', authMiddleware, projectRoutes);
app.use('/domains', authMiddleware, domainRoutes);

// Home page
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Dashboard
app.get('/dashboard', authMiddleware, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});

// 404 handler
app.use((req, res) => {
    logger.warn('404 Not Found:', { path: req.path });
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.status(404).render('error', {
        error: {
            status: 404,
            message: 'Page not found'
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error('Application error:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(err.status || 500).json({ error: err.message });
    }
    res.status(err.status || 500).render('error', {
        error: {
            status: err.status || 500,
            message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        }
    });
});

// Start application
const port = 5000;
const server = app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
    console.log(`Server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received. Closing server...');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

module.exports = app; 