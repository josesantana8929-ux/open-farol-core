const { body, param, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  
  const extractedErrors = [];
  errors.array().map(err => extractedErrors.push({
    field: err.path,
    message: err.msg,
  }));
  
  return res.status(400).json({
    errors: extractedErrors,
    message: 'Error de validación',
  });
};

const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido')
    .isLength({ max: 255 })
    .withMessage('Email demasiado largo'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una letra y un número'),
  
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  
  body('phone')
    .optional()
    .isString()
    .trim()
    .matches(/^[0-9+\-\s()]+$/)
    .withMessage('Teléfono inválido')
    .isLength({ max: 20 })
    .withMessage('Teléfono demasiado largo'),
  
  validate,
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  
  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida'),
  
  validate,
];

const profileUpdateValidation = [
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  
  body('phone')
    .optional()
    .isString()
    .trim()
    .matches(/^[0-9+\-\s()]+$/)
    .withMessage('Teléfono inválido'),
  
  body('location')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Ubicación demasiado larga'),
  
  validate,
];

const adValidation = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('El título debe tener entre 5 y 200 caracteres'),
  
  body('description')
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('La descripción debe tener entre 10 y 5000 caracteres'),
  
  body('price')
    .optional()
    .isFloat({ min: 0, max: 999999999 })
    .withMessage('Precio inválido'),
  
  body('category')
    .optional()
    .isString()
    .trim()
    .isIn(['vehiculos', 'inmuebles', 'empleos', 'servicios', 'tecnologia', 'hogar', 'moda', 'otros'])
    .withMessage('Categoría inválida'),
  
  body('condition')
    .optional()
    .isIn(['nuevo', 'como_nuevo', 'usado', 'reacondicionado'])
    .withMessage('Condición inválida'),
  
  body('location')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Ubicación demasiado larga'),
  
  body('contact_phone')
    .optional()
    .isString()
    .trim()
    .matches(/^[0-9+\-\s()]+$/)
    .withMessage('Teléfono de contacto inválido'),
  
  validate,
];

const adIdValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID de anuncio inválido'),
  
  validate,
];

const adFiltersValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Página inválida')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Límite inválido')
    .toInt(),
  
  query('category')
    .optional()
    .isIn(['vehiculos', 'inmuebles', 'empleos', 'servicios', 'tecnologia', 'hogar', 'moda', 'otros', 'all'])
    .withMessage('Categoría inválida'),
  
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Precio mínimo inválido')
    .toFloat(),
  
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Precio máximo inválido')
    .toFloat(),
  
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Búsqueda demasiado larga'),
  
  query('location')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Ubicación demasiado larga'),
  
  validate,
];

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  
  const { valid, decoded, error } = require('../utils/jwtUtils').verifyToken(token);
  
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
  adIdValidation,
  adFiltersValidation,
  authMiddleware,
  validate,
};
