// create-admin.js - Script para crear el administrador
// IMPORTANTE: Este script usa la MISMA estructura que server.js (columna "password", no "password_hash")

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createAdmin() {
    const adminData = {
        email: 'admin@elfarol.com.do',
        password: 'admin123',  // <- Contraseña simple pero segura
        name: 'Administrador El Farol',
        phone: '+1 (809) 555-0000',
        role: 'admin',
        user_type: 'seller',   // <- Campo requerido por server.js
        verified: true         // <- Admin siempre verificado
    };
    
    // Generar hash de la contraseña
    const hashedPassword = await bcrypt.hash(adminData.password, 10);
    
    try {
        // Verificar si la tabla users existe y tiene las columnas correctas
        const tableCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name IN ('password', 'password_hash')
        `);
        
        const hasPasswordColumn = tableCheck.rows.some(r => r.column_name === 'password');
        const hasPasswordHashColumn = tableCheck.rows.some(r => r.column_name === 'password_hash');
        
        let querySQL, params;
        
        if (hasPasswordColumn) {
            // Usar la estructura de server.js (columna "password")
            querySQL = `
                INSERT INTO users (email, password, name, phone, role, user_type, verified, created_at, last_login)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                ON CONFLICT (email) DO UPDATE 
                SET role = 'admin', 
                    user_type = 'seller',
                    verified = true,
                    password = $2,
                    name = $3,
                    updated_at = NOW()
                RETURNING id, email, name, role
            `;
            params = [adminData.email, hashedPassword, adminData.name, adminData.phone, adminData.role, adminData.user_type, adminData.verified];
        } else if (hasPasswordHashColumn) {
            // Usar la estructura alternativa (columna "password_hash")
            querySQL = `
                INSERT INTO users (email, password_hash, name, phone, role, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                ON CONFLICT (email) DO UPDATE 
                SET role = 'admin', 
                    password_hash = $2,
                    name = $3,
                    updated_at = NOW()
                RETURNING id, email, name, role
            `;
            params = [adminData.email, hashedPassword, adminData.name, adminData.phone, adminData.role];
        } else {
            throw new Error('No se encontró columna de contraseña en la tabla users');
        }
        
        const result = await pool.query(querySQL, params);
        
        console.log('\n✅ ADMINISTRADOR CREADO/CONFIGURADO EXITOSAMENTE\n');
        console.log('=========================================');
        console.log('🔐 CREDENCIALES DE ACCESO');
        console.log('=========================================');
        console.log(`📧 Email: ${adminData.email}`);
        console.log(`🔑 Contraseña: ${adminData.password}`);
        console.log(`👤 Nombre: ${adminData.name}`);
        console.log(`🎭 Rol: ${adminData.role}`);
        console.log(`✅ Verificado: ${adminData.verified ? 'Sí' : 'No'}`);
        console.log(`🆔 ID: ${result.rows[0].id}`);
        console.log('=========================================');
        console.log('\n🌐 Panel de Administración: /admin');
        console.log('=========================================\n');
        
        // Verificar que el admin se creó correctamente
        const verify = await pool.query(`SELECT id, email, role, verified FROM users WHERE email = $1`, [adminData.email]);
        console.log('🔍 Verificación en base de datos:');
        console.log(`   ID: ${verify.rows[0]?.id}`);
        console.log(`   Email: ${verify.rows[0]?.email}`);
        console.log(`   Rol: ${verify.rows[0]?.role}`);
        console.log(`   Verificado: ${verify.rows[0]?.verified}`);
        
    } catch (error) {
        console.error('❌ Error al crear administrador:', error.message);
        console.error('💡 Sugerencia: Asegúrate de que la tabla "users" exista y tenga las columnas correctas');
        console.error('   Si la tabla no existe, ejecuta primero el servidor (npm start) para crearla');
    } finally {
        await pool.end();
    }
}

// Ejecutar
createAdmin();
