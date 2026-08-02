const db = require("../config/db");

/**
 * Get Logs Controller — v2
 * Fetches all system logs (SUPER_ADMIN and DEV_ADMIN only)
 * JOINs users + roles. References job_entries instead of logistic_entries.
 */
exports.getLogs = (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN" && role !== "DEV_ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  const sql = `
    SELECT
      l.id,
      l.action,
      l.phase,
      l.description,
      l.ip_address,
      l.created_at,
      u.name AS user_name,
      u.email AS user_email,
      r.name AS user_role,
      j.job_no,
      j.job_type
    FROM logs l
    LEFT JOIN users u ON l.user_id = u.id
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN job_entries j ON l.job_id = j.id
    ORDER BY l.created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch logs error:", err);
      return res.status(500).json({ message: "Failed to fetch logs" });
    }

    res.json(results);
  });
};