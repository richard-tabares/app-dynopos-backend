import { supabase } from '../config/supabase.js'

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
