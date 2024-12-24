const db = require('../config/database');
const jwt = require('jsonwebtoken');
const winston = require('winston');

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

const authMiddleware = async (req, res, next) => {
    try {
        // Check session authentication
        if (req.session && req.session.user) {
            // Get user from database
            const user = db.get('users')
                .find({ username: req.session.user })
                .value();

            if (!user) {
                logger.warn('Session user not found in database');
                return res.redirect('/login');
            }

            // Check if session is expired
            if (req.session.lastActivity && 
                Date.now() - req.session.lastActivity > (24 * 60 * 60 * 1000)) { // 24 hours
                logger.info('Session expired', { username: user.username });
                req.session.destroy();
                return res.redirect('/login');
            }

            // Update last activity
            req.session.lastActivity = Date.now();

            // Add user to request object
            req.user = user;
            return next();
        }

        // Check API key authentication
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            const apiKeyRecord = db.get('apiKeys')
                .find({ key: apiKey })
                .value();

            if (!apiKeyRecord) {
                logger.warn('Invalid API key used');
                return res.status(401).json({ error: 'Invalid API key' });
            }

            // Check if API key is expired
            if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
                logger.warn('Expired API key used', { keyId: apiKeyRecord.id });
                return res.status(401).json({ error: 'API key has expired' });
            }

            // Get user associated with API key
            const user = db.get('users')
                .find({ id: apiKeyRecord.userId })
                .value();

            if (!user) {
                logger.warn('API key user not found');
                return res.status(401).json({ error: 'Invalid API key' });
            }

            // Add user to request object
            req.user = user;
            return next();
        }

        // Check JWT authentication
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = db.get('users')
                    .find({ id: decoded.userId })
                    .value();

                if (!user) {
                    logger.warn('JWT user not found');
                    return res.status(401).json({ error: 'Invalid token' });
                }

                // Add user to request object
                req.user = user;
                return next();
            } catch (error) {
                logger.warn('JWT verification failed', { error: error.message });
                return res.status(401).json({ error: 'Invalid token' });
            }
        }

        // No valid authentication method found
        logger.warn('Authentication required');
        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/login');
    } catch (error) {
        logger.error('Authentication middleware error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Admin middleware
const adminMiddleware = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        logger.warn('Admin access denied', { username: req.user?.username });
        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        return res.redirect('/dashboard');
    }
    next();
};

// 2FA middleware
const require2FA = async (req, res, next) => {
    try {
        if (!req.user.twoFactorEnabled) {
            return next();
        }

        if (!req.session.twoFactorVerified) {
            logger.info('2FA verification required', { username: req.user.username });
            if (req.xhr || req.headers.accept.includes('application/json')) {
                return res.status(403).json({ error: '2FA verification required' });
            }
            return res.redirect('/2fa/verify');
        }

        next();
    } catch (error) {
        logger.error('2FA middleware error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Rate limiting middleware
const rateLimit = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
    handler: (req, res) => {
        logger.warn('Rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many requests' });
    }
};

// CORS middleware
const corsMiddleware = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-API-Key');
    next();
};

// Activity logging middleware
const logActivity = async (req, res, next) => {
    try {
        if (req.user) {
            const activity = {
                userId: req.user.id,
                action: `${req.method} ${req.path}`,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                timestamp: new Date().toISOString()
            };

            db.get('activityLog')
                .push(activity)
                .write();

            logger.info('Activity logged', activity);
        }
        next();
    } catch (error) {
        logger.error('Activity logging error:', error);
        next();
    }
};

module.exports = {
    authMiddleware,
    adminMiddleware,
    require2FA,
    rateLimit,
    corsMiddleware,
    logActivity
}; 