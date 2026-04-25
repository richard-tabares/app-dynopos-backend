import { supabase } from '../config/supabase.js'

export const createBusiness = async (req, res) => {
	try {
		const { data, error } = await supabase
			.from('businesses')
			.insert(req.body)
			.select()
		if (error) throw new Error(error)
		res.status(201).json({ status: 201, message: 'Negocio Creado', data })
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
}

export const updateBusiness = async (req, res) => {
    const { id } = req.params
    try {
        const { data, error } = await supabase
            .from('businesses')
            .update(req.body)
            .eq('user_id', id)
            .select()
        if (error) throw new Error(error)
        res.json({ status: 200, message: 'Negocio Actualizado', data })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const deleteBusiness = async (req, res) => {
    const { id } = req.params
    try {
        const { data, error } = await supabase
            .from('businesses')
            .delete()
            .eq('user_id', id)
            .select()
        if (error) throw new Error(error)
        res.json({ status: 200, message: 'Negocio Eliminado', data })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const getBusiness = async (req, res) => {
    const { id } = req.params
    try {
        const { data, error } = await supabase
            .from('businesses')
            .select()
            .eq('user_id', id)
        if (error) throw new Error(error)
        res.json({ status: 200, message: 'Negocio Obtenido', data })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const changePassword = async (req, res) => {
    const { email, currentPassword, newPassword } = req.body
    try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password: currentPassword,
        })
        if (signInError) {
            return res.status(400).json({ error: 'La contraseña actual no es correcta' })
        }

        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword,
        })
        if (updateError) throw new Error(updateError)

        res.json({ status: 200, message: 'Contraseña actualizada exitosamente' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const uploadBusinessLogo = async (req, res) => {
    const { id } = req.params
    const file = req.file
    if (!file) return res.status(400).json({ error: 'No se subió ningún archivo' })

    try {
        const ext = file.originalname.split('.').pop()
        const fileName = `logos/${id}-${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage
            .from('logos')
            .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true })

        if (uploadError) throw new Error(uploadError)

        const { data: { publicUrl } } = supabase.storage
            .from('logos')
            .getPublicUrl(fileName)

        const { data: updated, error: updateError } = await supabase
            .from('businesses')
            .update({ business_logo: publicUrl })
            .eq('user_id', id)
            .select()
        if (updateError) throw new Error(updateError)

        res.json({ status: 200, message: 'Logo actualizado', url: publicUrl, data: updated[0] })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}