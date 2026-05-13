import { serviceRoleSupabase } from '../config/supabase.js'
import * as wompiService from '../services/wompiService.js'
import { encrypt, decrypt } from '../services/encryptionService.js'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

export const initSignup = async (req, res) => {
  const { business_name, owner_name, email, password, phone } = req.body

  if (!business_name || !owner_name || !email || !password || !phone) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' })
  }

  try {
    const existingUser = await serviceRoleSupabase.auth.admin.getUserByEmail(email)
    if (existingUser.data?.user) {
      return res.status(409).json({ error: 'El email ya está registrado' })
    }
  } catch {
    // continue
  }

  try {
    const acceptanceTokens = await wompiService.getAcceptanceToken()

    const encryptedPassword = encrypt(password)
    const billingFrequency = 'monthly'

    const { data: planData } = await serviceRoleSupabase
      .from('subscription_plans')
      .select('*')
      .eq('status', 'active')
      .limit(1)
      .single()

    const plan = planData

    const { data: pendingSignup, error } = await serviceRoleSupabase
      .from('pending_signups')
      .insert({
        business_name,
        owner_name,
        email,
        phone,
        encrypted_password: encryptedPassword,
        billing_frequency: billingFrequency,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return res.json({
      signup_token: pendingSignup.signup_token,
      acceptance_token: acceptanceTokens.acceptance_token,
      personal_data_auth: acceptanceTokens.personal_data_auth,
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthly_price: plan.monthly_price,
        annual_price: plan.annual_price,
        features: plan.features,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

export const createCheckout = async (req, res) => {
  const { signup_token, billing_frequency, payment_method } = req.body

  if (!signup_token || !billing_frequency || !payment_method) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' })
  }

  if (!['monthly', 'annual'].includes(billing_frequency)) {
    return res.status(400).json({ error: 'Frecuencia inválida' })
  }

  if (!['card', 'pse', 'transfer'].includes(payment_method)) {
    return res.status(400).json({ error: 'Método de pago inválido' })
  }

  try {
    const { data: pendingSignup, error: fetchError } = await serviceRoleSupabase
      .from('pending_signups')
      .select('*')
      .eq('signup_token', signup_token)
      .eq('status', 'pending')
      .single()

    if (fetchError || !pendingSignup) {
      return res.status(404).json({ error: 'Token inválido o expirado' })
    }

    const { data: planData } = await serviceRoleSupabase
      .from('subscription_plans')
      .select('*')
      .eq('status', 'active')
      .limit(1)
      .single()

    const amount = billing_frequency === 'annual' ? planData.annual_price : planData.monthly_price
    const amountInCents = Math.round(amount * 100)

    const reference = wompiService.generateReference()

    const redirectUrl = `${FRONTEND_URL}/signup/pending?token=${signup_token}`

    let checkoutUrl = null
    if (payment_method !== 'transfer') {
      checkoutUrl = wompiService.generateCheckoutUrl({
        reference,
        amountInCents,
        currency: 'COP',
        customerEmail: pendingSignup.email,
        redirectUrl,
      })
    }

    await serviceRoleSupabase
      .from('pending_signups')
      .update({
        payment_method,
        billing_frequency,
      })
      .eq('signup_token', signup_token)

    const { error: txError } = await serviceRoleSupabase
      .from('payment_transactions')
      .insert({
        reference,
        pending_signup_id: pendingSignup.id,
        amount,
        payment_method,
        status: 'pending',
        billing_frequency,
      })

    if (txError) throw new Error(txError.message)

    const response = {
      reference,
      amount,
      checkout_url: checkoutUrl,
      payment_method,
    }

    if (payment_method === 'transfer') {
      response.bank_info = {
        bank: 'Bancolombia',
        account_type: 'Ahorros',
        account_number: '000-000000-00',
        holder: 'DynoPOS SAS',
        nit: '123.456.789-0',
        notes: `Referencia: ${reference}. Enviar comprobante de pago para activación.`,
      }
    }

    return res.json(response)
  } catch (error) {
    console.error('createCheckout error:', error)
    return res.status(500).json({ error: error.message })
  }
}

export const webhook = async (req, res) => {
  try {
    const signature = req.headers['x-signature']
    if (signature && !wompiService.verifyWebhookSignature(req.body, signature)) {
      return res.status(401).json({ error: 'Firma inválida' })
    }

    const event = req.body
    if (event.event !== 'transaction.updated') {
      return res.status(200).json({ message: 'Event ignored' })
    }

    const transaction = event.data?.transaction
    if (!transaction) {
      return res.status(400).json({ error: 'Datos de transacción inválidos' })
    }

    const { data: pendingTx, error: txError } = await serviceRoleSupabase
      .from('payment_transactions')
      .select('*, pending_signups!inner(*)')
      .eq('reference', transaction.reference)
      .single()

    if (txError || !pendingTx) {
      return res.status(404).json({ error: 'Transacción no encontrada' })
    }

    const newStatus = transaction.status === 'APPROVED' ? 'approved' : 'declined'

    await serviceRoleSupabase
      .from('payment_transactions')
      .update({
        status: newStatus,
        wompi_transaction_id: transaction.id,
        wompi_response: JSON.stringify(transaction),
        updated_at: new Date(),
      })
      .eq('reference', transaction.reference)

    if (transaction.status === 'APPROVED') {
      await activateUser(pendingTx.pending_signups, transaction.id)
    }

    return res.status(200).json({ message: 'Webhook processed' })
  } catch (error) {
    console.error('Webhook error:', error)
    return res.status(500).json({ error: error.message })
  }
}

export const checkPaymentStatus = async (req, res) => {
  const { token } = req.params

  try {
    const { data: pendingSignup, error } = await serviceRoleSupabase
      .from('pending_signups')
      .select('*, payment_transactions(*)')
      .eq('signup_token', token)
      .single()

    if (error || !pendingSignup) {
      return res.status(404).json({ error: 'Token inválido' })
    }

    const transactions = pendingSignup.payment_transactions || []
    const latestTx = transactions[transactions.length - 1]

    return res.json({
      status: pendingSignup.status,
      transaction_status: latestTx?.status || null,
      payment_method: pendingSignup.payment_method,
      billing_frequency: pendingSignup.billing_frequency,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

export const confirmTransfer = async (req, res) => {
  const { signup_token } = req.body

  if (!signup_token) {
    return res.status(400).json({ error: 'Token requerido' })
  }

  try {
    const { data: pendingSignup, error: fetchError } = await serviceRoleSupabase
      .from('pending_signups')
      .select('*')
      .eq('signup_token', signup_token)
      .eq('status', 'pending')
      .eq('payment_method', 'transfer')
      .single()

    if (fetchError || !pendingSignup) {
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' })
    }

    await activateUser(pendingSignup)

    return res.json({ message: 'Cuenta activada exitosamente' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

export const getAcceptanceTokens = async (req, res) => {
  const { token } = req.params

  try {
    const { data: pendingSignup, error } = await serviceRoleSupabase
      .from('pending_signups')
      .select('*')
      .eq('signup_token', token)
      .eq('status', 'pending')
      .single()

    if (error || !pendingSignup) {
      return res.status(404).json({ error: 'Token inválido' })
    }

    const tokens = await wompiService.getAcceptanceToken()

    return res.json({
      acceptance_token: tokens.acceptance_token,
      personal_data_auth: tokens.personal_data_auth,
      email: pendingSignup.email,
      phone: pendingSignup.phone,
      owner_name: pendingSignup.owner_name,
      business_name: pendingSignup.business_name,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

export const processCardPayment = async (req, res) => {
  const {
    signup_token,
    card_token,
    card_last4,
    acceptance_token,
    personal_data_auth,
    customer_email,
    customer_data,
    billing_frequency,
  } = req.body

  if (!signup_token || !card_token || !acceptance_token || !customer_email) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' })
  }

  try {
    const { data: pendingSignup, error: fetchError } = await serviceRoleSupabase
      .from('pending_signups')
      .select('*')
      .eq('signup_token', signup_token)
      .eq('status', 'pending')
      .single()

    if (fetchError || !pendingSignup) {
      return res.status(404).json({ error: 'Token inválido o expirado' })
    }

    const { data: planData } = await serviceRoleSupabase
      .from('subscription_plans')
      .select('*')
      .eq('status', 'active')
      .limit(1)
      .single()

    const amount = billing_frequency === 'annual' ? planData.annual_price : planData.monthly_price
    const amountInCents = Math.round(amount * 100)

    const reference = wompiService.generateReference()

    const wompiBody = {
      amount_in_cents: amountInCents,
      currency: 'COP',
      customer_email,
      payment_method: {
        type: 'CARD',
        token: card_token,
        installments: 1,
      },
      payment_method_type: 'CARD',
      reference,
      acceptance_token,
      accept_personal_auth: personal_data_auth,
      ip: req.ip || req.connection?.remoteAddress || '0.0.0.0',
    }

    const transaction = await wompiService.createTransaction(wompiBody)

    await serviceRoleSupabase
      .from('pending_signups')
      .update({
        payment_method: 'card',
        billing_frequency,
      })
      .eq('signup_token', signup_token)

    await serviceRoleSupabase
      .from('payment_transactions')
      .insert({
        reference,
        pending_signup_id: pendingSignup.id,
        amount,
        payment_method: 'card',
        status: 'approved',
        wompi_transaction_id: transaction.id,
        wompi_response: JSON.stringify(transaction),
        billing_frequency,
      })

    await activateUser(pendingSignup, transaction.id)

    return res.json({
      success: true,
      transaction_id: transaction.id,
      status: transaction.status,
      reference,
      amount,
      billing_frequency: pendingSignup.billing_frequency,
      card_last4: card_last4 || null,
      business_name: pendingSignup.business_name,
      email: pendingSignup.email,
      owner_name: pendingSignup.owner_name,
    })
  } catch (error) {
    console.error('processCardPayment error:', error)
    return res.status(500).json({ error: error.message })
  }
}

async function activateUser(pendingSignup, wompiTransactionId = null) {
  if (pendingSignup.status === 'completed') return

  const password = decrypt(pendingSignup.encrypted_password)

  const { data: authData, error: authError } = await serviceRoleSupabase.auth.admin.createUser({
    email: pendingSignup.email,
    password,
    email_confirm: false,
  })

  if (authError) throw new Error(`Error creating auth user: ${authError.message}`)

  const { data: linkData, error: linkError } = await serviceRoleSupabase.auth.admin.generateLink({
    type: 'signup',
    email: pendingSignup.email,
    options: {
      redirectTo: `${FRONTEND_URL}/emailConfirmation/success`,
    },
  })
  if (linkError) throw new Error(`Error generating confirmation link: ${linkError.message}`)

  const confirmLink = linkData?.properties?.action_link
  const RESEND_API_KEY = process.env.RESEND_API_KEY

  if (RESEND_API_KEY && confirmLink) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'DynoPOS <onboarding@resend.dev>',
          to: pendingSignup.email,
          subject: 'Confirma tu cuenta DynoPOS',
          html: `
            <h2>¡Bienvenido a DynoPOS!</h2>
            <p>Tu pago fue exitoso y tu cuenta ha sido creada.</p>
            <p>Haz clic en el siguiente enlace para confirmar tu correo electrónico:</p>
            <p><a href="${confirmLink}" style="display:inline-block;padding:12px 24px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px;">Confirmar mi cuenta</a></p>
            <p>O copia este enlace en tu navegador:</p>
            <p>${confirmLink}</p>
            <p>Tu correo: ${pendingSignup.email}</p>
            <br>
            <p>Equipo DynoPOS</p>
          `,
        }),
      })
    } catch (emailError) {
      console.error('Error sending confirmation email via Resend:', emailError)
    }
  }

  const userId = authData.user.id

  const { error: profileError } = await serviceRoleSupabase.from('profiles').insert({
    user_id: userId,
    display_name: pendingSignup.owner_name,
    role: 'admin',
  })
  if (profileError) throw new Error(`Error creating profile: ${profileError.message}`)

  const { error: businessError } = await serviceRoleSupabase.from('businesses').insert({
    user_id: userId,
    business_name: pendingSignup.business_name,
    owner_name: pendingSignup.owner_name,
    email: pendingSignup.email,
    phone: pendingSignup.phone,
  })
  if (businessError) throw new Error(`Error creating business: ${businessError.message}`)

  const { error: categoryError } = await serviceRoleSupabase.from('categories').insert({
    business_id: userId,
    name: 'General',
  })
  if (categoryError) throw new Error(`Error creating category: ${categoryError.message}`)

  const now = new Date()
  const periodEnd = new Date(now)
  if (pendingSignup.billing_frequency === 'annual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  }

  const { data: planData } = await serviceRoleSupabase
    .from('subscription_plans')
    .select('id')
    .eq('status', 'active')
    .limit(1)
    .single()

  const { error: subError } = await serviceRoleSupabase.from('subscriptions').insert({
    business_id: userId,
    plan_id: planData?.id,
    status: 'active',
    billing_frequency: pendingSignup.billing_frequency,
    current_period_start: now.toISOString().split('T')[0],
    current_period_end: periodEnd.toISOString().split('T')[0],
    wompi_transaction_id: wompiTransactionId,
  })
  if (subError) throw new Error(`Error creating subscription: ${subError.message}`)

  await serviceRoleSupabase
    .from('pending_signups')
    .update({ status: 'completed' })
    .eq('id', pendingSignup.id)

  await serviceRoleSupabase
    .from('payment_transactions')
    .update({ business_id: userId, status: 'approved', updated_at: new Date() })
    .eq('pending_signup_id', pendingSignup.id)
}
