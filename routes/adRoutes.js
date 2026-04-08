const express = require('express');
const router = express.Router();
const multer = require('multer');
const adController = require('../controllers/adController');
const { authMiddleware, adValidation, adIdValidation, adFiltersValidation } = require('../middleware/validators');

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024,
    files: parseInt(process.env.MAX_FILES_PER_AD) || 5,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  },
});

router.get('/', adFiltersValidation, adController.getAds);
router.get('/user/my-ads', authMiddleware, adController.getUserAds);
router.get('/:id', adIdValidation, adController.getAdById);
router.post('/', authMiddleware, upload.array('images', 5), adValidation, adController.createAd);
router.put('/:id', authMiddleware, adIdValidation, adValidation, adController.updateAd);
router.delete('/:id', authMiddleware, adIdValidation, adController.deleteAd);

module.exports = router;
