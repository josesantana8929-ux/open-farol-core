const db = require('../db');
const { uploadImages, deleteImage } = require('../services/uploadService');

// Crear anuncio
const createAd = async (req, res) => {
  const { title, description, price, category, location, condition } = req.body;
  const userId = req.user.userId;
  
  // Validaciones
  if (!title || !price || !category) {
    return res.status(400).json({ 
      error: 'Título, precio y categoría son requeridos' 
    });
  }
  
  if (price <= 0) {
    return res.status(400).json({ error: 'El precio debe ser mayor a 0' });
  }
  
  try {
    // Subir imágenes si existen
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = await uploadImages(req.files);
    }
    
    // Insertar anuncio
    const result = await db.query(
      `INSERT INTO ads (
        user_id, title, description, price, category, 
        location, condition, images, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())
      RETURNING *`,
      [userId, title, description, price, category, location, condition, imageUrls]
    );
    
    res.status(201).json({
      success: true,
      message: 'Anuncio creado exitosamente',
      ad: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error creando anuncio:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener todos los anuncios (con filtros)
const getAllAds = async (req, res) => {
  const { 
    category, 
    location, 
    minPrice, 
    maxPrice, 
    search,
    page = 1,
    limit = 20 
  } = req.query;
  
  const offset = (page - 1) * limit;
  let query = `
    SELECT a.*, u.name as seller_name, u.phone as seller_phone
    FROM ads a
    JOIN users u ON a.user_id = u.id
    WHERE a.status = 'active'
  `;
  const params = [];
  let paramIndex = 1;
  
  // Aplicar filtros dinámicamente
  if (category) {
    query += ` AND a.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }
  
  if (location) {
    query += ` AND a.location ILIKE $${paramIndex}`;
    params.push(`%${location}%`);
    paramIndex++;
  }
  
  if (minPrice) {
    query += ` AND a.price >= $${paramIndex}`;
    params.push(minPrice);
    paramIndex++;
  }
  
  if (maxPrice) {
    query += ` AND a.price <= $${paramIndex}`;
    params.push(maxPrice);
    paramIndex++;
  }
  
  if (search) {
    query += ` AND (a.title ILIKE $${paramIndex} OR a.description ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  
  // Ordenar y paginar
  query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  try {
    const result = await db.query(query, params);
    
    // Obtener total de anuncios para paginación
    let countQuery = `SELECT COUNT(*) as total FROM ads a WHERE a.status = 'active'`;
    const countParams = [];
    let countIndex = 1;
    
    // Reaplicar filtros para el contador
    if (category) {
      countQuery += ` AND a.category = $${countIndex}`;
      countParams.push(category);
      countIndex++;
    }
    // ... (añadir los mismos filtros para el contador)
    
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo anuncios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener anuncio por ID (con teléfono para WhatsApp)
const getAdById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      `SELECT a.*, u.name as seller_name, u.email as seller_email, u.phone as seller_phone
       FROM ads a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = $1 AND a.status = 'active'`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    
    const ad = result.rows[0];
    
    // Incrementar contador de vistas
    await db.query(
      'UPDATE ads SET views = COALESCE(views, 0) + 1 WHERE id = $1',
      [id]
    );
    
    // Generar link de WhatsApp
    const whatsappLink = `https://wa.me/${ad.seller_phone.replace(/[^0-9]/g, '')}?text=Hola%20${encodeURIComponent(ad.seller_name)}%2C%20vi%20tu%20anuncio%20de%20${encodeURIComponent(ad.title)}%20en%20${process.env.SITE_NAME}%20y%20estoy%20interesado(a)`;
    
    res.json({
      success: true,
      ad,
      whatsappLink
    });
    
  } catch (error) {
    console.error('Error obteniendo anuncio:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener anuncios por usuario
const getUserAds = async (req, res) => {
  const userId = req.user.userId;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  
  try {
    const result = await db.query(
      `SELECT * FROM ads 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM ads WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total)
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo anuncios del usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Eliminar anuncio
const deleteAd = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  
  try {
    // Verificar que el anuncio pertenece al usuario
    const ad = await db.query(
      'SELECT images FROM ads WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (ad.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado o no autorizado' });
    }
    
    // Eliminar imágenes de Cloudinary
    if (ad.rows[0].images && ad.rows[0].images.length > 0) {
      for (const imageUrl of ad.rows[0].images) {
        await deleteImage(imageUrl);
      }
    }
    
    // Marcar como eliminado en la BD
    await db.query(
      'UPDATE ads SET status = $1, deleted_at = NOW() WHERE id = $2',
      ['deleted', id]
    );
    
    res.json({
      success: true,
      message: 'Anuncio eliminado exitosamente'
    });
    
  } catch (error) {
    console.error('Error eliminando anuncio:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  createAd,
  getAllAds,
  getAdById,
  getUserAds,
  deleteAd
};
