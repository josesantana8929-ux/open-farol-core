const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        
        pool.on('error', (err) => {
            console.error('❌ Error inesperado en pool de DB:', err);
        });
    }
    return pool;
}

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
        throw error;
    }
}

async function testConnection() {
    try {
        const result = await query('SELECT NOW()');
        return result.rows[0]?.now ? true : false;
    } catch (error) {
        console.error('❌ Error de conexión a DB:', error.message);
        return false;
    }
}

async function initDatabase() {
    const dbc = getPool();
    
    // Tabla de usuarios (ampliada para verificación)
    await dbc.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            phone VARCHAR(20),
            user_type VARCHAR(20) DEFAULT 'buyer',
            role VARCHAR(20) DEFAULT 'user',
            verified BOOLEAN DEFAULT FALSE,
            verification_status VARCHAR(20) DEFAULT 'pending',
            verified_date TIMESTAMP,
            plan_type VARCHAR(20) DEFAULT 'free',
            plan_expires TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            deleted_at TIMESTAMP
        )
    `);
    
    // Tabla de anuncios (con boost)
    await dbc.query(`
        CREATE TABLE IF NOT EXISTS ads (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            title VARCHAR(200) NOT NULL,
            description TEXT,
            price DECIMAL(10,2),
            category VARCHAR(100),
            ubicacion_sector VARCHAR(100),
            ubicacion_ciudad VARCHAR(50) DEFAULT 'Santo Domingo Este',
            status VARCHAR(20) DEFAULT 'pending',
            views INTEGER DEFAULT 0,
            boosted_at TIMESTAMP,
            boosted_expires TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP,
            deleted_at TIMESTAMP
        )
    `);
    
    // Tabla de imágenes de anuncios
    await dbc.query(`
        CREATE TABLE IF NOT EXISTS ad_images (
            id SERIAL PRIMARY KEY,
            ad_id INTEGER REFERENCES ads(id),
            image_url TEXT,
            is_primary BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Tabla de solicitudes de verificación
    await dbc.query(`
        CREATE TABLE IF NOT EXISTS verification_requests (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            id_photo_front TEXT,
            id_photo_back TEXT,
            selfie_photo TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            admin_notes TEXT,
            requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP,
            reviewed_by INTEGER
        )
    `);
    
    // Tabla de transacciones
    await dbc.query(`
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            amount DECIMAL(10,2),
            type VARCHAR(30),
            item_id INTEGER,
            status VARCHAR(20) DEFAULT 'pending',
            payment_method VARCHAR(30),
            reference VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    `);
    
    // Tabla de sectores
    await dbc.query(`
        CREATE TABLE IF NOT EXISTS sectores (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) UNIQUE NOT NULL,
            ciudad VARCHAR(50) DEFAULT 'Santo Domingo Este'
        )
    `);
    
    // Insertar sectores por defecto
    const sectores = [
        'Los Mina', 'Invivienda', 'San Vicente', 'Mendoza', 'Cancino',
        'Alma Rosa', 'Villa Francisca', 'Villa Duarte', 'Miami Este',
        'Brisas del Este', 'Residencial del Este', 'San Isidro',
        'Lucerna', 'Villa Faro', 'Los Trinitarios', 'El Paredón'
    ];
    
    for (const sector of sectores) {
        await dbc.query(`INSERT INTO sectores (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`, [sector]);
    }
    
    // Tabla de planes
    await dbc.query(`
        CREATE TABLE IF NOT EXISTS plans (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) UNIQUE NOT NULL,
            price DECIMAL(10,2),
            duration_days INTEGER,
            features JSONB
        )
    `);
    
    // Insertar planes por defecto
    await dbc.query(`
        INSERT INTO plans (name, price, duration_days, features) VALUES 
        ('pro', 399, 30, '["perfil_tienda", "anuncios_destacados", "soporte_prioritario"]'),
        ('premium', 799, 30, '["perfil_tienda", "anuncios_destacados", "soporte_prioritario", "boost_mensual", "insignia_premium", "primeros_resultados"]')
        ON CONFLICT (name) DO NOTHING
    `);
    
    // Crear admin por defecto
    const bcrypt = require('bcryptjs');
    const adminEmail = 'admin@elfarol.com.do';
    const adminExists = await dbc.query(`SELECT * FROM users WHERE email = $1`, [adminEmail]);
    if (adminExists.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await dbc.query(
            `INSERT INTO users (name, email, password, role, user_type, verified) VALUES ($1, $2, $3, $4, $5, $6)`,
            ['Administrador', adminEmail, hashedPassword, 'admin', 'seller', true]
        );
        console.log('✅ Admin creado: admin@elfarol.com.do / admin123');
    }
    
    console.log('✅ Base de datos inicializada');
}

async function audit(accion, userId, details) {
    try {
        await query(
            `INSERT INTO audit_log (accion, user_id, details, fecha) VALUES ($1, $2, $3, NOW())`,
            [accion, userId, JSON.stringify(details)]
        );
    } catch (error) {
        console.warn('⚠️ Error en audit log:', error.message);
    }
}

module.exports = {
    query,
    getPool,
    testConnection,
    initDatabase,
    audit
};
