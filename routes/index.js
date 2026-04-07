const express = require("express");
const router = express.Router();

// Import all route modules
const authRoutes = require("./auth.routes");
const entryRoutes = require("./entry.routes");
const logRoutes = require("./log.routes");
const userRoutes = require("./user.routes");
const roleRoutes = require("./role.routes");
const customerRoutes = require("./customer.routes");
const invoiceRoutes = require("./invoice.routes");

/**
 * Central Route Configuration
 * Organizes all API routes with prefixes
 */

// Mount routes
router.use("/auth", authRoutes);
router.use("/entries", entryRoutes);
router.use("/logs", logRoutes);
router.use("/users", userRoutes);
router.use("/roles", roleRoutes);
router.use("/customers", customerRoutes);
router.use("/invoices", invoiceRoutes);

module.exports = router;