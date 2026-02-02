const db = require("../config/db");

/**
 * Get Logs Controller
 * Fetches all system logs (SUPER_ADMIN and DEV_ADMIN only)
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
      le.invoice_no,
      le.container_no
    FROM logs l
    JOIN users u ON l.user_id = u.id
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