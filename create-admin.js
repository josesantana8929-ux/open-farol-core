// create-admin.js - Script para crear el administrador
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
        password: 'mxl_admin_2026',
        name: 'Administrador El Farol',
        phone: '+1 (809) 555-0000',
        role: 'admin'
    };
    
    // Generar hash de la contraseña
    const hashedPassword = await bcrypt.hash(adminData.password, 10);
    
    try {
        // Insertar o actualizar administrador
        const result = await pool.query(`
            INSERT INTO users (email, password_hash, name, phone, role, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (email) DO UPDATE 
            SET role = 'admin', 
                password_hash = $2,
                name = $3,
                updated_at = NOW()
            RETURNING id, email, name, role
        `, [adminData.email, hashedPassword, adminData.name, adminData.phone, adminData.role]);
        
        console.log('\n✅ ADMINISTRADOR CREADO/CONFIGURADO EXITOSAMENTE\n');
        console.log('=========================================');
        console.log('🔐 CREDENCIALES DE ACCESO');
        console.log('=========================================');
        console.log(`📧 Email: ${adminData.email}`);
        console.log(`🔑 Contraseña: ${adminData.password}`);
        console.log(`👤 Nombre: ${adminData.name}`);
        console.log(`🎭 Rol: ${adminData.role}`);
        console.log(`🆔 ID: ${result.rows[0].id}`);
        console.log('=========================================');
        console.log('\n🌐 Panel de Administración: /admin');
        console.log('=========================================\n');
        
    } catch (error) {
        console.error('❌ Error al crear administrador:', error.message);
    } finally {
        await pool.end();
    }
}

// Ejecutar
createAdmin();
