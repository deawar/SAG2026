/**
 * Authentication Middleware
 * Handles JWT verification, role-based access control
 */

const jwt = require('jsonwebtoken');
const authenticationService = require('../services/authenticationService');

class AuthMiddleware {
  /**
   * Verify JWT token
   * Security: Validates Bearer prefix, signature (HS256), claims, expiry
   */
  verifyToken(req, res, next) {
    try {
      // 1. Extract Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          message: 'Authorization header required'
        });
      }

      // 2. Validate Bearer prefix
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'Invalid Authorization header format'
        });
      }

      // 3. Extract token
      const token = authHeader.substring(7);
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }

      // 4. Verify signature and claims with HS256
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: 'silent-auction-gallery',
        audience: 'silent-auction-users'
      });

      // 5. Validate required claims (userId can be in 'sub' or direct property)
      const userId = decoded.sub || decoded.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token claims: missing userId'
        });
      }

      if (!decoded.role) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token claims: missing role'
        });
      }

      // 6. Attach user to request object
      req.user = {
        id: userId,
        userId: userId,
        sub: userId,
        role: decoded.role,
        schoolId: decoded.schoolId,
        email: decoded.email,
        jti: decoded.jti
      };

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired'
        });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Authentication failed'
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
