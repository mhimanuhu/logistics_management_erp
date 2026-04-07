const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const company = require("../config/company");
const { amountToWords } = require("./numberToWords");

// ── Colour palette ────────────────────────────────
const BLUE = "#1a3c8f";
const LIGHT_BLUE = "#dce6f7";
const WHITE = "#ffffff";
const BLACK = "#000000";
const GREY_LINE = "#999999";

// ── Page dimensions (A4) ──────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M_LEFT = 28;
const M_RIGHT = 28;
const M_TOP = 25;
const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT;

// ── Fonts ─────────────────────────────────────────
const FONT_BOLD = "Helvetica-Bold";
const FONT_NORMAL = "Helvetica";

/**
 * Helper: draw a filled rectangle
 */
function drawRect(doc, x, y, w, h, fill, stroke) {
  doc.save();
  if (fill) doc.rect(x, y, w, h).fill(fill);
  if (stroke) doc.rect(x, y, w, h).stroke(stroke);
  doc.restore();
}

/**
 * Helper: draw horizontal line
 */
function hLine(doc, x1, x2, y, color) {
  doc.save().moveTo(x1, y).lineTo(x2, y).strokeColor(color || BLACK).lineWidth(0.5).stroke().restore();
}

/**
 * Helper: draw vertical line
 */
function vLine(doc, x, y1, y2, color) {
  doc.save().moveTo(x, y1).lineTo(x, y2).strokeColor(color || BLACK).lineWidth(0.5).stroke().restore();
}

/**
 * Helper: format date to DD-MMM-YYYY
 */
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(dt.getDate()).padStart(2, "0")}-${months[dt.getMonth()]}-${dt.getFullYear()}`;
}

/**
 * Helper: format currency
 */
function fmtAmt(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Generate a QR code as a data URL buffer (PNG)
 */
async function generateQR(text) {
  try {
    return await QRCode.toBuffer(text, { width: 80, margin: 1 });
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════
//  MAIN: generateInvoicePDF
//  Receives the full invoice object + items array
//  Returns a Promise<Buffer> of the PDF
// ═══════════════════════════════════════════════════
async function generateInvoicePDF(invoice, items, copyLabel = "OFFICE COPY") {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margins: { top: M_TOP, bottom: 20, left: M_LEFT, right: M_RIGHT } });

      const buffers = [];
      doc.on("data", (b) => buffers.push(b));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      let y = M_TOP;

      // ══════════════════════════════════════════════
      //  HEADER: Company name + address + contact
      // ══════════════════════════════════════════════
      const headerH = 90;
      drawRect(doc, M_LEFT, y, CONTENT_W, headerH, LIGHT_BLUE);
      doc.rect(M_LEFT, y, CONTENT_W, headerH).stroke(BLUE);

      // Logo (left side)
      const logoX = M_LEFT + 8;
      const logoY = y + 8;
      if (company.logo_path && fs.existsSync(company.logo_path)) {
        doc.image(company.logo_path, logoX, logoY, { width: 75, height: 75 });
      }

      // Company name (center-left)
      const nameX = M_LEFT + 95;
      doc.font(FONT_BOLD).fontSize(14).fillColor(BLUE);
      doc.text(company.company_name, nameX, y + 8, { width: 250 });

      doc.font(FONT_NORMAL).fontSize(7).fillColor(BLACK);
      doc.text(company.address_line1, nameX, y + 28, { width: 220 });
      doc.text(company.address_line2, nameX, y + 38, { width: 220 });
      doc.text(`${company.city}, ${company.state} - ${company.pincode}`, nameX, y + 48, { width: 220 });
      doc.text(`MSME NO. ${company.msme_no}`, nameX, y + 58, { width: 220 });

      // Contact (right side)
      const rightX = M_LEFT + CONTENT_W - 210;
      doc.font(FONT_BOLD).fontSize(7.5).fillColor(BLACK);
      doc.text(`Name : ${company.company_name}`, rightX, y + 10, { width: 200 });
      doc.text(`Phone : ${company.phone}`, rightX, y + 22, { width: 200 });
      doc.text(`Email : ${company.email}`, rightX, y + 34, { width: 200 });
      doc.text(`Website : ${company.website}`, rightX, y + 46, { width: 200 });

      y += headerH + 2;

      // ══════════════════════════════════════════════
      //  GSTIN BAR:  GSTIN | TAX INVOICE | OFFICE COPY
      // ══════════════════════════════════════════════
      const gstBarH = 20;
      drawRect(doc, M_LEFT, y, CONTENT_W, gstBarH, WHITE);
      doc.rect(M_LEFT, y, CONTENT_W, gstBarH).stroke(BLACK);

      doc.font(FONT_BOLD).fontSize(9).fillColor(BLACK);
      doc.text(`GSTIN : ${company.gstin}`, M_LEFT + 5, y + 5, { width: 200 });

      // Determine invoice type label
      const invoiceTypeLabels = {
        tax_invoice: "TAX INVOICE",
        bill_of_supply: "BILL OF SUPPLY",
        export_invoice: "EXPORT INVOICE",
      };
      const typeLabel = invoiceTypeLabels[invoice.invoice_type] || "TAX INVOICE";

      doc.font(FONT_BOLD).fontSize(12).fillColor(BLUE);
      doc.text(typeLabel, M_LEFT, y + 3, { width: CONTENT_W, align: "center" });

      doc.font(FONT_BOLD).fontSize(8).fillColor(BLACK);
      doc.text(copyLabel, M_LEFT + CONTENT_W - 85, y + 5, { width: 80 });

      y += gstBarH;

      // ══════════════════════════════════════════════
      //  TWO-COLUMN: Customer Detail | Invoice Details
      // ══════════════════════════════════════════════
      const detailH = 120;
      const colW = CONTENT_W / 2;

      doc.rect(M_LEFT, y, CONTENT_W, detailH).stroke(BLACK);
      vLine(doc, M_LEFT + colW, y, y + detailH);

      // ── Left column: Customer Detail ──
      const lx = M_LEFT + 5;
      let ly = y + 3;

      doc.font(FONT_BOLD).fontSize(8).fillColor(BLACK);
      doc.text("Customer Detail", lx, ly, { width: colW - 10, align: "center", underline: true });
      ly += 14;

      const custFields = [
        ["M/S", invoice.company_name || ""],
        ["Address", [invoice.address_line1, invoice.address_line2, [invoice.city, invoice.state, invoice.pincode].filter(Boolean).join(", ")].filter(Boolean).join(", ")],
        ["Phone", invoice.contact_no || ""],
        ["GSTIN", invoice.gstin || ""],
        ["PAN", invoice.pan || ""],
        ["Place of\nSupply", invoice.place_of_supply || ""],
      ];

      doc.font(FONT_NORMAL).fontSize(7);
      for (const [label, value] of custFields) {
        doc.font(FONT_BOLD).text(label, lx, ly, { width: 50 });
        doc.font(FONT_NORMAL).text(String(value), lx + 55, ly, { width: colW - 70 });
        ly += label.includes("\n") ? 18 : 12;
      }

      // ── Right column: Invoice details ──
      const rx = M_LEFT + colW + 5;
      let ry = y + 5;
      const labelW = 70;
      const valW = colW - labelW - 20;
      const valX = rx + labelW + 5;

      const fullInvoiceNo = (invoice.invoice_prefix || company.default_invoice_prefix) + (invoice.invoice_number || "");

      const invFields = [
        ["Invoice No.", fullInvoiceNo, "Invoice Date", fmtDate(invoice.invoice_date)],
        ["S/BILL NO. :", invoice.sbill_no || "", "DATE :", fmtDate(invoice.sbill_date)],
        ["INVOICE NO. :", invoice.ref_invoice_no || ""],
        ["CONT NO. :", invoice.cont_no || ""],
      ];

      doc.fontSize(7.5);
      for (const row of invFields) {
        if (row.length === 4) {
          doc.font(FONT_BOLD).text(row[0], rx, ry, { width: 60 });
          doc.font(FONT_NORMAL).text(row[1], rx + 62, ry, { width: 80 });
          doc.font(FONT_BOLD).text(row[2], rx + 150, ry, { width: 55 });
          doc.font(FONT_NORMAL).text(row[3], rx + 205, ry, { width: 60 });
        } else {
          doc.font(FONT_BOLD).text(row[0], rx, ry, { width: 70 });
          doc.font(FONT_NORMAL).text(row[1], rx + 75, ry, { width: 180 });
        }
        ry += 14;
      }

      // Shipper / Delivery mode
      if (invoice.shipper) {
        doc.font(FONT_BOLD).text("Shipper :", rx, ry, { width: 70 });
        doc.font(FONT_NORMAL).text(invoice.shipper, rx + 75, ry, { width: 180 });
        ry += 14;
      }
      if (invoice.bl_no) {
        doc.font(FONT_BOLD).text("B/L No. :", rx, ry, { width: 70 });
        doc.font(FONT_NORMAL).text(invoice.bl_no, rx + 75, ry, { width: 180 });
        ry += 14;
      }
      if (invoice.delivery_mode) {
        doc.font(FONT_BOLD).text("Delivery :", rx, ry, { width: 70 });
        doc.font(FONT_NORMAL).text(invoice.delivery_mode, rx + 75, ry, { width: 180 });
        ry += 14;
      }

      y += detailH;

      // ══════════════════════════════════════════════
      //  ITEMS TABLE
      // ══════════════════════════════════════════════

      // Determine tax mode: if any item has igst_rate > 0, use IGST; else CGST+SGST
      const useIGST = items.some((i) => parseFloat(i.igst_rate) > 0);

      // Column widths
      const cols = {
        sr: 22,
        name: useIGST ? 130 : 110,
        hsn: 50,
        qty: 35,
        rate: 60,
        taxable: 65,
      };

      let taxCols;
      if (useIGST) {
        taxCols = { igst_pct: 30, igst_amt: 60, total: 65 };
      } else {
        taxCols = { cgst_pct: 30, cgst_amt: 55, sgst_pct: 30, sgst_amt: 55, total: 65 };
      }

      const allColW = cols.sr + cols.name + cols.hsn + cols.qty + cols.rate + cols.taxable +
        Object.values(taxCols).reduce((a, b) => a + b, 0);

      // Scale if needed to fit CONTENT_W
      const scale = CONTENT_W / allColW;
      Object.keys(cols).forEach((k) => (cols[k] = Math.floor(cols[k] * scale)));
      Object.keys(taxCols).forEach((k) => (taxCols[k] = Math.floor(taxCols[k] * scale)));

      // ── Table header ──
      const thH = 28;
      drawRect(doc, M_LEFT, y, CONTENT_W, thH, BLUE);
      doc.font(FONT_BOLD).fontSize(6.5).fillColor(WHITE);

      let cx = M_LEFT;
      const thY = y + 4;

      // Header labels
      const headerLabels = [
        [cols.sr, "Sr.\nNo."],
        [cols.name, "Name of Product / Service"],
        [cols.hsn, "HSN / SAC"],
        [cols.qty, "Qty"],
        [cols.rate, "Rate"],
        [cols.taxable, "Taxable Value"],
      ];

      for (const [w, label] of headerLabels) {
        doc.text(label, cx + 2, thY, { width: w - 4, align: "center" });
        cx += w;
      }

      if (useIGST) {
        // IGST header (merged)
        const igstTotalW = taxCols.igst_pct + taxCols.igst_amt;
        doc.text("IGST", cx + 2, thY, { width: igstTotalW - 4, align: "center" });
        // Sub-headers
        doc.fontSize(5.5);
        doc.text("%", cx + 2, thY + 14, { width: taxCols.igst_pct - 4, align: "center" });
        doc.text("Amount", cx + taxCols.igst_pct + 2, thY + 14, { width: taxCols.igst_amt - 4, align: "center" });
        cx += igstTotalW;
      } else {
        // CGST header
        const cgstTotalW = taxCols.cgst_pct + taxCols.cgst_amt;
        doc.text("CGST", cx + 2, thY, { width: cgstTotalW - 4, align: "center" });
        doc.fontSize(5.5);
        doc.text("%", cx + 2, thY + 14, { width: taxCols.cgst_pct - 4, align: "center" });
        doc.text("Amount", cx + taxCols.cgst_pct + 2, thY + 14, { width: taxCols.cgst_amt - 4, align: "center" });
        cx += cgstTotalW;

        // SGST header
        const sgstTotalW = taxCols.sgst_pct + taxCols.sgst_amt;
        doc.fontSize(6.5);
        doc.text("SGST", cx + 2, thY, { width: sgstTotalW - 4, align: "center" });
        doc.fontSize(5.5);
        doc.text("%", cx + 2, thY + 14, { width: taxCols.sgst_pct - 4, align: "center" });
        doc.text("Amount", cx + taxCols.sgst_pct + 2, thY + 14, { width: taxCols.sgst_amt - 4, align: "center" });
        cx += sgstTotalW;
      }

      doc.fontSize(6.5);
      doc.text("Total", cx + 2, thY, { width: taxCols.total - 4, align: "center" });

      y += thH;

      // ── Table rows ──
      const rowH = 16;
      const minItemRows = 10; // minimum rows to fill
      const totalRows = Math.max(items.length, minItemRows);

      let totalQty = 0;
      let totalTaxable = 0;
      let totalCgst = 0;
      let totalSgst = 0;
      let totalIgst = 0;
      let grandTotal = 0;

      for (let i = 0; i < totalRows; i++) {
        const item = items[i] || null;
        const rowY = y;

        // Alternating background
        if (i % 2 === 0) drawRect(doc, M_LEFT, rowY, CONTENT_W, rowH, "#f9f9f9");

        doc.font(FONT_NORMAL).fontSize(6.5).fillColor(BLACK);
        cx = M_LEFT;

        if (item) {
          const qty = parseFloat(item.qty) || 0;
          const rate = parseFloat(item.rate) || 0;
          const taxableVal = parseFloat(item.taxable_value) || 0;
          const cgstR = parseFloat(item.cgst_rate) || 0;
          const cgstA = parseFloat(item.cgst_amount) || 0;
          const sgstR = parseFloat(item.sgst_rate) || 0;
          const sgstA = parseFloat(item.sgst_amount) || 0;
          const igstR = parseFloat(item.igst_rate) || 0;
          const igstA = parseFloat(item.igst_amount) || 0;
          const total = parseFloat(item.total) || 0;

          totalQty += qty;
          totalTaxable += taxableVal;
          totalCgst += cgstA;
          totalSgst += sgstA;
          totalIgst += igstA;
          grandTotal += total;

          // Columns
          doc.text(String(item.sr_no || i + 1), cx + 2, rowY + 4, { width: cols.sr - 4, align: "center" });
          cx += cols.sr;
          doc.font(FONT_BOLD).text(item.product_name || "", cx + 2, rowY + 4, { width: cols.name - 4 });
          doc.font(FONT_NORMAL);
          cx += cols.name;
          doc.text(item.hsn_sac || "", cx + 2, rowY + 4, { width: cols.hsn - 4, align: "center" });
          cx += cols.hsn;
          doc.text(fmtAmt(qty), cx + 2, rowY + 4, { width: cols.qty - 4, align: "right" });
          cx += cols.qty;
          doc.text(fmtAmt(rate), cx + 2, rowY + 4, { width: cols.rate - 4, align: "right" });
          cx += cols.rate;
          doc.text(fmtAmt(taxableVal), cx + 2, rowY + 4, { width: cols.taxable - 4, align: "right" });
          cx += cols.taxable;

          if (useIGST) {
            doc.text(igstR.toFixed(2), cx + 2, rowY + 4, { width: taxCols.igst_pct - 4, align: "center" });
            cx += taxCols.igst_pct;
            doc.text(fmtAmt(igstA), cx + 2, rowY + 4, { width: taxCols.igst_amt - 4, align: "right" });
            cx += taxCols.igst_amt;
          } else {
            doc.text(cgstR.toFixed(2), cx + 2, rowY + 4, { width: taxCols.cgst_pct - 4, align: "center" });
            cx += taxCols.cgst_pct;
            doc.text(fmtAmt(cgstA), cx + 2, rowY + 4, { width: taxCols.cgst_amt - 4, align: "right" });
            cx += taxCols.cgst_amt;
            doc.text(sgstR.toFixed(2), cx + 2, rowY + 4, { width: taxCols.sgst_pct - 4, align: "center" });
            cx += taxCols.sgst_pct;
            doc.text(fmtAmt(sgstA), cx + 2, rowY + 4, { width: taxCols.sgst_amt - 4, align: "right" });
            cx += taxCols.sgst_amt;
          }

          doc.text(fmtAmt(total), cx + 2, rowY + 4, { width: taxCols.total - 4, align: "right" });
        }

        // Row border
        hLine(doc, M_LEFT, M_LEFT + CONTENT_W, rowY + rowH, "#cccccc");
        y += rowH;
      }

      // ── Totals row ──
      const totRowH = 18;
      drawRect(doc, M_LEFT, y, CONTENT_W, totRowH, LIGHT_BLUE);
      doc.rect(M_LEFT, y, CONTENT_W, totRowH).stroke(BLACK);

      doc.font(FONT_BOLD).fontSize(7).fillColor(BLACK);
      cx = M_LEFT;
      cx += cols.sr + cols.name + cols.hsn;

      doc.text("Total", cx - cols.hsn + 2, y + 5, { width: cols.hsn - 4, align: "right" });
      doc.text(fmtAmt(totalQty), cx + 2, y + 5, { width: cols.qty - 4, align: "right" });
      cx += cols.qty + cols.rate;
      doc.text(fmtAmt(totalTaxable), cx + 2, y + 5, { width: cols.taxable - 4, align: "right" });
      cx += cols.taxable;

      if (useIGST) {
        cx += taxCols.igst_pct;
        doc.text(fmtAmt(totalIgst), cx + 2, y + 5, { width: taxCols.igst_amt - 4, align: "right" });
        cx += taxCols.igst_amt;
      } else {
        cx += taxCols.cgst_pct;
        doc.text(fmtAmt(totalCgst), cx + 2, y + 5, { width: taxCols.cgst_amt - 4, align: "right" });
        cx += taxCols.cgst_amt + taxCols.sgst_pct;
        doc.text(fmtAmt(totalSgst), cx + 2, y + 5, { width: taxCols.sgst_amt - 4, align: "right" });
        cx += taxCols.sgst_amt;
      }

      doc.text(fmtAmt(grandTotal), cx + 2, y + 5, { width: taxCols.total - 4, align: "right" });
      y += totRowH;

      // ══════════════════════════════════════════════
      //  BOTTOM SECTION: Words | Tax Summary | Bank
      // ══════════════════════════════════════════════
      const bottomH = 130;
      const leftColW = CONTENT_W * 0.55;
      const rightColW = CONTENT_W - leftColW;

      doc.rect(M_LEFT, y, CONTENT_W, bottomH).stroke(BLACK);
      vLine(doc, M_LEFT + leftColW, y, y + bottomH);

      // ── Left: Total in Words ──
      let bly = y + 5;
      doc.font(FONT_BOLD).fontSize(7).fillColor(BLACK);
      doc.text("Total in words", M_LEFT + 5, bly, { width: leftColW - 10, align: "center", underline: true });
      bly += 12;
      const totalAmount = parseFloat(invoice.total_amount) || grandTotal;
      doc.font(FONT_NORMAL).fontSize(6.5);
      doc.text(amountToWords(totalAmount), M_LEFT + 5, bly, { width: leftColW - 10, align: "center" });

      // ── Left: Bank Details ──
      bly += 24;
      hLine(doc, M_LEFT, M_LEFT + leftColW, bly - 4);
      doc.font(FONT_BOLD).fontSize(7);
      doc.text("Bank Details", M_LEFT + 5, bly, { width: leftColW - 10, align: "center", underline: true });
      bly += 12;

      const bankFields = [
        ["Name", company.bank_name],
        ["Branch", company.bank_branch],
        ["Acc. Name", company.bank_acc_name],
        ["Acc. Number", company.bank_acc_number],
        ["IFSC", company.bank_ifsc],
        ["UPI ID", company.bank_upi_id],
      ];

      doc.fontSize(6.5);
      for (const [label, value] of bankFields) {
        doc.font(FONT_BOLD).text(label, M_LEFT + 10, bly, { width: 55, continued: false });
        doc.font(FONT_NORMAL).text(value, M_LEFT + 70, bly, { width: leftColW - 80 });
        bly += 10;
      }

      // ── Right: Tax summary ──
      const rStartX = M_LEFT + leftColW + 5;
      const rValX = M_LEFT + CONTENT_W - 75;
      let bry = y + 5;

      const taxableAmt = parseFloat(invoice.taxable_amount) || totalTaxable;
      const cgstAmt = parseFloat(invoice.cgst_amount) || totalCgst;
      const sgstAmt = parseFloat(invoice.sgst_amount) || totalSgst;
      const igstAmt = parseFloat(invoice.igst_amount) || totalIgst;
      const totalTaxAmt = cgstAmt + sgstAmt + igstAmt;
      const roundOff = parseFloat(invoice.round_off) || 0;

      doc.font(FONT_BOLD).fontSize(7);

      const taxSummary = [
        ["Taxable Amount", fmtAmt(taxableAmt)],
      ];
      if (useIGST) {
        taxSummary.push(["Add : IGST", fmtAmt(igstAmt)]);
      } else {
        taxSummary.push(["Add : CGST", fmtAmt(cgstAmt)]);
        taxSummary.push(["Add : SGST", fmtAmt(sgstAmt)]);
      }
      taxSummary.push(["Total Tax", fmtAmt(totalTaxAmt)]);
      taxSummary.push(["Round off Amount", fmtAmt(roundOff)]);

      for (const [label, value] of taxSummary) {
        doc.font(FONT_BOLD).text(label, rStartX, bry, { width: 80 });
        doc.font(FONT_NORMAL).text(value, rValX, bry, { width: 65, align: "right" });
        bry += 12;
      }

      // Final total
      hLine(doc, M_LEFT + leftColW, M_LEFT + CONTENT_W, bry);
      bry += 4;
      doc.font(FONT_BOLD).fontSize(9).fillColor(BLUE);
      doc.text("Total Amount After Tax", rStartX, bry, { width: 100 });
      doc.text(`₹${fmtAmt(totalAmount)}`, rValX - 10, bry, { width: 75, align: "right" });
      bry += 14;
      doc.font(FONT_NORMAL).fontSize(6).fillColor(BLACK);
      doc.text("(E & O.E.)", rStartX, bry, { width: rightColW - 10, align: "right" });

      y += bottomH;

      // ══════════════════════════════════════════════
      //  FOOTER: T&C, QR, Signatures
      // ══════════════════════════════════════════════
      const footerH = 85;
      doc.rect(M_LEFT, y, CONTENT_W, footerH).stroke(BLACK);
      vLine(doc, M_LEFT + leftColW, y, y + footerH);

      // ── Left: Terms & Conditions ──
      let fy = y + 3;
      doc.font(FONT_BOLD).fontSize(6).fillColor(BLACK);
      doc.text("Certified that the particulars given above are true and correct.", M_LEFT + 5, fy, { width: leftColW - 10 });
      fy += 10;

      doc.font(FONT_BOLD).fontSize(7).fillColor(BLACK);
      doc.text("Terms and Conditions", M_LEFT + 5, fy, { width: leftColW - 10, underline: true });
      fy += 10;

      doc.font(FONT_NORMAL).fontSize(5.5);
      company.terms.forEach((t, i) => {
        doc.text(`${i + 1}. ${t}`, M_LEFT + 5, fy, { width: leftColW - 15 });
        fy += 8;
      });
      doc.text(company.msme_no, M_LEFT + 5, fy, { width: leftColW - 15 });

      // ── Right: QR Code + Signature ──
      const qrX = M_LEFT + leftColW + 10;
      const sigX = M_LEFT + leftColW + 5;

      // QR code (Pay using UPI)
      const upiString = `upi://pay?pa=${company.bank_upi_id}&pn=${encodeURIComponent(company.company_name)}&am=${totalAmount}&cu=INR`;
      const qrBuffer = await generateQR(upiString);

      if (qrBuffer) {
        doc.image(qrBuffer, qrX, y + 5, { width: 55, height: 55 });
        doc.font(FONT_NORMAL).fontSize(5).text("Pay using UPI", qrX - 2, y + 62, { width: 60, align: "center" });
      }

      // Signature area
      doc.font(FONT_BOLD).fontSize(7).fillColor(BLACK);
      doc.text(`For ${company.company_name}`, sigX + 80, y + 15, { width: rightColW - 95, align: "center" });
      doc.font(FONT_NORMAL).fontSize(6);
      doc.text("Authorised Signatory", sigX + 80, y + footerH - 15, { width: rightColW - 95, align: "center" });

      // ── Finalize ──
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateInvoicePDF };
