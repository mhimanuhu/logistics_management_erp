const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const authMiddleware = require("../middleware/auth.middleware");
const allowRoles = require("../middleware/role.middleware");

/**
 * User Management Routes
 * All routes require authentication and SUPER_ADMIN privileges
 */

// POST /api/users - Create new user (SUPER_ADMIN only)
router.post("/", authMiddleware, allowRoles("SUPER_ADMIN"), userController.createUser);

// PATCH /api/users/:id/toggle-active - Toggle user active/inactive status (SUPER_ADMIN only)
router.patch("/:id/toggle-active", authMiddleware, allowRoles("SUPER_ADMIN"), userController.toggleUserActive);

module.exports = router;