export const parseBarcode = (raw) => {
    if (!raw || typeof raw !== 'string') return raw

    const trimmed = raw.trim()

    if (trimmed.length > 14) {
        return trimmed.substring(2, 16)
    }

    return trimmed
}
