const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../utils/jwtUtils');

// ============================================================
// LISTAR ANUNCIOS (con filtros)
// ============================================================
router.get('/', async (req, res) => {
    const { categoria, sector, search, verified_only, limit = 20, offset = 0 } = req.query;
    
    try {
        let query = `SELECT a.*, u.name as user_name, u.phone as user_phone, u.verified, u.plan_type
                     FROM ads a 
                     JOIN users u ON a.user_id = u.id 
                     WHERE a.deleted_at IS NULL AND a.status = 'active'`;
        const params = [];
        let paramIndex = 1;
        
        if (categoria) {
            query += ` AND a.category = $${paramIndex++}`;
            params.push(categoria);
        }
        if (sector) {
            query += ` AND a.ubicacion_sector = $${paramIndex++}`;
            params.push(sector);
        }
        if (search) {
            query
