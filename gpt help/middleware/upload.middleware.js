const multer = require("multer");
const cloudinary = require("../config/cloudinary");

//  Node v22 + ESM-compatible import
const CloudinaryStorage = require("multer-storage-cloudinary").default;

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "logistics-erp",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [{ width: 1000, height: 1000, crop: "limit" }],
  },
});

const upload = multer({
  storage,
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

module.exports = upload;
