const express = require("express");
require("dotenv").config();
const path = require("path");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("./config/db.js");
const multer = require("multer");

const app = express();

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static folder for uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


const PORT = process.env.PORT || 5000;



// 🔐 LOGIN API
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // basic validation
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  //find user by email
  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = results[0];

    //check if user is active
    if (user.is_active === 0) {
      return res.status(403).json({ message: "User is inactive" });
    }

    //compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // generate token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // response
    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  });
});

// AUTH MIDDLEWARE
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "Token missing" });
  }

  const token = authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: "Invalid token format" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // attach user info to request
    req.user = {
      id: decoded.id,
      role: decoded.role
    };

    next(); // go to actual API
  });
}

// ROLE MIDDLEWARE
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
}

// MULTER CONFIG (image upload)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// STAFF EDITABLE FIELDS
const STAFF_ALLOWED_FIELDS = [
  "remarks",
  "vehicle_no",
  "status"
];


// CREATE ENTRY API
app.post("/entries", authMiddleware, upload.single("image"), (req, res) => {
  const userId = req.user.id;

  const {
    date,
    exporter_name,
    invoice_no,
    container_no,
    size,
    line,
    line_seal,
    custom_seal_no,
    sb_no,
    sb_date,
    pod,
    value,
    pkgs,
    transporter,
    vehicle_no,
    shipping_bill_no,
    shipping_bill_date,
    cha,
    gst_no,
    port,
    factory_stuffing,
    seal_charges,
    fumigation_charges_kpc_care,
    empty_survey_report_master_marine,
    transport_charges,
    handling_charges_transport_bill,
    detention_charges,
    handling_charges_nk_yard,
    concor_freight_charges,
    concor_handling_charges,
    gsp_fees,
    gsp_making_charges,
    out_charges_handling,
    labour_charges,
    examination_charges,
    direct_stuffing_charges,
    ksl_invoice,
    remarks
  } = req.body;

  const imagePath = req.file ? req.file.filename : null;

  // basic validation
  if (!exporter_name || !invoice_no || !container_no || !transporter) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const sql = `
    INSERT INTO logistic_entries (
      user_id, date, exporter_name, invoice_no, container_no, size,
      line, line_seal, custom_seal_no, sb_no, sb_date, pod, value, pkgs,
      transporter, vehicle_no, shipping_bill_no, shipping_bill_date,
      cha, gst_no, port, factory_stuffing, seal_charges,
      fumigation_charges_kpc_care, empty_survey_report_master_marine,
      transport_charges, handling_charges_transport_bill,
      detention_charges, handling_charges_nk_yard,
      concor_freight_charges, concor_handling_charges,
      gsp_fees, image_path, gsp_making_charges,
      out_charges_handling, labour_charges,
      examination_charges, direct_stuffing_charges,
      ksl_invoice, remarks
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;

  const values = [
    userId,
    date,
    exporter_name,
    invoice_no,
    container_no,
    size,
    line,
    line_seal,
    custom_seal_no,
    sb_no,
    sb_date,
    pod,
    value || 0,
    pkgs || 0,
    transporter,
    vehicle_no,
    shipping_bill_no,
    shipping_bill_date,
    cha,
    gst_no,
    port,
    factory_stuffing,
    seal_charges || 0,
    fumigation_charges_kpc_care || 0,
    empty_survey_report_master_marine || 0,
    transport_charges || 0,
    handling_charges_transport_bill || 0,
    detention_charges || 0,
    handling_charges_nk_yard || 0,
    concor_freight_charges || 0,
    concor_handling_charges || 0,
    gsp_fees || 0,
    imagePath,
    gsp_making_charges || 0,
    out_charges_handling || 0,
    labour_charges || 0,
    examination_charges || 0,
    direct_stuffing_charges || 0,
    ksl_invoice,
    remarks
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Insert entry error:", err);
      return res.status(500).json({ message: "Failed to create entry" });
    }

    // insert log
    const logSql = `
      INSERT INTO logs (user_id, entry_id, action, description)
      VALUES (?, ?, ?, ?)
    `;

    db.query(
      logSql,
      [userId, result.insertId, "CREATE", "Entry created"],
      () => {}
    );

    res.json({
      message: "Entry created successfully",
      entry_id: result.insertId
    });
  });
});


// GET ENTRIES API
app.get("/entries", authMiddleware, (req, res) => {
  let sql = "";
  let values = [];

  if (req.user.role === "SUPER_ADMIN" || req.user.role === "DEV_ADMIN") {
    // admin/dev ko staff name bhi dikhega
    sql = `
      SELECT 
        le.*,
        u.name AS created_by_name,
        u.email AS created_by_email
      FROM logistic_entries le
      JOIN users u ON le.user_id = u.id
      ORDER BY le.created_at DESC
    `;
  } else {
    // staff ko sirf entries, no created_by info
    sql = `
      SELECT *
      FROM logistic_entries
      ORDER BY created_at DESC
    `;
  }

  db.query(sql, values, (err, results) => {
    if (err) {
      console.error("Fetch entries error:", err);
      return res.status(500).json({ message: "Failed to fetch entries" });
    }

    res.json(results);
  });
});


// UPDATE ENTRY API
app.put("/entries/:id", authMiddleware, (req, res) => {
  const entryId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  let updates = req.body;

  if (role === "USER") {
    // staff limited edit
    const filteredUpdates = {};

    Object.keys(updates).forEach((key) => {
      if (STAFF_ALLOWED_FIELDS.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    updates = filteredUpdates;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  const fields = Object.keys(updates)
    .map((key) => `${key} = ?`)
    .join(", ");

  const values = Object.values(updates);

  const sql = `UPDATE logistic_entries SET ${fields} WHERE id = ?`;

  db.query(sql, [...values, entryId], (err, result) => {
    if (err) {
      console.error("Update entry error:", err);
      return res.status(500).json({ message: "Failed to update entry" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    // insert log
    const logSql = `
      INSERT INTO logs (user_id, entry_id, action, description)
      VALUES (?, ?, ?, ?)
    `;

    db.query(
      logSql,
      [userId, entryId, "UPDATE", "Entry updated"],
      () => {}
    );

    res.json({ message: "Entry updated successfully" });
  });
});

// GET LOGS API
app.get("/logs", authMiddleware, (req, res) => {
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
});

// CREATE USER (STAFF / DEV_ADMIN) - SUPER_ADMIN ONLY
app.post("/users", authMiddleware, (req, res) => {
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

  // check if email already exists
  const checkSql = "SELECT id FROM users WHERE email = ?";
  db.query(checkSql, [email], async (err, results) => {
    if (err) {
      console.error("Check user error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // hash password
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

        // log action
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
});

// DELETE ENTRY API - SUPER_ADMIN ONLY
app.delete("/entries/:id", authMiddleware, (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only SUPER_ADMIN can delete entries" });
  }

  const entryId = req.params.id;

  // check entry exists
  const checkSql = "SELECT id FROM logistic_entries WHERE id = ?";
  db.query(checkSql, [entryId], (err, results) => {
    if (err) {
      console.error("Check entry error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    // delete entry
    const deleteSql = "DELETE FROM logistic_entries WHERE id = ?";

    db.query(deleteSql, [entryId], (err) => {
      if (err) {
        console.error("Delete entry error:", err);
        return res.status(500).json({ message: "Failed to delete entry" });
      }

      // log action
      const logSql = `
        INSERT INTO logs (user_id, entry_id, action, description)
        VALUES (?, ?, ?, ?)
      `;

      db.query(
        logSql,
        [req.user.id, entryId, "DELETE", "Entry deleted"],
        () => {}
      );

      res.json({ message: "Entry deleted successfully" });
    });
  });
});

// TOGGLE USER ACTIVE / INACTIVE - SUPER_ADMIN ONLY
app.patch("/users/:id/toggle-active", authMiddleware, (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only SUPER_ADMIN can change user status" });
  }

  const userId = req.params.id;

  // SUPER_ADMIN cannot deactive himseld
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ message: "You cannot deactivate yourself" });
  }

  // check user exists
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

      // log action
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
});


//  PROTECTED TEST ROUTE
// app.get("/me", authMiddleware, (req, res) => {
//   res.json({
//     message: "You are authenticated",
//     user: req.user
//   });
// });


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
