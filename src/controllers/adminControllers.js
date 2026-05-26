import { supabase, serviceRoleSupabase } from '../config/supabase.js'

export const adminLogin = async (req, res) => {
    const { email, password } = req.body
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return res.status(401).json({ error: error.message })

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single()
        if (profileError) return res.status(401).json({ error: 'Perfil no encontrado' })

        if (profile.role !== 'super_admin') {
            return res.status(403).json({ error: 'Acceso no autorizado al panel de administración' })
        }

        return res.json({
            status: 200,
            user: data.user,
            profile,
            access_token: data.session?.access_token,
            refresh_token: data.session?.refresh_token,
        })
    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}

export const getClients = async (req, res) => {
    try {
        const { data: businesses, error: bizError } = await serviceRoleSupabase
            .from('businesses')
            .select('*')
            .order('created_at', { ascending: false })
        if (bizError) throw bizError

        const businessIds = businesses.map(b => b.user_id)

        const [subsResult, profilesResult] = await Promise.all([
            serviceRoleSupabase
                .from('subscriptions')
                .select('*, plan:plan_id(*)')
                .in('business_id', businessIds)
                .order('created_at', { ascending: false }),
            serviceRoleSupabase
                .from('profiles')
                .select('*')
                .in('business_id', businessIds),
        ])

        if (subsResult.error) throw subsResult.error
        if (profilesResult.error) throw profilesResult.error

        const latestSub = {}
        for (const sub of subsResult.data || []) {
            if (!latestSub[sub.business_id]) latestSub[sub.business_id] = sub
        }

        const bizProfile = {}
        for (const p of profilesResult.data || []) {
            if (!bizProfile[p.business_id]) bizProfile[p.business_id] = p
        }

        const clients = businesses.map(biz => ({
            id: biz.user_id,
            business_name: biz.business_name,
            owner_name: biz.owner_name,
            email: biz.email,
            phone: biz.phone,
            business_logo: biz.business_logo,
            created_at: biz.created_at,
            profile: bizProfile[biz.user_id] || null,
            subscription: latestSub[biz.user_id] || null,
        }))

        res.json(clients)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const createClient = async (req, res) => {
    const { business_name, owner_name, email, phone, password, billing_frequency, plan_id } = req.body

    if (!business_name || !owner_name || !email || !phone || !password) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }

    try {
        const { data: authData, error: authError } = await serviceRoleSupabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })
        if (authError) return res.status(400).json({ error: authError.message })

        const userId = authData.user.id

        const { error: profileError } = await serviceRoleSupabase.from('profiles').insert({
            id: userId,
            business_id: userId,
            display_name: owner_name,
            role: 'admin',
        })
        if (profileError) {
            await serviceRoleSupabase.auth.admin.deleteUser(userId).catch(() => {})
            return res.status(500).json({ error: profileError.message })
        }

        const { error: businessError } = await serviceRoleSupabase.from('businesses').insert({
            user_id: userId,
            business_name,
            owner_name,
            email,
            phone,
        })
        if (businessError) {
            await serviceRoleSupabase.auth.admin.deleteUser(userId).catch(() => {})
            return res.status(500).json({ error: businessError.message })
        }

        try { await serviceRoleSupabase.from('categories').insert({
            business_id: userId,
            name: 'General',
        }) } catch (_) {}

        let selectedPlanId = plan_id
        if (!selectedPlanId) {
            const { data: defaultPlan } = await serviceRoleSupabase
                .from('subscription_plans')
                .select('id')
                .eq('status', 'active')
                .limit(1)
                .maybeSingle()
            selectedPlanId = defaultPlan?.id
        }

        const now = new Date()
        const periodStart = now.toISOString().split('T')[0]
        const freq = billing_frequency || 'monthly'
        const daysMap = { monthly: 30, quarterly: 90, annual: 365 }
        const periodEnd = new Date(now.getTime() + (daysMap[freq] || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        try { await serviceRoleSupabase.from('subscriptions').insert({
            business_id: userId,
            plan_id: selectedPlanId,
            status: 'active',
            billing_frequency: freq,
            current_period_start: periodStart,
            current_period_end: periodEnd,
        }) } catch (_) {}

        res.status(201).json({
            status: 201,
            message: 'Cliente creado exitosamente',
            user: { id: userId, email, business_name },
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const toggleClientStatus = async (req, res) => {
    const { id } = req.params
    const { is_active } = req.body

    try {
        const { data: sub, error: findError } = await serviceRoleSupabase
            .from('subscriptions')
            .select('id, status')
            .eq('business_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (findError) throw findError
        if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' })

        const newStatus = is_active ? 'active' : 'cancelled'

        const { error } = await serviceRoleSupabase
            .from('subscriptions')
            .update({ status: newStatus, updated_at: new Date() })
            .eq('id', sub.id)
        if (error) throw error

        res.json({ status: 200, message: is_active ? 'Cliente activado' : 'Cliente desactivado' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const changeBillingFrequency = async (req, res) => {
    const { id } = req.params
    const { billing_frequency } = req.body

    if (!['monthly', 'quarterly', 'annual'].includes(billing_frequency)) {
        return res.status(400).json({ error: 'Frecuencia inválida' })
    }

    try {
        const { data: sub, error: findError } = await serviceRoleSupabase
            .from('subscriptions')
            .select('id')
            .eq('business_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (findError) throw findError
        if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' })

        const { error } = await serviceRoleSupabase
            .from('subscriptions')
            .update({ billing_frequency, updated_at: new Date() })
            .eq('id', sub.id)
        if (error) throw error

        res.json({ status: 200, message: 'Frecuencia de facturación actualizada' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const extendSubscription = async (req, res) => {
    const { id } = req.params
    const { current_period_end } = req.body

    if (!current_period_end) {
        return res.status(400).json({ error: 'Fecha de vencimiento requerida' })
    }

    try {
        const { data: sub, error: findError } = await serviceRoleSupabase
            .from('subscriptions')
            .select('id')
            .eq('business_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (findError) throw findError
        if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' })

        const { error } = await serviceRoleSupabase
            .from('subscriptions')
            .update({
                current_period_end,
                status: 'active',
                updated_at: new Date(),
            })
            .eq('id', sub.id)
        if (error) throw error

        res.json({ status: 200, message: 'Suscripción extendida exitosamente' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const manualRenewal = async (req, res) => {
    const { id } = req.params

    try {
        const { data: sub, error: findError } = await serviceRoleSupabase
            .from('subscriptions')
            .select('id, current_period_end, billing_frequency, business_id')
            .eq('business_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (findError) throw findError
        if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' })

        const freq = sub.billing_frequency || 'monthly'
        const daysMap = { monthly: 30, quarterly: 90, annual: 365 }
        const now = new Date()
        const newPeriodStart = now.toISOString().split('T')[0]
        const newPeriodEnd = new Date(now.getTime() + (daysMap[freq] || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        const { error } = await serviceRoleSupabase
            .from('subscriptions')
            .update({
                current_period_start: newPeriodStart,
                current_period_end: newPeriodEnd,
                status: 'active',
                updated_at: new Date(),
            })
            .eq('id', sub.id)
        if (error) throw error

        res.json({ status: 200, message: 'Suscripción renovada manualmente' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const getAdminTickets = async (req, res) => {
    try {
        const { data: tickets, error } = await serviceRoleSupabase
            .from('support_tickets')
            .select('*')
            .order('created_at', { ascending: false })
        if (error) throw error

        const businessIds = [...new Set((tickets || []).map(t => t.business_id))]

        if (businessIds.length > 0) {
            const { data: businesses } = await serviceRoleSupabase
                .from('businesses')
                .select('user_id, business_name')
                .in('user_id', businessIds)

            const bizMap = {}
            for (const b of businesses || []) bizMap[b.user_id] = b.business_name

            const enriched = (tickets || []).map(t => ({
                ...t,
                business_name: bizMap[t.business_id] || 'Desconocido',
            }))

            return res.json(enriched)
        }

        res.json(tickets || [])
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const updateTicketStatus = async (req, res) => {
    const { id } = req.params
    const { status } = req.body

    if (!['open', 'in_progress', 'resolved'].includes(status)) {
        return res.status(400).json({ error: 'Estado inválido' })
    }

    try {
        const { error } = await serviceRoleSupabase
            .from('support_tickets')
            .update({ status, updated_at: new Date() })
            .eq('id', id)
        if (error) throw error

        res.json({ status: 200, message: 'Estado del ticket actualizado' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const getPayments = async (req, res) => {
    try {
        const { data: transactions, error } = await serviceRoleSupabase
            .from('payment_transactions')
            .select('*')
            .order('created_at', { ascending: false })
        if (error) throw error

        const businessIds = [...new Set((transactions || []).map(t => t.business_id).filter(Boolean))]

        if (businessIds.length > 0) {
            const { data: businesses } = await serviceRoleSupabase
                .from('businesses')
                .select('user_id, business_name')
                .in('user_id', businessIds)

            const bizMap = {}
            for (const b of businesses || []) bizMap[b.user_id] = b.business_name

            const enriched = (transactions || []).map(t => ({
                ...t,
                business_name: bizMap[t.business_id] || 'Desconocido',
            }))

            return res.json(enriched)
        }

        res.json(transactions || [])
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
