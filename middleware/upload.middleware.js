const multer = require("multer");
const cloudinary = require("../config/cloudinary");

//  Node v22 + ESM-compatible import
const CloudinaryStorage = require("multer-storage-cloudinary").CloudinaryStorage;

// ─────────────────────────────────────────────────────────
//  File upload (job phases) — Images + PDF
// ─────────────────────────────────────────────────────────
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isPdf = file.mimetype === "application/pdf";
    return {
      folder: "logistics-erp",
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp", "pdf"],
      resource_type: isPdf ? "raw" : "image",
      transformation: isPdf ? [] : [{ width: 1000, height: 1000, crop: "limit" }],
    };
  },
});

const upload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (JPG, PNG, GIF, WEBP) and PDF are allowed!"), false); // PDF Also
    }
  },
});

// ─────────────────────────────────────────────────────────
//  E-Invoice file upload (invoices) — PDF + images
// ─────────────────────────────────────────────────────────
const invoiceFileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "logistics-erp/invoices",
    allowed_formats: ["pdf", "jpg", "jpeg", "png", "webp"],
    resource_type: "auto", // auto-detect image vs raw (PDF)
  },
});

const uploadInvoiceFile = multer({
  storage: invoiceFileStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB for invoice docs
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files are allowed for e-invoices!"), false);
    }
  },
});

module.exports = upload;
module.exports.uploadInvoiceFile = uploadInvoiceFile;
