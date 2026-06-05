// const express = require("express");
// const router = express.Router();
// const jobController = require("../controllers/job.controller");
// const exportPhase = require("../controllers/exportPhase.controller");
// const importPhase = require("../controllers/importPhase.controller");
// const chargesController = require("../controllers/charges.controller");
// const authMiddleware = require("../middleware/auth.middleware");
// const upload = require("../middleware/upload.middleware");

// /**
//  * Job Routes — v2 phase-based workflow
//  * All routes require authentication
//  */

// // ── Job CRUD ──
// router.post("/", authMiddleware, jobController.createJob);
// router.get("/", authMiddleware, jobController.getJobs);
// router.get("/:id", authMiddleware, jobController.getJobById);
// router.delete("/:id", authMiddleware, jobController.deleteJob);

// // ── Export Phases ──
// router.get("/:id/export/phase/1", authMiddleware, exportPhase.getExportPhase1);
// router.put("/:id/export/phase/1", authMiddleware, exportPhase.updateExportPhase1);
// router.post("/:id/export/phase/1/complete", authMiddleware, exportPhase.completeExportPhase1);

// router.get("/:id/export/phase/2", authMiddleware, exportPhase.getExportPhase2);
// router.put("/:id/export/phase/2", authMiddleware, exportPhase.updateExportPhase2);
// router.post("/:id/export/phase/2/complete", authMiddleware, exportPhase.completeExportPhase2);

// router.get("/:id/export/phase/3", authMiddleware, ...upload("image"), exportPhase.getExportPhase3);
// router.put("/:id/export/phase/3", authMiddleware, ...upload("image"), exportPhase.updateExportPhase3);
// router.post("/:id/export/phase/3/complete", authMiddleware, exportPhase.completeExportPhase3);

// // ── Import Phases ──
// router.get("/:id/import/phase/1", authMiddleware, importPhase.getImportPhase1);
// router.put("/:id/import/phase/1", authMiddleware, ...upload("image"), importPhase.updateImportPhase1);
// router.post("/:id/import/phase/1/complete", authMiddleware, importPhase.completeImportPhase1);

// router.get("/:id/import/phase/2", authMiddleware, importPhase.getImportPhase2);
// router.put("/:id/import/phase/2", authMiddleware, ...upload("image"), importPhase.updateImportPhase2);
// router.post("/:id/import/phase/2/complete", authMiddleware, importPhase.completeImportPhase2);

// // ── Charges ──
// router.get("/:id/charges", authMiddleware, chargesController.getCharges);
// router.put("/:id/charges", authMiddleware, chargesController.updateCharges);

// module.exports = router;
const express = require("express");
const router = express.Router();
const jobController = require("../controllers/job.controller");
const exportPhase = require("../controllers/exportPhase.controller");
const importPhase = require("../controllers/importPhase.controller");
const chargesController = require("../controllers/charges.controller");
const authMiddleware = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

/**
 * Job Routes — v2 phase-based workflow
 * All routes require authentication
 */

// ── Job CRUD ──
router.post("/", authMiddleware, jobController.createJob);
router.get("/", authMiddleware, jobController.getJobs);
router.get("/:id", authMiddleware, jobController.getJobById);
router.delete("/:id", authMiddleware, jobController.deleteJob);

// ── Export Phases ──
router.get("/:id/export/phase/1", authMiddleware, exportPhase.getExportPhase1);
router.put("/:id/export/phase/1", authMiddleware, exportPhase.updateExportPhase1);
router.post("/:id/export/phase/1/complete", authMiddleware, exportPhase.completeExportPhase1);

router.get("/:id/export/phase/2", authMiddleware, exportPhase.getExportPhase2);
router.put("/:id/export/phase/2", authMiddleware, exportPhase.updateExportPhase2);
router.post("/:id/export/phase/2/complete", authMiddleware, exportPhase.completeExportPhase2);

router.get("/:id/export/phase/3", authMiddleware, exportPhase.getExportPhase3);
router.put("/:id/export/phase/3", authMiddleware, ...upload("image"), exportPhase.updateExportPhase3);
router.post("/:id/export/phase/3/complete", authMiddleware, exportPhase.completeExportPhase3);

// ── Import Phases ──
router.get("/:id/import/phase/1", authMiddleware, importPhase.getImportPhase1);
router.put("/:id/import/phase/1", authMiddleware, ...upload("image"), importPhase.updateImportPhase1);
router.post("/:id/import/phase/1/complete", authMiddleware, importPhase.completeImportPhase1);

router.get("/:id/import/phase/2", authMiddleware, importPhase.getImportPhase2);
router.put("/:id/import/phase/2", authMiddleware, ...upload("image"), importPhase.updateImportPhase2);
router.post("/:id/import/phase/2/complete", authMiddleware, importPhase.completeImportPhase2);

// ── Charges ──
router.get("/:id/charges", authMiddleware, chargesController.getCharges);
router.put("/:id/charges", authMiddleware, chargesController.updateCharges);

module.exports = router;