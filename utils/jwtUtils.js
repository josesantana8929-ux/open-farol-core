const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mxl_secret_2026';
const JWT_EXPIRES_IN = '7d';

function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role || 'user',
            user_type: user.user_type,
            verified: user.verified || false,
            plan_type: user.plan_type || 'free'
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return { valid: true, decoded };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

function decodeToken(token) {
    try {
        return jwt.decode(token);
    } catch {
        return null;
    }
}

module.exports = {
    generateToken,
    verifyToken,
    decodeToken,
    JWT_SECRET
};
