import { serviceRoleSupabase } from '../config/supabase.js'
import * as wompiService from './wompiService.js'
import { sendEmail, buildRenewalSuccessEmail, buildRenewalFailedEmail } from './emailService.js'

const GRACE_PERIOD_DAYS = 7

const calculateAmount = (plan, billingFrequency) => {
  if (billingFrequency === 'annual') return plan.annual_price
  if (billingFrequency === 'quarterly') return plan.quarterly_price
  return plan.monthly_price
}

const addPeriod = (date, frequency) => {
  const d = new Date(date)
  if (frequency === 'annual') d.setFullYear(d.getFullYear() + 1)
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().split('T')[0]
}

const getDaysPastDue = (pastDueAt) => {
  if (!pastDueAt) return 0
  return Math.floor((Date.now() - new Date(pastDueAt).getTime()) / (1000 * 60 * 60 * 24))
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
    .select('monthly_price, quarterly_price, annual_price')
    .eq('id', subscription.plan_id)
    .single()

  if (!plan) return { status: 'skipped' }

  const amount = calculateAmount(plan, subscription.billing_frequency)
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

    let txStatus = transaction.status
    let txId = transaction.id

    console.log(`[Renovación] Status Wompi inicial: ${txStatus}`)

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
      console.log(`[Renovación] Status Wompi tras polling (${retries} intentos): ${txStatus}`)
    }

    if (txStatus === 'APPROVED') {
      const newEnd = addPeriod(subscription.current_period_end, subscription.billing_frequency)

      await serviceRoleSupabase
        .from('subscriptions')
        .update({
          current_period_end: newEnd,
          status: 'active',
          past_due_at: null,
          updated_at: new Date(),
        })
        .eq('id', subscription.id)

      await serviceRoleSupabase
        .from('payment_transactions')
        .update({
          status: 'approved',
          wompi_transaction_id: txId,
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
    }

    await serviceRoleSupabase
      .from('payment_transactions')
      .update({
        status: 'declined',
        wompi_transaction_id: txId,
        wompi_response: JSON.stringify(transaction),
        updated_at: new Date(),
      })
      .eq('reference', reference)

    console.log(`[Renovación] Transacción declinada para ${business.business_name}, enviando correo de fallo...`)
    await sendEmail(buildRenewalFailedEmail({
      businessName: business.business_name,
      email: business.email,
      amount,
      billingFrequency: subscription.billing_frequency,
      reference,
      periodEnd: subscription.current_period_end,
    }))

    return { status: 'declined' }
  } catch (error) {
    console.error(`Renovación fallida para ${subscription.business_id}:`, error.message)

    await serviceRoleSupabase
      .from('payment_transactions')
      .update({
        status: 'declined',
        wompi_response: JSON.stringify({ error: error.message }),
        updated_at: new Date(),
      })
      .eq('reference', reference)

    console.log(`[Renovación] Error en catch para ${business.business_name}, enviando correo de fallo...`)
    await sendEmail(buildRenewalFailedEmail({
      businessName: business.business_name,
      email: business.email,
      amount,
      billingFrequency: subscription.billing_frequency,
      reference,
      periodEnd: subscription.current_period_end,
    }))

    return { status: 'error' }
  }
}

export const renewAllExpired = async () => {
  const today = new Date().toISOString().split('T')[0]

  const { data: expiredSubs } = await serviceRoleSupabase
    .from('subscriptions')
    .select('*')
    .in('status', ['active', 'past_due'])
    .lt('current_period_end', today)

  if (!expiredSubs?.length) return { renewed: 0, expired: 0 }

  let renewed = 0
  let expired = 0

  for (const sub of expiredSubs) {
    const daysPastDue = getDaysPastDue(sub.past_due_at)
    console.log(daysPastDue)

    if (sub.status === 'active') {
      await serviceRoleSupabase
        .from('subscriptions')
        .update({ status: 'past_due', past_due_at: new Date(), updated_at: new Date() })
        .eq('id', sub.id)
    }

    if (daysPastDue >= GRACE_PERIOD_DAYS) {
      if (sub.status === 'past_due') {
        await serviceRoleSupabase
          .from('subscriptions')
          .update({ status: 'expired', updated_at: new Date() })
          .eq('id', sub.id)
      }
      expired++
      continue
    }

    const { data: business } = await serviceRoleSupabase
      .from('businesses')
      .select('business_name, email')
      .eq('user_id', sub.business_id)
      .single()

    if (!business) continue

    if (sub.auto_renew && sub.payment_method === 'card') {
      const result = await renewSubscription(sub)
      if (result?.status === 'renewed') renewed++
    } else {
      const { data: plan } = await serviceRoleSupabase
        .from('subscription_plans')
        .select('monthly_price, quarterly_price, annual_price')
        .eq('id', sub.plan_id)
        .single()

      const amount = plan ? calculateAmount(plan, sub.billing_frequency) : 0
      const reference = wompiService.generateReference()

      await sendEmail(buildRenewalFailedEmail({
        businessName: business.business_name,
        email: business.email,
        amount,
        billingFrequency: sub.billing_frequency,
        reference,
        periodEnd: sub.current_period_end,
      }))
    }
  }

  return { renewed, expired }
}
