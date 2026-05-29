const multer = require("multer");
const sharp = require("sharp");
const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────
const MAX_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB hard limit for Cloudinary uploads
const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_MIMES = [...ALLOWED_IMAGE_MIMES, "application/pdf"];

// ─────────────────────────────────────────────────────────────────────────────
//  Multer — memoryStorage so we can intercept the buffer before Cloudinary
// ─────────────────────────────────────────────────────────────────────────────
const memStorage = multer.memoryStorage();

function buildMulter(allowedMimes, maxSizeBytes) {
  return multer({
    storage: memStorage,
    limits: { fileSize: maxSizeBytes * 10 }, // generous inbound cap; enforcement happens below
    fileFilter: (_req, file, cb) => {
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Only ${allowedMimes.join(", ")} files are allowed!`), false);
      }
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Compression / rejection middleware
//  • PDF > 1 MB  → HTTP 400
//  • Image > 1 MB → sharp compress (quality loop) until ≤ 1 MB
//  • File ≤ 1 MB  → pass through unchanged
// ─────────────────────────────────────────────────────────────────────────────
async function compressOrReject(req, _res, next) {
  if (!req.file) return next(); // no file uploaded — nothing to do

  const { originalname, mimetype, buffer, size } = req.file;
  const originalKB = Math.round((size || buffer.length) / 1024);

  // ── PDF: reject if oversized ──────────────────────────────────────────────
  if (mimetype === "application/pdf") {
    if (buffer.length > MAX_SIZE_BYTES) {
      const err = new Error("PDF is too large. Please upload a PDF under 1 MB.");
      err.status = 400;
      return next(err);
    }
    console.log(`[UPLOAD] PDF "${originalname}": ${originalKB} KB — within limit, no action needed.`);
    return next();
  }

  // ── Image: pass through if already ≤ 1 MB ────────────────────────────────
  if (buffer.length <= MAX_SIZE_BYTES) {
    console.log(`[UPLOAD] Image "${originalname}": ${originalKB} KB — within limit, skipping compression.`);
    return next();
  }

  // ── Image: compress iteratively until ≤ 1 MB ─────────────────────────────
  console.log(`[UPLOAD] Image "${originalname}": ${originalKB} KB — starting compression…`);

  const qualitySteps = [80, 65, 50, 35, 20];
  let compressedBuffer = null;

  for (const quality of qualitySteps) {
    try {
      compressedBuffer = await sharp(buffer)
        .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality })          // always output JPEG for maximum compression ratio
        .toBuffer();

      if (compressedBuffer.length <= MAX_SIZE_BYTES) {
        const compressedKB = Math.round(compressedBuffer.length / 1024);
        console.log(
          `[UPLOAD] Image "${originalname}": ${originalKB} KB → ${compressedKB} KB (quality=${quality})`
        );
        break;
      }
    } catch (sharpErr) {
      return next(sharpErr);
    }
    compressedBuffer = null; // still too large, try next quality step
  }

  if (!compressedBuffer) {
    // Absolute fallback: use the lowest-quality result even if it technically went above 1 MB.
    // In practice, a real image should always compress below 1 MB at quality=20.
    console.warn(
      `[UPLOAD] Image "${originalname}": could not compress below 1 MB — uploading best-effort result.`
    );
    compressedBuffer = await sharp(buffer)
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 20 })
      .toBuffer();
  }

  // Patch the req.file buffer + metadata for the upload step
  req.file.buffer = compressedBuffer;
  req.file.mimetype = "image/jpeg";
  req.file.originalname = originalname.replace(/\.[^.]+$/, ".jpg");

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Cloudinary upload middleware
//  Streams req.file.buffer to Cloudinary and writes back:
//    req.file.path     → secure_url  (used by controllers as image_path)
//    req.file.filename → public_id   (used by controllers as cloudinary_public_id)
// ─────────────────────────────────────────────────────────────────────────────
function cloudinaryUpload(folder) {
  return (req, _res, next) => {
    if (!req.file) return next();

    const isPdf = req.file.mimetype === "application/pdf";

    // Derive the file extension from the (possibly rewritten) originalname so
    // Cloudinary stores the file WITH its extension in the public_id.
    // e.g.  "report.pdf"  → public_id ends with ".pdf"
    //        "photo.jpg"  → public_id ends with ".jpg"
    const ext = req.file.originalname.split(".").pop().toLowerCase() || (isPdf ? "pdf" : "jpg");
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const uploadOptions = {
      folder,
      // public_id includes the extension — fixes the missing-extension Cloudinary bug
      public_id: `${uniqueId}.${ext}`,
      // "auto" lets Cloudinary detect the type and route correctly:
      //   images → /image/upload/…   PDFs → /raw/upload/…
      resource_type: "auto",
      // Apply resize transformation only for images, not PDFs
      ...(!isPdf && {
        transformation: [{ width: 1000, height: 1000, crop: "limit" }],
      }),
    };

    const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        const err = new Error(error.message || "Cloudinary upload failed");
        err.status = 500;
        return next(err);
      }
      // Write back fields that controllers already expect
      req.file.path = result.secure_url;
      req.file.filename = result.public_id;
      next();
    });

    // Pipe the buffer into the upload stream
    const readable = new Readable();
    readable.push(req.file.buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API
//  Both exports are functions that accept a field name and return an Express
//  middleware array: [multerSingle, compressOrReject, cloudinaryUpload]
//
//  Usage in routes (replaces the old .single() call):
//    upload("image")                   ← job phases
//    uploadInvoiceFile("e_invoice_file") ← invoices
// ─────────────────────────────────────────────────────────────────────────────

const jobMulter = buildMulter(ALLOWED_MIMES, MAX_SIZE_BYTES * 10);

/**
 * Middleware stack for job-phase image/PDF uploads (folder: logistics-erp)
 * @param {string} fieldName  — the multipart field name (e.g. "image")
 * @returns {Function[]}       — array of three Express middleware functions
 */
function upload(fieldName) {
  return [
    jobMulter.single(fieldName),
    compressOrReject,
    cloudinaryUpload("logistics-erp"),
  ];
}

const invoiceMulter = buildMulter(
  ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  MAX_SIZE_BYTES * 10
);

/**
 * Middleware stack for invoice e-invoice uploads (folder: logistics-erp/invoices)
 * @param {string} fieldName  — the multipart field name (e.g. "e_invoice_file")
 * @returns {Function[]}       — array of three Express middleware functions
 */
function uploadInvoiceFile(fieldName) {
  return [
    invoiceMulter.single(fieldName),
    compressOrReject,
    cloudinaryUpload("logistics-erp/invoices"),
  ];
}

module.exports = upload;
module.exports.uploadInvoiceFile = uploadInvoiceFile;
