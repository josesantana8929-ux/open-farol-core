const express = require('express');
const router = express.Router();
const multer = require('multer');
const adsController = require('../controllers/adsController');
const { authenticateToken } = require('../utils/jwtUtils');
const { validateCreateAd, validateId, validateSearchParams, validateImages } = require('../middleware/validators');

// Configurar multer para manejar archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/webp').split(',');
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  }
});

// Rutas públicas CON VALIDACIÓN
router.get('/', validateSearchParams, adsController.getAllAds);
router.get('/:id', validateId, adsController.getAdById);

// Rutas protegidas CON VALIDACIÓN
router.post('/', authenticateToken, upload.array('images', 5), validateImages, validateCreateAd, adsController.createAd);
router.get('/user/my-ads', authenticateToken, adsController.getUserAds);
router.delete('/:id', authenticateToken, validateId, adsController.deleteAd);

module.exports = router;
