// Middleware para validar anuncios
const validateAd = (req, res, next) => {
  const { title, price, category } = req.body;
  
  const errors = [];
  
  if (!title || title.length < 3 || title.length > 100) {
    errors.push('El título debe tener entre 3 y 100 caracteres');
  }
  
  if (!price || isNaN(price) || price <= 0 || price > 999999999) {
    errors.push('El precio debe ser un número válido entre 1 y 999,999,999');
  }
  
  if (!category || category.length < 2 || category.length > 50) {
    errors.push('La categoría es requerida y debe tener entre 2 y 50 caracteres');
  }
  
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  
  next();
};

// Middleware para validar usuario
const validateUser = (req, res, next) => {
  const { name, email, phone, password } = req.body;
  
  const errors = [];
  
  if (!name || name.length < 2 || name.length > 50) {
    errors.push('El nombre debe tener entre 2 y 50 caracteres');
  }
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Email inválido');
  }
  
  if (!phone || !/^[0-9+\-\s()]{8,20}$/.test(phone)) {
    errors.push('Teléfono inválido (mínimo 8 dígitos)');
  }
  
  if (password && (password.length < 6 || password.length > 100)) {
    errors.push('La contraseña debe tener entre 6 y 100 caracteres');
  }
  
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  
  next();
};

module.exports = {
  validateAd,
  validateUser
};
