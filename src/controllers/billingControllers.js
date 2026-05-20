import { supabase } from '../config/supabase.js'
import * as wompiService from '../services/wompiService.js'
import { renewSubscription } from '../services/renewalService.js'

const getClient = (req) => req.supabase || supabase

export const getSubscription = async (req, res) => {
    const client = getClient(req)
    const { businessId } = req.params
    try {
        const { data: subscription, error } = await client
            .from('subscriptions')
            .select(`
                *,
                plan:plan_id (
                    id,
                    name,
                    description,
                    monthly_price,
                    features
                )
            `)
            .eq('business_id', businessId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (error) throw new Error(error.message)

        res.json({ status: 200, data: subscription })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const getTransactions = async (req, res) => {
    const client = getClient(req)
    const { businessId } = req.params
    try {
        const { data: transactions, error } = await client
            .from('payment_transactions')
            .select('*')
            .eq('business_id', businessId)
            .order('created_at', { ascending: false })

        if (error) throw new Error(error.message)

        res.json({ status: 200, data: transactions })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const getAcceptanceTokens = async (req, res) => {
    try {
        const tokens = await wompiService.getAcceptanceToken()
        res.json({
            acceptance_token: tokens.acceptance_token,
            personal_data_auth: tokens.personal_data_auth,
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const cancelRecurring = async (req, res) => {
    const client = getClient(req)
    const { businessId } = req.params
    try {
        const { data: subscription, error: findError } = await client
            .from('subscriptions')
            .select('id')
            .eq('business_id', businessId)
            .eq('auto_renew', true)
            .maybeSingle()

        if (findError) throw new Error(findError.message)
        if (!subscription) {
            return res.status(404).json({ error: 'No hay suscripción con renovación automática activa' })
        }

        const { data, error } = await client
            .from('subscriptions')
            .update({ auto_renew: false, updated_at: new Date() })
            .eq('id', subscription.id)
            .select()

        if (error) throw new Error(error.message)
        if (!data || data.length === 0) {
            return res.status(500).json({ error: 'No se pudo desactivar la renovación automática' })
        }

        res.json({ status: 200, message: 'Pagos recurrentes desactivados' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const updatePaymentSource = async (req, res) => {
    const { businessId } = req.params
    const { card_token, acceptance_token, customer_email } = req.body

    if (!card_token || !acceptance_token || !customer_email) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' })
    }

    try {
        const paymentSource = await wompiService.createPaymentSource({
            type: 'CARD',
            token: card_token,
            customer_email,
            acceptance_token,
        })

        const client = getClient(req)
        const { data, error } = await client
            .from('subscriptions')
            .update({ wompi_payment_source_id: String(paymentSource.id), updated_at: new Date() })
            .eq('business_id', businessId)
            .select()

        if (error) throw new Error(error.message)
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'No se encontró una suscripción para este negocio' })
        }

        const today = new Date().toISOString().split('T')[0]
        const isExpired = data[0].current_period_end && data[0].current_period_end < today

        if (!isExpired) {
            return res.json({ status: 200, message: 'Método de pago actualizado exitosamente' })
        }

        const { data: fullSub } = await client
            .from('subscriptions')
            .select(`
                *,
                plan:plan_id (
                    id,
                    name,
                    description,
                    monthly_price,
                    features
                )
            `)
            .eq('id', data[0].id)
            .single()

        if (!fullSub) {
            return res.json({ status: 200, message: 'Método de pago actualizado exitosamente' })
        }

        const renewalResult = await renewSubscription(fullSub)

        if (renewalResult?.status === 'renewed') {
            await client
                .from('subscriptions')
                .update({ auto_renew: true, updated_at: new Date() })
                .eq('id', data[0].id)

            return res.json({
                status: 200,
                message: 'Método de pago actualizado y suscripción renovada exitosamente',
                renewed: true,
            })
        }

        res.json({
            status: 200,
            message: 'Método de pago actualizado. No se pudo renovar la suscripción automáticamente, pero el método de pago está listo para futuros intentos.',
            renewed: false,
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const reactivateSubscription = async (req, res) => {
    const client = getClient(req)
    const { businessId } = req.params
    try {
        const { data: subscription, error: findError } = await client
            .from('subscriptions')
            .select('id')
            .eq('business_id', businessId)
            .eq('auto_renew', false)
            .maybeSingle()

        if (findError) throw new Error(findError.message)
        if (!subscription) {
            return res.status(404).json({ error: 'No hay suscripción con renovación automática inactiva' })
        }

        const { data, error } = await client
            .from('subscriptions')
            .update({ auto_renew: true, updated_at: new Date() })
            .eq('id', subscription.id)
            .select()

        if (error) throw new Error(error.message)
        if (!data || data.length === 0) {
            return res.status(500).json({ error: 'No se pudo activar la renovación automática' })
        }

        res.json({ status: 200, message: 'Pagos recurrentes activados' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
