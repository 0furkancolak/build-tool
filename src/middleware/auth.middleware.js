const winston = require('winston');

// Logger configuration
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Authentication middleware
const authMiddleware = (req, res, next) => {
    if (!req.session.user) {
        logger.warn('Authentication required');
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/login');
    }
    next();
};

// Activity logging middleware
const logActivity = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('Activity log', {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration,
            ip: req.ip,
            user: req.session.user ? req.session.user.username : 'anonymous'
        });
    });
    next();
};

module.exports = {
    authMiddleware,
    logActivity
}; 