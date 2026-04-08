const { Pool } = require('pg');

let pool = null;

const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
};

const testConnection = async () => {
  try {
    const client = await getPool().connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Base de datos conectada');
    return true;
  } catch (error) {
    console.error('❌ Error de base de datos:', error.message);
    return false;
  }
};

const query = async (text, params) => {
  try {
    return await getPool().query(text, params);
  } catch (error) {
    console.error('❌ Error en query:', error.message);
    throw error;
  }
};

module.exports = { getPool, query, testConnection, pool: getPool() };
