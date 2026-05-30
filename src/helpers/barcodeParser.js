/**
 * Procesa cualquier código de barras y extrae la identidad del producto.
 * @param {string} codigoCrudo - La cadena de texto directa del escáner.
 * @returns {string|null} - El código normalizado listo para guardar/buscar en DB.
 */
export const parseBarcode = (codigoCrudo) => {
    if (!codigoCrudo || typeof codigoCrudo !== 'string') return codigoCrudo

    const codigo = codigoCrudo.trim()

    // 1. DETECTAR CÓDIGOS SEGMENTADOS AVANZADOS (GS1-128 / DataBar)
    // Suelen empezar con el identificador de aplicación '01' (GTIN de 14 dígitos)
    if (codigo.startsWith('01') && codigo.length > 14) {
        const gtin14 = codigo.substring(2, 16)

        // Convertir GTIN-14 a formato estándar EAN-13 si tiene ceros a la izquierda
        return gtin14.startsWith('0') ? gtin14.substring(1) : gtin14
    }

    // 2. DETECTAR CÓDIGOS DE SUPERMERCADO ESTÁNDAR (EAN-13)
    if (codigo.length === 13) {
        return codigo
    }

    // 3. DETECTAR CÓDIGOS NORTEAMERICANOS / IMPORTADOS (UPC-A)
    if (codigo.length === 12) {
        return codigo
    }

    // 4. DETECTAR CÓDIGOS MINIATURA (EAN-8)
    if (codigo.length === 8) {
        return codigo
    }

    // 5. CASO COMODÍN: Códigos internos, QR, o alfanuméricos (Code 39 / Code 128)
    return codigo
}
