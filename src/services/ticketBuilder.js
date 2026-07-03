import {
    ThermalPrinter,
    PrinterTypes,
    CharacterSet,
    BreakLine,
} from 'node-thermal-printer'

export function buildTicketBuffer(ticketData) {
    const WIDTH = ticketData.printerWidth || 32
    const DETAIL_WIDTH = WIDTH === 32 ? 0.5 : 0.5
    const TOTAL_WIDTH = WIDTH === 32 ? 0.5 : 0.5

    const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: {
            async isPrinterConnected() {
                return true
            },
            async execute() {},
        },
        characterSet: CharacterSet.PC437_USA,
        breakLine: BreakLine.WORD,
        removeSpecialCharacters: false,
        width: WIDTH,
    })

    printer.clear()

    printer.alignCenter()
    printer.setTextSize(1, 1)
    printer.println(ticketData.businessName || '')
    printer.setTextNormal()
    printer.println('Comprobante No Fiscal')

    printer.drawLine()

    printer.alignLeft()
    printer.println(
        `Orden: #${String(ticketData.ticketNumber || '').padStart(4, '0')}`,
    )
    printer.println(`Fecha: ${ticketData.date || ''}`)
    printer.println(`Pago: ${ticketData.paymentMethod || ''}`)
    if (ticketData.salesperson) {
        printer.println(`Vendedor: ${ticketData.salesperson}`)
    }

    printer.drawLine()

    printer.tableCustom([
        { text: 'Detalle', align: 'LEFT', width: DETAIL_WIDTH, bold: true },
        { text: 'Total', align: 'RIGHT', width: TOTAL_WIDTH, bold: true },
    ])

    for (const item of ticketData.items || []) {
        const name = item.variationName
            ? `${item.name} - ${item.variationName}`
            : item.name
        printer.println(name)
        const qty = Number(item.quantity) || 0
        const unit = item.displayUnit || ''
        const line = `${qty}${unit ? ' ' + unit : ''} x ${formatCurrency(item.price)}`
        printer.tableCustom([
            { text: line, align: 'LEFT', width: DETAIL_WIDTH },
            {
                text: formatCurrency(item.subtotal),
                align: 'RIGHT',
                width: TOTAL_WIDTH,
            },
        ])
    }

    printer.drawLine()

   printer.tableCustom([
        { text: 'Total', align: 'LEFT', width: DETAIL_WIDTH, bold: true },
        {
            text: formatCurrency(ticketData.total),
            align: 'RIGHT',
            width: TOTAL_WIDTH,
            bold: true,
        },
   ])
    
    printer.newLine()
    printer.alignCenter()
    printer.println(ticketData.footer || 'Gracias por su compra!')
    printer.newLine()

    printer.drawLine()
    printer.newLine()
    printer.println('¿Quieres un sistema rápido y moderno para tu negocio?')
    printer.newLine()
    printer.printQR('https://bykor.co', {
        cellSize: 5,
        correction: 'M',
        model: 2,
    })
    printer.println('Bykor.co')
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
