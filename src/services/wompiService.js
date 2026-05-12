import crypto from 'crypto'

const WOMPI_API_URL = process.env.WOMPI_API_URL || 'https://sandbox.wompi.co/v1'
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY

const wompiFetch = async (path, options = {}) => {
  const url = `${WOMPI_API_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
      ...options.headers,
    },
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('Wompi full error response:', JSON.stringify(data, null, 2))
    throw new Error(data.error?.message || JSON.stringify(data.error) || `Wompi error: ${res.status}`)
  }
  return data
}

export const getAcceptanceToken = async () => {
  const data = await wompiFetch(`/merchants/${WOMPI_PUBLIC_KEY}`)
  return {
    acceptance_token: data.data?.presigned_acceptance?.acceptance_token,
    personal_data_auth: data.data?.presigned_personal_data_auth?.acceptance_token,
  }
}

export const generateCheckoutUrl = ({ reference, amountInCents, currency = 'COP', customerEmail, redirectUrl }) => {
  let query = `currency=${currency}`
  query += `&public-key=${WOMPI_PUBLIC_KEY}`
  query += `&amount-in-cents=${amountInCents}`
  query += `&reference=${reference}`
  query += `&customer-email=${encodeURIComponent(customerEmail)}`

  if (!redirectUrl.includes('localhost')) {
    query += `&redirect-url=${encodeURIComponent(redirectUrl)}`
  }

  return `https://checkout.wompi.co/p/${WOMPI_PUBLIC_KEY}?${query}`
}

export const generateSignature = (reference, amountInCents, currency = 'COP') => {
  const INTEGRITY = process.env.WOMPI_INTEGRITY_SECRET
  if (!INTEGRITY) return null
  return crypto
    .createHash('sha256')
    .update(`${reference}${amountInCents}${currency}${INTEGRITY}`)
    .digest('hex')
}

export const createTransaction = async (body) => {
  const sig = generateSignature(body.reference, body.amount_in_cents, body.currency)
  if (sig) body.signature = sig

  const data = await wompiFetch('/transactions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return data.data
}

export const getTransaction = async (transactionId) => {
  const data = await wompiFetch(`/transactions/${transactionId}`)
  return data.data
}

export const verifyWebhookSignature = (body, signature) => {
  const INTEGRITY = process.env.WOMPI_INTEGRITY_SECRET
  if (!INTEGRITY) return true
  const expected = crypto
    .createHash('sha256')
    .update(JSON.stringify(body) + INTEGRITY)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export const generateReference = () => {
  return `DYNOPOS-${crypto.randomUUID()}`
}
