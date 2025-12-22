import { formatCurrency } from '@/lib/formatCurrency'
import { formatDate } from '@/lib/formatDate'

// --- PDF TEMPLATE CONFIGURATION ---
// Edit these values to customize the PDF look and feel
const CONFIG = {
    company: {
        name: 'Alden Group',
        address: [
            '123 Warehouse Way',
            'Logistics City, LC 12345',
            'United Kingdom'
        ],
        email: 'purchasing@aldengroup.com',
        phone: '+44 123 456 7890'
    },
    colors: {
        primary: [41, 128, 185] as [number, number, number], // Blue
        secondary: [127, 140, 141] as [number, number, number], // Grey
        headerBg: [245, 245, 245] as [number, number, number],
        text: [50, 50, 50] as [number, number, number]
    },
    fonts: {
        header: 'helvetica',
        body: 'helvetica'
    }
}

export const generatePoPdf = async (po: any, lines: any[]) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF()
    
    // --- HEADER ---
    doc.setFontSize(24)
    doc.setTextColor(CONFIG.colors.primary[0], CONFIG.colors.primary[1], CONFIG.colors.primary[2])
    doc.text('PURCHASE ORDER', 14, 20)

    // Company Info (Right Aligned)
    doc.setFontSize(10)
    doc.setTextColor(CONFIG.colors.secondary[0], CONFIG.colors.secondary[1], CONFIG.colors.secondary[2])
    const pageWidth = doc.internal.pageSize.width
    let yPos = 20
    
    doc.text(CONFIG.company.name, pageWidth - 14, yPos, { align: 'right' })
    yPos += 5
    CONFIG.company.address.forEach(line => {
        doc.text(line, pageWidth - 14, yPos, { align: 'right' })
        yPos += 5
    })
    doc.text(CONFIG.company.email, pageWidth - 14, yPos, { align: 'right' })
    
    // --- PO DETAILS ---
    yPos = 50
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    
    // Left Column: Supplier
    doc.setFont(CONFIG.fonts.body, 'bold')
    doc.text('VENDOR:', 14, yPos)
    doc.setFont(CONFIG.fonts.body, 'normal')
    doc.text(po.supplier_name || 'Unknown Supplier', 14, yPos + 6)
    // Add supplier address if available in the future
    
    // Right Column: PO Info
    const rightColX = pageWidth - 80
    doc.setFont(CONFIG.fonts.body, 'bold')
    doc.text('PO Number:', rightColX, yPos)
    doc.setFont(CONFIG.fonts.body, 'normal')
    doc.text(po.po_number, pageWidth - 14, yPos, { align: 'right' })
    
    doc.setFont(CONFIG.fonts.body, 'bold')
    doc.text('Date:', rightColX, yPos + 6)
    doc.setFont(CONFIG.fonts.body, 'normal')
    doc.text(formatDate(po.created_at), pageWidth - 14, yPos + 6, { align: 'right' })
    
    doc.setFont(CONFIG.fonts.body, 'bold')
    doc.text('Expected:', rightColX, yPos + 12)
    doc.setFont(CONFIG.fonts.body, 'normal')
    doc.text(po.expected_date ? formatDate(po.expected_date) : 'TBD', pageWidth - 14, yPos + 12, { align: 'right' })

    doc.setFont(CONFIG.fonts.body, 'bold')
    doc.text('Status:', rightColX, yPos + 18)
    doc.setFont(CONFIG.fonts.body, 'normal')
    doc.text(po.status?.toUpperCase(), pageWidth - 14, yPos + 18, { align: 'right' })

    // --- ITEMS TABLE ---
    const tableBody = lines.map(line => [
        line.products?.sku || 'N/A',
        line.products?.name || 'Unknown Item',
        line.quantity_ordered,
        formatCurrency(line.unit_cost),
        formatCurrency(line.quantity_ordered * line.unit_cost)
    ])

    autoTable(doc, {
        startY: yPos + 30,
        head: [['SKU', 'Description', 'Qty', 'Unit Cost', 'Total']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
            fillColor: CONFIG.colors.headerBg,
            textColor: CONFIG.colors.text,
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { cellWidth: 30 },
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right' }
        },
        styles: {
            fontSize: 10,
            cellPadding: 3
        }
    })

    // --- TOTALS ---
    const finalY = (doc as any).lastAutoTable.finalY + 10
    const totalAmount = lines.reduce((sum, line) => sum + (line.quantity_ordered * line.unit_cost), 0)
    
    doc.setFontSize(12)
    doc.setFont(CONFIG.fonts.body, 'bold')
    doc.text('TOTAL:', pageWidth - 60, finalY)
    doc.text(formatCurrency(totalAmount), pageWidth - 14, finalY, { align: 'right' })

    // --- FOOTER ---
    const pageHeight = doc.internal.pageSize.height
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('Authorized Signature: __________________________', 14, pageHeight - 30)
    doc.text(`Generated on ${new Date().toLocaleString()}`, 14, pageHeight - 10)

    // Save
    doc.save(`${po.po_number}.pdf`)
}
