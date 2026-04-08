// public/js/main.js
// Conexión completa entre el frontend y el backend

// Configuración
const API_URL = window.location.origin; // Usa la misma URL del sitio
// En producción, Railway maneja esto automáticamente

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 El Farol Clasificados - Inicializado');
    console.log(`📡 API URL: ${API_URL}`);
    
    // Inicializar el formulario de registro
    initRegisterForm();
    
    // Inicializar el contador (si existe)
    if (typeof startCountdown === 'function') {
        startCountdown();
    }
});

// Inicializar formulario de registro
function initRegisterForm() {
    const registerBtn = document.getElementById('registerBtn');
    const modal = document.getElementById('registerModal');
    const closeBtn = document.querySelector('.close-modal');
    const cancelBtn = document.getElementById('cancelRegister');
    const registerForm = document.getElementById('registerForm');
    
    // Abrir modal al hacer clic en el botón
    if (registerBtn) {
        registerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(modal);
        });
    }
    
    // Cerrar modal con la X
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeModal(modal);
        });
    }
    
    // Cerrar modal con el botón cancelar
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closeModal(modal);
        });
    }
    
    // Cerrar modal al hacer clic fuera
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modal);
        }
    });
    
    // Manejar el envío del formulario
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleRegistration(registerForm, modal);
        });
    }
}

// Abrir modal
function openModal(modal) {
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

// Cerrar modal
function closeModal(modal) {
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Manejar el registro
async function handleRegistration(form, modal) {
    // Obtener valores del formulario
    const name = document.getElementById('regName')?.value.trim() || '';
    const email = document.getElementById('regEmail')?.value.trim() || '';
    const password = document.getElementById('regPassword')?.value || '';
    const phone = document.getElementById('regPhone')?.value.trim() || '';
    
    // Validaciones
    if (!email) {
        showNotification('❌ Por favor ingresa tu email', 'error');
        return;
    }
    
    if (!password) {
        showNotification('❌ Por favor ingresa una contraseña', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('❌ La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    
    if (!validateEmail(email)) {
        showNotification('❌ Por favor ingresa un email válido', 'error');
        return;
    }
    
    // Deshabilitar botón durante el envío
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = '⏳ Registrando...';
    submitBtn.disabled = true;
    
    try {
        // Preparar datos
        const userData = {
            name: name || email.split('@')[0],
            email: email,
            password: password,
            phone: phone || null
        };
        
        console.log('📝 Enviando registro:', { email: userData.email, name: userData.name });
        
        // Enviar a la API
        const response = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Registro exitoso
            console.log('✅ Registro exitoso:', data);
            
            // Guardar token si existe
            if (data.token) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                console.log('🔐 Token guardado');
            }
            
            // Mostrar mensaje de éxito
            showNotification('🎉 ¡Registro exitoso! Bienvenido a El Farol Clasificados', 'success');
            
            // Limpiar formulario
            form.reset();
            
            // Cerrar modal
            closeModal(modal);
            
            // Redirigir o mostrar dashboard después de 2 segundos
            setTimeout(() => {
                showDashboard(data.user);
            }, 2000);
            
        } else {
            // Error en el registro
            console.error('❌ Error en registro:', data);
            const errorMsg = data.error || data.message || 'Error al registrarse';
            showNotification(`❌ ${errorMsg}`, 'error');
        }
        
    } catch (error) {
        console.error('❌ Error de red:', error);
        showNotification('❌ Error de conexión. Por favor intenta más tarde.', 'error');
    } finally {
        // Re-habilitar botón
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Validar email
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Mostrar notificación
function showNotification(message, type = 'info') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span class="notification-message">${message}</span>
        </div>
    `;
    
    // Estilos de la notificación
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        max-width: 350px;
        width: 100%;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
        .notification-content {
            background: white;
            border-radius: 12px;
            padding: 15px 20px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .notification-success .notification-content {
            border-left: 4px solid #10b981;
            color: #065f46;
        }
        .notification-error .notification-content {
            border-left: 4px solid #ef4444;
            color: #991b1b;
        }
        .notification-icon {
            font-size: 1.5rem;
        }
        .notification-message {
            font-size: 0.95rem;
            font-weight: 500;
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Auto-cerrar después de 4 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// Mostrar dashboard después del registro
function showDashboard(user) {
    // Verificar si ya existe un dashboard
    let dashboard = document.getElementById('userDashboard');
    
    if (!dashboard) {
        // Crear dashboard
        dashboard = document.createElement('div');
        dashboard.id = 'userDashboard';
        dashboard.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            z-index: 1000;
            overflow-y: auto;
            animation: fadeIn 0.5s ease-out;
        `;
        
        dashboard.innerHTML = `
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .dashboard-container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 40px 20px;
                    color: white;
                }
                .dashboard-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 40px;
                    flex-wrap: wrap;
                    gap: 20px;
                }
                .dashboard-title {
                    font-size: 2rem;
                }
                .dashboard-welcome {
                    background: rgba(255,255,255,0.1);
                    padding: 30px;
                    border-radius: 20px;
                    margin-bottom: 30px;
                    backdrop-filter: blur(10px);
                }
                .dashboard-stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin-top: 30px;
                }
                .stat-card {
                    background: rgba(255,255,255,0.1);
                    padding: 20px;
                    border-radius: 15px;
                    text-align: center;
                    backdrop-filter: blur(10px);
                }
                .close-dashboard {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 1rem;
                    transition: all 0.3s;
                }
                .close-dashboard:hover {
                    background: rgba(255,255,255,0.3);
                }
                .btn-crear-anuncio {
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 1rem;
                    font-weight: bold;
                    margin-top: 20px;
                }
            </style>
            <div class="dashboard-container">
                <div class="dashboard-header">
                    <h1 class="dashboard-title">🎉 ¡Bienvenido a El Farol!</h1>
                    <button class="close-dashboard" onclick="closeDashboard()">Cerrar</button>
                </div>
                <div class="dashboard-welcome">
                    <h2>Hola, ${user.name || user.email} 👋</h2>
                    <p>Tu cuenta ha sido creada exitosamente. Ahora puedes comenzar a usar El Farol Clasificados.</p>
                    <button class="btn-crear-anuncio" onclick="window.location.href='/app'">
                        📝 Crear mi primer anuncio
                    </button>
                </div>
                <div class="dashboard-stats">
                    <div class="stat-card">
                        <div style="font-size: 2rem;">📊</div>
                        <h3>Estado</h3>
                        <p>Cuenta verificada</p>
                    </div>
                    <div class="stat-card">
                        <div style="font-size: 2rem;">⭐</div>
                        <h3>Próximamente</h3>
                        <p>Más funciones disponibles pronto</p>
                    </div>
                    <div class="stat-card">
                        <div style="font-size: 2rem;">💬</div>
                        <h3>Soporte</h3>
                        <p>Disponible 24/7</p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(dashboard);
    }
    
    // Scroll al dashboard
    dashboard.scrollIntoView({ behavior: 'smooth' });
}

// Función global para cerrar dashboard
window.closeDashboard = function() {
    const dashboard = document.getElementById('userDashboard');
    if (dashboard) {
        dashboard.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            if (dashboard.parentNode) {
                dashboard.parentNode.removeChild(dashboard);
            }
        }, 300);
    }
};

// Verificar si el usuario ya está logueado
async function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            const response = await fetch(`${API_URL}/api/auth/profile`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Usuario autenticado:', data.user);
                // Mostrar botón de perfil en lugar de registrarse
                const registerBtn = document.getElementById('registerBtn');
                if (registerBtn) {
                    registerBtn.textContent = '👤 Mi Perfil';
                    registerBtn.onclick = () => showDashboard(data.user);
                }
            }
        } catch (error) {
            console.error('Error verificando autenticación:', error);
        }
    }
}

// Exportar funciones para uso global
window.openRegisterModal = function() {
    const modal = document.getElementById('registerModal');
    if (modal) openModal(modal);
};

window.closeRegisterModal = function() {
    const modal = document.getElementById('registerModal');
    if (modal) closeModal(modal);
};

// Inicializar verificación de autenticación
checkAuthStatus();
