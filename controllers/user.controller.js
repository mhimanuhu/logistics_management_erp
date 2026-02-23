const bcrypt = require("bcryptjs");
const db = require("../config/db");

/**
 * Get All Users (SUPER_ADMIN only)
 * Returns list of users without password_hash
 */
exports.getUsers = (req, res) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only SUPER_ADMIN can view users" });
  }

  const sql = `
    SELECT id, name, email, role, is_active, created_at
    FROM users
    ORDER BY created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch users error:", err);
      return res.status(500).json({ message: "Failed to fetch users" });
    }
    res.json(results);
  });
};

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
 * Delete User Controller (SUPER_ADMIN only)
 * Reassigns deleted user's logistic_entries and logs to the SUPER_ADMIN (avoids FK errors), then deletes the user.
 * Prevents SUPER_ADMIN from deleting their own account.
 */
exports.deleteUser = (req, res) => {
  const role = req.user.role;
  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only SUPER_ADMIN can delete users" });
  }

  const userId = req.params.id;
  const superAdminId = req.user.id;

  // SUPER_ADMIN cannot delete themselves
  if (parseInt(userId) === superAdminId) {
    return res.status(400).json({ message: "You cannot delete your own account" });
  }

  const checkSql = "SELECT id FROM users WHERE id = ?";

  db.query(checkSql, [userId], (err, users) => {
    if (err) {
      console.error("Delete user check error:", err);
      return res.status(500).json({ message: "Server error" });
    }
    if (users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // 1. Transfer logistic_entries to SUPER_ADMIN (avoid FK error on users.id)
    const transferEntriesSql = "UPDATE logistic_entries SET user_id = ? WHERE user_id = ?";
    db.query(transferEntriesSql, [superAdminId, userId], (err2) => {
      if (err2) {
        console.error("Transfer entries error:", err2);
        return res.status(500).json({ message: "Failed to transfer entries" });
      }

      // 2. Reassign logs by this user to SUPER_ADMIN (avoid FK error on users.id)
      const transferLogsSql = "UPDATE logs SET user_id = ? WHERE user_id = ?";
      db.query(transferLogsSql, [superAdminId, userId], (errLogs) => {
        if (errLogs) {
          console.error("Transfer logs error:", errLogs);
          return res.status(500).json({ message: "Failed to transfer logs" });
        }

        // 3. Now safe to delete user (no remaining FK references)
        const deleteSql = "DELETE FROM users WHERE id = ?";
        db.query(deleteSql, [userId], (err3) => {
          if (err3) {
            console.error("Delete user error:", err3);
            return res.status(500).json({ message: "Failed to delete user" });
          }
          res.json({ message: "User deleted successfully. Their entries and logs have been transferred to you." });
        });
      });
    });
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