-- ============================================
-- SMARTCLIENTERD IA - BASE DE DATOS COMPLETA
-- PostgreSQL 15+
-- ============================================

-- ============================================
-- 1. TABLA: PLANES (Niveles de suscripción)
-- ============================================
CREATE TABLE IF NOT EXISTS plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) DEFAULT 0,
    monthly_messages INT NOT NULL,
    max_clients INT NOT NULL,
    custom_prompts BOOLEAN DEFAULT FALSE,
    priority_support BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. TABLA: USUARIOS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255),
    phone VARCHAR(50),
    plan_id INT DEFAULT 1 REFERENCES plans(id),
    messages_used_this_month INT DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. TABLA: CLIENTES
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    tags TEXT[],
    last_contact TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. TABLA: MENSAJES GENERADOS
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id INT REFERENCES clients(id) ON DELETE SET NULL,
    message_type VARCHAR(50) NOT NULL,
    tone VARCHAR(50),
    length VARCHAR(20),
    country_style VARCHAR(50),
    custom_instructions TEXT,
    generated_text TEXT NOT NULL,
    prompt_used TEXT,
    was_sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. TABLA: CONFIGURACIÓN DE IA
-- ============================================
CREATE TABLE IF NOT EXISTS ai_settings (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    default_message_type VARCHAR(50),
    default_tone VARCHAR(50),
    default_length VARCHAR(20),
    default_country_style VARCHAR(50),
    temperature DECIMAL(3, 2) DEFAULT 0.7,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. TABLA: REGISTROS DE USO
-- ============================================
CREATE TABLE IF NOT EXISTS usage_logs (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    message_id INT REFERENCES messages(id) ON DELETE SET NULL,
    tokens_used INT,
    cost_estimate DECIMAL(10, 6),
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 7. TABLA: PAGOS
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'DOP',
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255) UNIQUE,
    status VARCHAR(20) DEFAULT 'pending',
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ÍNDICES (Optimización)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan_id);
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at);

-- ============================================
-- DATOS INICIALES (Planes)
-- ============================================
INSERT INTO plans (name, description, price, monthly_messages, max_clients, custom_prompts, priority_support)
VALUES 
    ('Free', 'Plan gratuito - Ideal para empezar', 0, 50, 50, FALSE, FALSE),
    ('Pro', 'Plan profesional - Para negocios activos', 499, 500, 500, TRUE, FALSE),
    ('Business', 'Plan empresarial - Sin límites', 999, 999999, 999999, TRUE, TRUE)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- FUNCIONES AUTOMÁTICAS
-- ============================================
-- Actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_settings_updated_at BEFORE UPDATE ON ai_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VISTAS ÚTILES
-- ============================================
-- Vista: Uso de mensajes por usuario
CREATE OR REPLACE VIEW user_monthly_usage AS
SELECT 
    u.id AS user_id,
    u.email,
    u.business_name,
    p.name AS plan_name,
    u.messages_used_this_month,
    p.monthly_messages AS monthly_limit,
    ROUND((u.messages_used_this_month::DECIMAL / p.monthly_messages) * 100, 2) AS usage_percentage
FROM users u
JOIN plans p ON u.plan_id = p.id;

-- Vista: Clientes por usuario
CREATE OR REPLACE VIEW user_clients_stats AS
SELECT 
    u.id AS user_id,
    u.email,
    COUNT(c.id) AS total_clients,
    COUNT(CASE WHEN c.last_contact > NOW() - INTERVAL '30 days' THEN 1 END) AS active_last_30_days
FROM users u
LEFT JOIN clients c ON u.id = c.user_id
GROUP BY u.id;

-- ============================================
-- PERMISOS (Seguridad básica)
-- ============================================
-- Revocar permisos públicos por defecto
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;

-- Usuario app (ajustar según necesidad)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
