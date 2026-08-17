/**
 * Authentication Middleware
 * Handles JWT verification, role-based access control
 */

const jwt = require('jsonwebtoken');
const { tokenBlacklist } = require('../services/authenticationService');
const { pool } = require('../models/index');

class AuthMiddleware {
  /**
   * Verify JWT token
   * Security: Validates httpOnly cookie, signature (HS256), claims, expiry
   */
  async verifyToken(req, res, next) {
    try {
      // 1. Extract the access token from the httpOnly cookie (hard cut — no Bearer).
      const token = req.cookies?.access_token;
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
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

      // 5b. Reject limited-purpose tokens. The pre-authentication tokens issued
      //     by /login (purpose '2fa_challenge' / '2fa_force_setup') carry a role
      //     and would otherwise pass as a full Bearer token, bypassing 2FA.
      //     Full-session access tokens never set `purpose`; they are consumed
      //     only by /verify-2fa and /2fa/force-verify, which parse them directly
      //     and do not use this middleware.
      if (decoded.purpose) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token: limited-purpose token cannot be used for access'
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
        schoolId: null,
        email: decoded.email,
        jti: decoded.jti,
        exp: decoded.exp,
        twoFaEnabled: decoded.twoFaEnabled
      };

      // 9. Hydrate school_id from DB for SCHOOL_ADMIN only.
      //    SCHOOL_ADMIN uses schoolId for cross-school authorization checks, so
      //    the JWT claim cannot be trusted — a school reassignment must take effect
      //    immediately. SITE_ADMIN ignores schoolId; other roles have no admin checks.
      //    When pool is unavailable (test env), fall back to the JWT claim so
      //    manually-crafted test tokens continue to supply the expected value.
      if (pool && req.user.role === 'SCHOOL_ADMIN') {
        try {
          const { rows } = await pool.query(
            'SELECT school_id FROM users WHERE id = $1 AND deleted_at IS NULL',
            [userId]
          );
          req.user.schoolId = rows[0]?.school_id ?? null;
        } catch (dbErr) {
          console.error('[auth] school_id lookup failed:', dbErr.message);
          // Fail closed: null never grants unintended cross-school access.
        }
      } else {
        req.user.schoolId = decoded.schoolId ?? null;
      }

      return next();
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
    const token = req.cookies?.access_token;
    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256']
      });

      // Reject limited-purpose pre-auth tokens (2fa_challenge / 2fa_force_setup)
      // here too — they must never populate req.user, even on optional routes.
      if (decoded.type !== 'refresh' && !decoded.purpose) {
        const userId = decoded.sub || decoded.userId;
        if (userId && decoded.role && !await tokenBlacklist.isRevoked(decoded.jti)) {
          req.user = {
            id: userId,
            userId,
            sub: userId,
            role: decoded.role,
            schoolId: decoded.schoolId ?? null,
            email: decoded.email,
            jti: decoded.jti,
            exp: decoded.exp,
            twoFaEnabled: decoded.twoFaEnabled
          };
          if (pool && decoded.role === 'SCHOOL_ADMIN') {
            try {
              const { rows } = await pool.query(
                'SELECT school_id FROM users WHERE id = $1 AND deleted_at IS NULL',
                [userId]
              );
              req.user.schoolId = rows[0]?.school_id ?? null;
            } catch (dbErr) {
              console.error('[auth] optional school_id lookup failed:', dbErr.message);
            }
          }
        }
      }
    } catch (_e) {
      // Invalid/expired/revoked token — proceed without user (public access)
    }

    return next();
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
    return next();
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

      return next();
    };
  }
}

module.exports = new AuthMiddleware();
