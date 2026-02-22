const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

/*
 CORS CONFIGURATION
 Frontend (Vite): http://localhost:5173
 Backend (Railway): https://logisticsmanagementerp-production.up.railway.app
 */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://logistics-management-frontend-iota.vercel.app/",
      "https://logisticsmanagementerp-production.up.railway.app",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Handle preflight requests
app.options("*", cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
const routes = require("./routes");
app.use("/api", routes);

// Health check
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// Global error handler (e.g. multer/Cloudinary upload errors) – must be last
app.use((err, req, res, next) => {
  const isMulter = err.code && String(err.code).startsWith("LIMIT_");
  const isUpload =
    err.message && typeof err.message === "string" && /image|file|upload/i.test(err.message);
  const status =
    err.status ||
    err.statusCode ||
    (isMulter || isUpload ? 400 : 500);
  let message =
    (err && typeof err.message === "string" && err.message) ||
    (err && err.error && typeof err.error.message === "string" && err.error.message) ||
    (typeof err === "string" ? err : "");
  if (!message) message = "Upload or server error";
  if (typeof message !== "string") message = String(message);
  console.error("Request error:", err.message || err.code || err);
  res.status(status).json({ message });
});

// Server configuration
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Cloudinary image hosting enabled");
});
