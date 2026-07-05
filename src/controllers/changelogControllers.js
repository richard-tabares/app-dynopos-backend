import { supabase, serviceRoleSupabase } from '../config/supabase.js'

const getClient = (req) => req.supabase || supabase

export const getChangelog = async (req, res) => {
    try {
        const client = getClient(req)

        if (req.isAdminRoute) {
            const { data, error } = await client
                .from('changelog')
                .select('*')
                .order('id', { ascending: false })

            if (error) return res.status(400).json({ error: error.message })
            return res.json(data)
        }

        const { data, error } = await client
            .from('changelog')
            .select('*')
            .eq('is_active', true)
            .order('id', { ascending: false })

        if (error) return res.status(400).json({ error: error.message })
        return res.json(data)
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
}

export const getLatestChangelogId = async (req, res) => {
    try {
        const client = getClient(req)
        const { data, error } = await client
            .from('changelog')
            .select('id')
            .eq('is_active', true)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (error) return res.status(400).json({ error: error.message })
        return res.json({ maxId: data?.id || 0 })
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
}

export const getChangelogById = async (req, res) => {
    try {
        const client = getClient(req)
        const { id } = req.params

        let query = client.from('changelog').select('*').eq('id', id)
        if (!req.isAdminRoute) {
            query = query.eq('is_active', true)
        }
        const { data, error } = await query.single()

        if (error) return res.status(404).json({ error: 'Novedad no encontrada' })
        return res.json(data)
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
}

export const createChangelog = async (req, res) => {
    try {
        const client = serviceRoleSupabase
        const { type, title, description, bullets, media_url } = req.body

        if (!type || !title) {
            return res.status(400).json({ error: 'El tipo y el título son obligatorios' })
        }

        const { data, error } = await client
            .from('changelog')
            .insert({ type, title, description, bullets: bullets || [], media_url: media_url || null })
            .select()
            .single()

        if (error) return res.status(400).json({ error: error.message })
        return res.status(201).json(data)
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
}

export const updateChangelog = async (req, res) => {
    try {
        const client = serviceRoleSupabase
        const { id } = req.params
        const { type, title, description, bullets, media_url, is_active } = req.body

        const updateData = {}
        if (type !== undefined) updateData.type = type
        if (title !== undefined) updateData.title = title
        if (description !== undefined) updateData.description = description
        if (bullets !== undefined) updateData.bullets = bullets
        if (media_url !== undefined) updateData.media_url = media_url
        if (is_active !== undefined) updateData.is_active = is_active

        const { data, error } = await client
            .from('changelog')
            .update(updateData)
            .eq('id', id)
            .select()
            .single()

        if (error) return res.status(400).json({ error: error.message })
        return res.json(data)
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
}

export const deleteChangelog = async (req, res) => {
    try {
        const client = serviceRoleSupabase
        const { id } = req.params
        const { error } = await client
            .from('changelog')
            .delete()
            .eq('id', id)

        if (error) return res.status(400).json({ error: error.message })
        return res.json({ message: 'Novedad eliminada correctamente' })
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
}
