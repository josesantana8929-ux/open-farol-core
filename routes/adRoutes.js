const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../utils/jwtUtils');
const { normalizePrice, validatePrice } = require('../utils/priceUtils');

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token requerido' });
    
    const { valid, decoded, error } = verifyToken(token);
    if (!valid) return res.status(401).json({ error: error || 'Token inválido' });
    
    req.user = decoded;
    next();
};

// Validar precio en peticiones
const validatePriceMiddleware = (req, res, next) => {
    const { price, currency_type = 'DOP' } = req.body;
    
    if (price !== undefined && price !== null && price !== '') {
        const validation = validatePrice(price, currency_type);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }
        req.body.price = validation.value;
    }
    
    next();
};

// Listar anuncios (con filtros mejorados)
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            category,
            minPrice,
            maxPrice,
            currency_type,
            search,
            location,
            negotiable
        } = req.query;
        
        const offset = (page - 1) * limit;
        const conditions = [];
        const params = [];
        let idx = 1;
        
        conditions.push(`a.deleted_at IS NULL`);
        
        if (category && category !== 'all') {
            conditions.push(`a.category = $${idx++}`);
            params.push(category);
        }
        
        if (minPrice !== undefined && minPrice !== '') {
            conditions.push(`a.price >= $${idx++}`);
            params.push(parseFloat(minPrice));
        }
        
        if (maxPrice !== undefined && maxPrice !== '') {
            conditions.push(`a.price <= $${idx++}`);
            params.push(parseFloat(maxPrice));
        }
        
        if (currency_type && currency_type !== 'all') {
            conditions.push(`a.currency_type = $${idx++}`);
            params.push(currency_type);
        }
        
        if (negotiable === 'true') {
            conditions.push(`a.price_negotiable = true`);
        }
        
        if (search) {
            conditions.push(`(a.title ILIKE $${idx++} OR a.description ILIKE $${idx++})`);
            params.push(`%${search}%`, `%${search}%`);
        }
        
        if (location) {
            conditions.push(`a.location ILIKE $${idx++}`);
            params.push(`%${location}%`);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const countQuery = `SELECT COUNT(*) as total FROM ads a ${whereClause}`;
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);
        
        const dataQuery = `
            SELECT 
                a.*,
                u.name as user_name,
                u.email as user_email,
                u.phone as user_phone
            FROM ads a
            JOIN users u ON a.user_id = u.id
            ${whereClause}
            ORDER BY a.created_at DESC
            LIMIT $${idx++} OFFSET $${idx++}
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
            currency_rates: {
                DOP: 1,
                USD: 58.5
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al obtener anuncios' });
    }
});

// Ver anuncio específico
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT a.*, u.name as user_name, u.email as user_email, u.phone as user_phone
            FROM ads a 
            JOIN users u ON a.user_id = u.id 
            WHERE a.id = $1 AND a.deleted_at IS NULL
        `, [req.params.id]);
        
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

// Crear anuncio (con validación de precio)
router.post('/', authMiddleware, validatePriceMiddleware, async (req, res) => {
    try {
        const {
            title,
            description,
            price,
            currency_type = 'DOP',
            price_negotiable = false,
            category,
            condition,
            location,
            contact_phone
        } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ error: 'Título y descripción requeridos' });
        }
        
        const result = await db.query(`
            INSERT INTO ads (
                user_id, title, description, price, currency_type, 
                price_negotiable, category, condition, location, 
                contact_phone, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NOW())
            RETURNING *
        `, [req.user.id, title, description, price || null, currency_type, 
            price_negotiable, category || 'otros', condition || null, 
            location || null, contact_phone || null]);
        
        res.status(201).json({
            message: 'Anuncio creado exitosamente',
            ad: result.rows[0]
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al crear anuncio' });
    }
});

// Mis anuncios
router.get('/user/my-ads', authMiddleware, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM ads 
            WHERE user_id = $1 AND deleted_at IS NULL 
            ORDER BY created_at DESC
        `, [req.user.id]);
        res.json({ ads: result.rows });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al obtener anuncios' });
    }
});

// Actualizar anuncio (incluyendo precio)
router.put('/:id', authMiddleware, validatePriceMiddleware, async (req, res) => {
    try {
        const {
            title,
            description,
            price,
            currency_type,
            price_negotiable,
            category,
            condition,
            location,
            contact_phone,
            status
        } = req.body;
        
        // Verificar propiedad
        const adCheck = await db.query(
            'SELECT user_id FROM ads WHERE id = $1 AND deleted_at IS NULL',
            [req.params.id]
        );
        
        if (adCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Anuncio no encontrado' });
        }
        
        if (adCheck.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No autorizado' });
        }
        
        const updates = [];
        const values = [];
        let idx = 1;
        
        if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
        if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
        if (price !== undefined) { updates.push(`price = $${idx++}`); values.push(price); }
        if (currency_type !== undefined) { updates.push(`currency_type = $${idx++}`); values.push(currency_type); }
        if (price_negotiable !== undefined) { updates.push(`price_negotiable = $${idx++}`); values.push(price_negotiable); }
        if (category !== undefined) { updates.push(`category = $${idx++}`); values.push(category); }
        if (condition !== undefined) { updates.push(`condition = $${idx++}`); values.push(condition); }
        if (location !== undefined) { updates.push(`location = $${idx++}`); values.push(location); }
        if (contact_phone !== undefined) { updates.push(`contact_phone = $${idx++}`); values.push(contact_phone); }
        if (status !== undefined && req.user.role === 'admin') {
            updates.push(`status = $${idx++}`); values.push(status);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No hay datos para actualizar' });
        }
        
        updates.push(`updated_at = NOW()`);
        values.push(req.params.id);
        
        const query = `
            UPDATE ads SET ${updates.join(', ')} 
            WHERE id = $${idx} RETURNING *
        `;
        
        const result = await db.query(query, values);
        
        res.json({
            message: 'Anuncio actualizado exitosamente',
            ad: result.rows[0]
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al actualizar anuncio' });
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
        
        if (adCheck.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No autorizado' });
        }
        
        await db.query('UPDATE ads SET deleted_at = NOW(), status = $1 WHERE id = $2',
            ['deleted', req.params.id]);
        
        res.json({ message: 'Anuncio eliminado exitosamente' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al eliminar anuncio' });
    }
});

module.exports = router;
