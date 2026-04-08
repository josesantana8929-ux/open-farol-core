const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// IMPORTANTE: Usar './db' (un punto) porque db.js está en la MISMA carpeta
const db = require('./db');

// Importar rutas (rutas relativas correctas)
const authRoutes = require('./routes/authRoutes');
const adRoutes = require('./routes/adRoutes');

// Configuración
const PORT = process.env.PORT || 8080;
const SITE_NAME = process.env.SITE_NAME || 'ClasificadosPlatform';
const isProduction = process.env.NODE_ENV === 'production';

// Validar SESSION_SECRET
if (!process.env.SESSION_SECRET) {
  if (isProduction) {
    console.error('❌ SESSION_SECRET no configurado');
    process.exit(1);
  } else {
    process.env.SESSION_SECRET = 'dev_secret_key_123456789';
    console.warn('⚠️ Usando SESSION_SECRET temporal');
  }
}

console.log(`\n🚀 Iniciando ${SITE_NAME}...`);
console.log(`📡 Puerto: ${PORT}`);
console.log(`📁 Directorio: ${__dirname}`);
console.log(`🔐 DB Path: ${require.resolve('./db')}\n`);

const app = express();

// Seguridad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Demasiadas solicitudes',
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

// ============ RUTAS ============

// Health check
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await db.testConnection();
    res.json({
      status: 'OK',
      siteName: SITE_NAME,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus ? 'connected' : 'disconnected',
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      error: error.message,
      database: 'disconnected'
    });
  }
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    name: SITE_NAME,
    version: '1.0.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      ads: '/api/ads',
    },
  });
});

// API Routes - USANDO LAS RUTAS CORRECTAS
app.use('/api/auth', authRoutes);
app.use('/api/ads', adRoutes);

// Ruta de diagnóstico (solo desarrollo)
if (!isProduction) {
  app.get('/debug/paths', (req, res) => {
    res.json({
      __dirname,
      cwd: process.cwd(),
      files: {
        db: require.resolve('./db'),
        authRoutes: require.resolve('./routes/authRoutes'),
        adRoutes: require.resolve('./routes/adRoutes'),
      }
    });
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    path: req.path,
    method: req.method
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  
  const status = err.status || 500;
  const message = isProduction && status === 500 ? 'Error interno del servidor' : err.message;
  
  res.status(status).json({ 
    error: message,
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// ============ INICIAR SERVIDOR ============
const startServer = async () => {
  try {
    // Probar conexión a DB
    const dbConnected = await db.testConnection();
    
    if (!dbConnected && isProduction) {
      console.error('❌ No se pudo conectar a la base de datos');
      process.exit(1);
    }
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║              🚀 ${SITE_NAME} - SERVIDOR INICIADO                ║
╠════════════════════════════════════════════════════════════════╣
║  📡 Puerto: ${PORT}                                             ║
║  🌍 Entorno: ${(process.env.NODE_ENV || 'development').padEnd(35)}║
║  🗄️  Base Datos: ${dbConnected ? '✅ Conectada' : '⚠️ Sin conexión'}                                   ║
║  🔗 URL: http://localhost:${PORT}                               ║
║  💚 Health: http://localhost:${PORT}/health                     ║
║  🔐 Auth: http://localhost:${PORT}/api/auth                     ║
║  📦 Ads: http://localhost:${PORT}/api/ads                       ║
╚════════════════════════════════════════════════════════════════╝
      `);
      
      if (!dbConnected && !isProduction) {
        console.warn('\n⚠️  Modo desarrollo: Base de datos no conectada');
        console.warn('   Algunas funciones pueden no estar disponibles\n');
      }
    });
    
  } catch (error) {
    console.error('❌ Error fatal al iniciar:', error.message);
    if (isProduction) process.exit(1);
  }
};

// Iniciar solo si es el archivo principal
if (require.main === module) {
  startServer();
}

module.exports = app;
