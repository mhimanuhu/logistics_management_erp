const db = require("../config/db");

const CHARGE_FIELDS = [
  "seal_charges", "fumigation_charges", "empty_survey_report",
  "transport_charges", "handling_charges_transport_bill", "detention_charges",
  "handling_charges_nk_yard", "concor_freight_charges", "concor_handling_charges",
  "gsp_fees", "gsp_making_charges", "out_charges_handling", "labour_charges",
  "examination_charges", "direct_stuffing_charges",
  "other_charges_1_desc", "other_charges_1_amount",
  "other_charges_2_desc", "other_charges_2_amount"
];

// ── GET /api/jobs/:id/charges ──
exports.getCharges = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });

  db.query("SELECT * FROM job_charges WHERE job_id = ?", [jobId], (err, rows) => {
    if (err) {
      console.error("Fetch charges error:", err);
      return res.status(500).json({ message: "Failed to fetch charges" });
    }
    if (rows.length === 0) return res.status(404).json({ message: "Charges not found" });
    res.json(rows[0]);
  });
};

// ── PUT /api/jobs/:id/charges ──
exports.updateCharges = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });

  const updates = {};
  CHARGE_FIELDS.forEach(f => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  const fields = Object.keys(updates).map(k => `${k} = ?`).join(", ");
  const values = Object.values(updates);

  db.query(`UPDATE job_charges SET ${fields} WHERE job_id = ?`, [...values, jobId], (err, result) => {
    if (err) {
      console.error("Update charges error:", err);
      return res.status(500).json({ message: "Failed to update charges" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Charges not found for this job" });
    }

    // Log
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
    db.query(
      `INSERT INTO logs (user_id, job_id, action, description, ip_address) VALUES (?,?,?,?,?)`,
      [req.user.id, jobId, "UPDATE", `Updated charges for job ${jobId}`, ip],
      () => {}
    );

    res.json({ message: "Charges updated successfully" });
  });
};
