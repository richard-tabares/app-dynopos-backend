import { serviceRoleSupabase } from '../config/supabase.js'
import * as wompiService from './wompiService.js'

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
    .select('email')
    .eq('user_id', subscription.business_id)
    .single()

  if (!business) return

  const { data: plan } = await serviceRoleSupabase
    .from('subscription_plans')
    .select('monthly_price')
    .eq('id', subscription.plan_id)
    .single()

  if (!plan) return

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

    if (currentTx?.status !== 'pending') return

    if (transaction.status === 'APPROVED') {
      const newEnd = addPeriod(subscription.current_period_end, subscription.billing_frequency)

      await serviceRoleSupabase
        .from('subscriptions')
        .update({ current_period_end: newEnd, updated_at: new Date() })
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
    } else if (transaction.status === 'DECLINED') {
      await serviceRoleSupabase
        .from('payment_transactions')
        .update({ status: 'declined', wompi_transaction_id: transaction.id, updated_at: new Date() })
        .eq('reference', reference)

      await serviceRoleSupabase
        .from('subscriptions')
        .update({ status: 'expired', updated_at: new Date() })
        .eq('id', subscription.id)
    }
  } catch (error) {
    console.error(`Renovación fallida para ${subscription.business_id}:`, error.message)
  }
}

export const renewAllExpired = async () => {
  const today = new Date().toISOString().split('T')[0]

  const { data: expiredSubs } = await serviceRoleSupabase
    .from('subscriptions')
    .select('*')
    .eq('status', 'active')
    .lt('current_period_end', today)

  if (!expiredSubs?.length) return { renewed: 0, expired: 0 }

  let renewed = 0
  let expired = 0

  for (const sub of expiredSubs) {
    if (!sub.wompi_payment_source_id) {
      continue
    }

    await renewSubscription(sub)
    renewed++
  }

  return { renewed }
}
