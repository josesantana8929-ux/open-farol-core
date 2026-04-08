const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, verifyToken } = require('../utils/jwtUtils');

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  
  const { valid, decoded, error } = verifyToken(token);
  
  if (!valid) {
    return res.status(401).json({ error: error || 'Token inválido' });
  }
  
  req.user = decoded;
  next();
};

// ============ VALIDACIÓN SIMPLE ============
const validateRegister = (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (!email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }
  next();
};

// ============ RUTAS ============

// Registro
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, phone, role, created_at)
       VALUES ($1, $2, $3, $4, 'user', NOW())
       RETURNING id, email, name, phone, role, created_at`,
      [email.toLowerCase(), hashedPassword, name || null, phone || null]
    );
    
    const user = result.rows[0];
    const token = generateToken(user.id, user.email);
    
    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user,
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// Login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const result = await db.query(
      `SELECT id, email, password_hash, name, phone, role, created_at
       FROM users 
       WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    
    const token = generateToken(user.id, user.email);
    
    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Obtener perfil
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, phone, role, created_at, updated_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// Actualizar perfil
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;
    
    if (name) { updates.push(`name = $${idx++}`); values.push(name); }
    if (phone) { updates.push(`phone = $${idx++}`); values.push(phone); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(req.user.id);
    
    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} 
       WHERE id = $${idx} AND deleted_at IS NULL
       RETURNING id, email, name, phone, role, created_at, updated_at`,
      values
    );
    
    res.json({ message: 'Perfil actualizado', user: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// Cambiar contraseña
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Se requieren ambas contraseñas' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }
    
    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }
    
    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', 
      [newHash, req.user.id]);
    
    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

module.exports = router;
