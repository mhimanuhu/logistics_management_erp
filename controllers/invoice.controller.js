const db = require("../config/db");
const cloudinary = require("../config/cloudinary");
const company = require("../config/company");

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

  db.query(sql, values, (err, invoices) => {
    if (err) {
      console.error("Fetch invoices error:", err);
      return res.status(500).json({ message: "Failed to fetch invoices" });
    }

    if (invoices.length === 0) {
      return res.json([]);
    }

    // Fetch items for all invoices in one query
    const invoiceIds = invoices.map((inv) => inv.id);
    const itemsSql = `
      SELECT * FROM invoice_items
      WHERE invoice_id IN (?)
      ORDER BY invoice_id, sr_no ASC
    `;

    db.query(itemsSql, [invoiceIds], (itemErr, allItems) => {
      if (itemErr) {
        console.error("Fetch invoice items error:", itemErr);
        // Return invoices without items rather than failing
        return res.json(invoices.map((inv) => ({ ...inv, items: [] })));
      }

      // Group items by invoice_id
      const itemsByInvoice = {};
      allItems.forEach((item) => {
        if (!itemsByInvoice[item.invoice_id]) {
          itemsByInvoice[item.invoice_id] = [];
        }
        itemsByInvoice[item.invoice_id].push(item);
      });

      // Attach items to each invoice
      const result = invoices.map((inv) => ({
        ...inv,
        items: itemsByInvoice[inv.id] || [],
      }));

      res.json(result);
    });
  });
};

// ─────────────────────────────────────────────────────────
//  GET /api/invoices/summary/monthly — Total bill amount month-wise
//  Optional: ?year=2026  (defaults to current year)
// ─────────────────────────────────────────────────────────
exports.getMonthlyInvoiceSummary = (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();

  const sql = `
    SELECT
      MONTH(invoice_date)                          AS month_number,
      DATE_FORMAT(invoice_date, '%b %Y')           AS month_label,
      COUNT(*)                                     AS total_invoices,
      COALESCE(SUM(taxable_amount), 0)             AS total_taxable,
      COALESCE(SUM(cgst_amount), 0)                AS total_cgst,
      COALESCE(SUM(sgst_amount), 0)                AS total_sgst,
      COALESCE(SUM(igst_amount), 0)                AS total_igst,
      COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) AS total_tax,
      COALESCE(SUM(total_amount), 0)               AS total_amount
    FROM invoices
    WHERE YEAR(invoice_date) = ?
    GROUP BY MONTH(invoice_date), DATE_FORMAT(invoice_date, '%b %Y')
    ORDER BY month_number ASC
  `;

  db.query(sql, [year], (err, results) => {
    if (err) {
      console.error("Monthly summary error:", err);
      return res.status(500).json({ message: "Failed to fetch monthly summary" });
    }

    // Grand total for the year
    const grandTotal = results.reduce((sum, row) => sum + parseFloat(row.total_amount), 0);
    const grandInvoices = results.reduce((sum, row) => sum + row.total_invoices, 0);

    res.json({
      year,
      grand_total_invoices: grandInvoices,
      grand_total_amount: grandTotal,
      months: results,
    });
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

      // Build computed fields
      const inv = headerResults[0];
      inv.full_invoice_no = (inv.invoice_prefix || "") + (inv.invoice_number || "");

      res.json({
        ...inv,
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

  // Smart upsert items: update existing (by id), insert new (no id), delete removed
  const upsertItems = (callback) => {
    if (!items || !Array.isArray(items)) return callback(null);

    // Fetch existing item IDs for this invoice
    db.query("SELECT id FROM invoice_items WHERE invoice_id = ?", [invoiceId], (fetchErr, existingRows) => {
      if (fetchErr) return callback(fetchErr);

      const existingIds = existingRows.map((r) => r.id);
      const incomingIds = items.filter((item) => item.id).map((item) => item.id);

      // ── 1. Delete items that are no longer in the request ──
      const idsToDelete = existingIds.filter((id) => !incomingIds.includes(id));

      const deleteRemoved = (cb) => {
        if (idsToDelete.length === 0) return cb(null);
        db.query("DELETE FROM invoice_items WHERE id IN (?) AND invoice_id = ?", [idsToDelete, invoiceId], cb);
      };

      // ── 2. Update existing items (have id) ──
      const itemsToUpdate = items.filter((item) => item.id && existingIds.includes(item.id));
      const itemsToInsert = items.filter((item) => !item.id);

      const updateExisting = (cb) => {
        if (itemsToUpdate.length === 0) return cb(null);

        let completed = 0;
        let hasErrored = false;

        itemsToUpdate.forEach((item, index) => {
          const updateSql = `
            UPDATE invoice_items SET
              sr_no = ?, product_name = ?, hsn_sac = ?, qty = ?, uom = ?, rate = ?,
              taxable_value = ?, cgst_rate = ?, cgst_amount = ?, sgst_rate = ?, sgst_amount = ?,
              igst_rate = ?, igst_amount = ?, discount = ?, total = ?, item_note = ?
            WHERE id = ? AND invoice_id = ?
          `;
          const updateValues = [
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
            item.item_note || null,
            item.id,
            invoiceId
          ];

          db.query(updateSql, updateValues, (updateErr) => {
            if (hasErrored) return;
            if (updateErr) {
              hasErrored = true;
              return cb(updateErr);
            }
            completed++;
            if (completed === itemsToUpdate.length) cb(null);
          });
        });
      };

      // ── 3. Insert new items (no id) ──
      const insertNew = (cb) => {
        if (itemsToInsert.length === 0) return cb(null);

        const itemSql = `
          INSERT INTO invoice_items (
            invoice_id, sr_no, product_name, hsn_sac, qty, uom, rate,
            taxable_value, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
            igst_rate, igst_amount, discount, total, item_note
          ) VALUES ?
        `;

        // Calculate sr_no offset for new items based on existing updated items
        const maxExistingSrNo = itemsToUpdate.length;

        const itemValues = itemsToInsert.map((item, index) => [
          invoiceId,
          item.sr_no || maxExistingSrNo + index + 1,
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

        db.query(itemSql, [itemValues], cb);
      };

      // Execute in sequence: delete removed → update existing → insert new
      deleteRemoved((delErr) => {
        if (delErr) return callback(delErr);
        updateExisting((updErr) => {
          if (updErr) return callback(updErr);
          insertNew(callback);
        });
      });
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

    upsertItems((itemErr) => {
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
//  GET /api/invoices/:id/print — Get all dynamic data for bill printing
//  Returns: invoice + customer + items + company info + computed totals
// ─────────────────────────────────────────────────────────
exports.getInvoicePrintData = (req, res) => {
  const invoiceId = parseInt(req.params.id, 10);
  if (isNaN(invoiceId)) {
    return res.status(400).json({ message: "Invalid invoice ID" });
  }

  // Fetch invoice header + full customer data
  const headerSql = `
    SELECT
      i.*,
      c.company_name, c.gstin, c.company_type, c.contact_person, c.contact_no,
      c.email AS customer_email, c.registration_type, c.pan,
      c.address_line1, c.address_line2, c.landmark, c.city, c.state, c.pincode,
      u.name AS created_by_name
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN users u ON u.id = i.created_by
    WHERE i.id = ?
  `;

  db.query(headerSql, [invoiceId], (err, headerResults) => {
    if (err) {
      console.error("Print fetch invoice error:", err);
      return res.status(500).json({ message: "Failed to fetch invoice" });
    }

    if (headerResults.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const inv = headerResults[0];

    // Fetch invoice items
    db.query(
      "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sr_no ASC",
      [invoiceId],
      (itemErr, items) => {
        if (itemErr) {
          console.error("Print fetch items error:", itemErr);
          return res.status(500).json({ message: "Failed to fetch invoice items" });
        }

        // ── Computed fields ──
        const fullInvoiceNo = (inv.invoice_prefix || "") + (inv.invoice_number || "");

        const totalAmount = parseFloat(inv.total_amount) || 0;
        const totalInWords = amountToWords(totalAmount);

        // Customer full address
        const customerAddress = [inv.address_line1, inv.address_line2, inv.landmark,
          [inv.city, inv.state, inv.pincode].filter(Boolean).join(", ")
        ].filter(Boolean).join(", ");

        // Invoice type label
        const invoiceTypeLabels = {
          tax_invoice: "TAX INVOICE",
          bill_of_supply: "BILL OF SUPPLY",
          export_invoice: "EXPORT INVOICE",
        };

        // UPI payment string
        const upiString = `upi://pay?pa=${company.bank_upi_id}&pn=${encodeURIComponent(company.company_name)}&am=${totalAmount}&cu=INR`;

        res.json({
          // ── Invoice header ──
          invoice: {
            id: inv.id,
            full_invoice_no: fullInvoiceNo,
            invoice_prefix: inv.invoice_prefix,
            invoice_number: inv.invoice_number,
            invoice_post: inv.invoice_post,
            invoice_type: inv.invoice_type,
            invoice_type_label: invoiceTypeLabels[inv.invoice_type] || "TAX INVOICE",
            invoice_date: inv.invoice_date,
            place_of_supply: inv.place_of_supply,
            ship_to: inv.ship_to,
            rev_charge: inv.rev_charge,
            shipper: inv.shipper,
            bl_no: inv.bl_no,
            sbill_no: inv.sbill_no,
            sbill_date: inv.sbill_date,
            ref_invoice_no: inv.ref_invoice_no,
            cont_no: inv.cont_no,
            delivery_mode: inv.delivery_mode,
            e_invoice_file: inv.e_invoice_file,
            taxable_amount: inv.taxable_amount,
            cgst_amount: inv.cgst_amount,
            sgst_amount: inv.sgst_amount,
            igst_amount: inv.igst_amount,
            total_tax: inv.total_tax,
            round_off: inv.round_off,
            total_amount: inv.total_amount,
            total_in_words: totalInWords,
            status: inv.status,
            remarks: inv.remarks,
            created_by_name: inv.created_by_name,
            created_at: inv.created_at,
          },

          // ── Customer info ──
          customer: {
            id: inv.customer_id,
            company_name: inv.company_name,
            company_type: inv.company_type,
            gstin: inv.gstin,
            pan: inv.pan,
            contact_person: inv.contact_person,
            contact_no: inv.contact_no,
            email: inv.customer_email,
            registration_type: inv.registration_type,
            address_line1: inv.address_line1,
            address_line2: inv.address_line2,
            landmark: inv.landmark,
            city: inv.city,
            state: inv.state,
            pincode: inv.pincode,
            full_address: customerAddress,
          },

          // ── Line items ──
          items: items,

          // ── Company (your firm) ──
          company: {
            name: company.company_name,
            address_line1: company.address_line1,
            address_line2: company.address_line2,
            city: company.city,
            state: company.state,
            pincode: company.pincode,
            msme_no: company.msme_no,
            gstin: company.gstin,
            phone: company.phone,
            email: company.email,
            website: company.website,
            logo_url: company.logo_url || null,
          },

          // ── Bank details ──
          bank: {
            name: company.bank_name,
            branch: company.bank_branch,
            acc_name: company.bank_acc_name,
            acc_number: company.bank_acc_number,
            ifsc: company.bank_ifsc,
            upi_id: company.bank_upi_id,
            upi_string: upiString,
          },

          // ── Terms & Conditions ──
          terms: company.terms,
        });
      }
    );
  });
};

// ─────────────────────────────────────────────────────────
//  Helper: Convert amount to Indian Rupee words
// ─────────────────────────────────────────────────────────
function amountToWords(amount) {
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
    "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

  function twoDigits(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
  }
  function threeDigits(n) {
    const h = Math.floor(n / 100), rest = n % 100;
    if (h && rest) return ones[h] + " HUNDRED AND " + twoDigits(rest);
    if (h) return ones[h] + " HUNDRED";
    return twoDigits(rest);
  }
  function numberToWords(num) {
    if (num === 0) return "ZERO";
    const parts = [];
    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh = Math.floor(num / 100000); num %= 100000;
    const thousand = Math.floor(num / 1000); num %= 1000;
    if (crore) parts.push(twoDigits(crore) + " CRORE");
    if (lakh) parts.push(twoDigits(lakh) + " LAKH");
    if (thousand) parts.push(twoDigits(thousand) + " THOUSAND");
    if (num) parts.push(threeDigits(num));
    return parts.join(" ");
  }

  const rupees = Math.floor(amount);
  const paisa = Math.round((amount - rupees) * 100);
  let result = numberToWords(rupees) + " RUPEES";
  if (paisa > 0) result += " AND " + numberToWords(paisa) + " PAISA";
  return result + " ONLY";
}

