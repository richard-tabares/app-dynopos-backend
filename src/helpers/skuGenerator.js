const PAD_DIGITS = 6
const PREFIX_LENGTH = 3
const PAD_CHAR = 'X'
const MAX_RETRIES = 5

export function extractPrefix(name) {
    if (!name || typeof name !== 'string') return PAD_CHAR.repeat(PREFIX_LENGTH)

    const cleaned = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .toUpperCase()

    const letters = cleaned.replace(/[^A-Z]/g, '')
    return letters.slice(0, PREFIX_LENGTH).padEnd(PREFIX_LENGTH, PAD_CHAR)
}

async function getMaxSequence(client, businessId, prefix) {
    const { data, error } = await client
        .from('product_variations')
        .select('sku')
        .eq('business_id', businessId)
        .ilike('sku', `${prefix}-%`)
        .order('sku', { ascending: false })
        .limit(1)

    if (error) throw error
    if (!data || data.length === 0) return 0
    const seq = parseInt(data[0].sku.split('-')[1], 10)
    return isNaN(seq) ? 0 : seq
}

function formatSku(prefix, n) {
    return `${prefix}-${String(n).padStart(PAD_DIGITS, '0')}`
}

export async function generateSku(client, businessId, productName, retryCount = 0) {
    const prefix = extractPrefix(productName)
    const max = await getMaxSequence(client, businessId, prefix)
    const sku = formatSku(prefix, max + 1 + retryCount)
    return sku
}

export async function generateBatchSkus(client, businessId, productName, count) {
    if (count <= 0) return []
    const prefix = extractPrefix(productName)
    const existing = await getMaxSequence(client, businessId, prefix)
    const skus = []
    for (let i = 0; i < count; i++) {
        skus.push(formatSku(prefix, existing + 1 + i))
    }
    return skus
}

export function generateSkuPreview(productName) {
    const prefix = extractPrefix(productName)
    return formatSku(prefix, 1)
}
