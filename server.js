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
const multer = require('multer');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'el_farol_secret_2026';
const SITE_NAME = process.env.SITE_NAME || 'El Farol Clasificados';
const isProduction = process.env.NODE_ENV === 'production';

// ============================================================
// CONFIGURACIÓN DE MULTER PARA MULTIMEDIA
// ============================================================
const uploadDir = path.join(__dirname, 'public/uploads');
const avatarDir = path.join(__dirname, 'public/uploads/avatars');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'avatar') cb(null, avatarDir);
        else cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    cb(null, mimetype && extname);
};

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

// ============================================================
// CACHÉ
// ============================================================
const cache = { sectores: { data: null, expires: 0 }, categorias: { data: null, expires: 0 }, stats: { data: null, expires: 0 } };
const CACHE_TTL = 5 * 60 * 1000;
function getCache(key) { const item = cache[key]; if (item && item.expires > Date.now()) return item.data; return null; }
function setCache(key, data) { cache[key] = { data, expires: Date.now() + CACHE_TTL }; }
function clearCache() { cache.sectores.data = null; cache.categorias.data = null; cache.stats.data = null; }

// ============================================================
// BASE DE DATOS
// ============================================================
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 20, min: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
});
db.on('error', (err) => console.error('❌ DB pool error:', err.message));

async function initDB() {
    await db.query(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL, phone VARCHAR(20), user_type VARCHAR(20) DEFAULT 'buyer',
        role VARCHAR(20) DEFAULT 'user', verified BOOLEAN DEFAULT FALSE,
        verification_status VARCHAR(20) DEFAULT 'pending', verified_date TIMESTAMP,
        plan_type VARCHAR(20) DEFAULT 'free', plan_expires TIMESTAMP, avatar TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP, deleted_at TIMESTAMP
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS ads (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), title VARCHAR(200) NOT NULL,
        description TEXT, price DECIMAL(10,2), category VARCHAR(100), ubicacion_sector VARCHAR(100),
        ubicacion_ciudad VARCHAR(50) DEFAULT 'Santo Domingo Este', status VARCHAR(20) DEFAULT 'active',
        views INTEGER DEFAULT 0, boosted_at TIMESTAMP, boosted_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP,
        deleted_at TIMESTAMP, deleted_reason TEXT, deleted_by VARCHAR(100)
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS ad_images (
        id SERIAL PRIMARY KEY, ad_id INTEGER REFERENCES ads(id), image_url TEXT NOT NULL,
        is_primary BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS verification_requests (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
        id_photo_front TEXT, id_photo_back TEXT, selfie_photo TEXT,
        status VARCHAR(20) DEFAULT 'pending', admin_notes TEXT,
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, reviewed_at TIMESTAMP, reviewed_by INTEGER
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS offers (
        id SERIAL PRIMARY KEY, ad_id INTEGER REFERENCES ads(id), buyer_id INTEGER REFERENCES users(id),
        seller_id INTEGER REFERENCES users(id), offered_price DECIMAL(10,2), message TEXT,
        status VARCHAR(20) DEFAULT 'pending', payment_method VARCHAR(50), delivery_location TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), ad_id INTEGER REFERENCES ads(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, ad_id)
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS sectores (
        id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE NOT NULL, ciudad VARCHAR(50) DEFAULT 'Santo Domingo Este'
    )`);
    const sectores = ['Los Mina', 'Invivienda', 'San Vicente', 'Mendoza', 'Cancino', 'Alma Rosa', 'Villa Francisca', 'Villa Duarte', 'Miami Este', 'Brisas del Este', 'Residencial del Este', 'San Isidro', 'Lucerna', 'Villa Faro', 'Los Trinitarios', 'El Paredón'];
    for (const sector of sectores) await db.query(`INSERT INTO sectores (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`, [sector]);
    
    await db.query(`CREATE TABLE IF NOT EXISTS plans (
        id SERIAL PRIMARY KEY, name VARCHAR(50) UNIQUE NOT NULL, price DECIMAL(10,2),
        duration_days INTEGER, features JSONB
    )`);
    await db.query(`INSERT INTO plans (name, price, duration_days, features) VALUES 
        ('pro', 399, 30, '["perfil_tienda","anuncios_destacados"]'),
        ('premium', 799, 30, '["perfil_tienda","anuncios_destacados","boost_mensual","insignia_premium"]')
        ON CONFLICT (name) DO NOTHING`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), user_name VARCHAR(100),
        user_email VARCHAR(100), subject VARCHAR(200), message TEXT, status VARCHAR(20) DEFAULT 'pending',
        priority VARCHAR(20) DEFAULT 'normal', admin_response TEXT, responded_at TIMESTAMP,
        resolved_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY, ticket_id INTEGER REFERENCES support_tickets(id),
        sender_type VARCHAR(20), message TEXT, is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS support_notifications (
        id SERIAL PRIMARY KEY, type VARCHAR(50), message TEXT, link VARCHAR(255),
        is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY, action VARCHAR(50), admin_email VARCHAR(100),
        ad_id INTEGER, ad_title TEXT, seller_email VARCHAR(100), reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status) WHERE deleted_at IS NULL`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ads_user_id ON ads(user_id) WHERE deleted_at IS NULL`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ads_created_at ON ads(created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    
    const adminEmail = 'admin@elfarol.com.do';
    const adminExists = await db.query(`SELECT * FROM users WHERE email = $1`, [adminEmail]);
    if (adminExists.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.query(`INSERT INTO users (name, email, password, role, user_type, verified) VALUES ($1, $2, $3, $4, $5, $6)`,
            ['Administrador', adminEmail, hashedPassword, 'admin', 'seller', true]);
        console.log('✅ Admin creado: admin@elfarol.com.do / admin123');
    }
    console.log('✅ Base de datos lista');
}

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], imgSrc: ["'self'", "data:", "https:"], }, }, }));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api/', limiter);
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ============================================================
// UTILS
// ============================================================
const generateToken = (user) => jwt.sign({ id: user.id, email: user.email, role: user.role, user_type: user.user_type, verified: user.verified || false, plan_type: user.plan_type || 'free' }, JWT_SECRET, { expiresIn: '7d' });
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token requerido' });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Token inválido' }); }
};
const verifyAdmin = async (req, res, next) => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' }); next(); };

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
        const result = await db.query(`INSERT INTO users (name, email, password, phone, user_type) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, user_type, role, verified, plan_type`,
            [name || email.split('@')[0], email, hashedPassword, phone || null, userType]);
        const user = result.rows[0];
        const token = generateToken(user);
        clearCache();
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
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, user_type: user.user_type, role: user.role, verified: user.verified, plan_type: user.plan_type, avatar: user.avatar } });
    } catch (error) { res.status(500).json({ error: 'Error al iniciar sesión' }); }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT id, name, email, phone, user_type, role, verified, plan_type, plan_expires, avatar FROM users WHERE id = $1`, [req.user.id]);
    res.json(result.rows[0]);
});

// ============================================================
// AVATAR
// ============================================================
app.post('/api/users/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await db.query(`UPDATE users SET avatar = $1 WHERE id = $2`, [avatarUrl, req.user.id]);
    res.json({ success: true, avatar: avatarUrl });
});

// ============================================================
// VERIFICACIÓN
// ============================================================
app.post('/api/auth/verify/request', verifyToken, async (req, res) => {
    const { id_photo_front, id_photo_back, selfie_photo } = req.body;
    if (!id_photo_front || !id_photo_back) return res.status(400).json({ error: 'Fotos de cédula requeridas' });
    try {
        await db.query(`INSERT INTO verification_requests (user_id, id_photo_front, id_photo_back, selfie_photo, status) VALUES ($1, $2, $3, $4, 'pending')`,
            [req.user.id, id_photo_front, id_photo_back, selfie_photo || null]);
        await db.query(`INSERT INTO support_notifications (type, message, link) VALUES ('verification', 'Nueva solicitud de verificación de ${req.user.email}', '/admin-verifications')`);
        res.json({ success: true, message: 'Solicitud enviada. Espera revisión del administrador.' });
    } catch (error) { res.status(500).json({ error: 'Error al enviar solicitud' }); }
});

app.get('/api/auth/verify/status', verifyToken, async (req, res) => {
    const user = await db.query(`SELECT verified, verification_status FROM users WHERE id = $1`, [req.user.id]);
    const request = await db.query(`SELECT * FROM verification_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`, [req.user.id]);
    res.json({ verified: user.rows[0]?.verified || false, status: user.rows[0]?.verification_status || 'pending', request: request.rows[0] || null });
});

// ============================================================
// ANUNCIOS CON MULTIMEDIA
// ============================================================
app.get('/api/ads', async (req, res) => {
    const { categoria, sector, search, verified_only, limit = 20, offset = 0 } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 20, 50);
    const safeOffset = parseInt(offset) || 0;
    let query = `SELECT a.id, a.title, a.description, a.price, a.ubicacion_sector, a.status, a.views, a.created_at, a.boosted_expires, (SELECT image_url FROM ad_images WHERE ad_id = a.id AND is_primary = true LIMIT 1) as primary_image, u.name as user_name, u.verified, u.plan_type FROM ads a JOIN users u ON a.user_id = u.id WHERE a.deleted_at IS NULL AND a.status = 'active'`;
    const params = []; let idx = 1;
    if (categoria) { query += ` AND a.category = $${idx++}`; params.push(categoria); }
    if (sector) { query += ` AND a.ubicacion_sector = $${idx++}`; params.push(sector); }
    if (search) { query += ` AND (a.title ILIKE $${idx++} OR a.description ILIKE $${idx++})`; params.push(`%${search}%`, `%${search}%`); }
    if (verified_only === 'true') { query += ` AND u.verified = true`; }
    query += ` ORDER BY CASE WHEN a.boosted_expires > NOW() THEN 1 ELSE 0 END DESC, a.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(safeLimit, safeOffset);
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
    const images = await db.query(`SELECT * FROM ad_images WHERE ad_id = $1 ORDER BY is_primary DESC, created_at ASC`, [id]);
    ad.badges = { verified: ad.verified, boosted: ad.boosted_expires && new Date(ad.boosted_expires) > new Date(), pro: ad.plan_type === 'pro', premium: ad.plan_type === 'premium' };
    ad.images = images.rows;
    res.json({ ad });
});

app.post('/api/ads', verifyToken, async (req, res) => {
    if (req.user.user_type !== 'seller' && req.user.role !== 'admin') return res.status(403).json({ error: 'Solo vendedores pueden publicar' });
    const { title, description, price, category, ubicacion_sector } = req.body;
    if (!title || !ubicacion_sector) return res.status(400).json({ error: 'Título y ubicación requeridos' });
    const result = await db.query(`INSERT INTO ads (user_id, title, description, price, category, ubicacion_sector, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
        [req.user.id, title, description, price || 0, category, ubicacion_sector]);
    clearCache();
    res.json({ success: true, ad: result.rows[0] });
});

app.post('/api/upload-images/:adId', verifyToken, upload.array('images', 10), async (req, res) => {
    const { adId } = req.params;
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ error: 'No se subieron imágenes' });
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1 AND user_id = $2`, [adId, req.user.id]);
    if (ad.rows.length === 0) return res.status(403).json({ error: 'No autorizado' });
    const imageUrls = [];
    for (let i = 0; i < files.length; i++) {
        const imageUrl = `/uploads/${files[i].filename}`;
        const isPrimary = i === 0;
        await db.query(`INSERT INTO ad_images (ad_id, image_url, is_primary) VALUES ($1, $2, $3)`, [adId, imageUrl, isPrimary]);
        imageUrls.push(imageUrl);
    }
    clearCache();
    res.json({ success: true, images: imageUrls });
});

app.get('/api/ads/my-ads', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT a.*, CASE WHEN a.boosted_expires > NOW() THEN true ELSE false END as is_boosted, (SELECT COUNT(*) FROM ad_images WHERE ad_id = a.id) as image_count FROM ads a WHERE a.user_id = $1 AND a.deleted_at IS NULL ORDER BY a.created_at DESC`, [req.user.id]);
    res.json({ ads: result.rows });
});

app.put('/api/ads/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, price, category, ubicacion_sector, status } = req.body;
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    await db.query(`UPDATE ads SET title = COALESCE($1, title), description = COALESCE($2, description), price = COALESCE($3, price), category = COALESCE($4, category), ubicacion_sector = COALESCE($5, ubicacion_sector), status = COALESCE($6, status), updated_at = NOW() WHERE id = $7`,
        [title, description, price, category, ubicacion_sector, status, id]);
    clearCache();
    res.json({ success: true });
});

app.put('/api/ads/:id/sold', verifyToken, async (req, res) => {
    const { id } = req.params;
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    await db.query(`UPDATE ads SET status = 'sold', updated_at = NOW() WHERE id = $1`, [id]);
    clearCache();
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
    clearCache();
    res.json({ success: true, message: 'Anuncio destacado por 24 horas', expires_at: expires });
});

app.delete('/api/ads/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const ad = await db.query(`SELECT * FROM ads WHERE id = $1`, [id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (ad.rows[0].user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    await db.query(`UPDATE ads SET deleted_at = NOW() WHERE id = $1`, [id]);
    clearCache();
    res.json({ success: true });
});

// ============================================================
// ADMIN - ELIMINAR CON MOTIVO
// ============================================================
app.get('/api/admin/ads/deleted', verifyToken, verifyAdmin, async (req, res) => {
    const result = await db.query(`SELECT a.*, u.email as user_email, u.name as user_name, a.deleted_reason, a.deleted_by, a.deleted_at FROM ads a JOIN users u ON a.user_id = u.id WHERE a.deleted_at IS NOT NULL ORDER BY a.deleted_at DESC LIMIT 100`);
    res.json({ ads: result.rows });
});

app.delete('/api/admin/ads/:id/delete', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const ad = await db.query(`SELECT a.*, u.email as user_email FROM ads a JOIN users u ON a.user_id = u.id WHERE a.id = $1`, [id]);
    if (ad.rows.length === 0) return res.status(404).json({ error: 'Anuncio no encontrado' });
    await db.query(`UPDATE ads SET deleted_at = NOW(), deleted_reason = $1, deleted_by = $2, status = 'deleted' WHERE id = $3`, [reason || 'Sin motivo', req.user.email, id]);
    await db.query(`INSERT INTO audit_log (action, admin_email, ad_id, ad_title, seller_email, reason) VALUES ('DELETE_AD', $1, $2, $3, $4, $5)`, [req.user.email, id, ad.rows[0].title, ad.rows[0].user_email, reason]);
    clearCache();
    res.json({ success: true });
});

app.post('/api/admin/ads/:id/restore', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    await db.query(`UPDATE ads SET deleted_at = NULL, deleted_reason = NULL, deleted_by = NULL, status = 'active', updated_at = NOW() WHERE id = $1`, [id]);
    await db.query(`INSERT INTO audit_log (action, admin_email, ad_id, reason) VALUES ('RESTORE_AD', $1, $2, $3)`, [req.user.email, id, 'Anuncio restaurado']);
    clearCache();
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
    const result = await db.query(`INSERT INTO offers (ad_id, buyer_id, seller_id, offered_price, message, payment_method, delivery_location, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
        [id, req.user.id, ad.rows[0].user_id, offered_price, message, payment_method, delivery_location]);
    res.json({ success: true, offer: result.rows[0] });
});

app.get('/api/offers/received', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT o.*, a.title as ad_title, u.name as buyer_name, u.phone as buyer_phone FROM offers o JOIN ads a ON o.ad_id = a.id JOIN users u ON o.buyer_id = u.id WHERE o.seller_id = $1 AND o.status = 'pending' ORDER BY o.created_at DESC`, [req.user.id]);
    res.json({ offers: result.rows });
});

app.get('/api/offers/my-offers', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT o.*, a.title as ad_title FROM offers o JOIN ads a ON o.ad_id = a.id WHERE o.buyer_id = $1 ORDER BY o.created_at DESC`, [req.user.id]);
    res.json({ offers: result.rows });
});

app.put('/api/offers/:id/:action', verifyToken, async (req, res) => {
    const { id, action } = req.params;
    const { counter_price, message } = req.body;
    if (!['accept', 'reject', 'counter', 'cancel'].includes(action)) return res.status(400).json({ error: 'Acción inválida' });
    const offer = await db.query(`SELECT * FROM offers WHERE id = $1`, [id]);
    if (offer.rows.length === 0) return res.status(404).json({ error: 'Oferta no encontrada' });
    if (action === 'cancel' && offer.rows[0].buyer_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
    let newStatus = action === 'accept' ? 'accepted' : (action === 'reject' ? 'rejected' : (action === 'cancel' ? 'cancelled' : 'counter'));
    await db.query(`UPDATE offers SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, id]);
    if (action === 'counter' && counter_price) {
        await db.query(`INSERT INTO offers (ad_id, buyer_id, seller_id, offered_price, message, status, payment_method, delivery_location) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)`,
            [offer.rows[0].ad_id, offer.rows[0].seller_id, offer.rows[0].buyer_id, counter_price, message, offer.rows[0].payment_method, offer.rows[0].delivery_location]);
    }
    res.json({ success: true });
});

// ============================================================
// FAVORITOS
// ============================================================
app.post('/api/favorites/:adId', verifyToken, async (req, res) => {
    await db.query(`INSERT INTO favorites (user_id, ad_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.user.id, req.params.adId]);
    res.json({ success: true });
});
app.delete('/api/favorites/:adId', verifyToken, async (req, res) => {
    await db.query(`DELETE FROM favorites WHERE user_id = $1 AND ad_id = $2`, [req.user.id, req.params.adId]);
    res.json({ success: true });
});
app.get('/api/favorites', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT a.*, u.name as user_name FROM ads a JOIN favorites f ON a.id = f.ad_id JOIN users u ON a.user_id = u.id WHERE f.user_id = $1 AND a.deleted_at IS NULL`, [req.user.id]);
    res.json({ favorites: result.rows });
});

// ============================================================
// DATOS AUXILIARES
// ============================================================
app.get('/api/sectores', async (req, res) => {
    let cached = getCache('sectores');
    if (cached) return res.json({ sectores: cached });
    const result = await db.query(`SELECT * FROM sectores ORDER BY nombre`);
    setCache('sectores', result.rows);
    res.json({ sectores: result.rows });
});
app.get('/api/categorias', async (req, res) => {
    let cached = getCache('categorias');
    if (cached) return res.json({ categorias: cached });
    const result = await db.query(`SELECT category, COUNT(*) as total FROM ads WHERE deleted_at IS NULL AND status = 'active' AND category IS NOT NULL GROUP BY category ORDER BY total DESC LIMIT 20`);
    setCache('categorias', result.rows);
    res.json({ categorias: result.rows });
});
app.get('/api/plans', async (req, res) => {
    const result = await db.query(`SELECT * FROM plans ORDER BY price ASC`);
    res.json({ plans: result.rows });
});

// ============================================================
// ADMIN ESTADÍSTICAS
// ============================================================
app.get('/api/admin/stats', verifyToken, verifyAdmin, async (req, res) => {
    let cached = getCache('stats');
    if (cached) return res.json(cached);
    const [users, ads, activeAds, verifiedUsers, pendingVerifications, deletedAds] = await Promise.all([
        db.query(`SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM ads WHERE deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM ads WHERE status = 'active' AND deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM users WHERE verified = true`),
        db.query(`SELECT COUNT(*) FROM verification_requests WHERE status = 'pending'`),
        db.query(`SELECT COUNT(*) FROM ads WHERE deleted_at IS NOT NULL`)
    ]);
    const stats = { totalUsers: parseInt(users.rows[0].count), totalAds: parseInt(ads.rows[0].count), activeAds: parseInt(activeAds.rows[0].count), verifiedUsers: parseInt(verifiedUsers.rows[0].count), pendingVerifications: parseInt(pendingVerifications.rows[0].count), deletedAds: parseInt(deletedAds.rows[0].count) };
    setCache('stats', stats);
    res.json(stats);
});

app.get('/api/admin/verification-requests', verifyToken, verifyAdmin, async (req, res) => {
    const result = await db.query(`SELECT vr.*, u.name, u.email, u.phone FROM verification_requests vr JOIN users u ON vr.user_id = u.id WHERE vr.status = 'pending' ORDER BY vr.requested_at ASC`);
    res.json({ requests: result.rows });
});

app.post('/api/admin/verify/:userId/approve', verifyToken, verifyAdmin, async (req, res) => {
    const { userId } = req.params;
    await db.query(`UPDATE users SET verified = true, verification_status = 'approved', verified_date = NOW() WHERE id = $1`, [userId]);
    await db.query(`UPDATE verification_requests SET status = 'approved', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE user_id = $3 AND status = 'pending'`, [req.body.notes, req.user.id, userId]);
    clearCache();
    res.json({ success: true });
});

app.post('/api/admin/verify/:userId/reject', verifyToken, verifyAdmin, async (req, res) => {
    const { userId } = req.params;
    await db.query(`UPDATE verification_requests SET status = 'rejected', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE user_id = $3 AND status = 'pending'`, [req.body.notes, req.user.id, userId]);
    clearCache();
    res.json({ success: true });
});

app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    const result = await db.query(`SELECT id, name, email, phone, user_type, role, verified, plan_type, created_at, avatar FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`);
    res.json({ users: result.rows });
});

app.delete('/api/admin/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    await db.query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
    await db.query(`UPDATE ads SET deleted_at = NOW() WHERE user_id = $1`, [req.params.id]);
    clearCache();
    res.json({ success: true });
});

app.get('/api/admin/ads', verifyToken, verifyAdmin, async (req, res) => {
    const result = await db.query(`SELECT a.*, u.email as user_email, u.name as user_name FROM ads a JOIN users u ON a.user_id = u.id WHERE a.deleted_at IS NULL ORDER BY a.created_at DESC LIMIT 100`);
    res.json({ ads: result.rows });
});

app.get('/api/admin/verification-photos/:userId', verifyToken, verifyAdmin, async (req, res) => {
    const user = await db.query(`SELECT name, email, phone FROM users WHERE id = $1`, [req.params.userId]);
    const request = await db.query(`SELECT id_photo_front, id_photo_back, selfie_photo FROM verification_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`, [req.params.userId]);
    res.json({ ...user.rows[0], ...request.rows[0] });
});

// ============================================================
// SOPORTE Y ASISTENCIA
// ============================================================
app.post('/api/support/create-ticket', async (req, res) => {
    const { user_id, user_name, user_email, subject, message } = req.body;
    if (!user_name || !user_email || !subject || !message) return res.status(400).json({ error: 'Todos los campos son requeridos' });
    const result = await db.query(`INSERT INTO support_tickets (user_id, user_name, user_email, subject, message, status, created_at) VALUES ($1, $2, $3, $4, $5, 'pending', NOW()) RETURNING id`, [user_id || null, user_name, user_email, subject, message]);
    await db.query(`INSERT INTO support_notifications (type, message, link) VALUES ('new_ticket', 'Nuevo ticket de ${user_name}', '/admin-support')`);
    res.json({ success: true, ticket_id: result.rows[0].id });
});

app.get('/api/support/tickets', verifyToken, verifyAdmin, async (req, res) => {
    const result = await db.query(`SELECT * FROM support_tickets ORDER BY CASE WHEN status = 'pending' THEN 1 WHEN status = 'in_progress' THEN 2 ELSE 3 END, created_at DESC`);
    res.json({ tickets: result.rows });
});

app.get('/api/support/tickets/:id', verifyToken, verifyAdmin, async (req, res) => {
    const ticket = await db.query(`SELECT * FROM support_tickets WHERE id = $1`, [req.params.id]);
    const messages = await db.query(`SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`, [req.params.id]);
    res.json({ ticket: ticket.rows[0], messages: messages.rows });
});

app.post('/api/support/tickets/:id/reply', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensaje requerido' });
    await db.query(`INSERT INTO support_messages (ticket_id, sender_type, message) VALUES ($1, 'admin', $2)`, [id, message]);
    await db.query(`UPDATE support_tickets SET status = 'in_progress', admin_response = $1, responded_at = NOW() WHERE id = $2`, [message, id]);
    res.json({ success: true });
});

app.post('/api/support/tickets/:id/resolve', verifyToken, verifyAdmin, async (req, res) => {
    await db.query(`UPDATE support_tickets SET status = 'resolved', resolved_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});

app.get('/api/support/notifications', verifyToken, verifyAdmin, async (req, res) => {
    const result = await db.query(`SELECT * FROM support_notifications WHERE is_read = false ORDER BY created_at DESC`);
    res.json({ notifications: result.rows });
});

app.put('/api/support/notifications/:id/read', verifyToken, verifyAdmin, async (req, res) => {
    await db.query(`UPDATE support_notifications SET is_read = true WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});

app.get('/api/support/stats', verifyToken, verifyAdmin, async (req, res) => {
    const [pending, inProgress, resolved, total] = await Promise.all([
        db.query(`SELECT COUNT(*) FROM support_tickets WHERE status = 'pending'`),
        db.query(`SELECT COUNT(*) FROM support_tickets WHERE status = 'in_progress'`),
        db.query(`SELECT COUNT(*) FROM support_tickets WHERE status = 'resolved'`),
        db.query(`SELECT COUNT(*) FROM support_tickets`)
    ]);
    res.json({ pending: parseInt(pending.rows[0].count), inProgress: parseInt(inProgress.rows[0].count), resolved: parseInt(resolved.rows[0].count), total: parseInt(total.rows[0].count) });
});

// ============================================================
// SERVIDOR DE ARCHIVOS ESTÁTICOS Y RUTAS
// ============================================================
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
app.use(express.static(publicDir));
app.use('/uploads', express.static(path.join(publicDir, 'uploads')));

// ============================================================
// RUTAS DEL FRONTEND
// ============================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/perfil', (req, res) => {
    res.sendFile(path.join(publicDir, 'perfil.html'));
});

app.get('/admin-support', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin-support.html'));
});

app.get('/help-faq', (req, res) => {
    res.sendFile(path.join(publicDir, 'help-faq.html'));
});

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
            console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
            console.log(`║     🚀 EL FAROL - SERVIDOR CORRIENDO 🚀                         ║`);
            console.log(`╠════════════════════════════════════════════════════════════════╣`);
            console.log(`║  📡 Puerto: ${PORT}                                                 ║`);
            console.log(`║  🌐 Web: http://localhost:${PORT}                                    ║`);
            console.log(`║  👑 Admin: http://localhost:${PORT}/admin                           ║`);
            console.log(`║  👤 Perfil: http://localhost:${PORT}/perfil                         ║`);
            console.log(`║  🔐 Admin: admin@elfarol.com.do / admin123                         ║`);
            console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
        });
    } catch (error) {
        console.error('❌ Error fatal:', error.message);
        process.exit(1);
    }
}

start();
