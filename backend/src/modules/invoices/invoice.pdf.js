import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import { amountInWords } from './amount-in-words.js'

// Шрифт с кириллицей: встроенные шрифты PDF ее не поддерживают
const FONT_REGULAR = fileURLToPath(new URL('../../../assets/fonts/DejaVuSans.ttf', import.meta.url))
const FONT_BOLD = fileURLToPath(new URL('../../../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url))

const money = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })

const LEFT = 50
const WIDTH = 495

function cell(doc, text, x, y, width, height, { bold = false, align = 'left', size = 9 } = {}) {
  doc.rect(x, y, width, height).stroke()
  doc.font(bold ? 'bold' : 'regular').fontSize(size).text(text, x + 4, y + 4, { width: width - 8, height: height - 6, align })
}

// Счет на оплату (FR-DOC-01): реквизиты агентства и клиента, сумма из сделки.
// Возвращает содержимое PDF-файла.
export function renderInvoicePdf({ invoice, agency, client }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: LEFT,
      info: { Title: `Счет № ${invoice.number}`, Author: agency.name, Creator: 'CRM-Агентство' },
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.registerFont('regular', FONT_REGULAR)
    doc.registerFont('bold', FONT_BOLD)
    doc.lineWidth(0.6)

    // Банковские реквизиты получателя
    let y = 50
    cell(doc, `${agency.bank}\nБанк получателя`, LEFT, y, 300, 40)
    cell(doc, 'БИК', LEFT + 300, y, 50, 20)
    cell(doc, agency.bik, LEFT + 350, y, 145, 20)
    cell(doc, 'Сч. №', LEFT + 300, y + 20, 50, 20)
    cell(doc, agency.correspondentAccount, LEFT + 350, y + 20, 145, 20)
    y += 40
    cell(doc, `ИНН ${agency.inn}`, LEFT, y, 150, 20)
    cell(doc, `КПП ${agency.kpp}`, LEFT + 150, y, 150, 20)
    cell(doc, 'Сч. №', LEFT + 300, y, 50, 52)
    cell(doc, agency.account, LEFT + 350, y, 145, 52)
    cell(doc, `${agency.name}\nПолучатель`, LEFT, y + 20, 300, 32)
    y += 72

    doc.font('bold').fontSize(15).text(`Счет на оплату № ${invoice.number} от ${dateFormat.format(new Date(invoice.issuedAt))}`, LEFT, y + 14, { width: WIDTH })
    y = doc.y + 6
    doc.moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(1.5).stroke().lineWidth(0.6)
    y += 12

    const party = (label, lines) => {
      doc.font('regular').fontSize(9).text(label, LEFT, y, { width: 90 })
      const labelBottom = doc.y
      doc.font('bold').fontSize(9).text(lines.filter(Boolean).join(', '), LEFT + 95, y, { width: WIDTH - 95 })
      y = Math.max(labelBottom, doc.y) + 10
    }
    party('Поставщик (исполнитель):', [agency.name, `ИНН ${agency.inn}`, `КПП ${agency.kpp}`, agency.address])
    party('Покупатель (заказчик):', [
      client.company || client.name,
      client.company && client.name !== client.company ? `контактное лицо: ${client.name}` : null,
      client.inn ? `ИНН ${client.inn}` : null,
      client.address,
      client.phone ? `тел. ${client.phone}` : null,
      client.email,
    ])
    party('Основание:', [`Сделка № ${invoice.dealId}`])

    // Таблица услуг: одна позиция на сумму сделки
    y += 4
    const columns = [
      { title: '№', width: 25, align: 'center' },
      { title: 'Товары (работы, услуги)', width: 250 },
      { title: 'Кол-во', width: 45, align: 'right' },
      { title: 'Ед.', width: 35, align: 'center' },
      { title: 'Цена', width: 70, align: 'right' },
      { title: 'Сумма', width: 70, align: 'right' },
    ]
    const amount = money.format(invoice.amount)
    const descriptionHeight = doc.font('regular').fontSize(9).heightOfString(invoice.description, { width: 242 }) + 10
    const rows = [
      { values: columns.map((column) => column.title), bold: true, height: 20 },
      { values: ['1', invoice.description, '1', 'усл.', amount, amount], height: Math.max(20, descriptionHeight) },
    ]
    for (const row of rows) {
      let x = LEFT
      columns.forEach((column, index) => {
        cell(doc, row.values[index], x, y, column.width, row.height, { bold: row.bold, align: row.bold ? 'center' : column.align })
        x += column.width
      })
      y += row.height
    }

    y += 8
    const total = (label, value) => {
      doc.font('bold').fontSize(9)
      doc.text(label, LEFT, y, { width: WIDTH - 90, align: 'right' })
      doc.text(value, LEFT + WIDTH - 85, y, { width: 85, align: 'right' })
      y += 15
    }
    total('Итого:', amount)
    total('Без налога (НДС):', '—')
    total('Всего к оплате:', amount)

    y += 6
    doc.font('regular').fontSize(9).text(`Всего наименований 1, на сумму ${amount} руб.`, LEFT, y, { width: WIDTH })
    doc.font('bold').text(amountInWords(invoice.amount), LEFT, doc.y + 2, { width: WIDTH })
    y = doc.y + 8
    doc.moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(1.5).stroke().lineWidth(0.6)

    y += 30
    doc.font('bold').fontSize(9).text('Руководитель', LEFT, y)
    doc.moveTo(LEFT + 75, y + 10).lineTo(LEFT + 225, y + 10).stroke()
    doc.font('regular').text(agency.director, LEFT + 235, y)

    doc.font('regular').fontSize(7.5).fillColor('#777')
      .text('Счет сформирован в системе «CRM-Агентство». Учебный проект: реквизиты и данные тестовые.', LEFT, 780, { width: WIDTH, align: 'center' })

    doc.end()
  })
}
