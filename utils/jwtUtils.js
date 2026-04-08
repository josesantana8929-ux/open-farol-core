const jwt = require('jsonwebtoken');

// Generar token JWT
const generateToken = (payload) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET no está configurada');
  }
  
  return jwt.sign(payload, secret, { expiresIn: '7d' });
};

// Verificar token JWT
const verifyToken = (token) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET no está configurada');
  }
  
  try {
    const decoded = jwt.verify(token, secret);
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expirado');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Token inválido');
    }
    throw error;
  }
};

// Middleware para autenticar rutas
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado' });
  }
  
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.message === 'Token expirado') {
      return res.status(401).json({ error: 'Token expirado, por favor inicia sesión nuevamente' });
    }
    return res.status(403).json({ error: 'Token inválido' });
  }
};

module.exports = {
  generateToken,
  verifyToken,
  authenticateToken
};
