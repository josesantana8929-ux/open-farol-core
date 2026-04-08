const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, verifyToken } = require('../utils/jwtUtils');

// ============================================================
// REGISTRO DE USUARIO (con tipo de cuenta)
// ============================================================
router.post('/register', async (req, res) => {
    const { name, email, password, phone, user_type } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }
    
    try {
        const existing = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email ya registrado' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const userType = user_type === 'seller' ? 'seller' : 'buyer';
        
        const result = await db.query(
            `INSERT INTO users (name, email, password, phone, user_type) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, user_type, role, verified, plan_type`,
            [name || email.split('@')[0], email, hashedPassword, phone || null, userType]
        );
        
        const user = result.rows[0];
        const token = generateToken(user);
        
        res.json({ success: true, token, user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar' });
    }
});

// ============================================================
// LOGIN
// ============================================================
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const result = await db.query(`SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`, [email]);
        const user = result.rows[0];
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Email o contraseña incorrectos' });
        }
        
        await db.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);
        
        const token = generateToken(user);
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                user_type: user.user_type,
                role: user.role,
                verified: user.verified,
                plan_type: user.plan_type
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// ============================================================
// OBTENER PERFIL
// ============================================================
router.get('/me', verifyToken, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, name, email, phone, user_type, role, verified, plan_type, plan_expires FROM users WHERE id = $1`,
            [req.user.id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

// ============================================================
// SOLICITAR VERIFICACIÓN DE CUENTA
// ============================================================
router.post('/verify/request', verifyToken, async (req, res) => {
    const { id_photo_front, id_photo_back, selfie_photo } = req.body;
    
    if (!id_photo_front || !id_photo_back) {
        return res.status(400).json({ error: 'Fotos de cédula requeridas' });
    }
    
    try {
        // Verificar si ya tiene solicitud pendiente
        const existing = await db.query(
            `SELECT * FROM verification_requests WHERE user_id = $1 AND status = 'pending'`,
            [req.user.id]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Ya tienes una solicitud pendiente' });
        }
        
        await db.query(
            `INSERT INTO verification_requests (user_id, id_photo_front, id_photo_back, selfie_photo, status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [req.user.id, id_photo_front, id_photo_back, selfie_photo || null]
        );
        
        res.json({ success: true, message: 'Solicitud enviada. Espera revisión del administrador.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al enviar solicitud' });
    }
});

// ============================================================
// OBTENER ESTADO DE VERIFICACIÓN
// ============================================================
router.get('/verify/status', verifyToken, async (req, res) => {
    try {
        const user = await db.query(`SELECT verified, verification_status FROM users WHERE id = $1`, [req.user.id]);
        const request = await db.query(
            `SELECT * FROM verification_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`,
            [req.user.id]
        );
        
        res.json({
            verified: user.rows[0]?.verified || false,
            status: user.rows[0]?.verification_status || 'pending',
            request: request.rows[0] || null
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener estado' });
    }
});

// ============================================================
// SUSCRIBIRSE A PLAN (Pro/Premium)
// ============================================================
router.post('/subscribe/:planName', verifyToken, async (req, res) => {
    const { planName } = req.params;
    
    try {
        const plan = await db.query(`SELECT * FROM plans WHERE name = $1`, [planName]);
        if (plan.rows.length === 0) {
            return res.status(404).json({ error: 'Plan no encontrado' });
        }
        
        const expires = new Date();
        expires.setDate(expires.getDate() + plan.rows[0].duration_days);
        
        await db.query(
            `UPDATE users SET plan_type = $1, plan_expires = $2 WHERE id = $3`,
            [planName, expires, req.user.id]
        );
        
        await db.query(
            `INSERT INTO transactions (user_id, amount, type, item_id, status, payment_method)
             VALUES ($1, $2, $3, $4, 'completed', $5)`,
            [req.user.id, plan.rows[0].price, 'subscription', plan.rows[0].id, 'simulated']
        );
        
        res.json({ success: true, message: `Suscrito a plan ${planName} hasta ${expires.toLocaleDateString()}` });
    } catch (error) {
        res.status(500).json({ error: 'Error al suscribirse' });
    }
});

module.exports = router;
