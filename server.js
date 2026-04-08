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
const SITE_NAME = process.env.SITE_NAME || 'MXL Clasificados';

// ============================================================
// BASE DE DATOS
// ============================================================
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
    // Usuarios (con user_type: buyer/seller)
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

    // Anuncios (con ubicacion_sector)
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP,
            deleted_at TIMESTAMP
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

    // Crear admin por defecto
    const adminEmail = 'admin@mxl.com.do';
    const adminExists = await db.query(`SELECT * FROM users WHERE email = $1`, [adminEmail]);
    if (adminExists.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('mxl_admin_2026', 10);
        await db.query(
            `INSERT INTO users (name, email, password, role, user_type) VALUES ($1, $2, $3, $4, $5)`,
            ['Administrador', adminEmail, hashedPassword, 'admin', 'seller']
        );
        console.log('✅ Admin creado: admin@mxl.com.do / mxl_admin_2026');
    }

    console.log('✅ Base de datos lista');
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
app.use(express.json());
app.use(express.static('public'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ============================================================
// UTILS
// ============================================================
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, user_type: user.user_type },
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
// RUTAS DE AUTENTICACIÓN (con registro dual)
// ============================================================

// Registro - pregunta si viene a comprar o vender
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
            `INSERT INTO users (name, email, password, phone, user_type) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, user_type, role`,
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
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// Obtener perfil
app.get('/api/auth/me', verifyToken, async (req, res) => {
    const result = await db.query(`SELECT id, name, email, phone, user_type, role FROM users WHERE id = $1`, [req.user.id]);
    res.json(result.rows[0]);
});

// ============================================================
// RUTAS DE ANUNCIOS (VENDEDOR)
// ============================================================

// Crear anuncio (solo vendedores)
app.post('/api/ads', verifyToken, async (req, res) => {
    if (req.user.user_type !== 'seller' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo vendedores pueden publicar. Cambia tu tipo de cuenta en el perfil.' });
    }
    
    const { title, description, price, category, ubicacion_sector } = req.body;
    
    if (!title || !ubicacion_sector) {
        return res.status(400).json({ error: 'Título y ubicación requeridos' });
    }
    
    try {
        const result = await db.query(
            `INSERT INTO ads (user_id, title, description, price, category, ubicacion_sector, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
            [req.user.id, title, description, price || 0, category, ubicacion_sector, 'active']
        );
        
        res.json({ success: true, ad: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear anuncio' });
    }
});

// Mis anuncios (panel del vendedor)
app.get('/api/ads/my-ads', verifyToken, async (req, res) => {
    const result = await db.query(
        `SELECT * FROM ads WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
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

// ============================================================
// RUTAS PÚBLICAS (COMPRADORES)
// ============================================================

// Listar anuncios con filtros (incluyendo sector)
app.get('/api/ads', async (req, res) => {
    const { categoria, sector, search, limit = 20, offset = 0 } = req.query;
    
    let query = `SELECT a.*, u.name as user_name, u.phone as user_phone 
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
    
    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    res.json({ ads: result.rows });
});

// Obtener sectores disponibles
app.get('/api/sectores', async (req, res) => {
    const result = await db.query(`SELECT * FROM sectores ORDER BY nombre`);
    res.json({ sectores: result.rows });
});

// Obtener categorías populares
app.get('/api/categorias', async (req, res) => {
    const result = await db.query(`
        SELECT DISTINCT category, COUNT(*) as total 
        FROM ads 
        WHERE deleted_at IS NULL AND status = 'active' AND category IS NOT NULL
        GROUP BY category ORDER BY total DESC
    `);
    res.json({ categorias: result.rows });
});

// Ver detalle de anuncio
app.get('/api/ads/:id', async (req, res) => {
    const { id } = req.params;
    
    await db.query(`UPDATE ads SET views = views + 1 WHERE id = $1`, [id]);
    
    const result = await db.query(
        `SELECT a.*, u.name as user_name, u.phone as user_phone, u.email as user_email
         FROM ads a 
         JOIN users u ON a.user_id = u.id 
         WHERE a.id = $1 AND a.deleted_at IS NULL`,
        [id]
    );
    
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    
    res.json({ ad: result.rows[0] });
});

// ============================================================
// RUTAS DE ADMINISTRACIÓN
// ============================================================

const verifyAdmin = async (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
};

app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    const result = await db.query(`SELECT id, name, email, phone, user_type, role, created_at, last_login FROM users WHERE deleted_at IS NULL`);
    res.json({ users: result.rows });
});

app.get('/api/admin/stats', verifyToken, verifyAdmin, async (req, res) => {
    const [users, ads, activeAds, soldAds] = await Promise.all([
        db.query(`SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM ads WHERE deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM ads WHERE status = 'active' AND deleted_at IS NULL`),
        db.query(`SELECT COUNT(*) FROM ads WHERE status = 'sold' AND deleted_at IS NULL`)
    ]);
    
    res.json({
        totalUsers: parseInt(users.rows[0].count),
        totalAds: parseInt(ads.rows[0].count),
        activeAds: parseInt(activeAds.rows[0].count),
        soldAds: parseInt(soldAds.rows[0].count)
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
        console.log(`📡 Admin: http://localhost:${PORT}/admin`);
        console.log(`👤 Login: admin@mxl.com.do / mxl_admin_2026\n`);
    });
}

start();
