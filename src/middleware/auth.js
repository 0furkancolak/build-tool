const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.isAdmin) {
        next();
    } else {
        res.status(403).json({ 
            success: false, 
            error: 'Admin privileges required' 
        });
    }
};

module.exports = {
    requireAuth,
    requireAdmin
}; 