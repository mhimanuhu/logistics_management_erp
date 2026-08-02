const db = require("../config/db");
const cloudinary = require("../config/cloudinary");

/**
 * Phase gate check — returns true if previous phase is complete
 */
function checkPrevPhase(jobType, jobId, phaseNum, callback) {
  if (phaseNum <= 1) return callback(null, true);
  const prevTable = `${jobType}_phase${phaseNum - 1}`;
  db.query(`SELECT is_complete FROM ${prevTable} WHERE job_id = ?`, [jobId], (err, rows) => {
    if (err) return callback(err);
    if (rows.length === 0 || rows[0].is_complete !== 1) return callback(null, false);
    callback(null, true);
  });
}

function getIp(req) {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
}

// ── EXPORT PHASE 1 ──
// container_no & container_size removed — now managed via job_containers table
const EXP1_FIELDS = [
  "clearing_location", "booking_line", "booking_no", "forwarder",
  "line_no", "custom_seal_rfid", "pol", "pod", "fpod", "vessel_name", "etd",
  "container_pickup_loc", "scheme_code", "remarks"
];

exports.getExportPhase1 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  db.query("SELECT * FROM export_phase1 WHERE job_id = ?", [jobId], (err, rows) => {
    if (err) {
      console.error("[export_phase1 get error]", err.message);
      return res.status(500).json({ message: "Failed to fetch phase 1" });
    }
    if (rows.length === 0) return res.status(404).json({ message: "Phase 1 data not found" });
    res.json(rows[0]);
  });
};

exports.updateExportPhase1 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const updates = {};
  EXP1_FIELDS.forEach(f => {
    if (req.body[f] !== undefined) {
      // Convert empty strings to null so DATE/NUMERIC columns don't reject the value
      updates[f] = req.body[f] === "" ? null : req.body[f];
    }
  });
  // If no fields provided, fall back to touching updated_at so the request still succeeds
  if (Object.keys(updates).length === 0) {
    updates.updated_at = new Date();
  }

  const fields = Object.keys(updates).map(k => `${k} = ?`).join(", ");
  db.query(`UPDATE export_phase1 SET ${fields} WHERE job_id = ?`, [...Object.values(updates), jobId], (err, result) => {
    if (err) {
      console.error("[export_phase1 update error]", err.message);
      return res.status(500).json({ message: "Failed to update phase 1" });
    }
    if (result.affectedRows === 0) return res.status(404).json({ message: "Phase 1 not found" });

    db.query(`INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
      [req.user.id, jobId, "UPDATE", 1, "Updated export phase 1", getIp(req)], () => {});
    res.json({ message: "Phase 1 updated" });
  });
};

exports.completeExportPhase1 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  db.query(`UPDATE export_phase1 SET is_complete = 1, completed_at = NOW() WHERE job_id = ?`, [jobId], (err, result) => {
    if (err) {
      console.error("[export_phase1 complete error]", err.message);
      return res.status(500).json({ message: "Failed to complete phase 1" });
    }
    if (result.affectedRows === 0) return res.status(404).json({ message: "Phase 1 not found" });

    // Insert empty phase 2 row if not exists, advance current_phase
    db.query(`INSERT IGNORE INTO export_phase2 (job_id) VALUES (?)`, [jobId], () => {});
    db.query(`UPDATE job_entries SET current_phase = 2, status = 'in_progress' WHERE id = ?`, [jobId], () => {});
    const userId = req.user && req.user.id ? req.user.id : null;
    db.query(`INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
      [userId, jobId, "PHASE_COMPLETE", 1, "Completed export phase 1", getIp(req)], () => {});
    res.json({ message: "Phase 1 marked complete" });
  });
};

// ── EXPORT PHASE 2 ──
const EXP2_FIELDS = ["trailer_no", "transporter_name", "diesel_adv", "cash_adv", "freight", "remarks"];

exports.getExportPhase2 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  checkPrevPhase("export", jobId, 2, (err, ok) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (!ok) return res.status(403).json({ message: "Previous phase not complete" });

    db.query("SELECT * FROM export_phase2 WHERE job_id = ?", [jobId], (err2, rows) => {
      if (err2) {
        console.error("[export_phase2 get error]", err2.message);
        return res.status(500).json({ message: "Failed to fetch phase 2" });
      }
      if (rows.length === 0) return res.status(404).json({ message: "Phase 2 data not found" });
      res.json(rows[0]);
    });
  });
};

exports.updateExportPhase2 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  checkPrevPhase("export", jobId, 2, (err, ok) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (!ok) return res.status(403).json({ message: "Previous phase not complete" });

    const updates = {};
    EXP2_FIELDS.forEach(f => {
      if (req.body[f] !== undefined) {
        // Convert empty strings to null so DATE/NUMERIC columns don't reject the value
        updates[f] = req.body[f] === "" ? null : req.body[f];
      }
    });
    // If no fields provided, fall back to touching updated_at so the request still succeeds
    if (Object.keys(updates).length === 0) {
      updates.updated_at = new Date();
    }

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(", ");
    db.query(`UPDATE export_phase2 SET ${fields} WHERE job_id = ?`, [...Object.values(updates), jobId], (err2, result) => {
      if (err2) {
        console.error("[export_phase2 update error]", err2.message);
        return res.status(500).json({ message: "Failed to update phase 2" });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Phase 2 not found" });

      db.query(`INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
        [req.user.id, jobId, "UPDATE", 2, "Updated export phase 2", getIp(req)], () => {});
      res.json({ message: "Phase 2 updated" });
    });
  });
};

exports.completeExportPhase2 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  checkPrevPhase("export", jobId, 2, (err, ok) => {
    if (err) {
      console.error("[export_phase2 prevPhase check error]", err.message);
      return res.status(500).json({ message: "Server error" });
    }
    if (!ok) return res.status(403).json({ message: "Previous phase not complete" });

    db.query(`UPDATE export_phase2 SET is_complete = 1, completed_at = NOW() WHERE job_id = ?`, [jobId], (err2, result) => {
      if (err2) {
        console.error("[export_phase2 complete error]", err2.message);
        return res.status(500).json({ message: "Failed to complete phase 2" });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Phase 2 not found" });

      db.query(`INSERT IGNORE INTO export_phase3 (job_id) VALUES (?)`, [jobId], () => {});
      db.query(`UPDATE job_entries SET current_phase = 3, status = 'in_progress' WHERE id = ?`, [jobId], () => {});
      const userId = req.user && req.user.id ? req.user.id : null;
      db.query(`INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
        [userId, jobId, "PHASE_COMPLETE", 2, "Completed export phase 2", getIp(req)], () => {});
      res.json({ message: "Phase 2 marked complete" });
    });
  });
};

// ── EXPORT PHASE 3 ──
const EXP3_FIELDS = [
  "invoice_no", "invoice_date", "cargo_description", "currency", "value", "total_packets",
  "net_weight", "gross_weight", "shipping_bill_no", "shipping_bill_date",
  "leo_date", "line_handover_date", "port_handover_date", "remarks"
];

exports.getExportPhase3 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  checkPrevPhase("export", jobId, 3, (err, ok) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (!ok) return res.status(403).json({ message: "Previous phase not complete" });

    db.query("SELECT * FROM export_phase3 WHERE job_id = ?", [jobId], (err2, rows) => {
      if (err2) {
        console.error("[export_phase3 get error]", err2.message);
        return res.status(500).json({ message: "Failed to fetch phase 3" });
      }
      if (rows.length === 0) return res.status(404).json({ message: "Phase 3 data not found" });
      res.json(rows[0]);
    });
  });
};

exports.updateExportPhase3 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  checkPrevPhase("export", jobId, 3, (err, ok) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (!ok) return res.status(403).json({ message: "Previous phase not complete" });

    const updates = {};
    EXP3_FIELDS.forEach(f => {
      if (req.body[f] !== undefined) {
        // Convert empty strings to null so DATE/NUMERIC columns don't reject the value
        updates[f] = req.body[f] === "" ? null : req.body[f];
      }
    });

    // Handle image upload
    if (req.file) {
      updates.image_path = req.file.path;
      updates.cloudinary_public_id = req.file.filename;

      // Delete old image
      db.query("SELECT cloudinary_public_id FROM export_phase3 WHERE job_id = ?", [jobId], (e, r) => {
        if (!e && r.length > 0 && r[0].cloudinary_public_id) {
          const oldPid = r[0].cloudinary_public_id;
          const opts = oldPid.endsWith(".pdf") ? { resource_type: "raw" } : {};
          cloudinary.uploader.destroy(oldPid, opts, () => {});
        }
      });
    }

    // If no fields provided, fall back to touching updated_at so the request still succeeds
    if (Object.keys(updates).length === 0) {
      updates.updated_at = new Date();
    }

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(", ");
    db.query(`UPDATE export_phase3 SET ${fields} WHERE job_id = ?`, [...Object.values(updates), jobId], (err2, result) => {
      if (err2) {
        console.error("[export_phase3 update error]", err2.message);
        return res.status(500).json({ message: "Failed to update phase 3" });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Phase 3 not found" });

      db.query(`INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
        [req.user.id, jobId, "UPDATE", 3, "Updated export phase 3", getIp(req)], () => {});
      res.json({ message: "Phase 3 updated" });
    });
  });
};

exports.completeExportPhase3 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  checkPrevPhase("export", jobId, 3, (err, ok) => {
    if (err) {
      console.error("[export_phase3 prevPhase check error]", err.message);
      return res.status(500).json({ message: "Server error" });
    }
    if (!ok) return res.status(403).json({ message: "Previous phase not complete" });

    db.query(`UPDATE export_phase3 SET is_complete = 1, completed_at = NOW() WHERE job_id = ?`, [jobId], (err2, result) => {
      if (err2) {
        console.error("[export_phase3 complete error]", err2.message);
        return res.status(500).json({ message: "Failed to complete phase 3" });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Phase 3 not found" });

      db.query(`UPDATE job_entries SET status = 'completed' WHERE id = ?`, [jobId], () => {});
      const userId = req.user && req.user.id ? req.user.id : null;
      db.query(`INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
        [userId, jobId, "PHASE_COMPLETE", 3, "Completed export phase 3 — job complete", getIp(req)], () => {});
      res.json({ message: "Phase 3 marked complete — job completed" });
    });
  });
};
