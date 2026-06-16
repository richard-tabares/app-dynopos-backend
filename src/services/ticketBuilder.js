import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer'

export function buildTicketBuffer(ticketData) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: {
      async isPrinterConnected() { return true },
      async execute() {},
    },
    characterSet: CharacterSet.PC437_USA,
    breakLine: BreakLine.WORD,
    removeSpecialCharacters: false,
    width: 42,
  })

  printer.clear()

  printer.alignCenter()
  printer.setTextSize(1, 1)
  printer.println(ticketData.businessName || '')
  printer.setTextNormal()
  printer.println('Comprobante No Fiscal')

  printer.drawLine()

  printer.alignLeft()
  printer.println(`Orden: #${String(ticketData.ticketNumber || '').padStart(4, '0')}`)
  printer.println(`Fecha: ${ticketData.date || ''}`)
  printer.println(`Pago: ${ticketData.paymentMethod || ''}`)
  if (ticketData.salesperson) {
    printer.println(`Vendedor: ${ticketData.salesperson}`)
  }

  printer.drawLine()

  printer.tableCustom([
    { text: 'Detalle', align: 'LEFT', width: 0.4, bold: true },
    { text: 'Total', align: 'RIGHT', width: 0.3, bold: true },
  ])

  for (const item of (ticketData.items || [])) {
    const name = item.variationName
      ? `${item.name} - ${item.variationName}`
      : item.name
    printer.println(name)
    printer.tableCustom([
      { text: `${item.quantity}x ${formatCurrency(item.price)}`, align: 'LEFT', width: 0.4 },
      { text: formatCurrency(item.subtotal), align: 'RIGHT', width: 0.3 },
    ])
  }

  printer.drawLine()

  printer.setTextSize(1, 1)
  printer.println('TOTAL')
  printer.println(formatCurrency(ticketData.total))

  printer.setTextNormal()
  printer.newLine()
  printer.alignCenter()
  printer.println(ticketData.footer || 'Gracias por su compra!')

  printer.newLine()
  printer.cut()
  printer.openCashDrawer()

  const buffer = printer.getBuffer()
  if (!buffer || buffer.length === 0) {
    throw new Error('No se generaron datos para imprimir')
  }

  return buffer
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}
