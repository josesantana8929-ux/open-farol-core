const express = require('express');
const router = express.Router();
const db = require('../db');

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

// GET /api/ads - Listar anuncios
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, u.name as user_name 
       FROM ads a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.deleted_at IS NULL 
       ORDER BY a.created_at DESC 
       LIMIT 20`
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener anuncios' });
  }
});

// GET /api/ads/:id - Ver anuncio específico
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, u.name as user_name, u.email as user_email
       FROM ads a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.id = $1 AND a.deleted_at IS NULL`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener el anuncio' });
  }
});

// POST /api/ads - Crear anuncio (requiere auth)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, price, category, location } = req.body;
    const userId = req.user.id;
    
    const result = await db.query(
      `INSERT INTO ads (user_id, title, description, price, category, location, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())
       RETURNING *`,
      [userId, title, description, price || null, category || 'otros', location || null]
    );
    
    res.status(201).json({
      message: 'Anuncio creado exitosamente',
      ad: result.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear el anuncio' });
  }
});

// DELETE /api/ads/:id - Eliminar anuncio (requiere auth)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const adCheck = await db.query(
      'SELECT user_id FROM ads WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    
    if (adCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    
    if (adCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'No tienes permiso' });
    }
    
    await db.query(
      'UPDATE ads SET deleted_at = NOW(), status = $1 WHERE id = $2',
      ['deleted', req.params.id]
    );
    
    res.json({ message: 'Anuncio eliminado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar el anuncio' });
  }
});

module.exports = router;
