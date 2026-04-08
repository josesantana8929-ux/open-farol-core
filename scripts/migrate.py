#!/usr/bin/env node
/**
 * Script de migración para SmartClienteRD IA (Node.js)
 * Ejecutar: node scripts/migrate.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Colores para console
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function printSuccess(msg) {
  console.log(`${colors.green}✅ ${msg}${colors.reset}`);
}

function printError(msg) {
  console.log(`${colors.red}❌ ${msg}${colors.reset}`);
}

function printInfo(msg) {
  console.log(`${colors.blue}ℹ️ ${msg}${colors.reset}`);
}

function printWarning(msg) {
  console.log(`${colors.yellow}⚠️ ${msg}${colors.reset}`);
}

async function migrate() {
  console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}   🚀 SmartClienteRD IA - Migración de Base de Datos${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);

  // Obtener URL de la base de datos
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    printError('No se encontró DATABASE_URL en las variables de entorno');
    printInfo('Asegúrate de tener un archivo .env con DATABASE_URL');
    printInfo('Ejemplo: DATABASE_URL=postgresql://user:pass@localhost:5432/smartclienterd');
    process.exit(1);
  }

  printInfo('Conectando a la base de datos...');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    // Probar conexión
    await pool.query('SELECT NOW()');
    printSuccess('Conexión establecida');

    // Leer el archivo schema.sql
    const schemaPath = path.join(__dirname, '..', 'schema.sql');

    if (!fs.existsSync(schemaPath)) {
      printError(`No se encontró el archivo schema.sql en ${schemaPath}`);
      printInfo('Debes crear el archivo schema.sql con la definición de las tablas');
      process.exit(1);
    }

    printInfo(`Leyendo schema.sql desde ${schemaPath}`);

    const sql = fs.readFileSync(schemaPath, 'utf-8');

    printInfo('Ejecutando creación de tablas...');

    // Dividir por statements (separados por ;)
    const statements = sql.split(';').filter(s => s.trim().length > 0);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      try {
        await pool.query(statement);
        console.log(`   ✓ Statement ${i + 1} ejecutado correctamente`);
      } catch (err) {
        // Si es error de "already exists", lo ignoramos
        if (err.message.includes('already exists')) {
          printWarning(`   Statement ${i + 1}: Ya existe (ignorado)`);
        } else {
          throw err;
        }
      }
    }

    printSuccess('¡Migración completada con éxito!');

    // Verificar tablas creadas
    printInfo('\nVerificando tablas creadas:');

    const tables = [
      'users', 'ads', 'clients', 'messages'
    ];

    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        const count = parseInt(result.rows[0].count);
        printSuccess(`  📋 ${table}: ${count} registros`);
      } catch (err) {
        printError(`  ❌ ${table}: No encontrada`);
      }
    }

    console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
    printSuccess('🎉 Base de datos lista para usar');
    printInfo('Ahora puedes iniciar el servidor: npm start');
    console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);

  } catch (error) {
    printError(`Error durante la migración: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
