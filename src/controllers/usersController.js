import { supabase, serviceRoleSupabase } from '../config/supabase.js'

const getClient = (req) => req.supabase || supabase

const requireAdmin = async (req) => {
    const client = getClient(req)
    const { data: profile } = await client
        .from('profiles')
        .select('role')
        .eq('id', req.user.id)
        .single()

    if (!profile || profile.role !== 'admin') {
        return false
    }
    return true
}

export const getUsers = async (req, res) => {
    const { businessId } = req.params
    try {
        if (!(await requireAdmin(req))) {
            return res.status(403).json({ error: 'No tienes permisos de administrador' })
        }

        const { data, error } = await serviceRoleSupabase
            .from('profiles')
            .select('id, display_name, role, permissions, created_at')
            .eq('business_id', businessId)
            .neq('id', businessId)
            .order('created_at', { ascending: false })

        if (error) throw new Error(error.message)

        const usersWithEmail = await Promise.all(
            (data || []).map(async (profile) => {
                try {
                    const { data: authUser } = await serviceRoleSupabase.auth.admin.getUserById(profile.id)
                    return {
                        ...profile,
                        email: authUser?.user?.email || '',
                    }
                } catch {
                    return { ...profile, email: '' }
                }
            })
        )

        res.json(usersWithEmail)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const createUser = async (req, res) => {
    const { email, password, display_name, role, permissions } = req.body
    const businessId = req.user.id

    try {
        if (!(await requireAdmin(req))) {
            return res.status(403).json({ error: 'No tienes permisos de administrador' })
        }

        if (role === 'admin') {
            return res.status(403).json({ error: 'No puedes crear otro usuario administrador' })
        }

        const { data: authData, error: authError } = await serviceRoleSupabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })

        if (authError) {
            return res.status(400).json({ error: authError.message })
        }

        const { error: profileError } = await serviceRoleSupabase
            .from('profiles')
            .insert({
                id: authData.user.id,
                business_id: businessId,
                display_name: display_name || '',
                role: role || 'cajero',
                permissions: permissions || null,
            })

        if (profileError) {
            await serviceRoleSupabase.auth.admin.deleteUser(authData.user.id)
            return res.status(500).json({ error: profileError.message })
        }

        res.status(201).json({
            status: 201,
            message: 'Usuario creado exitosamente',
            user: {
                id: authData.user.id,
                display_name,
                role,
                email,
            },
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const updateUser = async (req, res) => {
    const { userId } = req.params
    const { display_name, role, permissions } = req.body
    const businessId = req.user.id

    try {
        if (!(await requireAdmin(req))) {
            return res.status(403).json({ error: 'No tienes permisos de administrador' })
        }

        if (userId === businessId) {
            return res.status(403).json({ error: 'No puedes modificar tu propio usuario desde aquí' })
        }

        if (role === 'admin') {
            return res.status(403).json({ error: 'No puedes asignar el rol administrador a otro usuario' })
        }

        const client = getClient(req)
        const { data: existing } = await client
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .eq('business_id', businessId)
            .maybeSingle()

        if (!existing) {
            return res.status(404).json({ error: 'Usuario no encontrado en tu negocio' })
        }

        const updates = {}
        if (display_name !== undefined) updates.display_name = display_name
        if (role !== undefined) updates.role = role
        if (permissions !== undefined) updates.permissions = permissions

        const { error } = await client
            .from('profiles')
            .update(updates)
            .eq('id', userId)

        if (error) throw new Error(error.message)

        res.json({ status: 200, message: 'Usuario actualizado' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const deleteUser = async (req, res) => {
    const { userId } = req.params
    const businessId = req.user.id

    try {
        if (!(await requireAdmin(req))) {
            return res.status(403).json({ error: 'No tienes permisos de administrador' })
        }

        if (userId === businessId) {
            return res.status(403).json({ error: 'No puedes eliminar tu propio usuario' })
        }

        const client = getClient(req)
        const { data: existing } = await client
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .eq('business_id', businessId)
            .maybeSingle()

        if (!existing) {
            return res.status(404).json({ error: 'Usuario no encontrado en tu negocio' })
        }

        const { error: authError } = await serviceRoleSupabase.auth.admin.deleteUser(userId)
        if (authError) throw new Error(authError.message)

        res.json({ status: 200, message: 'Usuario eliminado' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
