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
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://via.placeholder.com", "https://images.unsplash.com"],
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

// Archivos estáticos
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
  skip: (req) => req.path === '/' || req.path.startsWith('/public'),
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

// Rutas de autenticación y anuncios
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
    const { limit = 100, search = '' } = req.query;
    let query = `
      SELECT id, name, email, phone, role, created_at, last_login 
      FROM users WHERE deleted_at IS NULL
    `;
    const params = [];
    
    if (search) {
      query += ` AND (name ILIKE $1 OR email ILIKE $1)`;
      params.push(`%${search}%`);
      params.push(limit);
    } else {
      query += ` ORDER BY created_at DESC LIMIT $1`;
      params.push(limit);
    }
    
    const result = await db.query(query, params);
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// Listar todos los anuncios (admin)
app.get('/api/admin/ads', verifyAdmin, async (req, res) => {
  try {
    const { limit = 100, status = 'all' } = req.query;
    let query = `
      SELECT a.*, u.email as user_email, u.name as user_name
      FROM ads a
      JOIN users u ON a.user_id = u.id
      WHERE a.deleted_at IS NULL
    `;
    const params = [];
    
    if (status !== 'all') {
      query += ` AND a.status = $1`;
      params.push(status);
      params.push(limit);
    } else {
      query += ` ORDER BY a.created_at DESC LIMIT $1`;
      params.push(limit);
    }
    
    const result = await db.query(query, params);
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

// Rechazar/Eliminar anuncio (admin)
app.delete('/api/admin/ads/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener imágenes para eliminar de Cloudinary si es necesario
    const imagesResult = await db.query(
      'SELECT public_id FROM ad_images WHERE ad_id = $1 AND public_id IS NOT NULL',
      [id]
    );
    
    // Eliminar anuncio (soft delete)
    const result = await db.query(
      'UPDATE ads SET deleted_at = NOW(), status = $1 WHERE id = $2 RETURNING *',
      ['deleted', id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anuncio no encontrado' });
    }
    
    // Eliminar imágenes asociadas
    await db.query('UPDATE ad_images SET deleted_at = NOW() WHERE ad_id = $1', [id]);
    
    res.json({ message: 'Anuncio eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar anuncio:', error);
    res.status(500).json({ error: 'Error al eliminar el anuncio' });
  }
});

// Obtener estadísticas detalladas (admin)
app.get('/api/admin/detailed-stats', verifyAdmin, async (req, res) => {
  try {
    const [usersByMonth, adsByCategory, topUsers] = await Promise.all([
      db.query(`
        SELECT DATE_TRUNC('month', created_at) as month, COUNT(*) as count
        FROM users WHERE deleted_at IS NULL
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC LIMIT 6
      `),
      db.query(`
        SELECT category, COUNT(*) as count
        FROM ads WHERE deleted_at IS NULL AND status = 'active'
        GROUP BY category ORDER BY count DESC
      `),
      db.query(`
        SELECT u.name, u.email, COUNT(a.id) as ad_count
        FROM users u
        LEFT JOIN ads a ON u.id = a.user_id AND a.deleted_at IS NULL
        WHERE u.deleted_at IS NULL
        GROUP BY u.id, u.name, u.email
        ORDER BY ad_count DESC LIMIT 10
      `)
    ]);
    
    res.json({
      usersByMonth: usersByMonth.rows,
      adsByCategory: adsByCategory.rows,
      topUsers: topUsers.rows
    });
  } catch (error) {
    console.error('Error en estadísticas detalladas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ============ RUTAS PÚBLICAS ============

// Ruta principal - sirve el HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta del panel de administración
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Ruta de respaldo
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para verificar configuración (solo desarrollo)
if (!isProduction) {
  app.get('/debug/config', (req, res) => {
    res.json({
      siteName: SITE_NAME,
      nodeEnv: process.env.NODE_ENV,
      dbConfigured: !!process.env.DATABASE_URL,
      sessionSecretConfigured: !!process.env.SESSION_SECRET,
      publicPath: path.join(__dirname, 'public'),
      files: require('fs').readdirSync(path.join(__dirname, 'public'))
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
    // Intentar servir index.html para rutas de SPA
    if (req.path === '/admin' || req.path === '/app') {
      return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
        if (err) {
          res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>404 - Página no encontrada</title>
              <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
              <style>
                body { font-family: 'Inter', sans-serif; text-align: center; padding: 50px; background: #F5F5F5; }
                h1 { font-size: 80px; color: #1A237E; margin: 0; }
                p { color: #666; margin: 20px 0; }
                a { color: #1A237E; text-decoration: none; font-weight: 600; }
              </style>
            </head>
            <body>
              <h1>404</h1>
              <p>Página no encontrada</p>
              <a href="/">← Volver al inicio</a>
            </body>
            </html>
          `);
        }
      });
    }
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  } else {
    res.status(404).json({ error: 'Ruta no encontrada' });
  }
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('❌ Error no capturado:', err.message);
  console.error(err.stack);
  
  // Errores específicos
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
    // Probar conexión a base de datos
    console.log('🔄 Verificando conexión a la base de datos...');
    const dbConnected = await db.testConnection();
    
    if (!dbConnected && isProduction) {
      console.error('❌ No se pudo conectar a la base de datos en producción');
      process.exit(1);
    }
    
    // Iniciar servidor
    const server = app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                         🚀 ${SITE_NAME} - SERVIDOR INICIADO                         ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  📡 Puerto: ${PORT}                                                              ║
║  🌍 Entorno: ${(process.env.NODE_ENV || 'development').padEnd(35)}║
║  🗄️  Base Datos: ${dbConnected ? '✅ CONECTADA' : '⚠️ SIN CONEXIÓN'}                                             ║
║  📁 Archivos: ${path.join(__dirname, 'public')}                                    ║
║  🌐 Web: http://localhost:${PORT}                                                 ║
║  🔐 Auth API: http://localhost:${PORT}/api/auth                                   ║
║  📦 Ads API: http://localhost:${PORT}/api/ads                                     ║
║  👑 Admin Panel: http://localhost:${PORT}/admin                                   ║
║  💚 Health: http://localhost:${PORT}/health                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
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
    console.error('❌ Error fatal al iniciar el servidor:', error.message);
    if (isProduction) process.exit(1);
  }
};

// Iniciar servidor solo si es el archivo principal
if (require.main === module) {
  startServer();
}

module.exports = app;
