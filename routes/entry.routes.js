const express = require("express");
const router = express.Router();
const entryController = require("../controllers/entry.controller");
const authMiddleware = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

/**
 * Logistic Entry Routes
 * All routes require authentication
 */
// POST get entrie by id
router.post("/:id", authMiddleware, entryController.getEntryById);
// DONE

// POST /api/entries - Create new entry (with optional image upload)
router.post("/", authMiddleware, upload.single("image"), entryController.createEntry);

// GET /api/entries - Get all entries
router.get("/", authMiddleware, entryController.getEntries);
// DONE

// PUT /api/entries/:id - Update entry (with optional image upload)
router.put("/:id", authMiddleware, upload.single("image"), entryController.updateEntry);

// DELETE /api/entries/:id - Delete entry (SUPER_ADMIN only)
router.delete("/:id", authMiddleware, entryController.deleteEntry);

module.exports = router;