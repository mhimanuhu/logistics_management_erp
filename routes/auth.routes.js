const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

/**
 * Authentication Routes
 */

// POST /api/auth/login - User login
router.post("/login", authController.login);

module.exports = router;