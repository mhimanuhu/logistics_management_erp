const bcrypt = require("bcryptjs");
const db = require("../config/db");

/**
 * Role-based creation permissions:
 *   DEV_ADMIN   → can create SUPER_ADMIN, DEV_ADMIN, USER
 *   SUPER_ADMIN → can create DEV_ADMIN, USER
 *   USER        → cannot create anyone
 */
const CREATION_PERMISSIONS = {
  DEV_ADMIN: ["SUPER_ADMIN", "DEV_ADMIN", "USER"],
  SUPER_ADMIN: ["DEV_ADMIN", "USER"],
};

// ─────────────────────────────────────────────────────────
//  GET /api/users — List all users
//  Accessible by SUPER_ADMIN and DEV_ADMIN
// ─────────────────────────────────────────────────────────
exports.getUsers = (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN" && role !== "DEV_ADMIN") {
    return res.status(403).json({ message: "Only admins can view users" });
  }

  const sql = `
    SELECT
      u.id, u.name, u.email,
      r.name AS role, r.id AS role_id,
      creator.name AS created_by,
      u.is_active, u.created_at, u.updated_at
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN users creator ON creator.id = u.created_by
    ORDER BY u.created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch users error:", err);
      return res.status(500).json({ message: "Failed to fetch users" });
    }
    res.json(results);
  });
};

// ─────────────────────────────────────────────────────────
//  POST /api/users — Create a new user
//  DEV_ADMIN  can create SUPER_ADMIN / DEV_ADMIN / USER
//  SUPER_ADMIN can create DEV_ADMIN / USER
// ─────────────────────────────────────────────────────────
exports.createUser = (req, res) => {
  const creatorRole = req.user.role;
  const creatorId = req.user.id;

  // Check if the creator role is allowed to create users at all
  const allowedTargetRoles = CREATION_PERMISSIONS[creatorRole];
  if (!allowedTargetRoles) {
    return res.status(403).json({ message: "You are not allowed to create users" });
  }

  const { name, email, password, role: newRoleName, role_id: directRoleId } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }

  // Resolve the target role — caller can pass either a role name or role_id
  // If both provided, role name takes precedence
  const resolveRole = (callback) => {
    if (newRoleName) {
      // Look up role_id by name
      db.query("SELECT id, name FROM roles WHERE name = ? AND is_active = 1", [newRoleName], (err, rows) => {
        if (err) return callback(err);
        if (rows.length === 0) return callback(null, null, newRoleName);
        callback(null, rows[0].id, rows[0].name);
      });
    } else if (directRoleId) {
      // Look up role name by id
      db.query("SELECT id, name FROM roles WHERE id = ? AND is_active = 1", [directRoleId], (err, rows) => {
        if (err) return callback(err);
        if (rows.length === 0) return callback(null, null, null);
        callback(null, rows[0].id, rows[0].name);
      });
    } else {
      return callback(null, null, null);
    }
  };

  resolveRole((err, roleId, roleName) => {
    if (err) {
      console.error("Role lookup error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (!roleId || !roleName) {
      return res.status(400).json({ message: "Valid role is required" });
    }

    // Check if the creator is permitted to assign this role
    if (!allowedTargetRoles.includes(roleName)) {
      return res.status(403).json({
        message: `${creatorRole} cannot create users with role ${roleName}`
      });
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
        INSERT INTO users (role_id, created_by, name, email, password_hash, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `;

      db.query(
        insertSql,
        [roleId, creatorId, name, email, hashedPassword],
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
            [creatorId, "CREATE_USER", `Created user ${email} (${roleName})`],
            () => {}
          );

          res.json({
            message: "User created successfully",
            user_id: result.insertId
          });
        }
      );
    });
  });
};

// ─────────────────────────────────────────────────────────
//  DELETE /api/users/:id — Delete user
//  SUPER_ADMIN and DEV_ADMIN can delete users
//  Transfers all FK-linked records to the admin performing
//  the deletion to avoid FK constraint violations.
// ─────────────────────────────────────────────────────────
exports.deleteUser = (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN" && role !== "DEV_ADMIN") {
    return res.status(403).json({ message: "Only admins can delete users" });
  }

  const userId = req.params.id;
  const adminId = req.user.id;

  // Cannot delete yourself
  if (parseInt(userId) === adminId) {
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

    // 1. Transfer logistic_entries to admin
    const transferEntriesSql = "UPDATE logistic_entries SET user_id = ? WHERE user_id = ?";
    db.query(transferEntriesSql, [adminId, userId], (err2) => {
      if (err2) {
        console.error("Transfer entries error:", err2);
        return res.status(500).json({ message: "Failed to transfer entries" });
      }

      // 2. Reassign logs to admin
      const transferLogsSql = "UPDATE logs SET user_id = ? WHERE user_id = ?";
      db.query(transferLogsSql, [adminId, userId], (errLogs) => {
        if (errLogs) {
          console.error("Transfer logs error:", errLogs);
          return res.status(500).json({ message: "Failed to transfer logs" });
        }

        // 3. Reassign customers.created_by
        const transferCustomersSql = "UPDATE customers SET created_by = ? WHERE created_by = ?";
        db.query(transferCustomersSql, [adminId, userId], (errCust) => {
          if (errCust) {
            console.error("Transfer customers error:", errCust);
            return res.status(500).json({ message: "Failed to transfer customers" });
          }

          // 4. Reassign invoices.created_by
          const transferInvoicesSql = "UPDATE invoices SET created_by = ? WHERE created_by = ?";
          db.query(transferInvoicesSql, [adminId, userId], (errInv) => {
            if (errInv) {
              console.error("Transfer invoices error:", errInv);
              return res.status(500).json({ message: "Failed to transfer invoices" });
            }

            // 5. Clear users.created_by self-references
            const clearCreatedBySql = "UPDATE users SET created_by = NULL WHERE created_by = ?";
            db.query(clearCreatedBySql, [userId], (errCb) => {
              if (errCb) {
                console.error("Clear created_by error:", errCb);
                return res.status(500).json({ message: "Failed to clear created_by references" });
              }

              // 6. Now safe to delete user
              const deleteSql = "DELETE FROM users WHERE id = ?";
              db.query(deleteSql, [userId], (err3) => {
                if (err3) {
                  console.error("Delete user error:", err3);
                  return res.status(500).json({ message: "Failed to delete user" });
                }

                // Log action
                const logSql = `
                  INSERT INTO logs (user_id, action, description)
                  VALUES (?, ?, ?)
                `;
                db.query(
                  logSql,
                  [adminId, "DELETE_USER", `Deleted user ID ${userId}. Records transferred.`],
                  () => {}
                );

                res.json({
                  message: "User deleted successfully. Their entries, logs, customers and invoices have been transferred to you."
                });
              });
            });
          });
        });
      });
    });
  });
};

// ─────────────────────────────────────────────────────────
//  PATCH /api/users/:id/toggle-active
//  Activates or deactivates a user
//  SUPER_ADMIN and DEV_ADMIN can toggle
// ─────────────────────────────────────────────────────────
exports.toggleUserActive = (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN" && role !== "DEV_ADMIN") {
    return res.status(403).json({ message: "Only admins can change user status" });
  }

  const userId = req.params.id;

  // Cannot deactivate yourself
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