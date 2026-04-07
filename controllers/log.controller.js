const db = require("../config/db");

/**
 * Get Logs Controller
 * Fetches all system logs (SUPER_ADMIN and DEV_ADMIN only)
 * Now also JOINs roles to show user role in the log output
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
      l.description,
      l.created_at,
      u.name AS user_name,
      u.email AS user_email,
      r.name AS user_role,
      le.invoice_no,
      le.container_no
    FROM logs l
    JOIN users u ON l.user_id = u.id
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN logistic_entries le ON l.entry_id = le.id
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