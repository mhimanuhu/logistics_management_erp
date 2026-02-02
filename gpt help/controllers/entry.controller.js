const db = require("../config/db");
const cloudinary = require("../config/cloudinary");

// Staff editable fields (restricted for USER role)
const STAFF_ALLOWED_FIELDS = [
  "remarks",
  "vehicle_no",
  "status"
];

/**
 * Create Entry Controller
 * Creates a new logistic entry with optional image upload to Cloudinary
 */
exports.createEntry = (req, res) => {
  const userId = req.user.id;

  const {
    date,
    exporter_name,
    invoice_no,
    container_no,
    size,
    line,
    line_seal,
    custom_seal_no,
    sb_no,
    sb_date,
    pod,
    value,
    pkgs,
    transporter,
    vehicle_no,
    shipping_bill_no,
    shipping_bill_date,
    cha,
    gst_no,
    port,
    factory_stuffing,
    seal_charges,
    fumigation_charges_kpc_care,
    empty_survey_report_master_marine,
    transport_charges,
    handling_charges_transport_bill,
    detention_charges,
    handling_charges_nk_yard,
    concor_freight_charges,
    concor_handling_charges,
    gsp_fees,
    gsp_making_charges,
    out_charges_handling,
    labour_charges,
    examination_charges,
    direct_stuffing_charges,
    ksl_invoice,
    remarks
  } = req.body;

  // Get Cloudinary URL if file was uploaded
  const imagePath = req.file ? req.file.path : null; // Cloudinary URL
  const imagePublicId = req.file ? req.file.filename : null; // Cloudinary public_id for deletion

  // Basic validation
  if (!exporter_name || !invoice_no || !container_no || !transporter) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const sql = `
    INSERT INTO logistic_entries (
      user_id, date, exporter_name, invoice_no, container_no, size,
      line, line_seal, custom_seal_no, sb_no, sb_date, pod, value, pkgs,
      transporter, vehicle_no, shipping_bill_no, shipping_bill_date,
      cha, gst_no, port, factory_stuffing, seal_charges,
      fumigation_charges_kpc_care, empty_survey_report_master_marine,
      transport_charges, handling_charges_transport_bill,
      detention_charges, handling_charges_nk_yard,
      concor_freight_charges, concor_handling_charges,
      gsp_fees, image_path, cloudinary_public_id, gsp_making_charges,
      out_charges_handling, labour_charges,
      examination_charges, direct_stuffing_charges,
      ksl_invoice, remarks
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;

  const values = [
    userId,
    date,
    exporter_name,
    invoice_no,
    container_no,
    size,
    line,
    line_seal,
    custom_seal_no,
    sb_no,
    sb_date,
    pod,
    value || 0,
    pkgs || 0,
    transporter,
    vehicle_no,
    shipping_bill_no,
    shipping_bill_date,
    cha,
    gst_no,
    port,
    factory_stuffing,
    seal_charges || 0,
    fumigation_charges_kpc_care || 0,
    empty_survey_report_master_marine || 0,
    transport_charges || 0,
    handling_charges_transport_bill || 0,
    detention_charges || 0,
    handling_charges_nk_yard || 0,
    concor_freight_charges || 0,
    concor_handling_charges || 0,
    gsp_fees || 0,
    imagePath, // Cloudinary URL
    imagePublicId, // Cloudinary public_id
    gsp_making_charges || 0,
    out_charges_handling || 0,
    labour_charges || 0,
    examination_charges || 0,
    direct_stuffing_charges || 0,
    ksl_invoice,
    remarks
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Insert entry error:", err);
      return res.status(500).json({ message: "Failed to create entry" });
    }

    // Insert log
    const logSql = `
      INSERT INTO logs (user_id, entry_id, action, description)
      VALUES (?, ?, ?, ?)
    `;

    db.query(
      logSql,
      [userId, result.insertId, "CREATE", "Entry created"],
      () => {}
    );

    res.json({
      message: "Entry created successfully",
      entry_id: result.insertId,
      image_url: imagePath
    });
  });
};

/**
 * Get Entries Controller
 * Fetches all logistic entries
 * SUPER_ADMIN and DEV_ADMIN see creator info, USER role doesn't
 */
exports.getEntries = (req, res) => {
  let sql = "";
  let values = [];

  if (req.user.role === "SUPER_ADMIN" || req.user.role === "DEV_ADMIN") {
    // Admin/Dev can see staff name
    sql = `
      SELECT 
        le.*,
        u.name AS created_by_name,
        u.email AS created_by_email
      FROM logistic_entries le
      JOIN users u ON le.user_id = u.id
      ORDER BY le.created_at DESC
    `;
  } else {
    // Staff can only see entries, no created_by info
    sql = `
      SELECT *
      FROM logistic_entries
      ORDER BY created_at DESC
    `;
  }

  db.query(sql, values, (err, results) => {
    if (err) {
      console.error("Fetch entries error:", err);
      return res.status(500).json({ message: "Failed to fetch entries" });
    }

    res.json(results);
  });
};

// get entry by id
exports.getEntryById = (req, res) => {
  const entryId = req.params.id;
  let sql = "";
  let values = [entryId];

  if (req.user.role === "SUPER_ADMIN" || req.user.role === "DEV_ADMIN") {
    // Admin / Dev can see who created the entry
    sql = `
      SELECT 
        le.*,
        u.name AS created_by_name,
        u.email AS created_by_email
      FROM logistic_entries le
      JOIN users u ON le.user_id = u.id
      WHERE le.id = ?
    `;
  } else {
    // Staff can only see entry data
    sql = `
      SELECT *
      FROM logistic_entries
      WHERE id = ?
    `;
  }

  db.query(sql, values, (err, results) => {
    if (err) {
      console.error("Fetch entry error:", err);
      return res.status(500).json({ message: "Failed to fetch entry" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    res.json(results[0]);
  });
};




/**
 * Update Entry Controller
 * Updates an existing entry
 * USER role has limited edit permissions (only certain fields)
 * ADMIN roles can edit all fields
 */
exports.updateEntry = (req, res) => {
  const entryId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  let updates = req.body;

  // Handle image update if new file uploaded
  if (req.file) {
    updates.image_path = req.file.path; // New Cloudinary URL
    updates.cloudinary_public_id = req.file.filename; // New public_id
    
    // Get old image public_id to delete from Cloudinary
    const getOldImageSql = "SELECT cloudinary_public_id FROM logistic_entries WHERE id = ?";
    db.query(getOldImageSql, [entryId], (err, results) => {
      if (err) {
        console.error("Get old image error:", err);
      } else if (results.length > 0 && results[0].cloudinary_public_id) {
        // Delete old image from Cloudinary
        cloudinary.uploader.destroy(results[0].cloudinary_public_id, (error, result) => {
          if (error) {
            console.error("Cloudinary delete error:", error);
          }
        });
      }
    });
  }

  if (role === "USER") {
    // Staff limited edit
    const filteredUpdates = {};

    Object.keys(updates).forEach((key) => {
      if (STAFF_ALLOWED_FIELDS.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    updates = filteredUpdates;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  const fields = Object.keys(updates)
    .map((key) => `${key} = ?`)
    .join(", ");

  const values = Object.values(updates);

  const sql = `UPDATE logistic_entries SET ${fields} WHERE id = ?`;

  db.query(sql, [...values, entryId], (err, result) => {
    if (err) {
      console.error("Update entry error:", err);
      return res.status(500).json({ message: "Failed to update entry" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    // Insert log
    const logSql = `
      INSERT INTO logs (user_id, entry_id, action, description)
      VALUES (?, ?, ?, ?)
    `;

    db.query(
      logSql,
      [userId, entryId, "UPDATE", "Entry updated"],
      () => {}
    );

    res.json({ message: "Entry updated successfully" });
  });
};

/**
 * Delete Entry Controller
 * Deletes an entry and its Cloudinary image (SUPER_ADMIN only)
 */
exports.deleteEntry = (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only SUPER_ADMIN can delete entries" });
  }

  const entryId = req.params.id;

  // Check entry exists and get image public_id
  const checkSql = "SELECT id, cloudinary_public_id FROM logistic_entries WHERE id = ?";
  db.query(checkSql, [entryId], (err, results) => {
    if (err) {
      console.error("Check entry error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    const cloudinaryPublicId = results[0].cloudinary_public_id;

    // Delete from Cloudinary if image exists
    if (cloudinaryPublicId) {
      cloudinary.uploader.destroy(cloudinaryPublicId, (error, result) => {
        if (error) {
          console.error("Cloudinary delete error:", error);
        }
      });
    }

    // Delete entry from database
    const deleteSql = "DELETE FROM logistic_entries WHERE id = ?";

    db.query(deleteSql, [entryId], (err) => {
      if (err) {
        console.error("Delete entry error:", err);
        return res.status(500).json({ message: "Failed to delete entry" });
      }

      // Log action
      const logSql = `
        INSERT INTO logs (user_id, entry_id, action, description)
        VALUES (?, ?, ?, ?)
      `;

      db.query(
        logSql,
        [req.user.id, entryId, "DELETE", "Entry deleted"],
        () => {}
      );

      res.json({ message: "Entry deleted successfully" });
    });
  });
};