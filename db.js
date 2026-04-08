}const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

/**
 * Obtener el pool de conexiones (singleton)
 */
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,              // Máximo de conexiones simultáneas
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        // Manejo de errores del pool
        pool.on('error', (err) => {
            console.error('❌ Error inesperado en pool de DB:', err.message);
        });
    }
    return pool;
}

/**
 * Ejecutar query con logging de tiempo
 */
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await getPool().query(text, params);
        const duration = Date.now() - start;
        if (duration > 100) {
            console.log(`⏱️ Query lenta (${duration}ms): ${text.slice(0, 100)}`);
        }
        return res;
    } catch (error) {
        console.error('❌ Error en query:', error.message);
        console.error('📝 Query:', text.slice(0, 200));
        throw error;
    }
}

/**
 * Probar conexión a la base de datos
 */
async function testConnection() {
    try {
        const result = await query('SELECT NOW() as now, version() as version');
        console.log('✅ Conexión a DB exitosa');
        console.log(`   📅 Fecha DB: ${result.rows[0].now}`);
        console.log(`   🐘 Versión: ${result.rows[0].version.split(',')[0]}`);
        return true;
    } catch (error) {
        console.error('❌ Error de conexión a DB:', error.message);
        return false;
    }
}

/**
 * Obtener estadísticas rápidas de la DB
 */
async function getStats() {
    try {
        const [users, ads, activeAds, verifiedUsers] = await Promise.all([
            query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'),
            query('SELECT COUNT(*) FROM ads WHERE deleted_at IS NULL'),
            query(`SELECT COUNT(*) FROM ads WHERE status = 'active' AND deleted_at IS NULL`),
            query('SELECT COUNT(*) FROM users WHERE verified = true')
        ]);
        return {
            users: parseInt(users.rows[0].count),
            ads: parseInt(ads.rows[0].count),
            activeAds: parseInt(activeAds.rows[0].count),
            verifiedUsers: parseInt(verifiedUsers.rows[0].count)
        };
    } catch (error) {
        console.error('❌ Error al obtener stats:', error.message);
        return null;
    }
}

/**
 * Registrar acción en audit_log (opcional, si existe la tabla)
 */
async function audit(accion, userId, details) {
    try {
        // Verificar si la tabla existe
        const tableExists = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'audit_log'
            )
        `);
        if (tableExists.rows[0].exists) {
            await query(
                `INSERT INTO audit_log (accion, user_id, details, fecha) VALUES ($1, $2, $3, NOW())`,
                [accion, userId, JSON.stringify(details)]
            );
        }
    } catch (error) {
        // No mostrar error si no existe la tabla
        if (process.env.NODE_ENV !== 'production') {
            console.warn('⚠️ Audit log no disponible:', error.message);
        }
    }
}

/**
 * Cerrar el pool de conexiones (para graceful shutdown)
 */
async function closePool() {
    if (pool) {
        await pool.end();
        console.log('🔌 Pool de conexiones cerrado');
        pool = null;
    }
}

module.exports = {
    query,
    getPool,
    testConnection,
    getStats,
    audit,
    closePool
};
