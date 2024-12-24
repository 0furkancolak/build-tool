const express = require('express');
const session = require('express-session');
const path = require('path');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const fs = require('fs').promises;
require('dotenv').config();

// Routes
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');

// Middleware
const {
    authMiddleware,
    corsMiddleware,
    logActivity
} = require('./middleware/authMiddleware');

// Logger yapılandırması
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

// Express uygulaması
const app = express();

// Güvenlik ayarları
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
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 100 // IP başına maksimum istek sayısı
});
app.use('/api/', limiter);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(corsMiddleware);

// Session yapılandırması
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 saat
    }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public')));

// Access log
const accessLogStream = fs.createWriteStream(
    path.join(__dirname, 'logs', 'access.log'),
    { flags: 'a' }
);
app.use(morgan('combined', { stream: accessLogStream }));

// Activity logging
app.use(logActivity);

// Routes
app.use('/', authRoutes);
app.use('/', projectRoutes);

// Ana sayfa
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// 404 handler
app.use((req, res) => {
    logger.warn('404 Not Found:', { path: req.path });
    if (req.xhr || req.headers.accept.includes('application/json')) {
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
    if (req.xhr || req.headers.accept.includes('application/json')) {
        return res.status(err.status || 500).json({ error: err.message });
    }
    res.status(err.status || 500).render('error', {
        error: {
            status: err.status || 500,
            message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        }
    });
});

// Uygulama başlatma
const port = process.env.PORT || 5000;
app.listen(port, () => {
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