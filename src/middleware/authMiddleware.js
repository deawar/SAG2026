/**
 * Authentication Middleware
 * Handles JWT verification, role-based access control
 */

const authenticationService = require('../services/authenticationService');

class AuthMiddleware {
  /**
   * Verify JWT token
   */
  verifyToken(req, res, next) {
    try {
      const token = req.headers.authorization?.split(' ')[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }

      // In production, verify with actual JWT
      const decoded = authenticationService.verifyToken(token);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  }

  /**
   * Verify user role
   */
  verifyRole(...allowedRoles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
        });
      }

      next();
    };
  }
}

module.exports = new AuthMiddleware();
