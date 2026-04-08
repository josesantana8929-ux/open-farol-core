// utils/priceUtils.js - Sistema de precios global

// Configuración de monedas
const CURRENCIES = {
    DOP: {
        symbol: 'RD$',
        code: 'DOP',
        name: 'Pesos Dominicanos',
        locale: 'es-DO',
        minValue: 0,
        maxValue: 999999999,
        decimalPlaces: 2,
        thousandSeparator: ',',
        decimalSeparator: '.'
    },
    USD: {
        symbol: 'US$',
        code: 'USD',
        name: 'Dólares Americanos',
        locale: 'en-US',
        minValue: 0,
        maxValue: 999999999,
        decimalPlaces: 2,
        thousandSeparator: ',',
        decimalSeparator: '.'
    }
};

// Normalizar número (limpiar formato)
function normalizePrice(value) {
    if (value === null || value === undefined || value === '') return null;
    
    // Si es string, limpiar caracteres no numéricos
    if (typeof value === 'string') {
        value = value.replace(/[^0-9.-]/g, '');
    }
    
    const num = parseFloat(value);
    if (isNaN(num)) return null;
    if (num < 0) return 0;
    
    // Redondear a 2 decimales
    return Math.round(num * 100) / 100;
}

// Formatear precio para mostrar
function formatPrice(price, currencyType = 'DOP', negotiable = false) {
    if (price === null || price === undefined) {
        return negotiable ? 'Precio a convenir' : 'Precio no especificado';
    }
    
    const currency = CURRENCIES[currencyType] || CURRENCIES.DOP;
    const formatter = new Intl.NumberFormat(currency.locale, {
        style: 'currency',
        currency: currency.code,
        minimumFractionDigits: currency.decimalPlaces,
        maximumFractionDigits: currency.decimalPlaces
    });
    
    let formattedPrice = formatter.format(price);
    
    // Reemplazar símbolo por el personalizado si es necesario
    if (currencyType === 'DOP') {
        formattedPrice = formattedPrice.replace('DOP', 'RD$');
    }
    
    if (negotiable) {
        formattedPrice += ' (Negociable)';
    }
    
    return formattedPrice;
}

// Formatear solo el número (sin moneda)
function formatNumber(price, currencyType = 'DOP') {
    if (price === null || price === undefined) return '';
    
    const currency = CURRENCIES[currencyType] || CURRENCIES.DOP;
    return new Intl.NumberFormat(currency.locale, {
        minimumFractionDigits: currency.decimalPlaces,
        maximumFractionDigits: currency.decimalPlaces
    }).format(price);
}

// Validar precio
function validatePrice(price, currencyType = 'DOP') {
    const currency = CURRENCIES[currencyType] || CURRENCIES.DOP;
    const num = normalizePrice(price);
    
    if (num === null) {
        return { valid: false, error: 'Ingrese un precio válido' };
    }
    
    if (num < currency.minValue) {
        return { valid: false, error: `El precio mínimo es ${currency.symbol} ${currency.minValue}` };
    }
    
    if (num > currency.maxValue) {
        return { valid: false, error: `El precio máximo es ${currency.symbol} ${currency.maxValue.toLocaleString()}` };
    }
    
    return { valid: true, value: num };
}

// Convertir entre monedas (preparado para API de tasas)
const exchangeRates = {
    DOP: 1,
    USD: 58.5 // Tasa aproximada, se actualizará con API real
};

async function convertPrice(price, fromCurrency, toCurrency) {
    if (!price || price === 0) return 0;
    if (fromCurrency === toCurrency) return price;
    
    // En producción, llamar a API de tasas
    // const rate = await fetchExchangeRate(fromCurrency, toCurrency);
    const rate = exchangeRates[toCurrency] / exchangeRates[fromCurrency];
    
    return Math.round(price * rate * 100) / 100;
}

// Obtener rango de precios para filtros
function getPriceRange(minPrice, maxPrice, currencyType = 'DOP') {
    const min = normalizePrice(minPrice);
    const max = normalizePrice(maxPrice);
    
    return {
        min: min || null,
        max: max || null,
        currency: currencyType
    };
}

// Generar HTML para mostrar precio
function renderPriceHTML(price, currencyType = 'DOP', negotiable = false) {
    if (!price && price !== 0) {
        return '<span class="price-na">Precio no especificado</span>';
    }
    
    const formatted = formatPrice(price, currencyType, false);
    const negotiableText = negotiable ? '<span class="price-negotiable-badge">💰 Negociable</span>' : '';
    
    return `
        <div class="price-container">
            <span class="price-value">${formatted}</span>
            ${negotiableText}
        </div>
    `;
}

module.exports = {
    CURRENCIES,
    normalizePrice,
    formatPrice,
    formatNumber,
    validatePrice,
    convertPrice,
    getPriceRange,
    renderPriceHTML
};
