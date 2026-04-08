// middleware/validators.js - VERSIÓN SIMPLIFICADA
const { body, param, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  
  return res.status(400).json({
    error: 'Error de validación',
    details: errors.array()
  });
};

// Validadores básicos
const registerValidation = [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  validate,
];

const loginValidation = [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('La contraseña es requerida'),
  validate,
];

const profileUpdateValidation = [
  body('name').optional().isString().trim(),
  body('phone').optional().isString().trim(),
  validate,
];

const adValidation = [
  body('title').notEmpty().withMessage('El título es requerido'),
  body('description').notEmpty().withMessage('La descripción es requerida'),
  validate,
];

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  
  const { verifyToken } = require('../utils/jwtUtils');
  const { valid, decoded, error } = verifyToken(token);
  
  if (!valid) {
    return res.status(401).json({ error: error || 'Token inválido' });
  }
  
  req.user = decoded;
  next();
};

module.exports = {
  registerValidation,
  loginValidation,
  profileUpdateValidation,
  adValidation,
  authMiddleware,
  validate,
};
