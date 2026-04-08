const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoice.controller");
const authMiddleware = require("../middleware/auth.middleware");
const allowRoles = require("../middleware/role.middleware");
const { uploadInvoiceFile } = require("../middleware/upload.middleware");

/**
 * Invoice Routes
 * All routes require authentication
 */

// GET /api/invoices — List all invoices (with optional filters)
router.get("/", authMiddleware, invoiceController.getInvoices);

// GET /api/invoices/summary/monthly — Total bill amount month-wise (?year=2026)
router.get("/summary/monthly", authMiddleware, invoiceController.getMonthlyInvoiceSummary);

// GET /api/invoices/:id/print — Get all dynamic data for bill printing
router.get("/:id/print", authMiddleware, invoiceController.getInvoicePrintData);

// GET /api/invoices/:id — Get single invoice with items
router.get("/:id", authMiddleware, invoiceController.getInvoiceById);

// POST /api/invoices — Create invoice with items (optional e-invoice file)
router.post("/", authMiddleware, uploadInvoiceFile.single("e_invoice_file"), invoiceController.createInvoice);

// PUT /api/invoices/:id — Update invoice and items (optional e-invoice file)
router.put("/:id", authMiddleware, uploadInvoiceFile.single("e_invoice_file"), invoiceController.updateInvoice);

// DELETE /api/invoices/:id — Delete invoice (SUPER_ADMIN only)
router.delete("/:id", authMiddleware, allowRoles("SUPER_ADMIN"), invoiceController.deleteInvoice);

module.exports = router;
