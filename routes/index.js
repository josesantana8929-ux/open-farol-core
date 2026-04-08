const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const adRoutes = require('./adRoutes');

router.use('/auth', authRoutes);
router.use('/ads', adRoutes);

router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.get('/', (req, res) => {
  res.json({
    message: 'API de Clasificados Platform',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      ads: '/api/ads',
      health: '/api/health',
    },
  });
});

module.exports = router;
