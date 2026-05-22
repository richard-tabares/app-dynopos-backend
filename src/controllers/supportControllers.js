import { supabase } from '../config/supabase.js'
import { sendEmail } from '../services/emailService.js'

const getClient = (req) => req.supabase || supabase

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'bykorpos@soporte.bykor.co'
const SUPPORT_EMAIL = 'richardtabaresb@gmail.com'

export const createTicket = async (req, res) => {
    const client = getClient(req)
    const { type, subject, description } = req.body
    const businessId = req.user?.id || req.user?.sub

    if (!type || !subject || !description) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }

    try {
        const { data: ticket, error } = await client
            .from('support_tickets')
            .insert({
                business_id: businessId,
                type,
                subject,
                description,
            })
            .select()
            .single()

        if (error) throw error

        await sendEmail({
            from: `DynoPOS Soporte <${FROM_EMAIL}>`,
            to: SUPPORT_EMAIL,
            subject: `Nuevo ticket de soporte: ${subject}`,
            html: `
                <h2>Nuevo Ticket de Soporte</h2>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Tipo</td><td style="padding:8px;border:1px solid #ddd;">${type}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Asunto</td><td style="padding:8px;border:1px solid #ddd;">${subject}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Descripción</td><td style="padding:8px;border:1px solid #ddd;">${description}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Business ID</td><td style="padding:8px;border:1px solid #ddd;">${businessId}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Fecha</td><td style="padding:8px;border:1px solid #ddd;">${new Date().toLocaleString('es-CO')}</td></tr>
                </table>
                <br><p>Equipo DynoPOS</p>
            `,
        })

        res.status(201).json(ticket)
    } catch (error) {
        console.error('createTicket error:', error)
        res.status(500).json({ error: error.message || 'Error al crear el ticket' })
    }
}
