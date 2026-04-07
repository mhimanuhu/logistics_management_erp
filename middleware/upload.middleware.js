const multer = require("multer");
const cloudinary = require("../config/cloudinary");

//  Node v22 + ESM-compatible import
const CloudinaryStorage = require("multer-storage-cloudinary").CloudinaryStorage;

// ─────────────────────────────────────────────────────────
//  Image upload (logistic entries) — JPG/PNG/GIF/WEBP only
// ─────────────────────────────────────────────────────────
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "logistics-erp",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [{ width: 1000, height: 1000, crop: "limit" }],
  },
});

const upload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
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
