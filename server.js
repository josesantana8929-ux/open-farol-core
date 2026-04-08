const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const db = require('./db');

// Importar rutas
const authRoutes = require('./routes/authRoutes');
const adRoutes = require('./routes/adRoutes');

// Cargar variables de entorno
dotenv.config();

// Validar configuración crítica
const requiredEnvVars = ['SITE_NAME', 'SESSION_SECRET'];
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
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://via.placeholder.com"],
      connectSrc: ["'self'", "https://api.cloudinary.com"],
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

// Aplicar rate limit a rutas de API
app.use('/api/', limiter);

// Rate limit más estricto para autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos
  message: 'Demasiados intentos de inicio de sesión, por favor intenta más tarde',
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

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
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ============ RUTAS DE LA API ============

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de anuncios
app.use('/api/ads', adRoutes);

// ============ RUTAS PÚBLICAS ============

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
      nodeEnv: process.env.NODE_ENV,
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
      api: {
        auth: '/api/auth',
        ads: '/api/ads',
      },
    },
    documentation: '/api/docs',
  });
});

// Ruta simple para verificar configuración (solo desarrollo)
if (!isProduction) {
  app.get('/config-check', (req, res) => {
    res.json({
      siteName: SITE_NAME,
      nodeEnv: process.env.NODE_ENV,
      dbConfigured: !!process.env.DATABASE_URL || (!!process.env.DB_HOST && !!process.env.DB_USER),
      cloudinaryConfigured: !!process.env.CLOUDINARY_URL || 
        (!!process.env.CLOUDINARY_CLOUD_NAME && !!process.env.CLOUDINARY_API_KEY),
      jwtConfigured: !!process.env.SESSION_SECRET,
    });
  });
}

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
  
  // Errores específicos de multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'Archivo demasiado grande',
      message: `El tamaño máximo permitido es ${parseInt(process.env.MAX_FILE_SIZE) / 1024 / 1024}MB`,
    });
  }
  
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Demasiados archivos',
      message: 'Máximo 5 imágenes por anuncio',
    });
  }
  
  if (err.message === 'Tipo de archivo no permitido') {
    return res.status(400).json({
      error: 'Tipo de archivo no permitido',
      message: `Formatos permitidos: ${process.env.ALLOWED_FILE_TYPES || 'image/jpeg, image/png, image/webp'}`,
    });
  }
  
  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Token inválido',
      message: 'Por favor, inicia sesión nuevamente',
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expirado',
      message: 'Tu sesión ha expirado, por favor inicia sesión nuevamente',
    });
  }
  
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
╔══════════════════════════════════════════════════════════════════════╗
║                    🚀 ${SITE_NAME} - Servidor Iniciado                    ║
╠══════════════════════════════════════════════════════════════════════╣
║  📡 Puerto: ${PORT}                                                       ║
║  🌍 Entorno: ${(process.env.NODE_ENV || 'development').padEnd(30)}║
║  🗄️  Base de Datos: ${dbConnected ? 'Conectada ✅' : 'Desconectada ⚠️'}                                         ║
║  📊 Health Check: http://localhost:${PORT}/health                                    ║
║  🔐 Auth API: http://localhost:${PORT}/api/auth                                     ║
║  📦 Ads API: http://localhost:${PORT}/api/ads                                       ║
║  🖥️  Servidor: ${isProduction ? 'Producción 🏭' : 'Desarrollo 💻'}                                                 ║
╚══════════════════════════════════════════════════════════════════════╝
      `);
      
      // Mostrar endpoints disponibles en desarrollo
      if (!isProduction) {
        console.log(`
📋 Endpoints disponibles:

  Autenticación:
  POST   /api/auth/register  - Registrar usuario
  POST   /api/auth/login     - Iniciar sesión
  GET    /api/auth/profile   - Ver perfil (requiere token)
  PUT    /api/auth/profile   - Actualizar perfil (requiere token)

  Anuncios:
  GET    /api/ads            - Listar anuncios (con filtros)
  GET    /api/ads/:id        - Ver anuncio específico
  POST   /api/ads            - Crear anuncio (requiere token + imágenes)
  GET    /api/ads/user/my-ads - Mis anuncios (requiere token)
  DELETE /api/ads/:id        - Eliminar anuncio (requiere token)

  Sistema:
  GET    /health             - Estado del servidor
  GET    /config-check       - Ver configuración (solo desarrollo)
        `);
      }
    });
    
    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Recibida señal ${signal}, cerrando servidor...`);
      
      server.close(async () => {
        console.log('📦 Cerrando conexiones de base de datos...');
        try {
          await db.pool.end();
          console.log('✅ Conexiones de base de datos cerradas');
        } catch (err) {
          console.error('❌ Error cerrando conexiones:', err);
        }
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
      });
      
      // Forzar cierre después de 10 segundos
      setTimeout(() => {
        console.error('⚠️  Timeout cerrando conexiones, forzando salida');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Manejar excepciones no capturadas
    process.on('uncaughtException', (error) => {
      console.error('❌ Excepción no capturada:', error);
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Promesa rechazada no manejada:', reason);
      gracefulShutdown('unhandledRejection');
    });
    
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
