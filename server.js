const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const db = require('./db');

// Cargar variables de entorno
dotenv.config();

// Validar configuración crítica
const requiredEnvVars = ['SITE_NAME'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`❌ Faltan variables de entorno: ${missingEnvVars.join(', ')}`);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Configuración desde variables de entorno
const PORT = process.env.PORT || 3000;
const SITE_NAME = process.env.SITE_NAME || 'ClasificadosPlatform';
const isProduction = process.env.NODE_ENV === 'production';

// Inicializar Express
const app = express();

// ============ MIDDLEWARE DE SEGURIDAD ============

// Helmet para seguridad de headers HTTP
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

// CORS configurable
app.use(cors({
  origin: isProduction ? process.env.ALLOWED_ORIGINS?.split(',') || true : true,
  credentials: true,
  optionsSuccessStatus: 200,
}));

// Compresión para respuestas más rápidas
app.use(compression());

// Rate limiting para prevenir ataques de fuerza bruta
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // límite por ventana
  message: 'Demasiadas solicitudes desde esta IP, por favor intenta más tarde',
  standardHeaders: true, // Retorna información rate limit en headers
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Parseo de JSON y URL encoded con límites
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging de requests (solo en desarrollo)
if (!isProduction) {
  app.use((req, res, next) => {
    console.log(`📝 ${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
  });
}

// ============ HEADERS PERSONALIZADOS ============
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', SITE_NAME);
  res.setHeader('X-Site-Name', SITE_NAME);
  next();
});

// ============ RUTAS ============

// Ruta de health check (para Railway, Hostinger, etc)
app.get('/health', async (req, res) => {
  try {
    // Verificar conexión a DB
    const dbStatus = await db.testConnection();
    
    const healthInfo = {
      status: 'OK',
      siteName: SITE_NAME,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: dbStatus ? 'connected' : 'disconnected',
      memory: process.memoryUsage(),
      version: process.version,
    };
    
    res.status(200).json(healthInfo);
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      siteName: SITE_NAME,
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      details: error.message,
    });
  }
});

// Ruta raíz con información básica
app.get('/', (req, res) => {
  res.json({
    name: SITE_NAME,
    description: process.env.SITE_DESCRIPTION || 'Plataforma de clasificados',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      health: '/health',
      api: '/api',
    },
  });
});

// Ruta simple para verificar configuración
app.get('/config-check', (req, res) => {
  res.json({
    siteName: SITE_NAME,
    nodeEnv: process.env.NODE_ENV,
    dbConfigured: !!process.env.DATABASE_URL || (!!process.env.DB_HOST && !!process.env.DB_USER),
    cloudinaryConfigured: !!process.env.CLOUDINARY_URL || 
      (!!process.env.CLOUDINARY_CLOUD_NAME && !!process.env.CLOUDINARY_API_KEY),
  });
});

// ============ MANEJO DE ERRORES ============

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `La ruta ${req.method} ${req.path} no existe`,
    siteName: SITE_NAME,
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('❌ Error no capturado:', err.stack);
  
  const status = err.status || 500;
  const message = isProduction && status === 500 
    ? 'Error interno del servidor' 
    : err.message;
  
  res.status(status).json({
    error: message,
    siteName: SITE_NAME,
    ...(!isProduction && { stack: err.stack }),
  });
});

// ============ INICIO DEL SERVIDOR ============

const startServer = async () => {
  try {
    // Probar conexión a base de datos antes de iniciar
    const dbConnected = await db.testConnection();
    
    if (!dbConnected) {
      console.error('❌ No se pudo conectar a la base de datos. El servidor no se iniciará.');
      if (isProduction) {
        process.exit(1);
      } else {
        console.warn('⚠️  Continuando sin base de datos en modo desarrollo...');
      }
    }
    
    // Iniciar servidor
    const server = app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════╗
║  🚀 ${SITE_NAME} - Servidor Iniciado                ║
╠══════════════════════════════════════════════════════╣
║  📡 Puerto: ${PORT}                                  ║
║  🌍 Entorno: ${process.env.NODE_ENV || 'development'} ║
║  🗄️  Base de Datos: ${dbConnected ? 'Conectada ✅' : 'Desconectada ⚠️'} ║
║  📊 Health Check: http://localhost:${PORT}/health    ║
║  🖥️  Servidor: ${isProduction ? 'Producción' : 'Desarrollo'}   ║
╚══════════════════════════════════════════════════════╝
      `);
    });
    
    // Graceful shutdown
    const gracefulShutdown = async () => {
      console.log('\n🛑 Recibida señal de terminación, cerrando servidor...');
      server.close(async () => {
        console.log('📦 Cerrando conexiones de base de datos...');
        await db.pool.end();
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
      });
    };
    
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
  } catch (error) {
    console.error('❌ Error fatal al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Solo iniciar si este archivo es ejecutado directamente
if (require.main === module) {
  startServer();
}

module.exports = app;
