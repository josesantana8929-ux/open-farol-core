// ✅ ARCHIVO CORREGIDO
const express = require('express');
const router = express.Router();
const multer = require('multer');
const adsController = require('../controllers/adsController');
const { authenticateToken } = require('../utils/jwtUtils');
const { validateCreateAd, validateId, validateSearchParams, validateImages } = require('../middleware/validators');

// Configuración de multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  }
});

// Rutas públicas con validación
router.get('/', validateSearchParams, adsController.getAllAds);
router.get('/:id', validateId, adsController.getAdById);

// Rutas protegidas con validación
router.post('/', authenticateToken, upload.array('images', 5), validateImages, validateCreateAd, adsController.createAd);
router.get('/user/my-ads', authenticateToken, adsController.getUserAds);
router.delete('/:id', authenticateToken, validateId, adsController.deleteAd);

module.exports = router;
