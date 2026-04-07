const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const authMiddleware = require("../middleware/auth.middleware");
const allowRoles = require("../middleware/role.middleware");

/**
 * User Management Routes
 * DEV_ADMIN can create SUPER_ADMIN / DEV_ADMIN / USER
 * SUPER_ADMIN can create DEV_ADMIN / USER
 * Both can list, delete, and toggle users
 */

// GET /api/users — List all users (SUPER_ADMIN & DEV_ADMIN)
router.get("/", authMiddleware, allowRoles("SUPER_ADMIN", "DEV_ADMIN"), userController.getUsers);

// POST /api/users — Create new user (SUPER_ADMIN & DEV_ADMIN)
router.post("/", authMiddleware, allowRoles("SUPER_ADMIN", "DEV_ADMIN"), userController.createUser);

// DELETE /api/users/:id — Delete user (SUPER_ADMIN & DEV_ADMIN)
router.delete("/:id", authMiddleware, allowRoles("SUPER_ADMIN", "DEV_ADMIN"), userController.deleteUser);

// PATCH /api/users/:id/toggle-active — Toggle user status (SUPER_ADMIN & DEV_ADMIN)
router.patch("/:id/toggle-active", authMiddleware, allowRoles("SUPER_ADMIN", "DEV_ADMIN"), userController.toggleUserActive);

module.exports = router;