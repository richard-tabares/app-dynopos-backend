import crypto from 'crypto'

const WOMPI_API_URL = process.env.WOMPI_API_URL || 'https://sandbox.wompi.co/v1'
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET

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
  const params = new URLSearchParams({
    'public-key': WOMPI_PUBLIC_KEY,
    reference,
    'amount-in-cents': String(amountInCents),
    currency,
    'customer-email': customerEmail,
  })

  if (!redirectUrl.includes('localhost')) {
    params.set('redirect-url', redirectUrl)
  }

  return `https://checkout.wompi.co/p/${WOMPI_PUBLIC_KEY}?${params.toString()}`
}

export const getTransaction = async (transactionId) => {
  const data = await wompiFetch(`/transactions/${transactionId}`)
  return data.data
}

export const verifyWebhookSignature = (body, signature) => {
  if (!WOMPI_INTEGRITY_SECRET) return true
  const expected = crypto
    .createHash('sha256')
    .update(JSON.stringify(body) + WOMPI_INTEGRITY_SECRET)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export const generateReference = () => {
  return `DYNOPOS-${crypto.randomUUID()}`
}
