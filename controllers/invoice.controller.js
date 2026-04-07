const db = require("../config/db");
const cloudinary = require("../config/cloudinary");
const { generateInvoicePDF } = require("../utils/invoicePdf");

// ─────────────────────────────────────────────────────────
//  GET /api/invoices — List all invoices
//  Uses the v_invoice_summary view for joined data.
//  Supports: ?status=draft&customer_id=5&search=KSL
// ─────────────────────────────────────────────────────────
exports.getInvoices = (req, res) => {
  const { status, customer_id, search } = req.query;

  let sql = `
    SELECT
      i.id,
      CONCAT(i.invoice_prefix, i.invoice_number) AS full_invoice_no,
      i.invoice_type,
      i.invoice_date,
      i.status,
      c.id AS customer_id,
      c.company_name,
      c.gstin,
      c.contact_no,
      i.place_of_supply,
      i.sbill_no,
      i.sbill_date,
      i.cont_no,
      i.taxable_amount,
      i.cgst_amount,
      i.sgst_amount,
      i.igst_amount,
      i.total_tax,
      i.round_off,
      i.total_amount,
      u.name AS created_by_name,
      i.created_at,
      i.updated_at
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN users u ON u.id = i.created_by
    WHERE 1=1`;
  const values = [];

  if (status) {
    sql += " AND i.status = ?";
    values.push(status);
  }

  if (customer_id) {
    sql += " AND i.customer_id = ?";
    values.push(customer_id);
  }

  if (search) {
    sql += " AND (CONCAT(i.invoice_prefix, i.invoice_number) LIKE ? OR c.company_name LIKE ? OR i.sbill_no LIKE ? OR i.cont_no LIKE ?)";
    const searchPattern = `%${search}%`;
    values.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  sql += " ORDER BY i.created_at DESC";

  db.query(sql, values, (err, results) => {
    if (err) {
      console.error("Fetch invoices error:", err);
      return res.status(500).json({ message: "Failed to fetch invoices" });
    }
    res.json(results);
  });
};

// ─────────────────────────────────────────────────────────
//  GET /api/invoices/:id — Get single invoice with items
// ─────────────────────────────────────────────────────────
exports.getInvoiceById = (req, res) => {
  const invoiceId = parseInt(req.params.id, 10);
  if (isNaN(invoiceId)) {
    return res.status(400).json({ message: "Invalid invoice ID" });
  }

  // Fetch invoice header with customer + creator info
  const headerSql = `
    SELECT
      i.*,
      c.company_name, c.gstin, c.contact_person, c.contact_no,
      c.email AS customer_email, c.registration_type, c.pan,
      c.address_line1, c.address_line2, c.city, c.state, c.pincode,
      u.name AS created_by_name
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN users u ON u.id = i.created_by
    WHERE i.id = ?
  `;

  db.query(headerSql, [invoiceId], (err, headerResults) => {
    if (err) {
      console.error("Fetch invoice error:", err);
      return res.status(500).json({ message: "Failed to fetch invoice" });
    }

    if (headerResults.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Fetch invoice items
    const itemsSql = `
      SELECT * FROM invoice_items
      WHERE invoice_id = ?
      ORDER BY sr_no ASC
    `;

    db.query(itemsSql, [invoiceId], (err, items) => {
      if (err) {
        console.error("Fetch invoice items error:", err);
        return res.status(500).json({ message: "Failed to fetch invoice items" });
      }

      res.json({
        ...headerResults[0],
        items
      });
    });
  });
};

// ─────────────────────────────────────────────────────────
//  POST /api/invoices — Create invoice with items
//  Expects body: { ...headerFields, items: [...] }
// ─────────────────────────────────────────────────────────
exports.createInvoice = (req, res) => {
  const createdBy = req.user.id;

  const {
    customer_id,
    logistic_entry_id,
    invoice_prefix,
    invoice_number,
    invoice_post,
    invoice_type,
    invoice_date,
    place_of_supply,
    ship_to,
    rev_charge,
    shipper,
    bl_no,
    sbill_no,
    sbill_date,
    ref_invoice_no,
    cont_no,
    delivery_mode,
    taxable_amount,
    cgst_amount,
    sgst_amount,
    igst_amount,
    round_off,
    total_amount,
    status,
    remarks,
  } = req.body;

  // Parse items — may arrive as JSON string via multipart/form-data
  let items = req.body.items;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch (e) {
      return res.status(400).json({ message: "Invalid items format — expected JSON array" });
    }
  }

  // Handle e-invoice file upload
  const eInvoiceFile = req.file ? req.file.path : null;
  const eInvoicePublicId = req.file ? req.file.filename : null;

  if (!customer_id || !invoice_number || !invoice_date) {
    return res.status(400).json({ message: "Customer, invoice number and date are required" });
  }

  if (!place_of_supply) {
    return res.status(400).json({ message: "Place of supply is required" });
  }

  const headerSql = `
    INSERT INTO invoices (
      customer_id, created_by, logistic_entry_id,
      invoice_prefix, invoice_number, invoice_post,
      invoice_type, invoice_date,
      place_of_supply, ship_to, rev_charge,
      shipper, bl_no, sbill_no, sbill_date,
      ref_invoice_no, cont_no, delivery_mode,
      e_invoice_file, e_invoice_public_id,
      taxable_amount, cgst_amount, sgst_amount, igst_amount,
      round_off, total_amount, status, remarks
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;

  const headerValues = [
    customer_id,
    createdBy,
    logistic_entry_id || null,
    invoice_prefix || "KSL/25-26/",
    invoice_number,
    invoice_post || null,
    invoice_type || "tax_invoice",
    invoice_date,
    place_of_supply || null,
    ship_to || null,
    rev_charge || 0,
    shipper || null,
    bl_no || null,
    sbill_no || null,
    sbill_date || null,
    ref_invoice_no || null,
    cont_no || null,
    delivery_mode || null,
    eInvoiceFile,
    eInvoicePublicId,
    taxable_amount || 0,
    cgst_amount || 0,
    sgst_amount || 0,
    igst_amount || 0,
    round_off || 0,
    total_amount || 0,
    status || "draft",
    remarks || null
  ];

  db.query(headerSql, headerValues, (err, result) => {
    if (err) {
      console.error("Create invoice error:", err);
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ message: "Invoice number already exists" });
      }
      return res.status(500).json({ message: "Failed to create invoice" });
    }

    const invoiceId = result.insertId;

    // Insert items if provided
    if (items && Array.isArray(items) && items.length > 0) {
      const itemSql = `
        INSERT INTO invoice_items (
          invoice_id, sr_no, product_name, hsn_sac, qty, uom, rate,
          taxable_value, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
          igst_rate, igst_amount, discount, total, item_note
        ) VALUES ?
      `;

      const itemValues = items.map((item, index) => [
        invoiceId,
        item.sr_no || index + 1,
        item.product_name,
        item.hsn_sac || null,
        item.qty || 1,
        item.uom || null,
        item.rate || 0,
        item.taxable_value || 0,
        item.cgst_rate || 0,
        item.cgst_amount || 0,
        item.sgst_rate || 0,
        item.sgst_amount || 0,
        item.igst_rate || 0,
        item.igst_amount || 0,
        item.discount || 0,
        item.total || 0,
        item.item_note || null
      ]);

      db.query(itemSql, [itemValues], (itemErr) => {
        if (itemErr) {
          console.error("Create invoice items error:", itemErr);
          // Invoice was created but items failed — return partial success
          return res.status(207).json({
            message: "Invoice created but some items failed to save",
            invoice_id: invoiceId,
            items_error: itemErr.message
          });
        }

        logAndRespond(createdBy, invoiceId, res);
      });
    } else {
      logAndRespond(createdBy, invoiceId, res);
    }
  });
};

function logAndRespond(userId, invoiceId, res) {
  db.query(
    "INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)",
    [userId, "CREATE_INVOICE", `Created invoice ID ${invoiceId}`],
    () => {}
  );

  res.json({
    message: "Invoice created successfully",
    invoice_id: invoiceId
  });
}

// ─────────────────────────────────────────────────────────
//  PUT /api/invoices/:id — Update invoice header + items
//  Replaces all items (delete old → insert new)
// ─────────────────────────────────────────────────────────
const INVOICE_UPDATEABLE_FIELDS = [
  "customer_id", "logistic_entry_id",
  "invoice_prefix", "invoice_number", "invoice_post",
  "invoice_type", "invoice_date",
  "place_of_supply", "ship_to", "rev_charge",
  "shipper", "bl_no", "sbill_no", "sbill_date",
  "ref_invoice_no", "cont_no", "delivery_mode",
  "e_invoice_file", "e_invoice_public_id",
  "taxable_amount", "cgst_amount", "sgst_amount", "igst_amount",
  "round_off", "total_amount", "status", "remarks"
];

exports.updateInvoice = (req, res) => {
  const invoiceId = parseInt(req.params.id, 10);
  if (isNaN(invoiceId)) {
    return res.status(400).json({ message: "Invalid invoice ID" });
  }
  const userId = req.user.id;

  // Parse items — may arrive as JSON string via multipart/form-data
  let parsedItems = req.body.items;
  if (typeof parsedItems === "string") {
    try {
      parsedItems = JSON.parse(parsedItems);
    } catch (e) {
      return res.status(400).json({ message: "Invalid items format — expected JSON array" });
    }
  }
  const { items: _rawItems, ...bodyFields } = req.body;
  const items = parsedItems;

  // Handle e-invoice file upload
  if (req.file) {
    bodyFields.e_invoice_file = req.file.path;
    bodyFields.e_invoice_public_id = req.file.filename;

    // Delete old e-invoice from Cloudinary
    const getOldSql = "SELECT e_invoice_public_id FROM invoices WHERE id = ?";
    db.query(getOldSql, [invoiceId], (err, results) => {
      if (!err && results.length > 0 && results[0].e_invoice_public_id) {
        cloudinary.uploader.destroy(results[0].e_invoice_public_id, () => {});
      }
    });
  }

  // Filter to allowed fields
  const updates = {};
  Object.keys(bodyFields).forEach((key) => {
    if (INVOICE_UPDATEABLE_FIELDS.includes(key)) {
      updates[key] = bodyFields[key];
    }
  });

  // Update header if there are field changes
  const updateHeader = (callback) => {
    if (Object.keys(updates).length === 0) return callback(null);

    const fields = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
    const values = Object.values(updates);

    db.query(`UPDATE invoices SET ${fields} WHERE id = ?`, [...values, invoiceId], (err, result) => {
      if (err) return callback(err);
      if (result.affectedRows === 0) return callback({ notFound: true });
      callback(null);
    });
  };

  // Replace items if provided
  const replaceItems = (callback) => {
    if (!items || !Array.isArray(items)) return callback(null);

    // Delete old items first (CASCADE would handle on invoice delete, but here we manually replace)
    db.query("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId], (delErr) => {
      if (delErr) return callback(delErr);

      if (items.length === 0) return callback(null);

      const itemSql = `
        INSERT INTO invoice_items (
          invoice_id, sr_no, product_name, hsn_sac, qty, uom, rate,
          taxable_value, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
          igst_rate, igst_amount, discount, total, item_note
        ) VALUES ?
      `;

      const itemValues = items.map((item, index) => [
        invoiceId,
        item.sr_no || index + 1,
        item.product_name,
        item.hsn_sac || null,
        item.qty || 1,
        item.uom || null,
        item.rate || 0,
        item.taxable_value || 0,
        item.cgst_rate || 0,
        item.cgst_amount || 0,
        item.sgst_rate || 0,
        item.sgst_amount || 0,
        item.igst_rate || 0,
        item.igst_amount || 0,
        item.discount || 0,
        item.total || 0,
        item.item_note || null
      ]);

      db.query(itemSql, [itemValues], callback);
    });
  };

  updateHeader((headerErr) => {
    if (headerErr) {
      if (headerErr.notFound) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      console.error("Update invoice error:", headerErr);
      return res.status(500).json({ message: "Failed to update invoice" });
    }

    replaceItems((itemErr) => {
      if (itemErr) {
        console.error("Update invoice items error:", itemErr);
        return res.status(500).json({ message: "Invoice updated but items failed" });
      }

      // Log
      db.query(
        "INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)",
        [userId, "UPDATE_INVOICE", `Updated invoice ID ${invoiceId}`],
        () => {}
      );

      res.json({ message: "Invoice updated successfully" });
    });
  });
};

// ─────────────────────────────────────────────────────────
//  DELETE /api/invoices/:id — Delete invoice (SUPER_ADMIN)
//  Items auto-deleted via ON DELETE CASCADE
// ─────────────────────────────────────────────────────────
exports.deleteInvoice = (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only SUPER_ADMIN can delete invoices" });
  }

  const invoiceId = parseInt(req.params.id, 10);
  if (isNaN(invoiceId)) {
    return res.status(400).json({ message: "Invalid invoice ID" });
  }

  // Get e-invoice file to delete from Cloudinary
  const checkSql = "SELECT id, e_invoice_public_id FROM invoices WHERE id = ?";
  db.query(checkSql, [invoiceId], (err, results) => {
    if (err) {
      console.error("Check invoice error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Delete e-invoice file from Cloudinary if exists
    if (results[0].e_invoice_public_id) {
      cloudinary.uploader.destroy(results[0].e_invoice_public_id, () => {});
    }

    // Delete invoice (items cascade)
    db.query("DELETE FROM invoices WHERE id = ?", [invoiceId], (delErr) => {
      if (delErr) {
        console.error("Delete invoice error:", delErr);
        return res.status(500).json({ message: "Failed to delete invoice" });
      }

      // Log
      db.query(
        "INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)",
        [req.user.id, "DELETE_INVOICE", `Deleted invoice ID ${invoiceId}`],
        () => {}
      );

      res.json({ message: "Invoice deleted successfully" });
    });
  });
};

// ─────────────────────────────────────────────────────────
//  GET /api/invoices/:id/pdf — Download invoice as PDF
//  Optional query param: ?copy=ORIGINAL+COPY
// ─────────────────────────────────────────────────────────
exports.downloadInvoicePdf = async (req, res) => {
  const invoiceId = parseInt(req.params.id, 10);
  if (isNaN(invoiceId)) {
    return res.status(400).json({ message: "Invalid invoice ID" });
  }

  const copyLabel = req.query.copy || "OFFICE COPY";

  // Fetch invoice header + customer data
  const headerSql = `
    SELECT
      i.*,
      c.company_name, c.gstin, c.contact_person, c.contact_no,
      c.email AS customer_email, c.registration_type, c.pan,
      c.address_line1, c.address_line2, c.city, c.state, c.pincode,
      u.name AS created_by_name
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN users u ON u.id = i.created_by
    WHERE i.id = ?
  `;

  db.query(headerSql, [invoiceId], (err, headerResults) => {
    if (err) {
      console.error("PDF fetch invoice error:", err);
      return res.status(500).json({ message: "Failed to fetch invoice" });
    }

    if (headerResults.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const invoice = headerResults[0];

    // Fetch invoice items
    db.query(
      "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sr_no ASC",
      [invoiceId],
      async (itemErr, items) => {
        if (itemErr) {
          console.error("PDF fetch items error:", itemErr);
          return res.status(500).json({ message: "Failed to fetch invoice items" });
        }

        try {
          const pdfBuffer = await generateInvoicePDF(invoice, items, copyLabel);

          const fullInvoiceNo = (invoice.invoice_prefix || "") + (invoice.invoice_number || "");
          const filename = `Invoice_${fullInvoiceNo.replace(/\//g, "_")}.pdf`;

          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
          res.setHeader("Content-Length", pdfBuffer.length);
          res.send(pdfBuffer);
        } catch (pdfErr) {
          console.error("PDF generation error:", pdfErr);
          return res.status(500).json({ message: "Failed to generate PDF" });
        }
      }
    );
  });
};
