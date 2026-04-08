// middleware/validators.js - Validador de Datos
const { body, param, query, validationResult } = require('express-validator');

// Middleware para mostrar errores de validación
const showValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Errores de validación',
      details: errors.array() 
    });
  }
  next();
};

// Validaciones para registro de usuario
const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  
  body('email')
    .trim()
    .toLowerCase()
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),
  
  body('phone')
    .trim()
    .matches(/^(809|829|849)\d{7}$/).withMessage('Teléfono dominicano inválido (809, 829, 849 seguido de 7 dígitos)'),
  
  body('password')
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  
  showValidationErrors
];

// Validaciones para login
const validateLogin = [
  body('email')
    .trim()
    .toLowerCase()
    .isEmail().withMessage('Email inválido'),
  
  body('password')
    .notEmpty().withMessage('La contraseña es requerida'),
  
  showValidationErrors
];

// Validaciones para crear anuncio
const validateCreateAd = [
  body('title')
    .trim()
    .notEmpty().withMessage('El título es requerido')
    .isLength({ min: 3, max: 100 }).withMessage('El título debe tener entre 3 y 100 caracteres'),
  
  body('price')
    .isFloat({ min: 0.01, max: 999999999 }).withMessage('El precio debe ser un número válido entre 0.01 y 999,999,999'),
  
  body('category')
    .trim()
    .notEmpty().withMessage('La categoría es requerida')
    .isIn(['vehiculos', 'propiedades', 'empleos', 'servicios', 'tecnologia', 'hogar', 'moda', 'deportes', 'otros'])
    .withMessage('Categoría inválida'),
  
  body('location')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('La ubicación no puede exceder 100 caracteres'),
  
  body('condition')
    .optional()
    .isIn(['nuevo', 'como_nuevo', 'bueno', 'regular'])
    .withMessage('Condición inválida'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('La descripción no puede exceder 2000 caracteres'),
  
  showValidationErrors
];

// Validación para ID en parámetros
const validateId = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido, debe ser un número positivo'),
  
  showValidationErrors
];

// Validación para búsqueda con filtros
const validateSearchParams = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page debe ser un número positivo'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit debe ser un número entre 1 y 100'),
  
  query('minPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('minPrice debe ser un número válido'),
  
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('maxPrice debe ser un número válido'),
  
  showValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateCreateAd,
  validateId,
  validateSearchParams
};
