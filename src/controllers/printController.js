import { buildTicketBuffer } from '../services/ticketBuilder.js'

export const buildTicket = async (req, res) => {
  try {
    const { ticketData } = req.body

    if (!ticketData) {
      return res.status(400).json({ error: 'Se requiere ticketData' })
    }

    const buffer = buildTicketBuffer(ticketData)
    const base64 = buffer.toString('base64')

    res.json({ base64 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
