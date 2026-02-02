const express = require("express");
require("dotenv").config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
const routes = require("./routes");
app.use("/api", routes);

// running route check 

app.get("/", (req, res) => {
  res.send("Backend is running");
});

// Server configuration
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Cloudinary image hosting enabled");
});