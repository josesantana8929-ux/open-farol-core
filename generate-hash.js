// generate-hash.js
const bcrypt = require('bcryptjs');

const password = 'mxl_admin_2026';
const hash = bcrypt.hashSync(password, 10);

console.log('=================================');
console.log('🔐 CONTRASEÑA ADMINISTRADOR');
console.log('=================================');
console.log(`📧 Email: admin@elfarol.com.do`);
console.log(`🔑 Contraseña: ${password}`);
console.log(`🔒 Hash: ${hash}`);
console.log('=================================');
console.log('\n📝 Copia este hash y úsalo en el INSERT:');
console.log(hash);
