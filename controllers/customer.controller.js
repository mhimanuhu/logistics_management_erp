const db = require("../config/db");

// ─────────────────────────────────────────────────────────
//  GET /api/customers — List all customers
//  Supports query params: ?status=active&company_type=customer&search=abc
// ─────────────────────────────────────────────────────────
exports.getCustomers = (req, res) => {
  const { status, company_type, search } = req.query;

  let sql = "SELECT * FROM customers WHERE 1=1";
  const values = [];

  if (status) {
    sql += " AND status = ?";
    values.push(status);
  }

  if (company_type) {
    sql += " AND company_type = ?";
    values.push(company_type);
  }

  if (search) {
    sql += " AND (company_name LIKE ? OR gstin LIKE ? OR contact_person LIKE ? OR email LIKE ?)";
    const searchPattern = `%${search}%`;
    values.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  sql += " ORDER BY created_at DESC";

  db.query(sql, values, (err, results) => {
    if (err) {
      console.error("Fetch customers error:", err);
      return res.status(500).json({ message: "Failed to fetch customers" });
    }
    res.json(results);
  });
};

// ─────────────────────────────────────────────────────────
//  GET /api/customers/:id — Get single customer
// ─────────────────────────────────────────────────────────
exports.getCustomerById = (req, res) => {
  const sql = "SELECT * FROM customers WHERE id = ?";

  db.query(sql, [req.params.id], (err, results) => {
    if (err) {
      console.error("Fetch customer error:", err);
      return res.status(500).json({ message: "Failed to fetch customer" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json(results[0]);
  });
};

// ─────────────────────────────────────────────────────────
//  POST /api/customers — Create customer
// ─────────────────────────────────────────────────────────
exports.createCustomer = (req, res) => {
  const createdBy = req.user.id;

  const {
    company_type,
    gstin,
    company_name,
    contact_person,
    contact_no,
    email,
    registration_type,
    pan,
    address_line1,
    address_line2,
    landmark,
    city,
    state,
    pincode,
    status
  } = req.body;

  if (!company_name) {
    return res.status(400).json({ message: "Company name is required" });
  }

  if (!city) {
    return res.status(400).json({ message: "City is required" });
  }

  const sql = `
    INSERT INTO customers (
      created_by, company_type, gstin, company_name, contact_person,
      contact_no, email, registration_type, pan,
      address_line1, address_line2, landmark, city, state, pincode, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;

  const values = [
    createdBy,
    company_type || "customer",
    gstin || null,
    company_name,
    contact_person || null,
    contact_no || null,
    email || null,
    registration_type || "unregistered",
    pan || null,
    address_line1 || null,
    address_line2 || null,
    landmark || null,
    city || null,
    state || null,
    pincode || null,
    status || "active"
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Create customer error:", err);
      return res.status(500).json({ message: "Failed to create customer" });
    }

    // Log action
    db.query(
      "INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)",
      [createdBy, "CREATE_CUSTOMER", `Created customer: ${company_name}`],
      () => {}
    );

    res.json({
      message: "Customer created successfully",
      customer_id: result.insertId
    });
  });
};

// ─────────────────────────────────────────────────────────
//  PUT /api/customers/:id — Update customer
// ─────────────────────────────────────────────────────────
const CUSTOMER_UPDATEABLE_FIELDS = [
  "company_type", "gstin", "company_name", "contact_person",
  "contact_no", "email", "registration_type", "pan",
  "address_line1", "address_line2", "landmark", "city",
  "state", "pincode", "status"
];

exports.updateCustomer = (req, res) => {
  const customerId = req.params.id;
  const updates = {};

  Object.keys(req.body).forEach((key) => {
    if (CUSTOMER_UPDATEABLE_FIELDS.includes(key)) {
      updates[key] = req.body[key];
    }
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  const fields = Object.keys(updates)
    .map((key) => `${key} = ?`)
    .join(", ");
  const values = Object.values(updates);

  const sql = `UPDATE customers SET ${fields} WHERE id = ?`;

  db.query(sql, [...values, customerId], (err, result) => {
    if (err) {
      console.error("Update customer error:", err);
      return res.status(500).json({ message: "Failed to update customer" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Log action
    db.query(
      "INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)",
      [req.user.id, "UPDATE_CUSTOMER", `Updated customer ID ${customerId}`],
      () => {}
    );

    res.json({ message: "Customer updated successfully" });
  });
};

// ─────────────────────────────────────────────────────────
//  DELETE /api/customers/:id — Delete customer
//  Soft-delete (set status='inactive') to avoid FK issues
//  with invoices. SUPER_ADMIN only.
// ─────────────────────────────────────────────────────────
exports.deleteCustomer = (req, res) => {
  const role = req.user.role;

  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Only SUPER_ADMIN can delete customers" });
  }

  const customerId = req.params.id;

  // Soft-delete: set status to inactive
  const sql = "UPDATE customers SET status = 'inactive' WHERE id = ?";

  db.query(sql, [customerId], (err, result) => {
    if (err) {
      console.error("Delete customer error:", err);
      return res.status(500).json({ message: "Failed to delete customer" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Log action
    db.query(
      "INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)",
      [req.user.id, "DELETE_CUSTOMER", `Soft-deleted customer ID ${customerId}`],
      () => {}
    );

    res.json({ message: "Customer deactivated successfully" });
  });
};
