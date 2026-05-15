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
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return res.json({
      id: pendingSignup.id,
      encrypted_password: encryptedPassword,
      acceptance_token: acceptanceTokens.acceptance_token,
      personal_data_auth: acceptanceTokens.personal_data_auth,
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthly_price: plan.monthly_price,
        features: plan.features,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

export const createCheckout = async (req, res) => {
  const { pending_signup_id, billing_frequency, payment_method } = req.body

  if (!pending_signup_id || !billing_frequency || !payment_method) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' })
  }

  if (!['monthly', 'quarterly', 'annual'].includes(billing_frequency)) {
    return res.status(400).json({ error: 'Frecuencia inválida' })
  }

  if (!['card', 'pse'].includes(payment_method)) {
    return res.status(400).json({ error: 'Método de pago inválido' })
  }

  try {
    const { data: pendingSignup, error: fetchError } = await serviceRoleSupabase
      .from('pending_signups')
      .select('*')
      .eq('id', pending_signup_id)
      .eq('status', 'pending')
      .single()

    if (fetchError || !pendingSignup) {
      return res.status(404).json({ error: 'Registro no encontrado o expirado' })
    }

    const { data: planData } = await serviceRoleSupabase
      .from('subscription_plans')
      .select('monthly_price')
      .eq('status', 'active')
      .limit(1)
      .single()

    const amount = calculateAmount(planData.monthly_price, billing_frequency)
    const amountInCents = Math.round(amount * 100)

    const reference = wompiService.generateReference()

    const redirectUrl = `${FRONTEND_URL}/signup/pending?id=${pending_signup_id}`

    const checkoutUrl = wompiService.generateCheckoutUrl({
      reference,
      amountInCents,
      currency: 'COP',
      customerEmail: pendingSignup.email,
      redirectUrl,
    })

    await serviceRoleSupabase
      .from('pending_signups')
      .update({
        payment_method,
        billing_frequency,
      })
      .eq('id', pending_signup_id)

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
      pending_signup_id: pendingSignup.id,
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
      .select('*, pending_signups(*)')
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

    if (pendingTx.pending_signups) {
      if (transaction.status === 'APPROVED' && pendingTx.payment_method !== 'card') {
        await activateUser(pendingTx.pending_signups, transaction.id)
      }
    } else if (pendingTx.business_id) {
      const { data: sub } = await serviceRoleSupabase
        .from('subscriptions')
        .select('*')
        .eq('business_id', pendingTx.business_id)
        .eq('status', 'active')
        .single()

      if (sub) {
        if (transaction.status === 'APPROVED') {
          const newEnd = addPeriod(sub.current_period_end, sub.billing_frequency)
          await serviceRoleSupabase
            .from('subscriptions')
            .update({ current_period_end: newEnd, failed_attempts: 0, updated_at: new Date() })
            .eq('id', sub.id)
        } else if (transaction.status === 'DECLINED') {
          const newAttempts = (sub.failed_attempts || 0) + 1
          const updateData = { failed_attempts: newAttempts, updated_at: new Date() }
          if (newAttempts >= 5) updateData.status = 'expired'
          await serviceRoleSupabase
            .from('subscriptions')
            .update(updateData)
            .eq('id', sub.id)
        }
      }
    }

    return res.status(200).json({ message: 'Webhook processed' })
  } catch (error) {
    console.error('Webhook error:', error)
    return res.status(500).json({ error: error.message })
  }
}

export const checkPaymentStatus = async (req, res) => {
  const { id } = req.params

  try {
    const { data: pendingSignup, error } = await serviceRoleSupabase
      .from('pending_signups')
      .select('*, payment_transactions(*)')
      .eq('id', id)
      .single()

    if (error || !pendingSignup) {
      return res.status(404).json({ error: 'Registro no encontrado' })
    }

    const transactions = pendingSignup.payment_transactions || []
    const latestTx = transactions[transactions.length - 1]

    return res.json({
      status: pendingSignup.status,
      transaction_status: latestTx?.status || null,
      payment_method: latestTx?.payment_method || null,
      billing_frequency: latestTx?.billing_frequency || null,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

export const confirmTransfer = async (req, res) => {
  const { payment_transaction_id } = req.body

  if (!payment_transaction_id) {
    return res.status(400).json({ error: 'ID de transacción requerido' })
  }

  try {
    const { data: tx, error: txError } = await serviceRoleSupabase
      .from('payment_transactions')
      .select('*, pending_signups!inner(*)')
      .eq('id', payment_transaction_id)
      .eq('status', 'pending')
      .single()

    if (txError || !tx) {
      return res.status(404).json({ error: 'Transacción no encontrada o ya procesada' })
    }

    await activateUser(tx.pending_signups, tx.wompi_transaction_id, null)

    await serviceRoleSupabase
      .from('payment_transactions')
      .update({ status: 'approved', updated_at: new Date() })
      .eq('id', payment_transaction_id)

    return res.json({ message: 'Cuenta activada exitosamente' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

export const getAcceptanceTokens = async (req, res) => {
  const { id } = req.params

  try {
    const { data: pendingSignup, error } = await serviceRoleSupabase
      .from('pending_signups')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !pendingSignup) {
      return res.status(404).json({ error: 'Registro no encontrado' })
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
    pending_signup_id,
    card_token,
    card_last4,
    acceptance_token,
    personal_data_auth,
    customer_email,
    billing_frequency,
  } = req.body

  if (!pending_signup_id || !card_token || !acceptance_token || !customer_email) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' })
  }

  try {
    const { data: pendingSignup, error: fetchError } = await serviceRoleSupabase
      .from('pending_signups')
      .select('*')
      .eq('id', pending_signup_id)
      .eq('status', 'pending')
      .single()

    if (fetchError || !pendingSignup) {
      return res.status(404).json({ error: 'Registro no encontrado o expirado' })
    }

    const { data: planData } = await serviceRoleSupabase
      .from('subscription_plans')
      .select('monthly_price')
      .eq('status', 'active')
      .limit(1)
      .single()

    const amount = calculateAmount(planData.monthly_price, billing_frequency)
    const amountInCents = Math.round(amount * 100)

    const reference = wompiService.generateReference()

    await serviceRoleSupabase
      .from('payment_transactions')
      .insert({
        reference,
        pending_signup_id: pendingSignup.id,
        amount,
        payment_method: 'card',
        status: 'pending',
        billing_frequency,
      })

    const paymentSource = await wompiService.createPaymentSource({
      type: 'CARD',
      token: card_token,
      customer_email,
      acceptance_token,
    })
    const paymentSourceId = String(paymentSource.id)

    const wompiBody = {
      amount_in_cents: amountInCents,
      currency: 'COP',
      customer_email,
      recurrent: true,
      payment_source_id: paymentSource.id,
      payment_method: {
        type: 'CARD',
        token: paymentSourceId,
        installments: 1,
      },
      payment_method_type: 'CARD',
      reference,
      acceptance_token,
      accept_personal_auth: personal_data_auth,
      ip: req.ip || req.connection?.remoteAddress || '0.0.0.0',
    }

    const transaction = await wompiService.createTransaction(wompiBody)

    let txStatus = transaction.status
    let txId = transaction.id

    if (txStatus === 'PENDING') {
      const MAX_RETRIES = 10
      let retries = 0
      while (txStatus === 'PENDING' && retries < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 3000))
        const updated = await wompiService.getTransaction(txId)
        txStatus = updated.status
        txId = updated.id
        retries++
      }
    }

    const newStatus = txStatus === 'APPROVED' ? 'approved' : 'declined'

    await serviceRoleSupabase
      .from('payment_transactions')
      .update({
        status: newStatus,
        wompi_transaction_id: txId,
        wompi_response: JSON.stringify(transaction),
        updated_at: new Date(),
      })
      .eq('reference', reference)

    if (txStatus !== 'APPROVED') {
      const errorMsg = txStatus === 'PENDING'
        ? 'La transacción está pendiente. Vuelve a intentarlo más tarde.'
        : (transaction.status_message || 'La transacción fue rechazada')

      return res.status(400).json({ success: false, error: errorMsg })
    }

    await activateUser(pendingSignup, txId, paymentSourceId)

    return res.json({
      success: true,
      transaction_id: txId,
      status: txStatus,
      reference,
      amount,
      billing_frequency: billing_frequency || 'monthly',
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

const calculateAmount = (monthlyPrice, billingFrequency) => {
  if (billingFrequency === 'annual') return Math.round(monthlyPrice * 12 * 0.9)
  if (billingFrequency === 'quarterly') return monthlyPrice * 3
  return monthlyPrice
}

const addPeriod = (date, frequency) => {
  const d = new Date(date)
  if (frequency === 'annual') d.setFullYear(d.getFullYear() + 1)
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().split('T')[0]
}

async function activateUser(pendingSignup, wompiTransactionId = null, paymentSourceId = null) {
  const { data: existing } = await serviceRoleSupabase
    .from('businesses')
    .select('id')
    .eq('email', pendingSignup.email)
    .maybeSingle()
  if (existing) return

  const { data: txData } = await serviceRoleSupabase
    .from('payment_transactions')
    .select('billing_frequency')
    .eq('wompi_transaction_id', wompiTransactionId)
    .maybeSingle()

  const billingFrequency = txData?.billing_frequency || 'monthly'
  const password = decrypt(pendingSignup.encrypted_password)

  const { data: authData, error: authError } = await serviceRoleSupabase.auth.admin.createUser({
    email: pendingSignup.email,
    password,
    email_confirm: false,
  })

  if (authError) {
    const { data: biz } = await serviceRoleSupabase
      .from('businesses')
      .select('id')
      .eq('email', pendingSignup.email)
      .maybeSingle()
    if (biz) {
      await serviceRoleSupabase
        .from('pending_signups')
        .update({ status: 'completed' })
        .eq('id', pendingSignup.id)
      return
    }
    throw new Error(`Error creating auth user: ${authError.message}`)
  }

  const { data: linkData, error: linkError } = await serviceRoleSupabase.auth.admin.generateLink({
    type: 'signup',
    email: pendingSignup.email,
    options: {
      redirectTo: `${FRONTEND_URL}/emailConfirmation/success`,
    },
  })
  if (linkError) throw new Error(`Error generating confirmation link: ${linkError.message}`)

  const confirmLink = linkData?.properties?.action_link

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
  if (billingFrequency === 'annual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  } else if (billingFrequency === 'quarterly') {
    periodEnd.setMonth(periodEnd.getMonth() + 3)
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
    billing_frequency: billingFrequency,
    current_period_start: now.toISOString().split('T')[0],
    current_period_end: periodEnd.toISOString().split('T')[0],
    wompi_transaction_id: wompiTransactionId,
    wompi_payment_source_id: paymentSourceId,
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

  if (confirmLink) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'dynopos@soporte.bykor.co' 
    if (RESEND_API_KEY) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `DynoPOS <${RESEND_FROM_EMAIL}>`,
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
      }).catch(err => console.error('Error sending confirmation email via Resend:', err))
    }
  }
}
