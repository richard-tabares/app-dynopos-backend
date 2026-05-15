const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'dynopos@soporte.bykor.co'

export const sendEmail = async ({ from, to, subject, html }) => {
    if (!RESEND_API_KEY) return
    return fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html }),
    }).catch((err) => console.error('Error sending email via Resend:', err))
}

export const buildRenewalSuccessEmail = ({
    businessName,
    email,
    amount,
    billingFrequency,
    reference,
    newPeriodEnd,
}) => ({
    from: `DynoPOS <${FROM_EMAIL}>`,
    to: email,
    subject: 'Renovación exitosa - Plan Emprendedor DynoPOS',
    html: `
    <h2>Tu suscripción ha sido renovada</h2>
    <p>Hola <strong>${businessName}</strong>,</p>
    <p>Tu plan <strong>Plan Emprendedor</strong> ha sido renovado exitosamente.</p>
    <h2>Resumen de la transacción</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Referencia</td><td style="padding:8px;border:1px solid #ddd;">${reference}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Monto</td><td style="padding:8px;border:1px solid #ddd;">$${new Intl.NumberFormat('es-CO').format(amount)}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Frecuencia</td><td style="padding:8px;border:1px solid #ddd;">${billingFrequency === 'monthly' ? 'Mensual' : billingFrequency === 'quarterly' ? 'Trimestral' : 'Anual'}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Nuevo período hasta</td><td style="padding:8px;border:1px solid #ddd;">${new Date(newPeriodEnd).toLocaleDateString('es-CO')}</td>
      </tr>
    </table>
    <br><p>Equipo DynoPOS</p>`,
})

export const buildRenewalFailedEmail = ({
    businessName,
    email,
    amount,
    billingFrequency,
    reference,
    failedAttempts,
    periodEnd,
}) => ({
    from: `DynoPOS <${FROM_EMAIL}>`,
    to: email,
    subject: 'Problema con la renovación de tu suscripción DynoPOS',
    html: `
    <h1>No pudimos renovar tu suscripción</h1>
    <p>Hola <strong>${businessName}</strong>,</p>
    <p>Hemos intentado cobrar tu plan <strong>Plan Emprendedor</strong> pero el pago fue rechazado. Revisa tu información de pago en configuraciones.</p>
    <h2>Resumen de la transacción</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr>
      <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Referencia</td><td style="padding:8px;border:1px solid #ddd;">${reference}</td>
      </tr>
      <tr>
      <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Monto</td><td style="padding:8px;border:1px solid #ddd;">$${new Intl.NumberFormat('es-CO').format(amount)}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Frecuencia</td>
        <td style="padding:8px;border:1px solid #ddd;">${billingFrequency === 'monthly' ? 'Mensual' : billingFrequency === 'quarterly' ? 'Trimestral' : 'Anual'}</td>
      </tr>
      <tr>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Vencimiento</td>
        <td style="padding:8px;border:1px solid #ddd;">${new Date(periodEnd).toLocaleDateString('es-CO')}</td>
      </tr>
    </table>
    <p style="color:#d32f2f;font-weight:bold;">⚠️ Tu plan vence el ${new Date(periodEnd).toLocaleDateString('es-CO')}. Después de 5 diás apartir de tu fecha de vencimiento, sino se efectua el pago tu cuenta será desactivada.</p>
    <h3>Recuerda actualizar tu método de pago.</h3>
    <p>Si necesitas actualizar tu método de pago, ingresa a tu panel de administración -> Configuración.</p>
    <br><p>Equipo DynoPOS</p>`,
})
