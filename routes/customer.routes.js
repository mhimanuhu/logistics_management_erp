const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customer.controller");
const authMiddleware = require("../middleware/auth.middleware");
const allowRoles = require("../middleware/role.middleware");

/**
 * Customer Routes
 * All routes require authentication
 */

// GET /api/customers — List all customers (with optional filters)
router.get("/", authMiddleware, customerController.getCustomers);

// GET /api/customers/:id — Get single customer
router.get("/:id", authMiddleware, customerController.getCustomerById);

// POST /api/customers — Create customer
router.post("/", authMiddleware, customerController.createCustomer);

// PUT /api/customers/:id — Update customer
router.put("/:id", authMiddleware, customerController.updateCustomer);

// DELETE /api/customers/:id — Soft-delete customer (SUPER_ADMIN only)
router.delete("/:id", authMiddleware, allowRoles("SUPER_ADMIN"), customerController.deleteCustomer);

module.exports = router;
