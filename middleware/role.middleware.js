/**
 * Role-based Authorization Middleware
 * Restricts access to routes based on user roles
 * @param {...string} roles - Allowed roles for the route
 * @returns {Function} Express middleware function
 */
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
}

module.exports = allowRoles;