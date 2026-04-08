const jwt = require('jsonwebtoken');

const SECRET = process.env.SESSION_SECRET || 'dev_secret_key_123456789';

const generateToken = (userId, email) => {
  return jwt.sign(
    { id: userId, email: email, iat: Math.floor(Date.now() / 1000) },
    SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, SECRET);
    return { valid: true, decoded };
  } catch (error) {
    let message = 'Token inválido';
    if (error.name === 'TokenExpiredError') message = 'Token expirado';
    if (error.name === 'JsonWebTokenError') message = 'Token malformado';
    return { valid: false, error: message };
  }
};

module.exports = { generateToken, verifyToken };
