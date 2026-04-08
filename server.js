const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'mxl_secret_2026';
const SITE_NAME = process.env.SITE_NAME || 'El Farol Clasificados';

// ============================================================
// BASE DE DATOS CON TODAS LAS TABLAS PARA COROTOS-LIKE
// ============================================================
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
    // Usuarios (ampliado para verificación)
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            phone VARCHAR(20),
            user_type VARCHAR(20) DEFAULT 'buyer',
            role VARCHAR(20) DEFAULT 'user',
            verified BOOLEAN DEFAULT FALSE,
            verified_type VARCHAR(20),
            verified_date TIMESTAMP,
            verification_status VARCHAR(20) DEFAULT 'pending',
            id_photo_front TEXT,
            id_photo_back TEXT,
            plan_type VARCHAR(20) DEFAULT 'free',
            plan_expires TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            deleted_at TIMESTAMP
        )
    `);

    // Anuncios (con boost)
    await db.query(`
        CREATE TABLE IF NOT EXISTS ads (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            title VARCHAR(200) NOT NULL,
            description TEXT,
            price DECIMAL(10,2),
            category VARCHAR(100),
            ubicacion_sector VARCHAR(100),
            ubicacion_ciudad VARCHAR(50) DEFAULT 'Santo Domingo Este',
            status VARCHAR(20) DEFAULT 'active',
            views INTEGER DEFAULT 0,
            boosted_at TIMESTAMP,
            boosted_expires TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP,
            deleted_at TIMESTAMP
        )
    `);

    // Solicitudes de verificación
    await db.query(`
        CREATE TABLE IF NOT EXISTS verification_requests (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            id_photo_front TEXT,
            id_photo_back TEXT,
            selfie_photo TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            admin_notes TEXT,
            requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP,
            reviewed_by INTEGER
        )
    `);

    // Pagos/transacciones
    await db.query(`
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            amount DECIMAL(10,2),
            type VARCHAR(30),
            item_id INTEGER,
            status VARCHAR(20) DEFAULT 'pending',
            payment_method VARCHAR(30),
            reference VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    `);

    // Sectores de Santo Domingo Este
    await db.query(`
        CREATE TABLE IF NOT EXISTS sectores (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) UNIQUE NOT NULL,
            ciudad VARCHAR(50) DEFAULT 'Santo Domingo Este'
        )
    `);

    // Insertar sectores por defecto
    const sectores = [
        'Los Mina', 'Invivienda', 'San Vicente', 'Mendoza', 'Cancino',
        'Alma Rosa', 'Villa Francisca', 'Villa Duarte', 'Miami Este',
        'Brisas del Este', 'Residencial del Este', 'San Isidro',
        'Lucerna', 'Villa Faro', 'Los Trinitarios', 'El Paredón'
    ];
    
    for (const sector of sectores) {
        await db.query(`INSERT INTO sectores (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`, [sector]);
    }

    // Planes de suscripción
    await db.query(`
        CREATE TABLE IF NOT EXISTS plans (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) UNIQUE NOT NULL,
            price DECIMAL(10,2),
            duration_days INTEGER,
            features JSONB
        )
    `);

    // Insertar planes por defecto
    await db.query(`INSERT INTO plans (name, price, duration_days, features) VALUES 
        ('pro', 399, 30, '["perfil_tienda", "anuncios_destacados", "soporte_prioritario"]'),
        ('premium', 799, 30, '["perfil_tienda", "anuncios_destacados", "soporte_prioritario", "boost_mensual", "insignia_premium", "primeros_resultados"]')
    ON CONFLICT (name) DO NOTHING`);

    // Crear admin por defecto
    const adminEmail = 'admin@elfarol.com.do';
    const adminExists = await db.query(`SELECT * FROM users WHERE email = $1`, [adminEmail]);
    if (adminExists.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.query(
            `INSERT INTO users (name, email, password, role, user_type, verified) VALUES ($1, $2, $3, $4, $5, $6)`,
            ['Administrador', adminEmail, hashedPassword, 'admin', 'seller', true]
        );
        console.log('✅ Admin creado: admin@elfarol.com.do / admin123');
    }

    console.log('✅ Base de datos lista - Modo Corotos activado');
}

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ============================================================
// UTILS
// ============================================================
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, user_type: user.user_type, verified: user.verified, plan_type: user.plan_type },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token requerido' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido' });
    }
};

// ============================================================
// VERIFICACIÓN DE CUENTA (estilo Corotos)
// ============================================================

// Solicitar verificación (subir fotos de cédula)
app.post('/api/verify/request', verifyToken, async (req, res) => {
    const { id_photo_front, id_photo_back, selfie_photo } = req.body;
    
    if (!id_photo_front || !id_photo_back) {
        return res.status(400).json({ error: 'Fotos de cédula requeridas' });
    }
    
    try {
        // Guardar solicitud
        await db.query(
            `INSERT INTO verification_requests (user_id, id_photo_front, id_photo_back, selfie_photo, status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [req.user.id, id_photo_front, id_photo_back, selfie_photo || null]
        );
        
        res.json({ success: true, message: 'Solicitud enviada. Espera revisión del admin.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al enviar solicitud' });
    }
});

// Obtener estado de verificación
app.get('/api/verify/status', verifyToken, async (req, res) => {
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
});

// Admin: Listar solicitudes de verificación pendientes
app.get('/api/admin/verification-requests', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    const result = await db.query(`
        SELECT vr.*, u.name, u.email, u.phone
        FROM verification_requests vr
        JOIN users u ON vr.user_id = u.id
        WHERE vr.status = 'pending'
        ORDER BY vr.requested_at ASC
    `);
    
    res.json({ requests: result.rows });
});

// Admin: Aprobar/rechazar verificación
app.post('/api/admin/verify/:userId/:action', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    const { userId, action } = req.params;
    const { notes } = req.body;
    
    if (action === 'approve') {
        await db.query(
            `UPDATE users SET verified = true, verification_status = 'approved', verified_date = NOW() WHERE id = $1`,
            [userId]
        );
        await db.query(
            `UPDATE verification_requests SET status = 'approved', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE user_id = $3 AND status = 'pending'`,
            [notes, req.user.id, userId]
        );
        res.json({ success: true, message: 'Usuario verificado exitosamente' });
    } else if (action === 'reject') {
        await db.query(
            `UPDATE verification_requests SET status = 'rejected', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE user_id = $3 AND status = 'pending'`,
            [notes, req.user.id, userId]
        );
        res.json({ success: true, message: 'Solicitud rechazada' });
    } else {
        res.status(400).json({ error: 'Acción inválida' });
    }
});

// ============================================================
// BOOST (Destacar anuncio - estilo Corotos)
// ============================================================

// Aplicar boost a un anuncio
app.post('/api/ads/:id/boost', verifyToken, async (req, res) => {
    const { id } = req.params;
    
    // Verificar que el anuncio es del usuario
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
    if (ad.rows.length === 0) {
        return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    
    // Verificar que el usuario tiene plan premium (boost mensual gratis) o va a pagar
    // Por ahora, simulamos que cualquier vendedor verificado puede boostear
    if (!req.user.verified && req.user.plan_type !== 'premium') {
        return res.status(403).json({ error: 'Debes tener cuenta verificada para usar Boost' });
    }
    
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    await db.query(
        `UPDATE ads SET boosted_at = $1, boosted_expires = $2, updated_at = NOW() WHERE id = $3`,
        [now, expires, id]
    );
    
    // Registrar transacción (simulada)
    await db.query(
        `INSERT INTO transactions (user_id, amount, type, item_id, status, payment_method)
         VALUES ($1, $2, $3, $4, 'completed', $5)`,
        [req.user.id, 199, 'boost', id, 'simulated']
    );
    
    res.json({ success: true, message: 'Anuncio destacado por 24 horas', expires_at: expires });
});

// ============================================================
// PLANES PRO/PREMIUM (suscripciones)
// ============================================================

// Obtener planes disponibles
app.get('/api/plans', async (req, res) => {
    const result = await db.query(`SELECT * FROM plans ORDER BY price ASC`);
    res.json({ plans: result.rows });
});

// Suscribirse a un plan
app.post('/api/subscribe/:planName', verifyToken, async (req, res) => {
    const { planName } = req.params;
    
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
});

// ============================================================
// ANUNCIOS CON FILTRO "SOLO VERIFICADOS"
// ============================================================

// Listar anuncios con filtros (incluyendo solo verificados)
app.get('/api/ads', async (req, res) => {
    const { categoria, sector, search, verified_only, limit = 20, offset = 0 } = req.query;
    
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
});

// ============================================================
// RESTO DE ENDPOINTS (autenticación, CRUD anuncios, etc.)
// ============================================================

// Registro (con opción de tipo de cuenta)
app.post('/api/auth/register', async (req, res) => {
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

// Login
app.post('/api/auth/login', async (req, res) => {
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

// Obtener perfil
app.get('/api/auth/me', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT id, name, email, phone, user_type, role, verified, plan_type, plan_expires FROM users WHERE id = $1`, [req.user.id]);
    res.json(result.rows[0]);
});

// Crear anuncio (solo vendedores)
app.post('/api/ads', verifyToken, async (req, res) => {
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

// Mis anuncios
app.get('/api/ads/my-ads', verifyToken, async (req, res) => {
    const result = await db.query(
        `SELECT *, 
                CASE WHEN boosted_expires > NOW() THEN true ELSE false END as is_boosted
         FROM ads WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
        [req.user.id]
    );
    res.json({ ads: result.rows });
});

// Actualizar anuncio
app.put('/api/ads/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, price, category, ubicacion_sector, status } = req.body;
    
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
});

// Marcar como vendido
app.put('/api/ads/:id/sold', verifyToken, async (req, res) => {
    const { id } = req.params;
    
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'No autorizado' });
    }
    
    await db.query(`UPDATE ads SET status = 'sold', updated_at = NOW() WHERE id = $1`, [id]);
    res.json({ success: true });
});

// Eliminar anuncio
app.delete('/api/ads/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'No autorizado' });
    }
    
    await db.query(`UPDATE ads SET deleted_at = NOW() WHERE id = $1`, [id]);
    res.json({ success: true });
});

// Ver detalle de anuncio
app.get('/api/ads/:id', async (req, res) => {
    const { id } = req.params;
    
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
});

// Obtener sectores
app.get('/api/sectores', async (req, res) => {
    const result = await db.query(`SELECT * FROM sectores ORDER BY nombre`);
    res.json({ sectores: result.rows });
});

// Obtener categorías
app.get('/api/categorias', async (req, res) => {
    const result = await db.query(`
        SELECT DISTINCT category, COUNT(*) as total 
        FROM ads 
        WHERE deleted_at IS NULL AND status = 'active' AND category IS NOT NULL
        GROUP BY category ORDER BY total DESC
    `);
    res.json({ categorias: result.rows });
});

// ============================================================
// ADMIN: Estadísticas
// ============================================================
app.get('/api/admin/stats', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    const [users, ads, activeAds, soldAds, verifiedUsers, pendingVerifications] = await Promise.all([
        db.query(`SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM ads WHERE deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM ads WHERE status = 'active' AND deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM ads WHERE status = 'sold' AND deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM users WHERE verified = true`),
        db.query(`SELECT COUNT(*) FROM verification_requests WHERE status = 'pending'`)
    ]);
    
    res.json({
        totalUsers: parseInt(users.rows[0].count),
        totalAds: parseInt(ads.rows[0].count),
        activeAds: parseInt(activeAds.rows[0].count),
        soldAds: parseInt(soldAds.rows[0].count),
        verifiedUsers: parseInt(verifiedUsers.rows[0].count),
        pendingVerifications: parseInt(pendingVerifications.rows[0].count)
    });
});

// ============================================================
// FRONTEND
// ============================================================
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

app.use(express.static(publicDir));
app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// ============================================================
// INICIO
// ============================================================
async function start() {
    await initDB();
    app.listen(PORT, () => {
        console.log(`\n🚀 ${SITE_NAME} iniciado en http://localhost:${PORT}`);
        console.log(`👑 Admin: admin@elfarol.com.do / admin123`);
        console.log(`✅ Modo Corotos: Verificación + Boost + Planes + Filtro verificados\n`);
    });
}

start();
