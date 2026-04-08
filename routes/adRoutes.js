const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../utils/jwtUtils');

// ============================================================
// LISTAR ANUNCIOS (con filtros)
// ============================================================
router.get('/', async (req, res) => {
    const { categoria, sector, search, verified_only, limit = 20, offset = 0 } = req.query;
    
    try {
        let query = `SELECT a.*, u.name as user_name, u.phone as user_phone, u.verified, u.plan_type
                     FROM ads a 
                     JOIN users u ON a.user_id = u.id 
                     WHERE a.deleted_at IS NULL AND a.status = 'active'`;
        const params = [];
        let paramIndex = 1;
        
        if (categoria) {
            query += ` AND a.category = $${paramIndex++}`;
            params.push(categoria);
        }
        if (sector) {
            query += ` AND a.ubicacion_sector = $${paramIndex++}`;
            params.push(sector);
        }
        if (search) {
            query += ` AND (a.title ILIKE $${paramIndex++} OR a.description ILIKE $${paramIndex++})`;
            params.push(`%${search}%`, `%${search}%`);
        }
        if (verified_only === 'true') {
            query += ` AND u.verified = true`;
        }
        
        // Orden: boosteados primero, luego fecha
        query += ` ORDER BY 
                    CASE WHEN a.boosted_expires > NOW() THEN 1 ELSE 0 END DESC,
                    a.created_at DESC 
                  LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);
        
        const result = await db.query(query, params);
        
        // Agregar insignias a cada anuncio
        const adsWithBadges = result.rows.map(ad => ({
            ...ad,
            badges: {
                verified: ad.verified,
                boosted: ad.boosted_expires && new Date(ad.boosted_expires) > new Date(),
                pro: ad.plan_type === 'pro',
                premium: ad.plan_type === 'premium'
            }
        }));
        
        res.json({ ads: adsWithBadges });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener anuncios' });
    }
});

// ============================================================
// VER DETALLE DE ANUNCIO
// ============================================================
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        await db.query(`UPDATE ads SET views = views + 1 WHERE id = $1`, [id]);
        
        const result = await db.query(
            `SELECT a.*, u.name as user_name, u.phone as user_phone, u.email as user_email, u.verified, u.plan_type
             FROM ads a 
             JOIN users u ON a.user_id = u.id 
             WHERE a.id = $1 AND a.deleted_at IS NULL`,
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Anuncio no encontrado' });
        }
        
        const ad = result.rows[0];
        ad.badges = {
            verified: ad.verified,
            boosted: ad.boosted_expires && new Date(ad.boosted_expires) > new Date(),
            pro: ad.plan_type === 'pro',
            premium: ad.plan_type === 'premium'
        };
        
        res.json({ ad });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener anuncio' });
    }
});

// ============================================================
// CREAR ANUNCIO (solo vendedores)
// ============================================================
router.post('/', verifyToken, async (req, res) => {
    if (req.user.user_type !== 'seller' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo vendedores pueden publicar' });
    }
    
    const { title, description, price, category, ubicacion_sector } = req.body;
    
    if (!title || !ubicacion_sector) {
        return res.status(400).json({ error: 'Título y ubicación requeridos' });
    }
    
    try {
        const result = await db.query(
            `INSERT INTO ads (user_id, title, description, price, category, ubicacion_sector, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
            [req.user.id, title, description, price || 0, category, ubicacion_sector]
        );
        
        res.json({ success: true, ad: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear anuncio' });
    }
});

// ============================================================
// MIS ANUNCIOS (panel vendedor)
// ============================================================
router.get('/my-ads', verifyToken, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT *, 
                    CASE WHEN boosted_expires > NOW() THEN true ELSE false END as is_boosted
             FROM ads WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ ads: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener anuncios' });
    }
});

// ============================================================
// ACTUALIZAR ANUNCIO
// ============================================================
router.put('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, price, category, ubicacion_sector, status } = req.body;
    
    try {
        const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
        if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
        if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No autorizado' });
        }
        
        await db.query(
            `UPDATE ads SET title = COALESCE($1, title), description = COALESCE($2, description),
             price = COALESCE($3, price), category = COALESCE($4, category),
             ubicacion_sector = COALESCE($5, ubicacion_sector), status = COALESCE($6, status),
             updated_at = NOW() WHERE id = $7`,
            [title, description, price, category, ubicacion_sector, status, id]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

// ============================================================
// MARCAR COMO VENDIDO
// ============================================================
router.put('/:id/sold', verifyToken, async (req, res) => {
    const { id } = req.params;
    
    try {
        const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
        if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
        if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No autorizado' });
        }
        
        await db.query(`UPDATE ads SET status = 'sold', updated_at = NOW() WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al marcar como vendido' });
    }
});

// ============================================================
// BOOST (DESTACAR ANUNCIO)
// ============================================================
router.post('/:id/boost', verifyToken, async (req, res) => {
    const { id } = req.params;
    
    try {
        const ad = await db.query(`SELECT * FROM ads WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
        if (ad.rows.length === 0) {
            return res.status(404).json({ error: 'Anuncio no encontrado' });
        }
        
        // Verificar que el usuario tiene cuenta verificada
        const user = await db.query(`SELECT verified FROM users WHERE id = $1`, [req.user.id]);
        if (!user.rows[0]?.verified) {
            return res.status(403).json({ error: 'Debes tener cuenta verificada para usar Boost' });
        }
        
        const now = new Date();
        const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        await db.query(
            `UPDATE ads SET boosted_at = $1, boosted_expires = $2, updated_at = NOW() WHERE id = $3`,
            [now, expires, id]
        );
        
        res.json({ success: true, message: 'Anuncio destacado por 24 horas', expires_at: expires });
    } catch (error) {
        res.status(500).json({ error: 'Error al destacar anuncio' });
    }
});

// ============================================================
// ELIMINAR ANUNCIO
// ============================================================
router.delete('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    
    try {
        const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
        if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
        if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No autorizado' });
        }
        
        await db.query(`UPDATE ads SET deleted_at = NOW() WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

module.exports = router;
