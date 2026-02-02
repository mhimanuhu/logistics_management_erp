const express = require("express");
const router = express.Router();
const logController = require("../controllers/log.controller");
const authMiddleware = require("../middleware/auth.middleware");
const allowRoles = require("../middleware/role.middleware");

/**
 * Log Routes
 * All routes require authentication and admin privileges
 */

// GET /api/logs - Get all system logs (SUPER_ADMIN and DEV_ADMIN only)
router.get("/", authMiddleware, allowRoles("SUPER_ADMIN", "DEV_ADMIN"), logController.getLogs);

module.exports = router;