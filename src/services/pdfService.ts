import jsPDF from 'jspdf';
import 'jspdf-autotable';

export interface CatalogProduct {
  name: string;
  price: string; // Formatted price string
}

export function generateCatalogPdf(
  products: CatalogProduct[],
  storeName: string,
  whatsappNumber: string,
  logoUrl?: string
) {
  const doc = new jsPDF();
  
  // Add Header
  doc.setFontSize(24);
  doc.setTextColor(31, 41, 55); // Gray 800
  doc.text(storeName, 14, 25);
  
  doc.setFontSize(12);
  doc.setTextColor(107, 114, 128); // Gray 500
  if (whatsappNumber) {
    doc.text(`WhatsApp: ${whatsappNumber}`, 14, 35);
  }
  
  // Add Table
  const tableData = products.map(p => [p.name, p.price]);
  
  (doc as any).autoTable({
    startY: 45,
    head: [['Product Name', 'Price']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] }, // Indigo 600
    styles: { fontSize: 11, cellPadding: 5 },
    alternateRowStyles: { fillColor: [249, 250, 251] }, // Gray 50
  });
  
  doc.save(`${storeName.replace(/\s+/g, '_')}_Catalog.pdf`);
}
