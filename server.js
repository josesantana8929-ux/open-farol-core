const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Importar módulos
const db = require('./db');
const authRoutes = require('./routes/authRoutes');
const adRoutes = require('./routes/adRoutes');

// Configuración
const PORT = process.env.PORT || 8080;
const SITE_NAME = process.env.SITE_NAME || 'El Farol - Clasificados';
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
console.log(`📁 Archivos estáticos: ${path.join(__dirname, 'public')}\n`);

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
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://via.placeholder.com"],
      connectSrc: ["'self'", "https://api.cloudinary.com"],
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

// Archivos estáticos - IMPORTANTE: La carpeta 'public' debe existir
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProduction ? '1y' : 0,
  etag: true,
  lastModified: true,
}));

// Rate limiting para API
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Demasiadas solicitudes',
  skip: (req) => req.path === '/' || req.path.startsWith('/public'), // No limitar archivos estáticos
});
app.use('/api/', limiter);

// Parseo de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Headers personalizados
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', SITE_NAME);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
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

// ============ RUTA PRINCIPAL - SIRVE EL HTML ============
// Esta ruta captura la raíz (/) y sirve el archivo index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta de respaldo para SPA (opcional)
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
  // Si no es una ruta de API, intentar servir el index.html (para SPA)
  if (!req.path.startsWith('/api') && req.path !== '/health') {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
      if (err) {
        res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>404 - Página no encontrada</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { font-size: 50px; color: #e74c3c; }
              a { color: #3498db; text-decoration: none; }
            </style>
          </head>
          <body>
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
  console.error('❌ Error:', err.message);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Archivo demasiado grande' });
  }
  
  const status = err.status || 500;
  const message = isProduction && status === 500 ? 'Error interno del servidor' : err.message;
  
  res.status(status).json({ error: message });
});

// ============ INICIAR SERVIDOR ============
const startServer = async () => {
  try {
    const dbConnected = await db.testConnection();
    
    const server = app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    🚀 ${SITE_NAME} - SERVIDOR INICIADO                    ║
╠══════════════════════════════════════════════════════════════════════╣
║  📡 Puerto: ${PORT}                                                       ║
║  🌍 Entorno: ${(process.env.NODE_ENV || 'development').padEnd(35)}║
║  🗄️  Base Datos: ${dbConnected ? '✅ CONECTADA' : '⚠️ SIN CONEXIÓN'}                                      ║
║  📁 Archivos: ${path.join(__dirname, 'public')}                                 ║
║  🌐 Web: http://localhost:${PORT}                                          ║
║  💚 Health: http://localhost:${PORT}/health                               ║
║  🔐 Auth: http://localhost:${PORT}/api/auth                               ║
║  📦 Ads: http://localhost:${PORT}/api/ads                                 ║
╚══════════════════════════════════════════════════════════════════════╝
      `);
    });
    
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Recibida señal ${signal}, cerrando servidor...`);
      server.close(async () => {
        if (db.pool) await db.pool.end();
        console.log('✅ Servidor cerrado');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    if (isProduction) process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;
