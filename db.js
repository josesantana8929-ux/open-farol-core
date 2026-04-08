const { Pool } = require('pg');

let pool = null;

const getPool = () => {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString && process.env.NODE_ENV === 'production') {
      console.error('❌ DATABASE_URL no configurada');
      return null;
    }
    
    const config = {
      connectionString: connectionString || 'postgresql://postgres:password@localhost:5432/clasificados_db',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
    
    // Solo agregar SSL en producción si es necesario
    if (process.env.NODE_ENV === 'production' && connectionString?.includes('railway')) {
      config.ssl = { rejectUnauthorized: false };
    }
    
    pool = new Pool(config);
    
    pool.on('error', (err) => {
      console.error('❌ Error inesperado en pool:', err.message);
    });
  }
  return pool;
};

const testConnection = async () => {
  try {
    const poolInstance = getPool();
    if (!poolInstance) return false;
    
    const client = await poolInstance.connect();
    const result = await client.query('SELECT NOW() as now');
    client.release();
    console.log('✅ Base de datos conectada:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Error de conexión a BD:', error.message);
    return false;
  }
};

const query = async (text, params) => {
  const start = Date.now();
  try {
    const poolInstance = getPool();
    if (!poolInstance) throw new Error('No hay conexión a la base de datos');
    
    const result = await poolInstance.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⚠️ Query lenta (${duration}ms):`, text.substring(0, 100));
    }
    return result;
  } catch (error) {
    console.error('❌ Error en query:', error.message);
    throw error;
  }
};

const getClient = async () => {
  const poolInstance = getPool();
  if (!poolInstance) throw new Error('No hay conexión a la base de datos');
  return await poolInstance.connect();
};

module.exports = {
  getPool,
  query,
  testConnection,
  getClient,
  pool: getPool(),
};
