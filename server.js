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
const JWT_SECRET = process.env.JWT_SECRET || 'el_farol_secret_2026';
const SITE_NAME = process.env.SITE_NAME || 'El Farol Clasificados';
const isProduction = process.env.NODE_ENV === 'production';

// ============================================================
// BASE DE DATOS
// ============================================================
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
});

async function initDB() {
    // TABLA USERS (sin columna verified al inicio)
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            phone VARCHAR(20),
            user_type VARCHAR(20) DEFAULT 'buyer',
            role VARCHAR(20) DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            deleted_at TIMESTAMP
        )
    `);

    // Agregar columna verified si no existe
    await db.query(`
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name = 'users' AND column_name = 'verified') THEN
                ALTER TABLE users ADD COLUMN verified BOOLEAN DEFAULT FALSE;
            END IF;
        END $$;
    `);

    // Agregar columna verification_status si no existe
    await db.query(`
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name = 'users' AND column_name = 'verification_status') THEN
                ALTER TABLE users ADD COLUMN verification_status VARCHAR(20) DEFAULT 'pending';
            END IF;
        END $$;
    `);

    // Agregar columna verified_date si no existe
    await db.query(`
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name = 'users' AND column_name = 'verified_date') THEN
                ALTER TABLE users ADD COLUMN verified_date TIMESTAMP;
            END IF;
        END $$;
    `);

    // Agregar columna plan_type si no existe
    await db.query(`
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name = 'users' AND column_name = 'plan_type') THEN
                ALTER TABLE users ADD COLUMN plan_type VARCHAR(20) DEFAULT 'free';
            END IF;
        END $$;
    `);

    // Agregar columna plan_expires si no existe
    await db.query(`
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name = 'users' AND column_name = 'plan_expires') THEN
                ALTER TABLE users ADD COLUMN plan_expires TIMESTAMP;
            END IF;
        END $$;
    `);

    // Agregar columna avatar si no existe
    await db.query(`
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name = 'users' AND column_name = 'avatar') THEN
                ALTER TABLE users ADD COLUMN avatar TEXT;
            END IF;
        END $$;
    `);

    // TABLA ADS (anuncios)
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

    // TABLA VERIFICATION_REQUESTS
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

    // TABLA OFFERS (ofertas)
    await db.query(`
        CREATE TABLE IF NOT EXISTS offers (
            id SERIAL PRIMARY KEY,
            ad_id INTEGER REFERENCES ads(id),
            buyer_id INTEGER REFERENCES users(id),
            seller_id INTEGER REFERENCES users(id),
            offered_price DECIMAL(10,2),
            message TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            payment_method VARCHAR(50),
            delivery_location TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP
        )
    `);

    // TABLA FAVORITES
    await db.query(`
        CREATE TABLE IF NOT EXISTS favorites (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            ad_id INTEGER REFERENCES ads(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, ad_id)
        )
    `);

    // TABLA SECTORES
    await db.query(`
        CREATE TABLE IF NOT EXISTS sectores (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) UNIQUE NOT NULL,
            ciudad VARCHAR(50) DEFAULT 'Santo Domingo Este'
        )
    `);

    // Insertar sectores por defecto
    const sectores = ['Los Mina', 'Invivienda', 'San Vicente', 'Mendoza', 'Cancino', 'Alma Rosa', 'Villa Francisca', 'Villa Duarte', 'Miami Este', 'Brisas del Este', 'Residencial del Este', 'San Isidro', 'Lucerna', 'Villa Faro', 'Los Trinitarios', 'El Paredón'];
    for (const sector of sectores) {
        await db.query(`INSERT INTO sectores (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`, [sector]);
    }

    // TABLA PLANS
    await db.query(`
        CREATE TABLE IF NOT EXISTS plans (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) UNIQUE NOT NULL,
            price DECIMAL(10,2),
            duration_days INTEGER,
            features JSONB
        )
    `);

    await db.query(`INSERT INTO plans (name, price, duration_days, features) VALUES ('pro', 399, 30, '["perfil_tienda","anuncios_destacados"]'), ('premium', 799, 30, '["perfil_tienda","anuncios_destacados","boost_mensual","insignia_premium"]') ON CONFLICT (name) DO NOTHING`);

    // Crear admin por defecto
    const adminEmail = 'admin@elfarol.com.do';
    const adminExists = await db.query(`SELECT * FROM users WHERE email = $1`, [adminEmail]);
    if (adminExists.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.query(`INSERT INTO users (name, email, password, role, user_type, verified) VALUES ($1, $2, $3, $4, $5, $6)`, ['Administrador', adminEmail, hashedPassword, 'admin', 'seller', true]);
        console.log('✅ Admin creado: admin@elfarol.com.do / admin123');
    } else if (adminExists.rows[0].role !== 'admin') {
        await db.query(`UPDATE users SET role = 'admin', verified = true WHERE email = $1`, [adminEmail]);
        console.log('✅ Usuario actualizado a admin');
    }

    console.log('✅ Base de datos inicializada correctamente');
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

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ============================================================
// UTILS
// ============================================================
const generateToken = (user) => {
    return jwt.sign({ 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        user_type: user.user_type, 
        verified: user.verified || false, 
        plan_type: user.plan_type || 'free' 
    }, JWT_SECRET, { expiresIn: '7d' });
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
// AUTENTICACIÓN
// ============================================================
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, phone, user_type } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
    try {
        const existing = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Email ya registrado' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const userType = user_type === 'seller' ? 'seller' : 'buyer';
        const result = await db.query(
            `INSERT INTO users (name, email, password, phone, user_type) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, user_type, role, verified, plan_type`,
            [name || email.split('@')[0], email, hashedPassword, phone || null, userType]
        );
        const user = result.rows[0];
        const token = generateToken(user);
        res.json({ success: true, token, user });
    } catch (error) { res.status(500).json({ error: 'Error al registrar' }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await db.query(`SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`, [email]);
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
        await db.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);
        const token = generateToken(user);
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, user_type: user.user_type, role: user.role, verified: user.verified, plan_type: user.plan_type } });
    } catch (error) { res.status(500).json({ error: 'Error al iniciar sesión' }); }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT id, name, email, phone, user_type, role, verified, plan_type, plan_expires FROM users WHERE id = $1`, [req.user.id]);
    res.json(result.rows[0]);
});

// ============================================================
// VERIFICACIÓN
// ============================================================
app.post('/api/auth/verify/request', verifyToken, async (req, res) => {
    const { id_photo_front, id_photo_back, selfie_photo } = req.body;
    if (!id_photo_front || !id_photo_back) return res.status(400).json({ error: 'Fotos de cédula requeridas' });
    try {
        await db.query(`INSERT INTO verification_requests (user_id, id_photo_front, id_photo_back, selfie_photo, status) VALUES ($1, $2, $3, $4, 'pending')`, [req.user.id, id_photo_front, id_photo_back, selfie_photo || null]);
        res.json({ success: true, message: 'Solicitud enviada. Espera revisión del administrador.' });
    } catch (error) { res.status(500).json({ error: 'Error al enviar solicitud' }); }
});

app.get('/api/auth/verify/status', verifyToken, async (req, res) => {
    const user = await db.query(`SELECT verified, verification_status FROM users WHERE id = $1`, [req.user.id]);
    const request = await db.query(`SELECT * FROM verification_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`, [req.user.id]);
    res.json({ verified: user.rows[0]?.verified || false, status: user.rows[0]?.verification_status || 'pending', request: request.rows[0] || null });
});

// ============================================================
// ANUNCIOS
// ============================================================
app.get('/api/ads', async (req, res) => {
    const { categoria, sector, search, verified_only, limit = 20, offset = 0 } = req.query;
    let query = `SELECT a.*, u.name as user_name, u.phone as user_phone, u.verified, u.plan_type FROM ads a JOIN users u ON a.user_id = u.id WHERE a.deleted_at IS NULL AND a.status = 'active'`;
    const params = [];
    let paramIndex = 1;
    if (categoria) { query += ` AND a.category = $${paramIndex++}`; params.push(categoria); }
    if (sector) { query += ` AND a.ubicacion_sector = $${paramIndex++}`; params.push(sector); }
    if (search) { query += ` AND (a.title ILIKE $${paramIndex++} OR a.description ILIKE $${paramIndex++})`; params.push(`%${search}%`, `%${search}%`); }
    if (verified_only === 'true') { query += ` AND u.verified = true`; }
    query += ` ORDER BY CASE WHEN a.boosted_expires > NOW() THEN 1 ELSE 0 END DESC, a.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);
    const result = await db.query(query, params);
    const adsWithBadges = result.rows.map(ad => ({ ...ad, badges: { verified: ad.verified, boosted: ad.boosted_expires && new Date(ad.boosted_expires) > new Date(), pro: ad.plan_type === 'pro', premium: ad.plan_type === 'premium' } }));
    res.json({ ads: adsWithBadges });
});

app.get('/api/ads/:id', async (req, res) => {
    const { id } = req.params;
    await db.query(`UPDATE ads SET views = views + 1 WHERE id = $1`, [id]);
    const result = await db.query(`SELECT a.*, u.name as user_name, u.phone as user_phone, u.email as user_email, u.verified, u.plan_type FROM ads a JOIN users u ON a.user_id = u.id WHERE a.id = $1 AND a.deleted_at IS NULL`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    const ad = result.rows[0];
    ad.badges = { verified: ad.verified, boosted: ad.boosted_expires && new Date(ad.boosted_expires) > new Date(), pro: ad.plan_type === 'pro', premium: ad.plan_type === 'premium' };
    res.json({ ad });
});

app.post('/api/ads', verifyToken, async (req, res) => {
    if (req.user.user_type !== 'seller' && req.user.role !== 'admin') return res.status(403).json({ error: 'Solo vendedores pueden publicar' });
    const { title, description, price, category, ubicacion_sector } = req.body;
    if (!title || !ubicacion_sector) return res.status(400).json({ error: 'Título y ubicación requeridos' });
    const result = await db.query(`INSERT INTO ads (user_id, title, description, price, category, ubicacion_sector, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`, [req.user.id, title, description, price || 0, category, ubicacion_sector]);
    res.json({ success: true, ad: result.rows[0] });
});

app.get('/api/ads/my-ads', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT *, CASE WHEN boosted_expires > NOW() THEN true ELSE false END as is_boosted FROM ads WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [req.user.id]);
    res.json({ ads: result.rows });
});

app.put('/api/ads/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, price, category, ubicacion_sector, status } = req.body;
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    await db.query(`UPDATE ads SET title = COALESCE($1, title), description = COALESCE($2, description), price = COALESCE($3, price), category = COALESCE($4, category), ubicacion_sector = COALESCE($5, ubicacion_sector), status = COALESCE($6, status), updated_at = NOW() WHERE id = $7`, [title, description, price, category, ubicacion_sector, status, id]);
    res.json({ success: true });
});

app.put('/api/ads/:id/sold', verifyToken, async (req, res) => {
    const { id } = req.params;
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    await db.query(`UPDATE ads SET status = 'sold', updated_at = NOW() WHERE id = $1`, [id]);
    res.json({ success: true });
});

app.post('/api/ads/:id/boost', verifyToken, async (req, res) => {
    const { id } = req.params;
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    const user = await db.query(`SELECT verified FROM users WHERE id = $1`, [req.user.id]);
    if (!user.rows[0]?.verified) return res.status(403).json({ error: 'Debes tener cuenta verificada para usar Boost' });
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await db.query(`UPDATE ads SET boosted_at = $1, boosted_expires = $2, updated_at = NOW() WHERE id = $3`, [now, expires, id]);
    res.json({ success: true, message: 'Anuncio destacado por 24 horas', expires_at: expires });
});

app.delete('/api/ads/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    await db.query(`UPDATE ads SET deleted_at = NOW() WHERE id = $1`, [id]);
    res.json({ success: true });
});

// ============================================================
// OFERTAS
// ============================================================
app.post('/api/ads/:id/offer', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { offered_price, message, payment_method, delivery_location } = req.body;
    if (req.user.user_type !== 'buyer' && req.user.role !== 'admin') return res.status(403).json({ error: 'Solo compradores pueden hacer ofertas' });
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    const result = await db.query(`INSERT INTO offers (ad_id, buyer_id, seller_id, offered_price, message, payment_method, delivery_location, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`, [id, req.user.id, ad.rows[0].user_id, offered_price, message, payment_method, delivery_location]);
    res.json({ success: true, offer: result.rows[0] });
});

app.get('/api/offers/received', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT o.*, a.title as ad_title, u.name as buyer_name, u.phone as buyer_phone FROM offers o JOIN ads a ON o.ad_id = a.id JOIN users u ON o.buyer_id = u.id WHERE o.seller_id = $1 AND o.status = 'pending' ORDER BY o.created_at DESC`, [req.user.id]);
    res.json({ offers: result.rows });
});

app.put('/api/offers/:id/:action', verifyToken, async (req, res) => {
    const { id, action } = req.params;
    const { counter_price, message } = req.body;
    if (action !== 'accept' && action !== 'reject' && action !== 'counter') return res.status(400).json({ error: 'Acción inválida' });
    const offer = await db.query(`SELECT * FROM offers WHERE id = $1`, [id]);
    if (offer.rows.length === 0) return res.status(404).json({ error: 'Oferta no encontrada' });
    let newStatus = action === 'accept' ? 'accepted' : (action === 'reject' ? 'rejected' : 'counter');
    await db.query(`UPDATE offers SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, id]);
    if (action === 'counter' && counter_price) {
        await db.query(`INSERT INTO offers (ad_id, buyer_id, seller_id, offered_price, message, status, payment_method, delivery_location) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`, [offer.rows[0].ad_id, offer.rows[0].seller_id, offer.rows[0].buyer_id, counter_price, message, offer.rows[0].payment_method, offer.rows[0].delivery_location]);
    }
    res.json({ success: true });
});

// ============================================================
// FAVORITOS
// ============================================================
app.post('/api/favorites/:adId', verifyToken, async (req, res) => {
    const { adId } = req.params;
    await db.query(`INSERT INTO favorites (user_id, ad_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.user.id, adId]);
    res.json({ success: true });
});

app.delete('/api/favorites/:adId', verifyToken, async (req, res) => {
    const { adId } = req.params;
    await db.query(`DELETE FROM favorites WHERE user_id = $1 AND ad_id = $2`, [req.user.id, adId]);
    res.json({ success: true });
});

app.get('/api/favorites', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT a.* FROM ads a JOIN favorites f ON a.id = f.ad_id WHERE f.user_id = $1 AND a.deleted_at IS NULL`, [req.user.id]);
    res.json({ favorites: result.rows });
});

// ============================================================
// DATOS AUXILIARES
// ============================================================
app.get('/api/sectores', async (req, res) => {
    const result = await db.query(`SELECT * FROM sectores ORDER BY nombre`);
    res.json({ sectores: result.rows });
});

app.get('/api/categorias', async (req, res) => {
    const result = await db.query(`SELECT DISTINCT category, COUNT(*) as total FROM ads WHERE deleted_at IS NULL AND status = 'active' AND category IS NOT NULL GROUP BY category ORDER BY total DESC`);
    res.json({ categorias: result.rows });
});

app.get('/api/plans', async (req, res) => {
    const result = await db.query(`SELECT * FROM plans ORDER BY price ASC`);
    res.json({ plans: result.rows });
});

// ============================================================
// ADMIN
// ============================================================
const verifyAdmin = async (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    next();
};

app.get('/api/admin/stats', verifyToken, verifyAdmin, async (req, res) => {
    const [users, ads, activeAds, verifiedUsers, pendingVerifications] = await Promise.all([
        db.query(`SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM ads WHERE deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM ads WHERE status = 'active' AND deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM users WHERE verified = true`),
        db.query(`SELECT COUNT(*) FROM verification_requests WHERE status = 'pending'`)
    ]);
    res.json({ totalUsers: parseInt(users.rows[0].count), totalAds: parseInt(ads.rows[0].count), activeAds: parseInt(activeAds.rows[0].count), verifiedUsers: parseInt(verifiedUsers.rows[0].count), pendingVerifications: parseInt(pendingVerifications.rows[0].count) });
});

app.get('/api/admin/verification-requests', verifyToken, verifyAdmin, async (req, res) => {
    const result = await db.query(`SELECT vr.*, u.name, u.email, u.phone FROM verification_requests vr JOIN users u ON vr.user_id = u.id WHERE vr.status = 'pending' ORDER BY vr.requested_at ASC`);
    res.json({ requests: result.rows });
});

app.post('/api/admin/verify/:userId/approve', verifyToken, verifyAdmin, async (req, res) => {
    const { userId } = req.params;
    const { notes } = req.body;
    await db.query(`UPDATE users SET verified = true, verification_status = 'approved', verified_date = NOW() WHERE id = $1`, [userId]);
    await db.query(`UPDATE verification_requests SET status = 'approved', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE user_id = $3 AND status = 'pending'`, [notes, req.user.id, userId]);
    res.json({ success: true });
});

app.post('/api/admin/verify/:userId/reject', verifyToken, verifyAdmin, async (req, res) => {
    const { userId } = req.params;
    const { notes } = req.body;
    await db.query(`UPDATE verification_requests SET status = 'rejected', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE user_id = $3 AND status = 'pending'`, [notes, req.user.id, userId]);
    res.json({ success: true });
});

app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    const result = await db.query(`SELECT id, name, email, phone, user_type, role, verified, plan_type, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`);
    res.json({ users: result.rows });
});

app.get('/api/admin/ads', verifyToken, verifyAdmin, async (req, res) => {
    const result = await db.query(`SELECT a.*, u.email as user_email, u.name as user_name FROM ads a JOIN users u ON a.user_id = u.id WHERE a.deleted_at IS NULL ORDER BY a.created_at DESC LIMIT 100`);
    res.json({ ads: result.rows });
});

app.delete('/api/admin/ads/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    await db.query(`UPDATE ads SET deleted_at = NOW() WHERE id = $1`, [id]);
    res.json({ success: true });
});

// ============================================================
// FRONTEND
// ============================================================
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

app.use(express.static(publicDir));
app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// ============================================================
// INICIO
// ============================================================
async function start() {
    try {
        await initDB();
        app.listen(PORT, () => {
            console.log(`\n🚀 ${SITE_NAME} iniciado en http://localhost:${PORT}`);
            console.log(`👑 Admin: admin@elfarol.com.do / admin123`);
            console.log(`✅ Modo Corotos: Verificación + Boost + Ofertas + Favoritos\n`);
        });
    } catch (error) {
        console.error('❌ Error al iniciar:', error.message);
        process.exit(1);
    }
}

start();
