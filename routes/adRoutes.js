const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../utils/jwtUtils');

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  
  const { valid, decoded, error } = verifyToken(token);
  if (!valid) return res.status(401).json({ error: error || 'Token inválido' });
  
  req.user = decoded;
  next();
};

// Validación simple para crear anuncio
const validateAd = (req, res, next) => {
  const { title, description } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'Título y descripción son requeridos' });
  }
  if (title.length < 5) {
    return res.status(400).json({ error: 'El título debe tener al menos 5 caracteres' });
  }
  if (description.length < 10) {
    return res.status(400).json({ error: 'La descripción debe tener al menos 10 caracteres' });
  }
  next();
};

// Listar anuncios
router.get('/', async (req, res) => {
  try {
    const { category, search, limit = 20, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT a.*, u.name as user_name
      FROM ads a
      JOIN users u ON a.user_id = u.id
      WHERE a.deleted_at IS NULL
    `;
    const params = [];
    let idx = 1;
    
    if (category && category !== 'all') {
      query += ` AND a.category = $${idx++}`;
      params.push(category);
    }
    
    if (search) {
      query += ` AND (a.title ILIKE $${idx++} OR a.description ILIKE $${idx++})`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` ORDER BY a.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    res.json({ data: result.rows, pagination: { page, limit } });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener anuncios' });
  }
});

// Ver anuncio específico
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, u.name as user_name, u.email as user_email
       FROM ads a JOIN users u ON a.user_id = u.id
       WHERE a.id = $1 AND a.deleted_at IS NULL`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    
    await db.query('UPDATE ads SET views = views + 1 WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener anuncio' });
  }
});

// Crear anuncio
router.post('/', authMiddleware, validateAd, async (req, res) => {
  try {
    const { title, description, price, category, location, contact_phone } = req.body;
    
    const result = await db.query(
      `INSERT INTO ads (user_id, title, description, price, category, location, contact_phone, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
       RETURNING *`,
      [req.user.id, title, description, price || null, category || 'otros', location || null, contact_phone || null]
    );
    
    res.status(201).json({ message: 'Anuncio creado', ad: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear anuncio' });
  }
});

// Mis anuncios
router.get('/user/my-ads', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM ads WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ ads: result.rows });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener anuncios' });
  }
});

// Actualizar anuncio
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, price, category, location } = req.body;
    
    const adCheck = await db.query(
      'SELECT user_id FROM ads WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    
    if (adCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    
    if (adCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    
    const updates = [];
    const values = [];
    let idx = 1;
    
    if (title) { updates.push(`title = $${idx++}`); values.push(title); }
    if (description) { updates.push(`description = $${idx++}`); values.push(description); }
    if (price !== undefined) { updates.push(`price = $${idx++}`); values.push(price); }
    if (category) { updates.push(`category = $${idx++}`); values.push(category); }
    if (location) { updates.push(`location = $${idx++}`); values.push(location); }
    
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);
    
    const result = await db.query(
      `UPDATE ads SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    
    res.json({ message: 'Anuncio actualizado', ad: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// Eliminar anuncio
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const adCheck = await db.query(
      'SELECT user_id FROM ads WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    
    if (adCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    
    if (adCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    
    await db.query('UPDATE ads SET deleted_at = NOW(), status = $1 WHERE id = $2',
      ['deleted', req.params.id]);
    
    res.json({ message: 'Anuncio eliminado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

module.exports = router;
