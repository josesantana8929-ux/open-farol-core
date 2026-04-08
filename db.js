const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Soporte tanto para URL completa como para variables individuales
const isProduction = process.env.NODE_ENV === 'production';

let poolConfig;

if (process.env.DATABASE_URL) {
  // Para Railway y despliegues con URL completa
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 20, // Máximo de conexiones en el pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
} else {
  // Para desarrollo local y VPS con variables separadas
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'classifieds_db',
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

const pool = new Pool(poolConfig);

// Eventos de monitoreo del pool
pool.on('connect', () => {
  console.log('📦 Nueva conexión al pool de PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
});

// Función para probar la conexión
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as time, version() as version');
    console.log('✅ PostgreSQL conectado exitosamente');
    console.log(`🕒 Hora del servidor: ${result.rows[0].time}`);
    console.log(`🐘 Versión: ${result.rows[0].version}`);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
    return false;
  }
};

// Query helper con logging en desarrollo
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('📊 Query ejecutada:', { text, duration: `${duration}ms`, rows: result.rowCount });
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error en query:', { text, error: error.message });
    throw error;
  }
};

// Transacción helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
  transaction,
  testConnection,
  getPool: () => pool,
};
