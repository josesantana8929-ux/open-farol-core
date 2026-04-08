// ============================================================
// WIDGET DE AYUDA FLOTANTE - El Farol Clasificados
// Agregar este script al final del <body> de index.html
// ============================================================

(function() {
    // Crear estilos del widget
    const styles = `
        .help-fab {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 56px;
            height: 56px;
            background: #0A1F44;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000;
            transition: all 0.3s;
            border: none;
        }
        .help-fab:hover {
            transform: scale(1.05);
            background: #FFD600;
            color: #0A1F44;
        }
        .help-fab i { font-size: 1.5rem; }
        
        .help-menu {
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 280px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 1001;
            display: none;
            overflow: hidden;
            animation: slideUp 0.3s ease;
        }
        .help-menu.show { display: block; }
        
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .help-menu-header {
            background: #0A1F44;
            color: white;
            padding: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: bold;
        }
        .help-menu-header span:last-child {
            cursor: pointer;
            font-size: 1.2rem;
        }
        
        .help-item {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 15px;
            border-bottom: 1px solid #eee;
            text-decoration: none;
            color: #333;
            transition: background 0.2s;
        }
        .help-item:hover {
            background: #f5f5f5;
        }
        .help-item i {
            width: 24px;
            font-size: 1.2rem;
            color: #0A1F44;
        }
        .help-item span {
            font-size: 0.9rem;
        }
    `;
    
    // Crear elementos del widget
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
    
    const fab = document.createElement('button');
    fab.className = 'help-fab';
    fab.innerHTML = '<i class="fas fa-headset"></i>';
    fab.onclick = toggleHelpMenu;
    document.body.appendChild(fab);
    
    const menu = document.createElement('div');
    menu.className = 'help-menu';
    menu.id = 'helpMenu';
    menu.innerHTML = `
        <div class="help-menu-header">
            <span><i class="fas fa-life-ring"></i> Centro de Ayuda</span>
            <span onclick="closeHelpMenu()">✕</span>
        </div>
        <a href="/help-faq.html" class="help-item">
            <i class="fas fa-question-circle"></i>
            <span>Preguntas frecuentes</span>
        </a>
        <a href="/admin-support.html" class="help-item">
            <i class="fas fa-ticket-alt"></i>
            <span>Reportar problema</span>
        </a>
        <a href="https://wa.me/18091234567?text=Hola%2C%20necesito%20ayuda%20en%20El%20Farol" class="help-item" target="_blank">
            <i class="fab fa-whatsapp"></i>
            <span>WhatsApp</span>
        </a>
        <a href="/help-faq.html#seguridad" class="help-item">
            <i class="fas fa-shield-alt"></i>
            <span>Consejos de seguridad</span>
        </a>
    `;
    document.body.appendChild(menu);
    
    window.openHelpMenu = function() {
        document.getElementById('helpMenu').classList.add('show');
    };
    
    window.closeHelpMenu = function() {
        document.getElementById('helpMenu').classList.remove('show');
    };
    
    function toggleHelpMenu() {
        const menuEl = document.getElementById('helpMenu');
        if (menuEl.classList.contains('show')) {
            menuEl.classList.remove('show');
        } else {
            menuEl.classList.add('show');
        }
    }
    
    // Cerrar menú al hacer clic fuera
    document.addEventListener('click', function(event) {
        const menuEl = document.getElementById('helpMenu');
        const fabEl = document.querySelector('.help-fab');
        if (menuEl && menuEl.classList.contains('show') && !menuEl.contains(event.target) && !fabEl.contains(event.target)) {
            menuEl.classList.remove('show');
        }
    });
})();
