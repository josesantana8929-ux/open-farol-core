const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

let pool = null;

const getPool = () => {
  if (!pool) {
    const config = {
      connectionString: process.env.DATABASE_URL,
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000,
    };

    if (process.env.NODE_ENV === 'production') {
      config.ssl = { rejectUnauthorized: false };
    }

    pool = new Pool(config);

    pool.on('error', (err) => {
      console.error('❌ Error inesperado en pool de base de datos:', err);
    });
  }
  return pool;
};

const testConnection = async () => {
  try {
    const client = await getPool().connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Base de datos conectada:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Error de conexión a base de datos:', error.message);
    return false;
  }
};

const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⚠️ Query lenta (${duration}ms):`, text);
    }
    return result;
  } catch (error) {
    console.error('❌ Error en query:', error.message);
    throw error;
  }
};

const getClient = async () => {
  return await getPool().connect();
};

module.exports = {
  getPool,
  query,
  testConnection,
  getClient,
  pool: getPool(),
};
