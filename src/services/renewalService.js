import { serviceRoleSupabase } from '../config/supabase.js'
import * as wompiService from './wompiService.js'
import { sendEmail, buildRenewalSuccessEmail, buildRenewalFailedEmail } from './emailService.js'

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

export const renewSubscription = async (subscription) => {
  const { data: business } = await serviceRoleSupabase
    .from('businesses')
    .select('business_name, email')
    .eq('user_id', subscription.business_id)
    .single()

  if (!business) return { status: 'skipped' }

  const { data: plan } = await serviceRoleSupabase
    .from('subscription_plans')
    .select('monthly_price')
    .eq('id', subscription.plan_id)
    .single()

  if (!plan) return { status: 'skipped' }

  const amount = calculateAmount(plan.monthly_price, subscription.billing_frequency)
  const amountInCents = Math.round(amount * 100)
  const reference = wompiService.generateReference()

  await serviceRoleSupabase
    .from('payment_transactions')
    .insert({
      reference,
      business_id: subscription.business_id,
      amount,
      payment_method: 'card',
      status: 'pending',
      billing_frequency: subscription.billing_frequency,
    })

  try {
    const transaction = await wompiService.createTransaction({
      amount_in_cents: amountInCents,
      currency: 'COP',
      customer_email: business.email,
      payment_source_id: Number(subscription.wompi_payment_source_id),
      payment_method: {
        type: 'CARD',
        token: subscription.wompi_payment_source_id,
        installments: 1,
      },
      payment_method_type: 'CARD',
      reference,
    })

    const { data: currentTx } = await serviceRoleSupabase
      .from('payment_transactions')
      .select('status')
      .eq('reference', reference)
      .single()

    // if (currentTx?.status !== 'pending') {
    //   return { status: currentTx.status === 'approved' ? 'renewed' : 'declined' }
    // }

    console.log(`[Renovación] Status Wompi recibido: ${transaction.status}`)

    if (transaction.status === 'APPROVED') {
      const newEnd = addPeriod(subscription.current_period_end, subscription.billing_frequency)

      await serviceRoleSupabase
        .from('subscriptions')
        .update({ current_period_end: newEnd, failed_attempts: 0, updated_at: new Date() })
        .eq('id', subscription.id)

      await serviceRoleSupabase
        .from('payment_transactions')
        .update({
          status: 'approved',
          wompi_transaction_id: transaction.id,
          wompi_response: JSON.stringify(transaction),
          updated_at: new Date(),
        })
        .eq('reference', reference)

      console.log(`[Renovación] Transacción aprobada para ${business.business_name}, enviando correo de éxito...`)
      await sendEmail(buildRenewalSuccessEmail({
        businessName: business.business_name,
        email: business.email,
        amount,
        billingFrequency: subscription.billing_frequency,
        reference,
        newPeriodEnd: newEnd,
      }))

      return { status: 'renewed' }
    } else if (transaction.status === 'DECLINED') {
      const newAttempts = (subscription.failed_attempts || 0) + 1
      const updateData = { failed_attempts: newAttempts, updated_at: new Date() }
      if (newAttempts >= 5) updateData.status = 'expired'

      await serviceRoleSupabase
        .from('payment_transactions')
        .update({ status: 'declined', wompi_transaction_id: transaction.id, updated_at: new Date() })
        .eq('reference', reference)

      await serviceRoleSupabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', subscription.id)

      console.log(`[Renovación] Transacción declinada para ${business.business_name}, enviando correo de fallo...`)
      await sendEmail(buildRenewalFailedEmail({
        businessName: business.business_name,
        email: business.email,
        amount,
        billingFrequency: subscription.billing_frequency,
        reference,
        failedAttempts: newAttempts,
        periodEnd: subscription.current_period_end,
      }))

      return { status: 'declined', failed_attempts: newAttempts }
    }

    return { status: 'pending' }
  } catch (error) {
    console.error(`Renovación fallida para ${subscription.business_id}:`, error.message)

    const newAttempts = (subscription.failed_attempts || 0) + 1
    const updateData = { failed_attempts: newAttempts, updated_at: new Date() }
    if (newAttempts >= 5) updateData.status = 'expired'

    await serviceRoleSupabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', subscription.id)

    console.log(`[Renovación] Error en catch para ${business.business_name}, enviando correo de fallo...`)
    await sendEmail(buildRenewalFailedEmail({
      businessName: business.business_name,
      email: business.email,
      amount,
      billingFrequency: subscription.billing_frequency,
      reference,
      failedAttempts: newAttempts,
      periodEnd: subscription.current_period_end,
    }))

    return { status: 'error', failed_attempts: newAttempts }
  }
}

export const renewAllExpired = async () => {
  const today = new Date().toISOString().split('T')[0]

  const { data: expiredSubs } = await serviceRoleSupabase
    .from('subscriptions')
    .select('*')
    .eq('status', 'active')
    .lt('current_period_end', today)

  // if (!expiredSubs?.length) return { renewed: 0, attempts: 0 }

  // let renewed = 0
  // let attempts = 0

  for (const sub of expiredSubs) {
    if (!sub.wompi_payment_source_id) continue
    if ((sub.failed_attempts || 0) >= 5) continue

    const result = await renewSubscription(sub)
    //attempts += result.failed_attempts || 0
    
    // if (result?.status === 'renewed') renewed++
  }
}
