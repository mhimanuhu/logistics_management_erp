const db = require("../config/db");

function getIp(req) {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
}



// ── GET /api/jobs/:id/containers ──
// Returns all containers for a job ordered by sr_no
exports.getContainers = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });

  db.query(
    "SELECT * FROM job_containers WHERE job_id = ? ORDER BY sr_no ASC",
    [jobId],
    (err, rows) => {
      if (err) {
        console.error("[containers get error]", err.message);
        return res.status(500).json({ message: "Failed to fetch containers", error: err.message });
      }
      res.json(rows);
    }
  );
};
// New Api
// ── PUT /api/jobs/:id/containers ──
// Full replace — accepts an array of containers and syncs the DB.
// Body: { containers: [ { sr_no, container_no, container_size }, ... ] }
exports.syncContainers = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });

  const containers = req.body.containers;
  if (!Array.isArray(containers) || containers.length === 0) {
    return res.status(400).json({ message: "containers must be a non-empty array" });
  }

  // Validate each entry
  for (const c of containers) {
    if (!c.sr_no || typeof c.sr_no !== "number") {
      return res.status(400).json({ message: "Each container must have a numeric sr_no" });
    }

  }

  // Verify job exists
  db.query("SELECT id, job_type FROM job_entries WHERE id = ?", [jobId], (err, jobs) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (jobs.length === 0) return res.status(404).json({ message: "Job not found" });

    // Build INSERT … ON DUPLICATE KEY UPDATE for all containers at once
    const placeholders = containers.map(() => "(?, ?, ?, ?)").join(", ");
    const values = [];
    containers.forEach((c) => {
      values.push(
        jobId,
        c.sr_no,
        c.container_no || null,
        c.container_size || null
      );
    });

    const sql = `
      INSERT INTO job_containers (job_id, sr_no, container_no, container_size)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        container_no   = VALUES(container_no),
        container_size = VALUES(container_size)
    `;

    db.query(sql, values, (err2) => {
      if (err2) {
        console.error("[containers sync error]", err2.message);
        return res.status(500).json({ message: "Failed to sync containers", error: err2.message });
      }

      // Update total_containers on job_entries to match count
      db.query(
        "UPDATE job_entries SET total_containers = ? WHERE id = ?",
        [containers.length, jobId],
        () => {}
      );

      db.query(
        `INSERT INTO logs (user_id, job_id, action, description, ip_address) VALUES (?,?,?,?,?)`,
        [req.user.id, jobId, "UPDATE", `Synced ${containers.length} container(s)`, getIp(req)],
        () => {}
      );

      res.json({ message: "Containers synced", count: containers.length });
    });
  });
};

// ── POST /api/jobs/:id/containers ──
// Add a single new container (next sr_no auto-assigned)
exports.addContainer = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });

  const { container_no, container_size } = req.body;


  // Verify job exists
  db.query("SELECT id FROM job_entries WHERE id = ?", [jobId], (err, jobs) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (jobs.length === 0) return res.status(404).json({ message: "Job not found" });

    // Get next sr_no
    db.query(
      "SELECT COALESCE(MAX(sr_no), 0) + 1 AS next_sr FROM job_containers WHERE job_id = ?",
      [jobId],
      (err2, rows) => {
        if (err2) return res.status(500).json({ message: "Server error" });
        const srNo = rows[0].next_sr;

        db.query(
          "INSERT INTO job_containers (job_id, sr_no, container_no, container_size) VALUES (?, ?, ?, ?)",
          [jobId, srNo, container_no || null, container_size || null],
          (err3, result) => {
            if (err3) {
              console.error("[container add error]", err3.message);
              return res.status(500).json({ message: "Failed to add container", error: err3.message });
            }

            // Keep total_containers in sync
            db.query(
              "UPDATE job_entries SET total_containers = (SELECT COUNT(*) FROM job_containers WHERE job_id = ?) WHERE id = ?",
              [jobId, jobId],
              () => {}
            );

            db.query(
              `INSERT INTO logs (user_id, job_id, action, description, ip_address) VALUES (?,?,?,?,?)`,
              [req.user.id, jobId, "UPDATE", `Added container sr_no ${srNo}`, getIp(req)],
              () => {}
            );

            res.status(201).json({ message: "Container added", id: result.insertId, sr_no: srNo });
          }
        );
      }
    );
  });
};

// ── PATCH /api/jobs/:id/containers/:srNo ──
// Update a single container by sr_no
exports.updateContainer = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const srNo  = parseInt(req.params.srNo, 10);
  if (isNaN(jobId) || isNaN(srNo)) return res.status(400).json({ message: "Invalid ID" });

  const { container_no, container_size } = req.body;


  const updates = {};
  if (container_no  !== undefined) updates.container_no   = container_no  === "" ? null : container_no;
  if (container_size !== undefined) updates.container_size = container_size;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields to update" });
  }

  const fields = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
  db.query(
    `UPDATE job_containers SET ${fields} WHERE job_id = ? AND sr_no = ?`,
    [...Object.values(updates), jobId, srNo],
    (err, result) => {
      if (err) {
        console.error("[container update error]", err.message);
        return res.status(500).json({ message: "Failed to update container", error: err.message });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Container not found" });

      db.query(
        `INSERT INTO logs (user_id, job_id, action, description, ip_address) VALUES (?,?,?,?,?)`,
        [req.user.id, jobId, "UPDATE", `Updated container sr_no ${srNo}`, getIp(req)],
        () => {}
      );

      res.json({ message: "Container updated" });
    }
  );
};

// ── DELETE /api/jobs/:id/containers/:srNo ──
// Remove a single container; re-sequences sr_no values afterwards
exports.deleteContainer = (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const srNo  = parseInt(req.params.srNo, 10);
  if (isNaN(jobId) || isNaN(srNo)) return res.status(400).json({ message: "Invalid ID" });

  db.query(
    "DELETE FROM job_containers WHERE job_id = ? AND sr_no = ?",
    [jobId, srNo],
    (err, result) => {
      if (err) {
        console.error("[container delete error]", err.message);
        return res.status(500).json({ message: "Failed to delete container", error: err.message });
      }
      if (result.affectedRows === 0) return res.status(404).json({ message: "Container not found" });

      // Re-sequence remaining sr_no values for this job
      db.query(
        `SET @row := 0;
         UPDATE job_containers SET sr_no = (@row := @row + 1)
         WHERE job_id = ? ORDER BY sr_no ASC`,
        [jobId],
        () => {}
      );

      // Keep total_containers in sync
      db.query(
        "UPDATE job_entries SET total_containers = (SELECT COUNT(*) FROM job_containers WHERE job_id = ?) WHERE id = ?",
        [jobId, jobId],
        () => {}
      );

      db.query(
        `INSERT INTO logs (user_id, job_id, action, description, ip_address) VALUES (?,?,?,?,?)`,
        [req.user.id, jobId, "UPDATE", `Deleted container sr_no ${srNo}`, getIp(req)],
        () => {}
      );

      res.json({ message: "Container deleted" });
    }
  );
};
