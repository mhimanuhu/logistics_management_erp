const db = require("../config/db");

// ─────────────────────────────────────────────────────────
//  GET /api/roles — List all active roles
//  Any authenticated user can fetch (for dropdowns)
// ─────────────────────────────────────────────────────────
exports.getRoles = (req, res) => {
  const sql = `
    SELECT id, name, description, is_active, created_at
    FROM roles
    WHERE is_active = 1
    ORDER BY id ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch roles error:", err);
      return res.status(500).json({ message: "Failed to fetch roles" });
    }
    res.json(results);
  });
};

// ─────────────────────────────────────────────────────────
//  GET /api/roles/all — List ALL roles including inactive
//  SUPER_ADMIN and DEV_ADMIN only
// ─────────────────────────────────────────────────────────
exports.getAllRoles = (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN" && role !== "DEV_ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  const sql = `
    SELECT id, name, description, is_active, created_at
    FROM roles
    ORDER BY id ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch all roles error:", err);
      return res.status(500).json({ message: "Failed to fetch roles" });
    }
    res.json(results);
  });
};
