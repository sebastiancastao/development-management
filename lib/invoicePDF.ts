import { Invoice } from '../app/types';

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtCurrency(v: number) {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export async function downloadInvoicePDF(invoice: Invoice) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const total = invoice.items.reduce((s, i) => s + i.amount, 0);
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;

  // ── Header bar ────────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 0, pageW, 72, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text('INVOICE', margin, 46);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${invoice.invoiceNumber}`, margin, 62);

  // Status badge (top-right)
  const statusColors: Record<string, [number, number, number]> = {
    draft:  [148, 163, 184],
    sent:   [147, 197, 253],
    paid:   [110, 231, 183],
  };
  const [sr, sg, sb] = statusColors[invoice.status] ?? [200, 200, 200];
  doc.setFillColor(sr, sg, sb);
  const badgeLabel = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  const badgeW = doc.getTextWidth(badgeLabel) + 16;
  doc.roundedRect(pageW - margin - badgeW, 26, badgeW, 20, 4, 4, 'F');
  doc.text(badgeLabel, pageW - margin - badgeW / 2, 40, { align: 'center' });

  // ── Bill To / Dates block ──────────────────────────────────────────────────
  let y = 100;
  doc.setTextColor(100, 116, 139); // slate-500
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('BILL TO', margin, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(invoice.clientName, margin, y + 14);

  if (invoice.clientEmail) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(invoice.clientEmail, margin, y + 28);
  }

  // Dates column (right-aligned)
  const dateLines: [string, string][] = [];
  if (invoice.billedFrom || invoice.billedTo) {
    const period = [
      invoice.billedFrom ? fmtDate(invoice.billedFrom) : '',
      invoice.billedTo   ? fmtDate(invoice.billedTo)   : '',
    ].filter(Boolean).join(' – ');
    dateLines.push(['Billing Period', period]);
  }
  if (invoice.dueDate) {
    dateLines.push(['Due Date', fmtDate(invoice.dueDate)]);
  }
  dateLines.push(['Issued', fmtDate(invoice.createdAt.split('T')[0] || invoice.createdAt)]);

  const rightCol = pageW - margin;
  let dy = y;
  for (const [label, value] of dateLines) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), rightCol, dy, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(value, rightCol, dy + 12, { align: 'right' });
    dy += 28;
  }

  // ── Line items table ───────────────────────────────────────────────────────
  const tableStartY = Math.max(y + 60, dy + 10);

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margin, right: margin },
    head: [['Description', 'Qty (h)', 'Rate', 'Amount']],
    body: invoice.items.map((item) => [
      item.description,
      item.quantity % 1 === 0 ? String(item.quantity) : item.quantity.toFixed(2),
      fmtCurrency(item.rate),
      fmtCurrency(item.amount),
    ]),
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 60 },
      2: { halign: 'right', cellWidth: 80 },
      3: { halign: 'right', cellWidth: 80 },
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [100, 116, 139],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 10,
      textColor: [15, 23, 42],
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.5,
  });

  // ── Total ──────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTable = (doc as any).lastAutoTable.finalY as number;
  const totalY = afterTable + 16;

  doc.setFillColor(37, 99, 235);
  doc.roundedRect(pageW - margin - 200, totalY - 14, 200, 28, 4, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL', pageW - margin - 100, totalY + 2, { align: 'center' });
  doc.setFontSize(13);
  doc.text(fmtCurrency(total), pageW - margin - 8, totalY + 2, { align: 'right' });

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    const notesY = totalY + 44;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('NOTES', margin, notesY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(invoice.notes, pageW - margin * 2);
    doc.text(lines, margin, notesY + 14);
  }

  doc.save(`${invoice.invoiceNumber}.pdf`);
}
