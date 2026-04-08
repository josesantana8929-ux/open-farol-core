const { body, param, query, validationResult } = require('express-validator');

// Middleware para mostrar errores de validación
const showValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Errores de validación',
      details: errors.array().map(err => ({
        campo: err.param,
        mensaje: err.msg,
        valor: err.value
      }))
    });
  }
  next();
};

// ============ VALIDACIONES DE USUARIO ============

// Validación para registro de usuario
const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+$/).withMessage('El nombre solo puede contener letras y espacios'),
  
  body('email')
    .trim()
    .toLowerCase()
    .notEmpty().withMessage('El email es requerido')
    .isEmail().withMessage('Email inválido (ejemplo: usuario@dominio.com)')
    .normalizeEmail(),
  
  body('phone')
    .trim()
    .notEmpty().withMessage('El teléfono es requerido')
    .matches(/^(809|829|849)\d{7}$/).withMessage('Teléfono inválido. Debe ser un número dominicano (809, 829, 849) seguido de 7 dígitos'),
  
  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
    .isLength({ max: 100 }).withMessage('La contraseña no puede exceder 100 caracteres'),
  
  showValidationErrors
];

// Validación para login
const validateLogin = [
  body('email')
    .trim()
    .toLowerCase()
    .notEmpty().withMessage('El email es requerido')
    .isEmail().withMessage('Email inválido'),
  
  body('password')
    .notEmpty().withMessage('La contraseña es requerida'),
  
  showValidationErrors
];

// Validación para actualizar perfil
const validateProfileUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+$/).withMessage('El nombre solo puede contener letras y espacios'),
  
  body('phone')
    .optional()
    .trim()
    .matches(/^(809|829|849)\d{7}$/).withMessage('Teléfono inválido. Debe ser un número dominicano'),
  
  showValidationErrors
];

// ============ VALIDACIONES DE ANUNCIOS ============

// Validación para crear anuncio
const validateCreateAd = [
  body('title')
    .trim()
    .notEmpty().withMessage('El título es requerido')
    .isLength({ min: 3, max: 100 }).withMessage('El título debe tener entre 3 y 100 caracteres'),
  
  body('price')
    .notEmpty().withMessage('El precio es requerido')
    .isFloat({ min: 0.01, max: 999999999 }).withMessage('El precio debe ser un número válido entre 0.01 y 999,999,999'),
  
  body('category')
    .trim()
    .notEmpty().withMessage('La categoría es requerida')
    .isIn(['vehiculos', 'propiedades', 'empleos', 'servicios', 'tecnologia', 'hogar', 'moda', 'deportes', 'otros'])
    .withMessage('Categoría inválida. Opciones: vehiculos, propiedades, empleos, servicios, tecnologia, hogar, moda, deportes, otros'),
  
  body('location')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('La ubicación no puede exceder 100 caracteres'),
  
  body('condition')
    .optional()
    .trim()
    .isIn(['nuevo', 'como_nuevo', 'bueno', 'regular'])
    .withMessage('Condición inválida. Opciones: nuevo, como_nuevo, bueno, regular'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('La descripción no puede exceder 2000 caracteres'),
  
  showValidationErrors
];

// ============ VALIDACIONES DE PARÁMETROS ============

// Validación para ID en parámetros de URL
const validateId = [
  param('id')
    .notEmpty().withMessage('El ID es requerido')
    .isInt({ min: 1 }).withMessage('ID inválido, debe ser un número positivo'),
  
  showValidationErrors
];

// Validación para búsqueda con filtros (query params)
const validateSearchParams = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page debe ser un número positivo')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit debe ser un número entre 1 y 100')
    .toInt(),
  
  query('minPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('minPrice debe ser un número válido mayor o igual a 0')
    .toFloat(),
  
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('maxPrice debe ser un número válido mayor o igual a 0')
    .toFloat(),
  
  query('category')
    .optional()
    .trim()
    .isIn(['vehiculos', 'propiedades', 'empleos', 'servicios', 'tecnologia', 'hogar', 'moda', 'deportes', 'otros'])
    .withMessage('Categoría inválida para filtrar'),
  
  query('location')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Ubicación muy larga'),
  
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('La búsqueda debe tener entre 2 y 100 caracteres'),
  
  (req, res, next) => {
    // Validación personalizada: minPrice no puede ser mayor que maxPrice
    const minPrice = req.query.minPrice;
    const maxPrice = req.query.maxPrice;
    
    if (minPrice && maxPrice && parseFloat(minPrice) > parseFloat(maxPrice)) {
      return res.status(400).json({
        error: 'Errores de validación',
        details: [{
          campo: 'minPrice',
          mensaje: 'minPrice no puede ser mayor que maxPrice',
          valor: `${minPrice} > ${maxPrice}`
        }]
      });
    }
    next();
  }
];

// ============ VALIDACIONES DE ARCHIVOS ============

// Validación para imágenes (para usar antes de multer)
const validateImages = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: 'Validación fallida',
      details: [{
        campo: 'images',
        mensaje: 'Debes subir al menos una imagen'
      }]
    });
  }
  
  if (req.files.length > 5) {
    return res.status(400).json({
      error: 'Validación fallida',
      details: [{
        campo: 'images',
        mensaje: 'Máximo 5 imágenes por anuncio'
      }]
    });
  }
  
  next();
};

module.exports = {
  // Usuarios
  validateRegister,
  validateLogin,
  validateProfileUpdate,
  
  // Anuncios
  validateCreateAd,
  
  // Parámetros
  validateId,
  validateSearchParams,
  
  // Archivos
  validateImages
};
