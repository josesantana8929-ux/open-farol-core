const { Pool } = require('pg');

let pool = null;

const getPool = () => {
  if (pool) return pool;
  
  // Railway genera automáticamente DATABASE_URL
  // También puede usar variables individuales PGHOST, PGPORT, etc.
  const connectionString = process.env.DATABASE_URL || 
                          process.env.POSTGRES_URL ||
                          process.env.PG_DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ No se encontró DATABASE_URL en las variables de entorno');
    console.log('📋 Variables disponibles:', Object.keys(process.env).filter(k => k.includes('PG') || k.includes('POSTGRES')));
    return null;
  }
  
  console.log('✅ Conectando a PostgreSQL en Railway...');
  
  // Configuración para Railway (requiere SSL)
  const config = {
    connectionString: connectionString,
    max: 20,                       // Máximo de conexiones en el pool
    idleTimeoutMillis: 30000,      // Tiempo de espera para conexiones inactivas
    connectionTimeoutMillis: 10000, // Timeout de conexión (10 segundos)
  };
  
  // Railway OBLIGA usar SSL con rejectUnauthorized: false
  if (process.env.NODE_ENV === 'production' || connectionString.includes('railway')) {
    config.ssl = {
      rejectUnauthorized: false,   // ⚠️ NECESARIO PARA RAILWAY
    };
    console.log('🔒 SSL habilitado para Railway');
  }
  
  pool = new Pool(config);
  
  // Manejar errores del pool
  pool.on('error', (err) => {
    console.error('❌ Error inesperado en el pool de conexiones:', err.message);
  });
  
  pool.on('connect', () => {
    console.log('✅ Nueva conexión establecida a la base de datos');
  });
  
  return pool;
};

const testConnection = async () => {
  try {
    const poolInstance = getPool();
    if (!poolInstance) {
      console.error('❌ No se pudo crear el pool de conexiones');
      return false;
    }
    
    const client = await poolInstance.connect();
    const result = await client.query('SELECT NOW() as now, version() as version');
    client.release();
    
    console.log('✅ Base de datos conectada exitosamente');
    console.log(`   📅 Hora: ${result.rows[0].now}`);
    console.log(`   🗄️  Versión: ${result.rows[0].version.split(',')[0]}`);
    return true;
  } catch (error) {
    console.error('❌ Error de conexión a la base de datos:', error.message);
    console.error('   Detalles:', error.stack);
    return false;
  }
};

const query = async (text, params) => {
  const start = Date.now();
  try {
    const poolInstance = getPool();
    if (!poolInstance) {
      throw new Error('No hay conexión a la base de datos');
    }
    
    const result = await poolInstance.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      console.warn(`⚠️ Query lenta (${duration}ms): ${text.substring(0, 100)}`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error en query:', error.message);
    throw error;
  }
};

const getClient = async () => {
  const poolInstance = getPool();
  if (!poolInstance) {
    throw new Error('No hay conexión a la base de datos');
  }
  return await poolInstance.connect();
};

// Función para verificar el estado de la conexión
const getConnectionStatus = () => {
  return {
    isConnected: pool !== null,
    totalCount: pool?.totalCount || 0,
    idleCount: pool?.idleCount || 0,
    waitingCount: pool?.waitingCount || 0,
  };
};

module.exports = {
  getPool,
  query,
  testConnection,
  getClient,
  getConnectionStatus,
  pool: getPool(),
};
