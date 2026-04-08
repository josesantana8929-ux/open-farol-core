const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Importar módulos
const db = require('./db');
const authRoutes = require('./routes/authRoutes');
const adRoutes = require('./routes/adRoutes');

// ============ VERIFICAR/CREAR CARPETA PUBLIC ============
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    console.log('📁 Creando carpeta public...');
    fs.mkdirSync(publicDir, { recursive: true });
}

// Crear archivo admin.html si no existe
const adminFile = path.join(publicDir, 'admin.html');
if (!fs.existsSync(adminFile)) {
    console.log('📝 Creando admin.html...');
    fs.writeFileSync(adminFile, `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>MXL Clasificados - Admin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#f5f5f5}
.login-container{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1A1A1A,#2A2A2A)}
.login-box{background:white;padding:40px;border-radius:16px;width:400px}
.login-box h2{color:#1A237E;margin-bottom:24px;text-align:center}
input{width:100%;padding:12px;margin:8px 0;border:1px solid #ddd;border-radius:8px}
.btn-primary{width:100%;background:#1A237E;color:white;padding:12px;border:none;border-radius:8px;cursor:pointer}
.dashboard{display:none}
.sidebar{width:250px;background:#1A1A1A;color:white;position:fixed;height:100%;padding:20px}
.main-content{margin-left:250px;padding:20px}
.topbar{background:white;padding:15px 20px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between}
table{width:100%;background:white;border-collapse:collapse}
th,td{padding:10px;text-align:left;border-bottom:1px solid #ddd}
.btn-delete{background:#ef4444;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer}
.logout-btn{background:#ef4444;color:white;border:none;padding:8px 15px;border-radius:5px;cursor:pointer}
</style>
</head>
<body>
<div id="loginPanel" class="login-container">
<div class="login-box">
<h2>🔐 MXL Clasificados - Admin</h2>
<input type="email" id="adminEmail" placeholder="Email" value="admin@mxl.com.do">
<input type="password" id="adminPassword" placeholder="Contraseña" value="mxl_admin_2026">
<button class="btn-primary" onclick="login()">Ingresar</button>
<div id="errorMsg" style="color:red;margin-top:10px"></div>
</div>
</div>
<div id="dashboardPanel" class="dashboard">
<div class="sidebar"><h3>MXL Admin</h3><hr><br><button onclick="loadUsers()" style="width:100%;margin:5px 0;padding:10px;">👥 Usuarios</button><button onclick="loadAds()" style="width:100%;margin:5px 0;padding:10px;">📢 Anuncios</button><button onclick="logout()" style="width:100%;margin:5px 0;padding:10px;background:#ef4444;">🚪 Salir</button></div>
<div class="main-content"><div class="topbar"><h1 id="pageTitle">Dashboard</h1></div><div id="contentArea">Bienvenido al panel</div></div>
</div>
<script>
let token=null;
async function login(){const email=document.getElementById('adminEmail').value;const password=document.getElementById('adminPassword').value;try{const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const data=await res.json();if(res.ok&&data.user?.role==='admin'){token=data.token;localStorage.setItem('adminToken',token);document.getElementById('loginPanel').style.display='none';document.getElementById('dashboardPanel').style.display='block';loadUsers();}else{document.getElementById('errorMsg').innerText='Acceso denegado';}}catch(e){document.getElementById('errorMsg').innerText='Error de conexión';}}
async function loadUsers(){document.getElementById('pageTitle').innerText='Usuarios';document.getElementById('contentArea').innerHTML='Cargando...';const res=await fetch('/api/admin/users',{headers:{'Authorization':`Bearer ${token}`}});const data=await res.json();if(data.users){let html='<table><tr><th>ID</th><th>Nombre</th><th>Email</th><th>Rol</th></tr>';data.users.forEach(u=>{html+=`<tr><td>${u.id}</td><td>${u.name||'-'}</td><td>${u.email}</td><td>${u.role}</td></tr>`;});html+='</table>';document.getElementById('contentArea').innerHTML=html;}}
async function loadAds(){document.getElementById('pageTitle').innerText='Anuncios';document.getElementById('contentArea').innerHTML='Cargando...';const res=await fetch('/api/admin/ads',{headers:{'Authorization':`Bearer ${token}`}});const data=await res.json();if(data.ads){let html='<table><tr><th>ID</th><th>Título</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr>';data.ads.forEach(a=>{html+=`<tr><td>${a.id}</td><td>${a.title}</td><td>$${a.price||0}</td><td>${a.status}</td><td><button class="btn-delete" onclick="deleteAd(${a.id})">Eliminar</button></td></tr>`;});html+='</table>';document.getElementById('contentArea').innerHTML=html;}}
async function deleteAd(id){if(!confirm('¿Eliminar este anuncio?'))return;await fetch(`/api/admin/ads/${id}`,{method:'DELETE',headers:{'Authorization':`Bearer ${token}`}});loadAds();}
function logout(){localStorage.removeItem('adminToken');token=null;document.getElementById('loginPanel').style.display='flex';document.getElementById('dashboardPanel').style.display='none';}
const savedToken=localStorage.getItem('adminToken');if(savedToken){token=savedToken;document.getElementById('loginPanel').style.display='none';document.getElementById('dashboardPanel').style.display='block';loadUsers();}
</script>
</body>
</html>`);
}

// Crear archivo 404.html si no existe
const notFoundFile = path.join(publicDir, '404.html');
if (!fs.existsSync(notFoundFile)) {
    console.log('📝 Creando 404.html...');
    fs.writeFileSync(notFoundFile, `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>404 - MXL Clasificados</title>
<style>
body{font-family:Arial;text-align:center;padding:50px;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;color:white}
h1{font-size:120px;margin:0}
a{color:white;text-decoration:none;border:2px solid white;padding:10px 20px;border-radius:8px;display:inline-block;margin-top:20px}
</style>
</head>
<body>
<h1>404</h1>
<p>Página no encontrada</p>
<a href="/">Volver al inicio</a>
</body>
</html>`);
}

// Crear archivo index.html si no existe
const indexFile = path.join(publicDir, 'index.html');
if (!fs.existsSync(indexFile)) {
    console.log('📝 Creando index.html...');
    fs.writeFileSync(indexFile, `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>MXL Clasificados</title>
<style>
body{font-family:Arial;text-align:center;padding:50px;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;color:white}
h1{font-size:3rem}
.btn{background:white;color:#1A237E;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:20px}
</style>
</head>
<body>
<h1>🚀 MXL Clasificados</h1>
<p>Mercado de confianza en República Dominicana</p>
<a href="/admin" class="btn">Panel Admin</a>
</body>
</html>`);
}

console.log(`✅ Carpeta public lista en: ${publicDir}`);
console.log(`   - admin.html: ${fs.existsSync(adminFile) ? '✅' : '❌'}`);
console.log(`   - index.html: ${fs.existsSync(indexFile) ? '✅' : '❌'}`);
console.log(`   - 404.html: ${fs.existsSync(notFoundFile) ? '✅' : '❌'}`);

// Configuración
const PORT = process.env.PORT || 8080;
const SITE_NAME = process.env.SITE_NAME || 'MXL Clasificados';
const isProduction = process.env.NODE_ENV === 'production';

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
console.log(`📁 Archivos estáticos: ${publicDir}\n`);

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
            imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
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
    skip: (req) => req.path === '/' || req.path === '/admin',
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
        });
    } catch (error) {
        res.status(503).json({ status: 'ERROR', error: error.message });
    }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/ads', adRoutes);

// ============ RUTAS DE ADMINISTRACIÓN ============

// Middleware para verificar admin
const verifyAdmin = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }
    
    const { verifyToken } = require('./utils/jwtUtils');
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
        const [usersRes, adsRes, salesRes, pendingRes] = await Promise.all([
            db.query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'),
            db.query('SELECT COUNT(*) FROM ads WHERE status = $1 AND deleted_at IS NULL', ['active']),
            db.query('SELECT COALESCE(SUM(price), 0) FROM ads WHERE status = $1 AND created_at > NOW() - INTERVAL \'30 days\'', ['active']),
            db.query('SELECT COUNT(*) FROM ads WHERE status = $1 AND deleted_at IS NULL', ['pending'])
        ]);
        
        res.json({
            totalUsers: parseInt(usersRes.rows[0].count),
            activeAds: parseInt(adsRes.rows[0].count),
            monthlySales: parseInt(salesRes.rows[0].coalesce),
            pendingAds: parseInt(pendingRes.rows[0].count)
        });
    } catch (error) {
        console.error('Error en stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// Listar todos los usuarios (admin)
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const result = await db.query(`
            SELECT id, name, email, phone, role, created_at, last_login 
            FROM users WHERE deleted_at IS NULL 
            ORDER BY created_at DESC LIMIT $1
        `, [limit]);
        res.json({ users: result.rows });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// Listar todos los anuncios (admin)
app.get('/api/admin/ads', verifyAdmin, async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const result = await db.query(`
            SELECT a.*, u.email as user_email, u.name as user_name
            FROM ads a
            JOIN users u ON a.user_id = u.id
            WHERE a.deleted_at IS NULL 
            ORDER BY a.created_at DESC LIMIT $1
        `, [limit]);
        res.json({ ads: result.rows });
    } catch (error) {
        console.error('Error al obtener anuncios:', error);
        res.status(500).json({ error: 'Error al obtener anuncios' });
    }
});

// Aprobar anuncio
app.put('/api/admin/ads/:id/approve', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            'UPDATE ads SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            ['active', id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Anuncio no encontrado' });
        }
        
        res.json({ message: 'Anuncio aprobado exitosamente', ad: result.rows[0] });
    } catch (error) {
        console.error('Error al aprobar anuncio:', error);
        res.status(500).json({ error: 'Error al aprobar el anuncio' });
    }
});

// Eliminar anuncio (admin)
app.delete('/api/admin/ads/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(
            'UPDATE ads SET deleted_at = NOW(), status = $1 WHERE id = $2 RETURNING *',
            ['deleted', id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Anuncio no encontrado' });
        }
        
        await db.query('UPDATE ad_images SET deleted_at = NOW() WHERE ad_id = $1', [id]);
        
        res.json({ message: 'Anuncio eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar anuncio:', error);
        res.status(500).json({ error: 'Error al eliminar el anuncio' });
    }
});

// ============ RUTAS PÚBLICAS ============

// Ruta principal - sirve el HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Ruta del panel de administración
app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin.html'));
});

// Ruta de respaldo
app.get('/app', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Ruta para verificar configuración (solo desarrollo)
if (!isProduction) {
    app.get('/debug/config', (req, res) => {
        res.json({
            siteName: SITE_NAME,
            nodeEnv: process.env.NODE_ENV,
            dbConfigured: !!process.env.DATABASE_URL,
            sessionSecretConfigured: !!process.env.SESSION_SECRET,
            publicPath: publicDir,
            files: fs.readdirSync(publicDir)
        });
    });
}

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
    if (!req.path.startsWith('/api') && req.path !== '/health') {
        res.status(404).sendFile(path.join(publicDir, '404.html'), (err) => {
            if (err) {
                res.status(404).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>404 - MXL Clasificados</title></head>
                    <body style="text-align:center;padding:50px;">
                        <h1>404</h1>
                        <p>Página no encontrada</p>
                        <a href="/">Volver al inicio</a>
                    </body>
                    </html>
                `);
            }
        });
    } else {
        res.status(404).json({ error: 'Ruta no encontrada' });
    }
});

// Error handler global
app.use((err, req, res, next) => {
    console.error('❌ Error no capturado:', err.message);
    console.error(err.stack);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Archivo demasiado grande' });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Demasiados archivos' });
    }
    
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Token inválido' });
    }
    
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expirado' });
    }
    
    const status = err.status || 500;
    const message = isProduction && status === 500 ? 'Error interno del servidor' : err.message;
    
    res.status(status).json({
        error: message,
        ...(!isProduction && { stack: err.stack }),
    });
});

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
║  📁 Archivos: ${publicDir}                              ║
║  🌐 Web: http://localhost:${PORT}                                           ║
║  🔐 Auth API: http://localhost:${PORT}/api/auth                             ║
║  📦 Ads API: http://localhost:${PORT}/api/ads                               ║
║  👑 Admin Panel: http://localhost:${PORT}/admin                             ║
║  💚 Health: http://localhost:${PORT}/health                                 ║
╚══════════════════════════════════════════════════════════════════════════╝
            `);
            
            if (!dbConnected && !isProduction) {
                console.warn('\n⚠️  Modo desarrollo: Base de datos no conectada');
                console.warn('   Algunas funciones pueden no estar disponibles');
                console.warn('   Asegúrate de configurar DATABASE_URL en .env\n');
            }
        });
        
        // Graceful shutdown
        const gracefulShutdown = async (signal) => {
            console.log(`\n🛑 Recibida señal ${signal}, cerrando servidor...`);
            
            server.close(async () => {
                console.log('📦 Cerrando conexiones de base de datos...');
                if (db.pool) {
                    try {
                        await db.pool.end();
                        console.log('✅ Conexiones de base de datos cerradas');
                    } catch (err) {
                        console.error('❌ Error cerrando conexiones:', err.message);
                    }
                }
                console.log('✅ Servidor cerrado correctamente');
                process.exit(0);
            });
            
            setTimeout(() => {
                console.error('⚠️ Timeout cerrando conexiones, forzando salida');
                process.exit(1);
            }, 10000);
        };
        
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        
        process.on('uncaughtException', (error) => {
            console.error('❌ Excepción no capturada:', error);
            gracefulShutdown('uncaughtException');
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Promesa rechazada no manejada:', reason);
            gracefulShutdown('unhandledRejection');
        });
        
    } catch (error) {
        console.error('❌ Error fatal al iniciar el servidor:', error.message);
        if (isProduction) process.exit(1);
    }
};

// Iniciar servidor solo si es el archivo principal
if (require.main === module) {
    startServer();
}

module.exports = app;
