import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticación requerido' })
        }

        const token = authHeader.split(' ')[1]

        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false,
            }
        })

        const { data: { user }, error: sessionError } = await supabaseClient.auth.getUser(token)
        if (sessionError || !user) {
            return res.status(401).json({ error: 'Token inválido o expirado' })
        }

        await supabaseClient.auth.setSession({
            access_token: token,
            refresh_token: token,
        })

        req.user = user
        req.supabase = supabaseClient
        next()
    } catch (error) {
        return res.status(500).json({ error: 'Error de autenticación' })
    }
}
