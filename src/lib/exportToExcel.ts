import ExcelJS from 'exceljs'

export async function exportToExcel(filename: string, columns: { header: string, key: string, width?: number }[], data: any[]) {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Sheet1')

    // Set Columns
    worksheet.columns = columns.map(col => ({
        header: col.header,
        key: col.key,
        width: col.width || 20
    }))

    // Add Data
    worksheet.addRows(data)

    // Style Header Row
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    }

    // Write Buffer
    const buffer = await workbook.xlsx.writeBuffer()
    
    // Trigger Download
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${filename}.xlsx`
    anchor.click()
    window.URL.revokeObjectURL(url)
}
