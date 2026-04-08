// test.js - Prueba simple
console.log('=== INICIANDO TEST ===\n');

// Test 1: Cargar authRoutes
try {
  const authRoutes = require('./routes/authRoutes');
  console.log('✅ authRoutes cargado correctamente');
  console.log('   Rutas disponibles: POST /register, POST /login, GET /profile, PUT /profile, POST /change-password');
} catch (error) {
  console.error('❌ Error en authRoutes:', error.message);
  process.exit(1);
}

// Test 2: Cargar server
try {
  const app = require('express')();
  const authRoutes = require('./routes/authRoutes');
  app.use('/api/auth', authRoutes);
  console.log('✅ Servidor configurado correctamente');
} catch (error) {
  console.error('❌ Error configurando servidor:', error.message);
}

console.log('\n=== TEST COMPLETADO ===');
