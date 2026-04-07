const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

/**
 * Login Controller
 * Authenticates user with email and password
 * Returns JWT token on successful login
 *
 * Now JOINs the `roles` table to resolve role_id → role name
 */
exports.login = (req, res) => {
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  // Find user by email — JOIN roles to get role name
  const sql = `
    SELECT u.*, r.name AS role
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.email = ?
  `;

  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = results[0];

    // Check if user is active
    if (user.is_active === 0) {
      return res.status(403).json({ message: "User is inactive" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token — role is the name string e.g. "SUPER_ADMIN"
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Return response
    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        role_id: user.role_id
      }
    });
  });
};