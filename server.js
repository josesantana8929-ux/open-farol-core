const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// IMPORTANTE: db.js debe estar en la misma carpeta
const db = require('./db');

// Importar rutas
const authRoutes = require('./routes/authRoutes');
const adRoutes = require('./routes/adRoutes');

// Configuración
const PORT = process.env.PORT || 8080;
const SITE_NAME = process.env.SITE_NAME || 'ClasificadosPlatform';
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
console.log(`🗄️  Base de datos: ${process.env.DATABASE_URL ? '✅ Configurada' : '❌ No configurada'}\n`);

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

// Health check mejorado
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await db.testConnection();
    const dbConnectionStatus = db.getConnectionStatus();
    
    res.json({
      status: dbStatus ? 'OK' : 'DEGRADED',
      siteName: SITE_NAME,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: dbStatus,
        ...dbConnectionStatus,
      },
      port: PORT,
      version: process.version,
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      error: error.message,
      database: 'disconnected',
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
      debug: '/debug/env',
    },
  });
});

// Debug endpoint (solo desarrollo)
if (!isProduction) {
  app.get('/debug/env', (req, res) => {
    const dbVars = Object.keys(process.env).filter(k => 
      k.includes('PG') || k.includes('POSTGRES') || k.includes('DATABASE')
    );
    res.json({
      database_url_exists: !!process.env.DATABASE_URL,
      database_vars: dbVars,
      node_env: process.env.NODE_ENV,
      has_session_secret: !!process.env.SESSION_SECRET,
    });
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/ads', adRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path,
    method: req.method,
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  
  const status = err.status || 500;
  const message = isProduction && status === 500 
    ? 'Error interno del servidor' 
    : err.message;
  
  res.status(status).json({
    error: message,
    path: req.path,
    timestamp: new Date().toISOString(),
  });
});

// ============ INICIAR SERVIDOR ============
const startServer = async () => {
  try {
    // Probar conexión a base de datos
    console.log('🔄 Probando conexión a la base de datos...');
    const dbConnected = await db.testConnection();
    
    if (!dbConnected) {
      console.error('❌ No se pudo conectar a la base de datos');
      if (isProduction) {
        console.error('⚠️ En producción, el servidor no se iniciará sin base de datos');
        process.exit(1);
      } else {
        console.warn('⚠️ Continuando en modo desarrollo sin base de datos');
      }
    }
    
    // Iniciar servidor
    const server = app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    🚀 ${SITE_NAME} - SERVIDOR INICIADO                    ║
╠══════════════════════════════════════════════════════════════════════╣
║  📡 Puerto: ${PORT}                                                       ║
║  🌍 Entorno: ${(process.env.NODE_ENV || 'development').padEnd(35)}║
║  🗄️  Base Datos: ${dbConnected ? '✅ CONECTADA' : '⚠️ SIN CONEXIÓN'}                                      ║
║  🔗 URL: http://localhost:${PORT}                                         ║
║  💚 Health: http://localhost:${PORT}/health                               ║
║  🔐 Auth: http://localhost:${PORT}/api/auth                               ║
║  📦 Ads: http://localhost:${PORT}/api/ads                                 ║
╚══════════════════════════════════════════════════════════════════════╝
      `);
    });
    
    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Recibida señal ${signal}, cerrando servidor...`);
      
      server.close(async () => {
        console.log('📦 Cerrando conexiones de base de datos...');
        if (db.pool) {
          await db.pool.end();
          console.log('✅ Conexiones cerradas');
        }
        console.log('✅ Servidor cerrado');
        process.exit(0);
      });
      
      setTimeout(() => {
        console.error('⚠️ Timeout, forzando salida');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;
