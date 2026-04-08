const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const http = require('http');

// Cargar variables de entorno
dotenv.config();

// Importar módulos
const db = require('./db');
const authRoutes = require('./routes/authRoutes');
const adRoutes = require('./routes/adRoutes');

// Configuración
const PORT = process.env.PORT || 8080;
const SITE_NAME = process.env.SITE_NAME || 'El Farol Clasificados';
const isProduction = process.env.NODE_ENV === 'production';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Validar SESSION_SECRET
if (!process.env.SESSION_SECRET) {
    if (isProduction) {
        console.error('❌ SESSION_SECRET no configurado en producción');
        process.exit(1);
    } else {
        process.env.SESSION_SECRET = 'dev_secret_key_123456789';
        console.warn('⚠️ Usando SESSION_SECRET temporal para desarrollo');
    }
}

console.log(`\n🚀 Iniciando ${SITE_NAME}...`);
console.log(`📡 Puerto: ${PORT}`);
console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
console.log(`📍 Base URL: ${BASE_URL}\n`);

const app = express();

// ============ SEGURIDAD ============
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://res.cloudinary.com"],
            connectSrc: ["'self'"],
        },
    },
}));

// CORS
app.use(cors({
    origin: isProduction ? process.env.ALLOWED_ORIGINS?.split(',') || true : true,
    credentials: true,
}));

// Compresión
app.use(compression());

// Archivos estáticos
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

app.use(express.static(publicDir, {
    maxAge: isProduction ? '1y' : 0,
    etag: true,
    lastModified: true,
}));

// Rate limiting para API
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Demasiadas solicitudes',
    skip: (req) => req.path === '/' || req.path === '/admin' || req.path === '/ping',
});
app.use('/api/', limiter);

// Rate limit más estricto para autenticación
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Demasiados intentos, intenta más tarde',
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Parseo de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Headers personalizados
app.use((req, res, next) => {
    res.setHeader('X-Powered-By', SITE_NAME);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Logging en desarrollo
if (!isProduction) {
    app.use((req, res, next) => {
        console.log(`📝 ${req.method} ${req.path}`);
        next();
    });
}

// ============ RUTA PING PARA KEEP ALIVE ============
app.get('/ping', (req, res) => {
    res.status(200).json({
        status: 'pong',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
    });
});

// ============ RUTAS DE API ============

// Health check
app.get('/health', async (req, res) => {
    try {
        const dbStatus = await db.testConnection();
        res.json({
            status: 'OK',
            siteName: SITE_NAME,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            database: dbStatus ? 'connected' : 'disconnected',
            port: PORT,
            memory: process.memoryUsage(),
        });
    } catch (error) {
        res.status(503).json({ status: 'ERROR', error: error.message });
    }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/ads', adRoutes);

// ============ RUTAS DE ADMINISTRACIÓN ADICIONALES ============

const { verifyToken } = require('./utils/jwtUtils');

// Middleware para verificar admin
const verifyAdmin = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }
    
    const { valid, decoded } = verifyToken(token);
    
    if (!valid || decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
    
    req.user = decoded;
    next();
};

// Estadísticas del dashboard
app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
    try {
        const [usersRes, adsRes, activeAdsRes, pendingAdsRes, verifiedUsersRes] = await Promise.all([
            db.query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'),
            db.query('SELECT COUNT(*) FROM ads WHERE deleted_at IS NULL'),
            db.query('SELECT COUNT(*) FROM ads WHERE status = $1 AND deleted_at IS NULL', ['active']),
            db.query('SELECT COUNT(*) FROM ads WHERE status = $1 AND deleted_at IS NULL', ['pending']),
            db.query('SELECT COUNT(*) FROM users WHERE verified = true')
        ]);
        
        res.json({
            totalUsers: parseInt(usersRes.rows[0].count),
            totalAds: parseInt(adsRes.rows[0].count),
            activeAds: parseInt(activeAdsRes.rows[0].count),
            pendingAds: parseInt(pendingAdsRes.rows[0].count),
            verifiedUsers: parseInt(verifiedUsersRes.rows[0].count)
        });
    } catch (error) {
        console.error('Error en stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// Listar solicitudes de verificación pendientes
app.get('/api/admin/verification-requests', verifyAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT vr.*, u.name, u.email, u.phone
            FROM verification_requests vr
            JOIN users u ON vr.user_id = u.id
            WHERE vr.status = 'pending'
            ORDER BY vr.requested_at ASC
        `);
        res.json({ requests: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener solicitudes' });
    }
});

// Aprobar verificación
app.post('/api/admin/verify/:userId/approve', verifyAdmin, async (req, res) => {
    const { userId } = req.params;
    const { notes } = req.body;
    
    try {
        await db.query(
            `UPDATE users SET verified = true, verification_status = 'approved', verified_date = NOW() WHERE id = $1`,
            [userId]
        );
        await db.query(
            `UPDATE verification_requests SET status = 'approved', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE user_id = $3 AND status = 'pending'`,
            [notes, req.user.id, userId]
        );
        res.json({ success: true, message: 'Usuario verificado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al aprobar verificación' });
    }
});

// Rechazar verificación
app.post('/api/admin/verify/:userId/reject', verifyAdmin, async (req, res) => {
    const { userId } = req.params;
    const { notes } = req.body;
    
    try {
        await db.query(
            `UPDATE verification_requests SET status = 'rejected', admin_notes = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE user_id = $3 AND status = 'pending'`,
            [notes, req.user.id, userId]
        );
        res.json({ success: true, message: 'Solicitud rechazada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al rechazar verificación' });
    }
});

// Listar todos los usuarios (admin)
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const result = await db.query(`
            SELECT id, name, email, phone, role, user_type, verified, plan_type, created_at, last_login 
            FROM users WHERE deleted_at IS NULL 
            ORDER BY created_at DESC LIMIT $1
        `, [limit]);
        res.json({ users: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// Listar todos los anuncios (admin)
app.get('/api/admin/ads', verifyAdmin, async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const result = await db.query(`
            SELECT a.*, u.email as user_email, u.name as user_name, u.verified
            FROM ads a
            JOIN users u ON a.user_id = u.id
            WHERE a.deleted_at IS NULL 
            ORDER BY a.created_at DESC LIMIT $1
        `, [limit]);
        res.json({ ads: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener anuncios' });
    }
});

// Eliminar anuncio (admin)
app.delete('/api/admin/ads/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('UPDATE ads SET deleted_at = NOW() WHERE id = $1', [id]);
        res.json({ success: true, message: 'Anuncio eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar anuncio' });
    }
});

// Sectores
app.get('/api/sectores', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM sectores ORDER BY nombre');
        res.json({ sectores: result.rows });
    } catch (error) {
        res.json({ sectores: [] });
    }
});

// Categorías
app.get('/api/categorias', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT category, COUNT(*) as total 
            FROM ads 
            WHERE deleted_at IS NULL AND status = 'active' AND category IS NOT NULL
            GROUP BY category ORDER BY total DESC
        `);
        res.json({ categorias: result.rows });
    } catch (error) {
        res.json({ categorias: [] });
    }
});

// Planes
app.get('/api/plans', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM plans ORDER BY price ASC');
        res.json({ plans: result.rows });
    } catch (error) {
        res.json({ plans: [] });
    }
});

// ============ RUTAS PÚBLICAS ============

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Ruta admin
app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin.html'));
});

// ============ MANEJO DE ERRORES ============

// 404 handler para API
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `La ruta ${req.method} ${req.path} no existe`,
    });
});

// 404 handler para archivos estáticos
app.use((req, res) => {
    if (!req.path.startsWith('/api') && req.path !== '/health' && req.path !== '/ping') {
        const notFoundFile = path.join(publicDir, '404.html');
        if (fs.existsSync(notFoundFile)) {
            res.status(404).sendFile(notFoundFile);
        } else {
            res.status(404).send('<h1>404 - Página no encontrada</h1>');
        }
    } else {
        res.status(404).json({ error: 'Ruta no encontrada' });
    }
});

// Error handler global
app.use((err, req, res, next) => {
    console.error('❌ Error no capturado:', err.message);
    console.error(err.stack);
    
    const status = err.status || 500;
    const message = isProduction && status === 500 ? 'Error interno del servidor' : err.message;
    
    res.status(status).json({
        error: message,
        ...(!isProduction && { stack: err.stack }),
    });
});

// ============ SELF-PING ============
let pingInterval = null;
let consecutiveFails = 0;
const MAX_CONSECUTIVE_FAILS = 3;

function startSelfPing() {
    const selfUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${PORT}`;
    
    console.log(`🔄 Iniciando Self-Ping cada 10 minutos a: ${selfUrl}/ping`);
    
    const ping = () => {
        const host = process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost';
        const port = process.env.RAILWAY_PUBLIC_DOMAIN ? 443 : PORT;
        const protocol = process.env.RAILWAY_PUBLIC_DOMAIN ? 'https' : 'http';
        
        const options = {
            hostname: host,
            port: port,
            path: '/ping',
            method: 'GET',
        };
        
        const req = http.request(options, (res) => {
            if (res.statusCode === 200) {
                consecutiveFails = 0;
                console.log(`💓 Self-Ping exitoso - ${new Date().toISOString()}`);
            } else {
                consecutiveFails++;
                console.warn(`⚠️ Self-Ping status: ${res.statusCode} (Fallo ${consecutiveFails})`);
            }
        });
        
        req.on('error', (error) => {
            consecutiveFails++;
            console.error(`❌ Self-Ping falló: ${error.message} (Fallo ${consecutiveFails})`);
        });
        
        req.end();
    };
    
    setTimeout(ping, 5000);
    pingInterval = setInterval(ping, 10 * 60 * 1000);
}

// ============ INICIAR SERVIDOR ============
const startServer = async () => {
    try {
        console.log('🔄 Verificando conexión a la base de datos...');
        const dbConnected = await db.testConnection();
        
        if (!dbConnected && isProduction) {
            console.error('❌ No se pudo conectar a la base de datos en producción');
            process.exit(1);
        }
        
        const server = app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║                    🚀 ${SITE_NAME} - SERVIDOR INICIADO                       ║
╠══════════════════════════════════════════════════════════════════════════╣
║  📡 Puerto: ${PORT}                                                          ║
║  🌍 Entorno: ${(process.env.NODE_ENV || 'development').padEnd(35)}║
║  🗄️  Base Datos: ${dbConnected ? '✅ CONECTADA' : '⚠️ SIN CONEXIÓN'}                                          ║
║  💓 Ping: /ping                                                          ║
║  💚 Health: /health                                                      ║
║  🌐 Web: http://localhost:${PORT}                                           ║
║  👑 Admin: http://localhost:${PORT}/admin                                  ║
╚══════════════════════════════════════════════════════════════════════════╝
            `);
            
            startSelfPing();
        });
        
        process.on('SIGTERM', () => {
            console.log('🛑 Cerrando servidor...');
            if (pingInterval) clearInterval(pingInterval);
            server.close(() => process.exit(0));
        });
        
        process.on('SIGINT', () => {
            console.log('🛑 Cerrando servidor...');
            if (pingInterval) clearInterval(pingInterval);
            server.close(() => process.exit(0));
        });
        
    } catch (error) {
        console.error('❌ Error fatal:', error.message);
        if (isProduction) process.exit(1);
    }
};

if (require.main === module) {
    startServer();
}

module.exports = app;
