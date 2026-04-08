-- ============================================
-- EL FAROL CLASIFICADOS - ESQUEMA DE BASE DE DATOS
-- ============================================

-- Eliminar tablas existentes (orden correcto por dependencias)
DROP TABLE IF EXISTS ad_images;
DROP TABLE IF EXISTS ads;
DROP TABLE IF EXISTS users;

-- ============================================
-- TABLA DE USUARIOS
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    phone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'user',
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- ============================================
-- TABLA DE ANUNCIOS
-- ============================================
CREATE TABLE ads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(10,2),
    category VARCHAR(50),
    condition VARCHAR(20),
    location TEXT,
    contact_phone VARCHAR(20),
    views INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- ============================================
-- TABLA DE IMÁGENES
-- ============================================
CREATE TABLE ad_images (
    id SERIAL PRIMARY KEY,
    ad_id INTEGER REFERENCES ads(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    public_id VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- ============================================
-- ÍNDICES PARA MEJOR RENDIMIENTO
-- ============================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_ads_user_id ON ads(user_id);
CREATE INDEX idx_ads_category ON ads(category);
CREATE INDEX idx_ads_status ON ads(status);
CREATE INDEX idx_ads_created_at ON ads(created_at);
CREATE INDEX idx_ad_images_ad_id ON ad_images(ad_id);

-- ============================================
-- FUNCIÓN PARA ACTUALIZAR updated_at AUTOMÁTICAMENTE
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ads_updated_at 
    BEFORE UPDATE ON ads 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INSERTAR USUARIO ADMINISTRADOR
-- Email: admin@elfarol.com.do
-- Contraseña: mxl_admin_2026
-- ============================================

-- Eliminar admin existente si existe
DELETE FROM users WHERE email = 'admin@elfarol.com.do';

-- Insertar nuevo administrador
-- Hash generado con bcrypt para: mxl_admin_2026
INSERT INTO users (email, password_hash, name, phone, role, created_at, updated_at)
VALUES (
    'admin@elfarol.com.do',
    '$2a$10$LgQx5x5x5x5x5x5x5x5x5u5x5x5x5x5x5x5x5x5x5x5x5x5x5x5x5x5x5x5x',
    'Administrador El Farol',
    '+1 (809) 555-0000',
    'admin',
    NOW(),
    NOW()
);

-- NOTA: El hash de arriba es un marcador de posición.
-- Ejecuta el script de abajo para generar el hash correcto.
-- O usa el siguiente comando en Node.js para generar el hash real:
-- node -e "console.log(require('bcryptjs').hashSync('mxl_admin_2026', 10))"
