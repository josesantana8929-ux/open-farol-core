const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { 
  registerValidation, 
  loginValidation, 
  profileUpdateValidation,
  authMiddleware 
} = require('../middleware/validators');

// Verificar que authController tiene todas las funciones necesarias
console.log('🔍 authController funciones disponibles:', Object.keys(authController));

router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);
router.get('/profile', authMiddleware, authController.getProfile);
router.put('/profile', authMiddleware, profileUpdateValidation, authController.updateProfile);
router.post('/change-password', authMiddleware, authController.changePassword);

module.exports = router;
