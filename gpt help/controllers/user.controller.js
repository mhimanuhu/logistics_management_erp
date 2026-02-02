const bcrypt = require("bcryptjs");
const db = require("../config/db");

/**
 * Create User Controller
 * Creates new USER or DEV_ADMIN (SUPER_ADMIN only)
 */
exports.createUser = (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only SUPER_ADMIN can create users" });
  }

  const { name, email, password, role: newRole } = req.body;

  if (!name || !email || !password || !newRole) {
    return res.status(400).json({ message: "All fields required" });
  }

  if (!["USER", "DEV_ADMIN"].includes(newRole)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  // Check if email already exists
  const checkSql = "SELECT id FROM users WHERE email = ?";
  db.query(checkSql, [email], async (err, results) => {
    if (err) {
      console.error("Check user error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const insertSql = `
      INSERT INTO users (name, email, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, 1)
    `;

    db.query(
      insertSql,
      [name, email, hashedPassword, newRole],
      (err, result) => {
        if (err) {
          console.error("Create user error:", err);
          return res.status(500).json({ message: "Failed to create user" });
        }

        // Log action
        const logSql = `
          INSERT INTO logs (user_id, action, description)
          VALUES (?, ?, ?)
        `;

        db.query(
          logSql,
          [req.user.id, "CREATE_USER", `Created user ${email} (${newRole})`],
          () => {}
        );

        res.json({
          message: "User created successfully",
          user_id: result.insertId
        });
      }
    );
  });
};

/**
 * Toggle User Active/Inactive Controller
 * Activates or deactivates a user (SUPER_ADMIN only)
 */
exports.toggleUserActive = (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only SUPER_ADMIN can change user status" });
  }

  const userId = req.params.id;

  // SUPER_ADMIN cannot deactivate themselves
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ message: "You cannot deactivate yourself" });
  }

  // Check user exists
  const checkSql = "SELECT id, is_active FROM users WHERE id = ?";
  db.query(checkSql, [userId], (err, results) => {
    if (err) {
      console.error("Check user error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentStatus = results[0].is_active;
    const newStatus = currentStatus === 1 ? 0 : 1;

    const updateSql = "UPDATE users SET is_active = ? WHERE id = ?";

    db.query(updateSql, [newStatus, userId], (err) => {
      if (err) {
        console.error("Update user status error:", err);
        return res.status(500).json({ message: "Failed to update user status" });
      }

      // Log action
      const logSql = `
        INSERT INTO logs (user_id, action, description)
        VALUES (?, ?, ?)
      `;

      const actionText = newStatus === 1 ? "ACTIVATE_USER" : "DEACTIVATE_USER";

      db.query(
        logSql,
        [req.user.id, actionText, `User ${userId} status changed to ${newStatus}`],
        () => {}
      );

      res.json({
        message: `User ${newStatus === 1 ? "activated" : "deactivated"} successfully`,
        user_id: userId,
        is_active: newStatus
      });
    });
  });
};