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
    const adminHtml = '<!DOCTYPE html>\n' +
    '<html lang="es">\n' +
    '<head><meta charset="UTF-8"><title>MXL Clasificados - Admin</title>\n' +
    '<style>\n' +
    '*{margin:0;padding:0;box-sizing:border-box}\n' +
    'body{font-family:Arial,sans-serif;background:#f5f5f5}\n' +
    '.login-container{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1A1A1A,#2A2A2A)}\n' +
    '.login-box{background:white;padding:40px;border-radius:16px;width:400px}\n' +
    '.login-box h2{color:#1A237E;margin-bottom:24px;text-align:center}\n' +
    'input{width:100%;padding:12px;margin:8px 0;border:1px solid #ddd;border-radius:8px}\n' +
    '.btn-primary{width:100%;background:#1A237E;color:white;padding:12px;border:none;border-radius:8px;cursor:pointer}\n' +
    '.dashboard{display:none}\n' +
    '.sidebar{width:250px;background:#1A1A1A;color:white;position:fixed;height:100%;padding:20px}\n' +
    '.main-content{margin-left:250px;padding:20px}\n' +
    '.topbar{background:white;padding:15px 20px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between}\n' +
    'table{width:100%;background:white;border-collapse:collapse}\n' +
    'th,td{padding:10px;text-align:left;border-bottom:1px solid #ddd}\n' +
    '.btn-delete{background:#ef4444;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer}\n' +
    '.logout-btn{background:#ef4444;color:white;border:none;padding:8px 15px;border-radius:5px;cursor:pointer}\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<div id="loginPanel" class="login-container">\n' +
    '<div class="login-box">\n' +
    '<h2>🔐 MXL Clasificados - Admin</h2>\n' +
    '<input type="email" id="adminEmail" placeholder="Email" value="admin@mxl.com.do">\n' +
    '<input type="password" id="adminPassword" placeholder="Contraseña" value="mxl_admin_2026">\n' +
    '<button class="btn-primary" onclick="login()">Ingresar</button>\n' +
    '<div id="errorMsg" style="color:red;margin-top:10px"></div>\n' +
    '</div>\n' +
    '</div>\n' +
    '<div id="dashboardPanel" class="dashboard">\n' +
    '<div class="sidebar"><h3>MXL Admin</h3><hr><br><button onclick="loadUsers()" style="width:100%;margin:5px 0;padding:10px;">👥 Usuarios</button><button onclick="loadAds()" style="width:100%;margin:5px 0;padding:10px;">📢 Anuncios</button><button onclick="logout()" style="width:100%;margin:5px 0;padding:10px;background:#ef4444;">🚪 Salir</button></div>\n' +
    '<div class="main-content"><div class="topbar"><h1 id="pageTitle">Dashboard</h1></div><div id="contentArea">Bienvenido al panel</div></div>\n' +
    '</div>\n' +
    '<script>\n' +
    'let token=null;\n' +
    'async function login(){const email=document.getElementById("adminEmail").value;const password=document.getElementById("adminPassword").value;try{const res=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});const data=await res.json();if(res.ok&&data.user?.role==="admin"){token=data.token;localStorage.setItem("adminToken",token);document.getElementById("loginPanel").style.display="none";document.getElementById("dashboardPanel").style.display="block";loadUsers();}else{document.getElementById("errorMsg").innerText="Acceso denegado";}}catch(e){document.getElementById("errorMsg").innerText="Error de conexión";}}\n' +
    'async function loadUsers(){document.getElementById("pageTitle").innerText="Usuarios";document.getElementById("contentArea").innerHTML="Cargando...";const res=await fetch("/api/admin/users",{headers:{"Authorization":`Bearer ${token}`}});const data=await res.json();if(data.users){let html="<table><tr><th>ID</th><th>Nombre</th><th>Email</th><th>Rol</th></tr>";data.users.forEach(u=>{html+=`<tr><td>${u.id}</td><td>${u.name||"-"}</td><td>${u.email}</td><td>${u.role}</td></tr>`;});html+="</table>";document.getElementById("contentArea").innerHTML=html;}}\n' +
    'async function loadAds(){document.getElementById("pageTitle").innerText="Anuncios";document.getElementById("contentArea").innerHTML="Cargando...";const res=await fetch("/api/admin/ads",{headers:{"Authorization":`Bearer ${token}`}});const data=await res.json();if(data.ads){let html="<table><tr><th>ID</th><th>Título</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr>";data.ads.forEach(a=>{html+=`<tr><td>${a.id}</td><td>${a.title}</td><td>$${a.price||0}</td><td>${a.status}</td><td><button class="btn-delete" onclick="deleteAd(${a.id})">Eliminar</button></td></tr>`;});html+="</table>";document.getElementById("contentArea").innerHTML=html;}}\n' +
    'async function deleteAd(id){if(!confirm("¿Eliminar este anuncio?"))return;await fetch(`/api/admin/ads/${id}`,{method:"DELETE",headers:{"Authorization":`Bearer ${token}`}});loadAds();}\n' +
    'function logout(){localStorage.removeItem("adminToken");token=null;document.getElementById("loginPanel").style.display="flex";document.getElementById("dashboardPanel").style.display="none";}\n' +
    'const savedToken=localStorage.getItem("adminToken");if(savedToken){token=savedToken;document.getElementById("loginPanel").style.display="none";document.getElementById("dashboardPanel").style.display="block";loadUsers();}\n' +
    '</script>\n' +
    '</body>\n' +
    '</html>';
    fs.writeFileSync(adminFile, adminHtml);
}

// Crear archivo 404.html si no existe
const notFoundFile = path.join(publicDir, '404.html');
if (!fs.existsSync(notFoundFile)) {
    console.log('📝 Creando 404.html...');
    const notFoundHtml = '<!DOCTYPE html>\n' +
    '<html>\n' +
    '<head><meta charset="UTF-8"><title>404 - MXL Clasificados</title>\n' +
    '<style>\n' +
    'body{font-family:Arial;text-align:center;padding:50px;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;color:white}\n' +
    'h1{font-size:120px;margin:0}\n' +
    'a{color:white;text-decoration:none;border:2px solid white;padding:10px 20px;border-radius:8px;display:inline-block;margin-top:20px}\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<h1>404</h1>\n' +
    '<p>Página no encontrada</p>\n' +
    '<a href="/">Volver al inicio</a>\n' +
    '</body>\n' +
    '</html>';
    fs.writeFileSync(notFoundFile, notFoundHtml);
}

// Crear archivo index.html si no existe
const indexFile = path.join(publicDir, 'index.html');
if (!fs.existsSync(indexFile)) {
    console.log('📝 Creando index.html...');
    const indexHtml = '<!DOCTYPE html>\n' +
    '<html>\n' +
    '<head><meta charset="UTF-8"><title>MXL Clasificados</title>\n' +
    '<style>\n' +
    'body{font-family:Arial;text-align:center;padding:50px;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;color:white}\n' +
    'h1{font-size:3rem}\n' +
    '.btn{background:white;color:#1A237E;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:20px}\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<h1>🚀 MXL Clasificados</h1>\n' +
    '<p>Mercado de confianza en República Dominicana</p>\n' +
    '<a href="/admin" class="btn">Panel Admin</a>\n' +
    '</body>\n' +
    '</html>';
    fs.writeFileSync(indexFile, indexHtml);
}

console.log(`✅ Carpeta public lista en: ${publicDir}`);
console.log(`   - admin.html: ${fs.existsSync(adminFile) ? '✅' : '❌'}`);
console.log(`   - index.html: ${fs.existsSync(indexFile) ? '✅' : '❌'}`);
console.log(`   - 404.html: ${fs.existsSync(notFoundFile) ? '✅' : '❌'}`);

// Configuración
const PORT = process.env.PORT || 8080;
const SITE_NAME = process.env.SITE_NAME || 'MXL Clasificados';
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
console.log(`📍 Base URL: ${BASE_URL}`);
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

// Health check mejorado
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
        res.status(404).sendFile(path.join(publicDir, '404.html'));
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

// ============ SELF-PING - KEEP ALIVE ============
let pingInterval = null;
let consecutiveFails = 0;
const MAX_CONSECUTIVE_FAILS = 3;

function startSelfPing() {
    const selfUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${PORT}`;
    
    console.log(`🔄 Iniciando Self-Ping cada 10 minutos a: ${selfUrl}/ping`);
    
    const ping = () => {
        const protocol = process.env.RAILWAY_PUBLIC_DOMAIN ? 'https' : 'http';
        const host = process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost';
        const port = process.env.RAILWAY_PUBLIC_DOMAIN ? 443 : PORT;
        
        const options = {
            hostname: host,
            port: port,
            path: '/ping',
            method: 'GET',
            ...(process.env.RAILWAY_PUBLIC_DOMAIN && { protocol: 'https:' })
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    consecutiveFails = 0;
                    console.log(`💓 Self-Ping exitoso - ${new Date().toISOString()}`);
                } else {
                    consecutiveFails++;
                    console.warn(`⚠️ Self-Ping status: ${res.statusCode} (Fallo ${consecutiveFails})`);
                }
            });
        });
        
        req.on('error', (error) => {
            consecutiveFails++;
            console.error(`❌ Self-Ping falló: ${error.message} (Fallo ${consecutiveFails})`);
            
            if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
                console.error('🚨 Demasiados fallos en Self-Ping!');
                consecutiveFails = 0;
            }
        });
        
        req.end();
    };
    
    setTimeout(ping, 5000);
    pingInterval = setInterval(ping, 10 * 60 * 1000);
}

// ============ MONITOREO DE MEMORIA ============
function startMemoryMonitoring() {
    console.log('📊 Iniciando monitoreo de memoria...');
    
    setInterval(() => {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
        const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);
        
        console.log(`📊 Memoria: Heap: ${heapUsedMB}/${heapTotalMB}MB | RSS: ${rssMB}MB`);
        
        if (heapUsedMB > heapTotalMB * 0.8) {
            console.warn(`⚠️ ALERTA: Uso de memoria alto: ${heapUsedMB}/${heapTotalMB}MB`);
        }
    }, 5 * 60 * 1000);
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
            startMemoryMonitoring();
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
