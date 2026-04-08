const db = require('../db');
const { uploadMultipleImages, deleteMultipleImages } = require('../services/uploadService');

const getAds = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      minPrice,
      maxPrice,
      search,
      location,
      userId,
      status = 'active',
    } = req.query;

    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    conditions.push(`a.status = $${paramIndex++}`);
    params.push(status);

    if (category && category !== 'all') {
      conditions.push(`a.category = $${paramIndex++}`);
      params.push(category);
    }

    if (minPrice !== undefined) {
      conditions.push(`a.price >= $${paramIndex++}`);
      params.push(minPrice);
    }

    if (maxPrice !== undefined) {
      conditions.push(`a.price <= $${paramIndex++}`);
      params.push(maxPrice);
    }

    if (search) {
      conditions.push(`(a.title ILIKE $${paramIndex++} OR a.description ILIKE $${paramIndex++})`);
      params.push(`%${search}%`, `%${search}%`);
    }

    if (location) {
      conditions.push(`a.location ILIKE $${paramIndex++}`);
      params.push(`%${location}%`);
    }

    if (userId) {
      conditions.push(`a.user_id = $${paramIndex++}`);
      params.push(userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM ads a
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    const dataQuery = `
      SELECT 
        a.*,
        u.name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        COALESCE(
          (SELECT json_agg(json_build_object('url', ai.image_url, 'order', ai.display_order))
           FROM ad_images ai 
           WHERE ai.ad_id = a.id AND ai.deleted_at IS NULL),
          '[]'::json
        ) as images
      FROM ads a
      JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);
    const result = await db.query(dataQuery, params);

    res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('❌ Error obteniendo anuncios:', error);
    res.status(500).json({ error: 'Error al obtener anuncios' });
  }
};

const getAdById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        a.*,
        u.name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        u.location as user_location,
        COALESCE(
          (SELECT json_agg(json_build_object('url', ai.image_url, 'order', ai.display_order))
           FROM ad_images ai 
           WHERE ai.ad_id = a.id AND ai.deleted_at IS NULL
           ORDER BY ai.display_order),
          '[]'::json
        ) as images
      FROM ads a
      JOIN users u ON a.user_id = u.id
      WHERE a.id = $1 AND a.deleted_at IS NULL
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }

    await db.query(
      'UPDATE ads SET views = views + 1 WHERE id = $1',
      [id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error obteniendo anuncio:', error);
    res.status(500).json({ error: 'Error al obtener el anuncio' });
  }
};

const createAd = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      category,
      condition,
      location,
      contact_phone,
    } = req.body;

    const userId = req.user.id;

    const result = await db.query(
      `INSERT INTO ads (user_id, title, description, price, category, condition, location, contact_phone, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())
       RETURNING *`,
      [userId, title, description, price || null, category || 'otros', condition || null, location || null, contact_phone || null]
    );

    const ad = result.rows[0];

    if (req.files && req.files.length > 0) {
      try {
        const uploadedImages = await uploadMultipleImages(req.files);
        
        for (let i = 0; i < uploadedImages.length; i++) {
          const image = uploadedImages[i];
          await db.query(
            `INSERT INTO ad_images (ad_id, image_url, public_id, display_order, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [ad.id, image.url, image.publicId, i]
          );
        }
        
        const imagesResult = await db.query(
          `SELECT image_url, display_order FROM ad_images 
           WHERE ad_id = $1 AND deleted_at IS NULL 
           ORDER BY display_order`,
          [ad.id]
        );
        ad.images = imagesResult.rows;
      } catch (uploadError) {
        console.error('❌ Error subiendo imágenes:', uploadError);
        await db.query('DELETE FROM ads WHERE id = $1', [ad.id]);
        return res.status(400).json({ error: uploadError.message });
      }
    } else {
      ad.images = [];
    }

    res.status(201).json({
      message: 'Anuncio creado exitosamente',
      ad,
    });
  } catch (error) {
    console.error('❌ Error creando anuncio:', error);
    res.status(500).json({ error: 'Error al crear el anuncio' });
  }
};

const updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      title,
      description,
      price,
      category,
      condition,
      location,
      contact_phone,
      status,
    } = req.body;

    const adCheck = await db.query(
      'SELECT user_id FROM ads WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (adCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }

    if (adCheck.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'No tienes permiso para editar este anuncio' });
    }

    const updates = [];
    const values = [];
    let valueIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${valueIndex++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${valueIndex++}`);
      values.push(description);
    }
    if (price !== undefined) {
      updates.push(`price = $${valueIndex++}`);
      values.push(price);
    }
    if (category !== undefined) {
      updates.push(`category = $${valueIndex++}`);
      values.push(category);
    }
    if (condition !== undefined) {
      updates.push(`condition = $${valueIndex++}`);
      values.push(condition);
    }
    if (location !== undefined) {
      updates.push(`location = $${valueIndex++}`);
      values.push(location);
    }
    if (contact_phone !== undefined) {
      updates.push(`contact_phone = $${valueIndex++}`);
      values.push(contact_phone);
    }
    if (status !== undefined && req.user.role === 'admin') {
      updates.push(`status = $${valueIndex++}`);
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE ads 
      SET ${updates.join(', ')} 
      WHERE id = $${valueIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);

    res.json({
      message: 'Anuncio actualizado exitosamente',
      ad: result.rows[0],
    });
  } catch (error) {
    console.error('❌ Error actualizando anuncio:', error);
    res.status(500).json({ error: 'Error al actualizar el anuncio' });
  }
};

const deleteAd = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const adCheck = await db.query(
      'SELECT user_id FROM ads WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (adCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }

    if (adCheck.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este anuncio' });
    }

    const imagesResult = await db.query(
      'SELECT public_id FROM ad_images WHERE ad_id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (imagesResult.rows.length > 0) {
      const publicIds = imagesResult.rows.map(row => row.public_id).filter(id => id);
      if (publicIds.length > 0) {
        await deleteMultipleImages(publicIds);
      }
    }

    await db.query(
      'UPDATE ads SET deleted_at = NOW(), status = \'deleted\' WHERE id = $1',
      [id]
    );

    await db.query(
      'UPDATE ad_images SET deleted_at = NOW() WHERE ad_id = $1',
      [id]
    );

    res.json({ message: 'Anuncio eliminado exitosamente' });
  } catch (error) {
    console.error('❌ Error eliminando anuncio:', error);
    res.status(500).json({ error: 'Error al eliminar el anuncio' });
  }
};

const getUserAds = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const query = `
      SELECT 
        a.*,
        COALESCE(
          (SELECT json_agg(json_build_object('url', ai.image_url, 'order', ai.display_order))
           FROM ad_images ai 
           WHERE ai.ad_id = a.id AND ai.deleted_at IS NULL
           ORDER BY ai.display_order),
          '[]'::json
        ) as images
      FROM ads a
      WHERE a.user_id = $1 AND a.deleted_at IS NULL
      ORDER BY a.created_at DESC
    `;

    const result = await db.query(query, [userId]);
    res.json({ ads: result.rows });
  } catch (error) {
    console.error('❌ Error obteniendo anuncios del usuario:', error);
    res.status(500).json({ error: 'Error al obtener tus anuncios' });
  }
};

module.exports = {
  getAds,
  getAdById,
  createAd,
  updateAd,
  deleteAd,
  getUserAds,
};
