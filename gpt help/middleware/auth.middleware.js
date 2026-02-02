const jwt = require("jsonwebtoken");

/**
 * Authentication Middleware
 * Verifies JWT token from Authorization header
 * Attaches user info (id, role) to req.user
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "Token missing" });
  }

  const token = authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: "Invalid token format" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // attach user info to request
    req.user = {
      id: decoded.id,
      role: decoded.role
    };

    next(); // proceed to next middleware/route handler
  });
}

module.exports = authMiddleware;