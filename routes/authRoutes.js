const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/jwtUtils');
const { 
  registerValidation, 
  loginValidation, 
  profileUpdateValidation 
} = require('../middleware/validators');

// ============ FUNCIONES DE AUTENTICACIÓN DIRECTAS EN EL ROUTER ============

// Registrar usuario
const register = async (req, res) => {
  try {
    const { email, password, name, phone, location } = req.body;
    
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, phone, location, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, email, name, phone, location, role, created_at`,
      [email.toLowerCase(), hashedPassword, name || null, phone || null, location || null, 'user']
    );
    
    const user = result.rows[0];
    const token = generateToken(user.id, user.email);
    
    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        location: user.location,
        role: user.role,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('❌ Error en registro:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
};

// Iniciar sesión
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const result = await db.query(
      `SELECT id, email, password_hash, name, phone, location, role, 
              last_login, created_at
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
    
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );
    
    const token = generateToken(user.id, user.email);
    
    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        location: user.location,
        role: user.role,
        lastLogin: user.last_login,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// Middleware de autenticación
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

// Obtener perfil
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      `SELECT id, email, name, phone, location, role, 
              last_login, created_at, updated_at
       FROM users 
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('❌ Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
};

// Actualizar perfil
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, location } = req.body;
    
    const updates = [];
    const values = [];
    let valueIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${valueIndex++}`);
      values.push(name);
    }
    
    if (phone !== undefined) {
      updates.push(`phone = $${valueIndex++}`);
      values.push(phone);
    }
    
    if (location !== undefined) {
      updates.push(`location = $${valueIndex++}`);
      values.push(location);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(userId);
    
    const query = `
      UPDATE users 
      SET ${updates.join(', ')} 
      WHERE id = $${valueIndex} AND deleted_at IS NULL
      RETURNING id, email, name, phone, location, role, created_at, updated_at
    `;
    
    const result = await db.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json({
      message: 'Perfil actualizado exitosamente',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('❌ Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
};

// Cambiar contraseña
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Se requieren contraseña actual y nueva' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }
    
    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const isValidPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }
    
    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHashedPassword, userId]
    );
    
    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    console.error('❌ Error cambiando contraseña:', error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
};

// ============ DEFINIR RUTAS ============
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, profileUpdateValidation, updateProfile);
router.post('/change-password', authMiddleware, changePassword);

module.exports = router;
