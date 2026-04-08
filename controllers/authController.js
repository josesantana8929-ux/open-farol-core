const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Registro de usuario
const register = async (req, res) => {
  const { name, email, phone, password } = req.body;
  
  try {
    // Verificar si el email ya existe
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    
    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insertar usuario
    const result = await db.query(
      `INSERT INTO users (name, email, phone, password_hash) 
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, phone`,
      [name, email, phone, hashedPassword]
    );
    
    const user = result.rows[0];
    
    // Generar token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'secreto-temporal',
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
    
  } catch (error) {
    console.error('Error en register:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Login de usuario
const login = async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const result = await db.query(
      'SELECT id, name, email, phone, password_hash FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'secreto-temporal',
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
    
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener perfil
const getProfile = async (req, res) => {
  const userId = req.user.id;
  
  try {
    const result = await db.query(
      'SELECT id, name, email, phone, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json({ success: true, user: result.rows[0] });
    
  } catch (error) {
    console.error('Error en getProfile:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar perfil
const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { name, phone } = req.body;
  
  try {
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (name) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }
    
    if (phone) {
      updates.push(`phone = $${paramIndex}`);
      params.push(phone);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    
    params.push(userId);
    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, email, phone`,
      params
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json({ success: true, user: result.rows[0] });
    
  } catch (error) {
    console.error('Error en updateProfile:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile
};
