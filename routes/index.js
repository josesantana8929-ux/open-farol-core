const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const adRoutes = require('./adRoutes');

// Rutas públicas de la API
router.use('/auth', authRoutes);
router.use('/ads', adRoutes);

// Ruta de prueba para verificar que el router funciona
router.get('/ping', (req, res) => {
  res.json({ 
    message: 'pong', 
    timestamp: new Date().toISOString(),
    siteName: process.env.SITE_NAME 
  });
});

// Ruta de documentación básica de la API
router.get('/docs', (req, res) => {
  res.json({
    version: '1.0.0',
    endpoints: {
      auth: {
        register: { method: 'POST', path: '/api/auth/register', body: ['name', 'email', 'phone', 'password'] },
        login: { method: 'POST', path: '/api/auth/login', body: ['email', 'password'] },
        profile: { method: 'GET', path: '/api/auth/profile', auth: true },
        updateProfile: { method: 'PUT', path: '/api/auth/profile', auth: true, body: ['name', 'phone'] }
      },
      ads: {
        list: { method: 'GET', path: '/api/ads', params: ['category?', 'location?', 'minPrice?', 'maxPrice?', 'page?'] },
        getById: { method: 'GET', path: '/api/ads/:id' },
        create: { method: 'POST', path: '/api/ads', auth: true, body: ['title', 'price', 'category'], files: ['images'] },
        myAds: { method: 'GET', path: '/api/ads/user/my-ads', auth: true },
        delete: { method: 'DELETE', path: '/api/ads/:id', auth: true }
      }
    }
  });
});

module.exports = router;
