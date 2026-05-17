const db = require("../config/db");

/**
 * Generate job_no in format EXP/25-26/0001 or IMP/25-26/0001
 */
function generateJobNo(jobType, callback) {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
  const prefix = jobType === "export" ? "EXP" : "IMP";

  const sql = `SELECT COUNT(*) AS cnt FROM job_entries WHERE job_type = ? AND job_no LIKE ?`;
  db.query(sql, [jobType, `${prefix}/${fy}/%`], (err, rows) => {
    if (err) return callback(err);
    const seq = String((rows[0].cnt || 0) + 1).padStart(4, "0");
    callback(null, `${prefix}/${fy}/${seq}`);
  });
}

// ── POST /api/jobs ──
exports.createJob = (req, res) => {
  const { job_type, customer_id, assigned_to, remarks } = req.body;
  const created_by = req.user.id;

  if (!job_type || !["export", "import"].includes(job_type)) {
    return res.status(400).json({ message: "job_type must be 'export' or 'import'" });
  }

  generateJobNo(job_type, (err, job_no) => {
    if (err) {
      console.error("Generate job_no error:", err);
      return res.status(500).json({ message: "Failed to generate job number" });
    }

    const sql = `INSERT INTO job_entries (job_type, job_no, customer_id, created_by, assigned_to, remarks, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'draft')`;
    const vals = [job_type, job_no, customer_id || null, created_by, assigned_to || null, remarks || null];

    db.query(sql, vals, (err2, result) => {
      if (err2) {
        console.error("Create job error:", err2);
        return res.status(500).json({ message: "Failed to create job" });
      }

      const jobId = result.insertId;
      const phase1Table = job_type === "export" ? "export_phase1" : "import_phase1";

      // Insert empty phase 1 row
      db.query(`INSERT INTO ${phase1Table} (job_id) VALUES (?)`, [jobId], (err3) => {
        if (err3) console.error("Insert phase1 error:", err3);

        // Insert empty charges row
        db.query(`INSERT INTO job_charges (job_id) VALUES (?)`, [jobId], (err4) => {
          if (err4) console.error("Insert charges error:", err4);

          // Log action
          const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
          db.query(
            `INSERT INTO logs (user_id, job_id, action, phase, description, ip_address) VALUES (?,?,?,?,?,?)`,
            [created_by, jobId, "CREATE", 1, `Created ${job_type} job ${job_no}`, ip],
            () => {}
          );

          res.json({ message: "Job created successfully", job_id: jobId, job_no });
        });
      });
    });
  });
};

// ── GET /api/jobs ──
exports.getJobs = (req, res) => {
  const { job_type, status, search } = req.query;

  let sql = `SELECT j.*, c.company_name AS customer_name, u.name AS created_by_name,
                    a.name AS assigned_to_name
             FROM job_entries j
             LEFT JOIN customers c ON c.id = j.customer_id
             LEFT JOIN users u ON u.id = j.created_by
             LEFT JOIN users a ON a.id = j.assigned_to
             WHERE 1=1`;
  const vals = [];

  if (job_type) { sql += " AND j.job_type = ?"; vals.push(job_type); }
  if (status) { sql += " AND j.status = ?"; vals.push(status); }
  if (search) {
    sql += " AND (j.job_no LIKE ? OR c.company_name LIKE ?)";
    vals.push(`%${search}%`, `%${search}%`);
  }
  sql += " ORDER BY j.created_at DESC";

  db.query(sql, vals, (err, results) => {
    if (err) {
      console.error("Fetch jobs error:", err);
      return res.status(500).json({ message: "Failed to fetch jobs" });
    }
    res.json(results);
  });
};

// ── GET /api/jobs/:id ──
exports.getJobById = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });

  const sql = `SELECT j.*, c.company_name AS customer_name, u.name AS created_by_name,
                      a.name AS assigned_to_name
               FROM job_entries j
               LEFT JOIN customers c ON c.id = j.customer_id
               LEFT JOIN users u ON u.id = j.created_by
               LEFT JOIN users a ON a.id = j.assigned_to
               WHERE j.id = ?`;

  db.query(sql, [jobId], (err, rows) => {
    if (err) {
      console.error("Fetch job error:", err);
      return res.status(500).json({ message: "Failed to fetch job" });
    }
    if (rows.length === 0) return res.status(404).json({ message: "Job not found" });
    res.json(rows[0]);
  });
};

// ── DELETE /api/jobs/:id ──
exports.deleteJob = (req, res) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only SUPER_ADMIN can delete jobs" });
  }

  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });

  db.query("DELETE FROM job_entries WHERE id = ?", [jobId], (err, result) => {
    if (err) {
      console.error("Delete job error:", err);
      return res.status(500).json({ message: "Failed to delete job" });
    }
    if (result.affectedRows === 0) return res.status(404).json({ message: "Job not found" });

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
    db.query(
      `INSERT INTO logs (user_id, job_id, action, description, ip_address) VALUES (?,?,?,?,?)`,
      [req.user.id, jobId, "DELETE", `Deleted job ID ${jobId}`, ip],
      () => {}
    );

    res.json({ message: "Job deleted successfully" });
  });
};
