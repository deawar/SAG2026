/**
 * Authentication Middleware
 * Handles JWT verification, role-based access control
 */

const jwt = require('jsonwebtoken');
const { tokenBlacklist } = require('../services/authenticationService');

class AuthMiddleware {
  /**
   * Verify JWT token
   * Security: Validates Bearer prefix, signature (HS256), claims, expiry
   */
  async verifyToken(req, res, next) {
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
        algorithms: ['HS256']
      });

      // 5. Validate token type (must be 'access', not 'refresh')
      if (decoded.type === 'refresh') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token: refresh token cannot be used as access token'
        });
      }

      // 6. Validate required claims (userId can be in 'sub' or direct property)
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

      // 7. Check token blacklist (revoked via logout)
      if (await tokenBlacklist.isRevoked(decoded.jti)) {
        return res.status(401).json({
          success: false,
          message: 'Token has been revoked'
        });
      }

      // 8. Attach user to request object
      req.user = {
        id: userId,
        userId,
        sub: userId,
        role: decoded.role,
        schoolId: decoded.schoolId,
        email: decoded.email,
        jti: decoded.jti,
        exp: decoded.exp,
        twoFaEnabled: decoded.twoFaEnabled
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
   * Optional JWT verification — populates req.user if a valid token is present,
   * but does NOT reject unauthenticated requests (used for public routes).
   */
  async optionalVerifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256']
      });

      if (decoded.type !== 'refresh') {
        const userId = decoded.sub || decoded.userId;
        if (userId && decoded.role && !await tokenBlacklist.isRevoked(decoded.jti)) {
          req.user = {
            id: userId,
            userId,
            sub: userId,
            role: decoded.role,
            schoolId: decoded.schoolId,
            email: decoded.email,
            jti: decoded.jti,
            exp: decoded.exp,
            twoFaEnabled: decoded.twoFaEnabled
          };
        }
      }
    } catch (_e) {
      // Invalid/expired/revoked token — proceed without user (public access)
    }

    next();
  }

  /**
   * Defense-in-depth: block admin routes for admin users who have not enabled 2FA.
   * Placed after verifyToken so req.user is populated.
   * Rejects with 403 if the token was issued without twoFaEnabled=true for an admin role.
   */
  requireAdmin2fa(req, res, next) {
    const adminRoles = ['SITE_ADMIN', 'SCHOOL_ADMIN'];
    if (adminRoles.includes(req.user?.role) && !req.user?.twoFaEnabled) {
      return res.status(403).json({
        success: false,
        error: 'admin_2fa_required',
        message: 'Admin accounts must have 2FA enabled. Please complete 2FA setup at /force-2fa-setup.html'
      });
    }
    next();
  }

  /**
   * Verify user role
   */
  verifyRole(...allowedRoles) {
    // Flatten in case roles are passed as an array: verifyRole(['ADMIN', 'USER'])
    allowedRoles = allowedRoles.flat();
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
