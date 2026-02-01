
# Section 11: Security Fixes Implementation Guide
**Status**: READY FOR IMPLEMENTATION  
**Priority**: CRITICAL  
**Estimated Duration**: 3-5 days  
**Start Date**: February 1, 2026

---

## PART 1: FIX #1 - AUTHENTICATION MIDDLEWARE (Day 1-2)

### Current State
- ❌ GET /api/auctions returns 200 for unauthenticated requests
- ❌ JWT signature validation not implemented
- ❌ Bearer prefix not validated
- ❌ Required claims (userId, role) not checked

### Target State
- ✅ All protected endpoints require valid JWT
- ✅ JWT signature validated with HS256
- ✅ Claims validated: userId, role, exp, iat, jti
- ✅ Bearer prefix required
- ✅ 401 returned on any validation failure

### Implementation Steps

#### Step 1: Review Current authMiddleware
**File**: [src/middleware/authMiddleware.js](src/middleware/authMiddleware.js)

**Current Code Pattern**:
```javascript
// NEEDS FIXING:
const authMiddleware = {
  verifyToken: (req, res, next) => {
    // TODO: Implement JWT verification
  },
  verifyRole: (allowedRoles) => {
    // TODO: Implement role verification
  }
};
```

#### Step 2: Implement JWT Verification
```javascript
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
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

    // 4. Verify signature and claims
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    // 5. Validate required claims
    if (!decoded.userId || !decoded.role) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token claims'
      });
    }

    // 6. Check JTI blacklist (optional - implement after)
    // if (isTokenBlacklisted(token)) {
    //   return res.status(401).json({ success: false, message: 'Token revoked' });
    // }

    // 7. Attach user to request
    req.user = {
      id: decoded.userId,
      role: decoded.role,
      schoolId: decoded.schoolId,
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
};
```

#### Step 3: Implement Role Verification
```javascript
const verifyRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};
```

#### Step 4: Apply Middleware to Routes
**File**: [src/routes/auctionRoutes.js](src/routes/auctionRoutes.js)

```javascript
const authMiddleware = require('../middleware/authMiddleware');

// Protected route - requires auth
router.get('/api/auctions/:id',
  authMiddleware.verifyToken,
  auctionController.getById
);

// Protected route - requires specific role
router.post('/api/auctions',
  authMiddleware.verifyToken,
  authMiddleware.verifyRole('SCHOOL_ADMIN', 'SITE_ADMIN'),
  auctionController.create
);
```

#### Step 5: Fix Login Endpoint
**File**: [src/controllers/userController.js](src/controllers/userController.js) or [src/routes/authRoutes.js](src/routes/authRoutes.js)

```javascript
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password required'
      });
    }

    // 2. Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // 3. Verify password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // 4. Check if 2FA enabled
    if (user.totpEnabled) {
      // Return challenge, not token
      return res.status(200).json({
        success: true,
        message: '2FA verification required',
        data: { 
          tempToken: jwt.sign(
            { userId: user.id, purpose: '2fa' },
            process.env.JWT_SECRET,
            { expiresIn: '5m' }
          )
        }
      });
    }

    // 5. Generate access token
    const accessToken = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        schoolId: user.schoolId,
        jti: uuidv4()
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // 6. Generate refresh token
    const refreshToken = jwt.sign(
      {
        userId: user.id,
        type: 'refresh',
        jti: uuidv4()
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 7. Save refresh token to DB
    await Session.create({
      userId: user.id,
      refreshToken,
      expiresAt: new Date(Date.now() + 7*24*60*60*1000)
    });

    // 8. Return tokens
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
};
```

---

## PART 2: FIX #2 - INPUT SANITIZATION (Day 1-2)

### Current State
- ❌ SQL injection not prevented (parameterized queries not used)
- ❌ XSS vulnerabilities (no input encoding)
- ❌ Null bytes accepted
- ❌ Oversized payloads may cause issues

### Target State
- ✅ All queries use parameterized statements
- ✅ All user input sanitized before storage
- ✅ All output HTML-encoded in responses
- ✅ Null bytes rejected
- ✅ Payload size limits enforced

### Implementation Steps

#### Step 1: Create Validation Utility
**File**: [src/utils/validationUtils.js](src/utils/validationUtils.js)

```javascript
const sanitizer = require('sanitizer');
const validator = require('validator');

class ValidationUtils {
  /**
   * Sanitize string input (remove dangerous characters)
   */
  static sanitizeString(input, maxLength = 1000) {
    if (typeof input !== 'string') return '';
    
    // 1. Remove null bytes
    let sanitized = input.replace(/\x00/g, '');
    
    // 2. Trim whitespace
    sanitized = sanitized.trim();
    
    // 3. Enforce maximum length
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }
    
    // 4. HTML encode for storage
    // (decode when displaying)
    return sanitized;
  }

  /**
   * Validate email format
   */
  static validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const sanitized = this.sanitizeString(email, 254);
    return validator.isEmail(sanitized);
  }

  /**
   * Validate password strength
   */
  static validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    
    const requirements = {
      minLength: password.length >= 12,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    return Object.values(requirements).every(req => req);
  }

  /**
   * Validate URL (prevent XSS via redirect)
   */
  static validateURL(url) {
    try {
      const parsed = new URL(url);
      // Only allow http/https
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Prevent SQL injection in search queries
   */
  static sanitizeSearchQuery(query) {
    if (!query || typeof query !== 'string') return '';
    
    // Remove SQL keywords and special characters
    const sanitized = query
      .replace(/[;'"`]/g, '') // Remove quote chars
      .replace(/--/g, '')      // Remove SQL comment
      .replace(/\/\*/g, '')    // Remove comment start
      .trim();

    return this.sanitizeString(sanitized, 100);
  }

  /**
   * Validate ID format (UUID)
   */
  static validateUUID(id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }
}

module.exports = ValidationUtils;
```

#### Step 2: Update User Login with Parameterized Queries
**File**: [src/models/user.js](src/models/user.js) or [src/services/authenticationService.js](src/services/authenticationService.js)

```javascript
// BEFORE (VULNERABLE):
const user = await db.query(
  `SELECT * FROM users WHERE email = '${email}'`
);

// AFTER (SAFE):
const user = await db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]  // Parameter safely escaped
);
```

#### Step 3: Update Application Middleware
**File**: [src/app.js](src/app.js)

```javascript
// Add body parser with size limits
app.use(express.json({ limit: '10kb' })); // Reject payloads > 10KB
app.use(express.urlencoded({ limit: '10kb' })); // For form data

// Add custom middleware to validate content length
app.use((req, res, next) => {
  const contentLength = parseInt(req.headers['content-length']) || 0;
  if (contentLength > 10 * 1024 * 1024) { // 10MB hard limit
    return res.status(413).json({
      success: false,
      message: 'Payload too large'
    });
  }
  next();
});
```

---

## PART 3: FIX #3 - RATE LIMITING (Day 2)

### Target Implementation
```bash
npm install express-rate-limit
```

**File**: [src/app.js](src/app.js) or new [src/middleware/rateLimitMiddleware.js](src/middleware/rateLimitMiddleware.js)

```javascript
const rateLimit = require('express-rate-limit');

// Login rate limit: 5 attempts per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test'
});

// API rate limit: 100 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false
});

// Payment rate limit: 10 requests per minute
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many payment requests',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply to routes
app.post('/api/auth/login', loginLimiter, loginController.login);
app.use('/api/', apiLimiter);
app.use('/api/payments', paymentLimiter);
```

---

## PART 4: FIX #4 - PAYMENT ENDPOINTS (Day 2-3)

### Create Payment Routes
**File**: [src/routes/paymentRoutes.js](src/routes/paymentRoutes.js)

```javascript
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');

// Protected routes (require authentication)
router.post('/payments/process',
  authMiddleware.verifyToken,
  paymentController.processPayment
);

router.get('/payments/:transactionId',
  authMiddleware.verifyToken,
  paymentController.getPaymentStatus
);

router.post('/payments/:transactionId/refund',
  authMiddleware.verifyToken,
  authMiddleware.verifyRole('SITE_ADMIN', 'SCHOOL_ADMIN'),
  paymentController.refundPayment
);

// Webhook (unprotected but signature verified)
router.post('/webhooks/payment',
  paymentController.handleWebhook
);

module.exports = router;
```

### Create Payment Controller
**File**: [src/controllers/paymentController.js](src/controllers/paymentController.js)

```javascript
class PaymentController {
  async processPayment(req, res, next) {
    try {
      const { auctionId, amount, paymentToken } = req.body;
      const userId = req.user.id;

      // 1. Validate input
      if (!auctionId || !amount || !paymentToken) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      // 2. Validate amount is positive
      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid amount'
        });
      }

      // 3. Call payment service
      const transaction = await paymentService.processPayment({
        userId,
        auctionId,
        amount,
        paymentToken,
        idempotencyKey: req.headers['idempotency-key']
      });

      // 4. Return transaction (NO token data)
      return res.json({
        success: true,
        message: 'Payment processed successfully',
        data: {
          transactionId: transaction.id,
          amount: transaction.amount,
          status: transaction.status,
          timestamp: transaction.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async refundPayment(req, res, next) {
    try {
      const { transactionId } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;

      // 1. Validate transaction exists
      const transaction = await Payment.findById(transactionId);
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // 2. Check 48-hour immutability window
      const age = Date.now() - transaction.createdAt.getTime();
      if (age > 48 * 60 * 60 * 1000) {
        return res.status(403).json({
          success: false,
          message: 'Transaction immutable after 48 hours'
        });
      }

      // 3. Process refund
      const refund = await paymentService.refundTransaction(
        transactionId,
        reason,
        adminId
      );

      // 4. Audit log
      await auditService.log({
        userId: adminId,
        action: 'REFUND_ISSUED',
        resource: transactionId,
        details: { reason, amount: transaction.amount }
      });

      return res.json({
        success: true,
        message: 'Refund issued successfully',
        data: {
          refundId: refund.id,
          status: refund.status,
          amount: refund.amount
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async handleWebhook(req, res, next) {
    try {
      const signature = req.headers['x-stripe-signature'];
      const body = req.rawBody; // Must be raw body, not parsed

      // 1. Verify signature
      if (!paymentService.verifyWebhookSignature(signature, body)) {
        return res.status(401).json({
          success: false,
          message: 'Invalid signature'
        });
      }

      // 2. Parse event
      const event = JSON.parse(body);

      // 3. Handle event type
      if (event.type === 'charge.succeeded') {
        await paymentService.handleChargeSucceeded(event.data);
      } else if (event.type === 'charge.failed') {
        await paymentService.handleChargeFailed(event.data);
      }

      // 4. Return 200 OK
      return res.json({ received: true });
    } catch (error) {
      // Always return 200 for webhooks to prevent retries
      res.json({ received: true });
      next(error);
    }
  }
}

module.exports = new PaymentController();
```

---

## PART 5: TEST VALIDATION

### Run Tests After Each Fix
```bash
# After fixing authMiddleware
npm test -- tests/security/authentication.test.js --testNamePattern="JWT Token Validation"

# After adding rate limiting
npm test -- tests/security/owasp-top-10.test.js --testNamePattern="Rate Limiting"

# After implementing payment endpoints
npm test -- tests/security/payment-security.test.js

# Run all security tests
npm test -- tests/security/
```

### Success Criteria for Phase 1
- ✅ 15-20 new tests passing (JWT, auth, basic validation)
- ✅ 0 critical authentication bypass issues
- ✅ Rate limiting working on login endpoint
- ✅ Payment endpoints returning proper status codes

---

## PART 6: FILES TO MODIFY

### Critical Files (Must Fix)
1. [src/middleware/authMiddleware.js](src/middleware/authMiddleware.js) - JWT validation
2. [src/utils/validationUtils.js](src/utils/validationUtils.js) - Input sanitization
3. [src/routes/auctionRoutes.js](src/routes/auctionRoutes.js) - Apply middleware
4. [src/routes/paymentRoutes.js](src/routes/paymentRoutes.js) - Create endpoints
5. [src/controllers/paymentController.js](src/controllers/paymentController.js) - Implement logic

### Supporting Files
6. [src/app.js](src/app.js) - Add rate limiter, body limits
7. [src/services/paymentService.js](src/services/paymentService.js) - Payment processing
8. [src/routes/authRoutes.js](src/routes/authRoutes.js) - Fix login endpoint

---

## PART 7: EXPECTED RESULTS AFTER PHASE 1

### Tests Passing (Target: 50-55/91)
- ✅ JWT Validation (6/6)
- ✅ Authentication Bypass Prevention (5/5)
- ✅ CSRF Protection (4/4)
- ✅ Input Validation (3/3)
- ✅ Rate Limiting (3/3)
- ✅ Password Security (3/3)
- ✅ Sensitive Data Exposure (4/4)
- ✅ Security Headers (3/4)
- ✅ XSS Prevention (3/5)
- ✅ Payment Data Security (5/5)
- ✅ RBAC (5/5 with role enforcement)

### Vulnerabilities Resolved
- ✅ 25+ critical/high vulnerabilities fixed
- ✅ Authentication middleware fully functional
- ✅ Input sanitization implemented
- ✅ Rate limiting active
- ✅ Payment endpoints accessible

### Remaining Work (Phase 2-3)
- 🔄 2FA endpoints
- 🔄 Token refresh flow
- 🔄 COPPA implementation
- 🔄 Admin dashboard
- 🔄 Audit logging

---

**Start Implementation**: Immediately after this plan review  
**Target Completion**: February 2-3, 2026  
**Validation**: npm test -- tests/security/
