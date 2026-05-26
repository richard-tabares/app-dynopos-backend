import { serviceRoleSupabase } from '../config/supabase.js'

export const requireSuperAdmin = async (req, res, next) => {
    try {
        if (req.user?.role !== 'super_admin') {
            return res.status(403).json({ error: 'Se requieren permisos de super administrador' })
        }

        req.supabase = serviceRoleSupabase

        next()
    } catch (error) {
        return res.status(500).json({ error: 'Error de autorización' })
    }
}
