const express = require("express");
const router = express.Router();
const roleController = require("../controllers/role.controller");
const authMiddleware = require("../middleware/auth.middleware");

/**
 * Role Routes
 */

// GET /api/roles — List active roles (any authenticated user)
router.get("/", authMiddleware, roleController.getRoles);

// GET /api/roles/all — List all roles including inactive (admins only)
router.get("/all", authMiddleware, roleController.getAllRoles);

module.exports = router;
