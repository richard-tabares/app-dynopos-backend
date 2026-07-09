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
        const { type, title, description, bullets } = req.body

        if (!type || !title) {
            return res.status(400).json({ error: 'El tipo y el título son obligatorios' })
        }

        const { data, error } = await client
            .from('changelog')
            .insert({ type, title, description, bullets: bullets || [] })
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
        const { type, title, description, bullets, is_active } = req.body

        const updateData = {}
        if (type !== undefined) updateData.type = type
        if (title !== undefined) updateData.title = title
        if (description !== undefined) updateData.description = description
        if (bullets !== undefined) updateData.bullets = bullets
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

export const uploadChangelogImage = async (req, res) => {
    try {
        const file = req.file
        if (!file) return res.status(400).json({ error: 'No se subió ningún archivo' })

        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if (!allowed.includes(file.mimetype)) {
            return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG, WebP o GIF' })
        }

        if (file.size > 5 * 1024 * 1024) {
            return res.status(400).json({ error: 'La imagen no debe superar los 5MB' })
        }

        const ext = file.originalname.split('.').pop()
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
        const fileName = `changelog/${Date.now()}-${sanitizedName}.${ext}`

        const { error: uploadError } = await serviceRoleSupabase.storage
            .from('changelog')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            })

        if (uploadError) return res.status(400).json({ error: uploadError.message })

        const { data: { publicUrl } } = serviceRoleSupabase.storage
            .from('changelog')
            .getPublicUrl(fileName)

        return res.json({ url: publicUrl })
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
}

export const deleteChangelogImage = async (req, res) => {
    try {
        const { url } = req.body
        if (!url) return res.status(400).json({ error: 'URL requerida' })

        const match = url.match(/\/public\/changelog\/(.+)$/)
        if (!match) return res.status(400).json({ error: 'URL inválida' })

        const filePath = match[1]
        const { error } = await serviceRoleSupabase.storage
            .from('changelog')
            .remove([filePath])

        if (error) return res.status(400).json({ error: error.message })
        return res.json({ message: 'Imagen eliminada correctamente' })
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
}
