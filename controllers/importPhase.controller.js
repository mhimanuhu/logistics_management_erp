const db = require("../config/db");
const cloudinary = require("../config/cloudinary");

function checkPrevPhase(jobId, phaseNum, callback) {
  if (phaseNum <= 1) return callback(null, true);
  db.query(`SELECT is_complete FROM import_phase${phaseNum - 1} WHERE job_id = ?`, [jobId], (err, rows) => {
    if (err) return callback(err);
    if (rows.length === 0 || rows[0].is_complete !== 1) return callback(null, false);
    callback(null, true);
  });
}

function getIp(req) {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
}

// container_no & container_size removed — now managed via job_containers table
const IMP1_FIELDS = [
  "shipping_line", "mbl_no", "hbl_no",
  "eta", "port", "tpt_name", "trailer_no", "transporter_name",
  "diesel_adv", "cash_adv", "freight", "remarks"
];

exports.getImportPhase1 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  db.query("SELECT * FROM import_phase1 WHERE job_id = ?", [jobId], (err, rows) => {
    if (err) return res.status(500).json({ message: "Failed to fetch phase 1" });
    if (rows.length === 0) return res.status(404).json({ message: "Phase 1 data not found" });
    res.json(rows[0]);
  });
};

exports.updateImportPhase1 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const updates = {};
  IMP1_FIELDS.forEach(f => {
    if (req.body[f] !== undefined) {
      // Convert empty strings to null so DATE/NUMERIC columns don't reject the value
      updates[f] = req.body[f] === "" ? null : req.body[f];
    }
  });

  // Handle image upload
  if (req.file) {
    updates.image_path = req.file.path;
    updates.cloudinary_public_id = req.file.filename;
    db.query("SELECT cloudinary_public_id FROM import_phase1 WHERE job_id = ?", [jobId], (e, r) => {
      if (!e && r.length > 0 && r[0].cloudinary_public_id) {
        const oldPid = r[0].cloudinary_public_id;
        const opts = oldPid.endsWith(".pdf") ? { resource_type: "raw" } : {};
        cloudinary.uploader.destroy(oldPid, opts, () => { });
      }
    });
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No valid fields" });

  const fields = Object.keys(updates).map(k => `${k} = ?`).join(", ");
  db.query(`UPDATE import_phase1 SET ${fields} WHERE job_id = ?`, [...Object.values(updates), jobId], (err, result) => {
    if (err) {
      console.error("[import_phase1 update error]", err.message);
      return res.status(500).json({ message: "Failed to update phase 1" });
    }
    if (result.affectedRows === 0) return res.status(404).json({ message: "Phase 1 not found" });

    db.query(`INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
      [req.user.id, jobId, "UPDATE", 1, "Updated import phase 1", getIp(req)], () => { });
    res.json({ message: "Phase 1 updated" });
  });
};

exports.completeImportPhase1 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  db.query(`UPDATE import_phase1 SET is_complete = 1, completed_at = NOW() WHERE job_id = ?`, [jobId], (err, result) => {
    if (err) return res.status(500).json({ message: "Failed to complete phase 1" });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Phase 1 not found" });

    db.query(`INSERT IGNORE INTO import_phase2 (job_id) VALUES (?)`, [jobId], () => { });
    db.query(`UPDATE job_entries SET current_phase = 2, status = 'in_progress' WHERE id = ?`, [jobId], () => { });
    db.query(`INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
      [req.user.id, jobId, "PHASE_COMPLETE", 1, "Completed import phase 1", getIp(req)], () => { });
    res.json({ message: "Phase 1 marked complete" });
  });
};

// ── IMPORT PHASE 2 ──
const IMP2_FIELDS = [
  "be_no", "be_date", "cargo_description", "net_weight", "gross_weight",
  "packages", "ooc_date", "scheme_code", "tpt_name", "trailer_no",
  "transporter_name", "diesel_adv", "cash_adv", "freight", "remarks"
];

exports.getImportPhase2 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  checkPrevPhase(jobId, 2, (err, ok) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (!ok) return res.status(403).json({ message: "Previous phase not complete" });

    db.query("SELECT * FROM import_phase2 WHERE job_id = ?", [jobId], (err2, rows) => {
      if (err2) return res.status(500).json({ message: "Failed to fetch phase 2" });
      if (rows.length === 0) return res.status(404).json({ message: "Phase 2 data not found" });
      res.json(rows[0]);
    });
  });
};

exports.updateImportPhase2 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  checkPrevPhase(jobId, 2, (err, ok) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (!ok) return res.status(403).json({ message: "Previous phase not complete" });

    const updates = {};
    IMP2_FIELDS.forEach(f => {
      if (req.body[f] !== undefined) {
        // Convert empty strings to null so DATE/NUMERIC columns don't reject the value
        updates[f] = req.body[f] === "" ? null : req.body[f];
      }
    });

    if (req.file) {
      updates.image_path = req.file.path;
      updates.cloudinary_public_id = req.file.filename;
      db.query("SELECT cloudinary_public_id FROM import_phase2 WHERE job_id = ?", [jobId], (e, r) => {
        if (!e && r.length > 0 && r[0].cloudinary_public_id) {
          const oldPid = r[0].cloudinary_public_id;
          const opts = oldPid.endsWith(".pdf") ? { resource_type: "raw" } : {};
          cloudinary.uploader.destroy(oldPid, opts, () => { });
        }
      });
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No valid fields" });

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(", ");
    db.query(`UPDATE import_phase2 SET ${fields} WHERE job_id = ?`, [...Object.values(updates), jobId], (err2, result) => {
      if (err2) {
        console.error("[import_phase2 update error]", err2.message);
        return res.status(500).json({ message: "Failed to update phase 2" });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Phase 2 not found" });

      db.query(`INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
        [req.user.id, jobId, "UPDATE", 2, "Updated import phase 2", getIp(req)], () => { });
      res.json({ message: "Phase 2 updated" });
    });
  });
};

exports.completeImportPhase2 = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  checkPrevPhase(jobId, 2, (err, ok) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (!ok) return res.status(403).json({ message: "Previous phase not complete" });

    db.query(`UPDATE import_phase2 SET is_complete = 1, completed_at = NOW() WHERE job_id = ?`, [jobId], (err2, result) => {
      if (err2) return res.status(500).json({ message: "Failed to complete phase 2" });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Phase 2 not found" });

      db.query(`UPDATE job_entries SET status = 'completed' WHERE id = ?`, [jobId], () => { });
      db.query(`INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
        [req.user.id, jobId, "PHASE_COMPLETE", 2, "Completed import phase 2 — job complete", getIp(req)], () => { });
      res.json({ message: "Phase 2 marked complete — job completed" });
    });
  });
};

