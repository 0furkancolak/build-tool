const bcrypt = require('bcryptjs');
const db = require('../config/database');

class AuthController {
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
                res.render('login', { error: 'Invalid credentials' });
            }
        } catch (error) {
            res.render('login', { error: 'Login failed' });
        }
    }

    logout(req, res) {
        req.session.destroy();
        res.redirect('/login');
    }

    showLoginPage(req, res) {
        res.render('login');
    }
}

module.exports = new AuthController(); 