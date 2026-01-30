# Silent Auction Gallery - Authoritative Master Prompt

**Project**: Silent Auction Gallery (SAG)  
**Website**: https://SAG.live  
**Status**: Production-Grade, PCI-DSS & WCAG 2.1 AA Compliant  
**Last Updated**: January 29, 2026

---

## PART 1: AUTHORITATIVE ARCHITECTURE SPECIFICATION

### 1.1 Technology Stack (LOCKED - No Substitutions)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend** | Node.js 18+ / Express 4.18+ | Production-grade, async-first, security middleware ecosystem |
| **Frontend** | Vanilla HTML5, CSS3, ES6+ JS | No build step, fast load, accessibility control, 508/WCAG 2.1 AA |
| **Database** | PostgreSQL (primary), MySQL-compatible | Relational, normalized, ACID compliance, audit triggers |
| **Real-time** | WebSocket (ws library) | Low-latency bid updates, QR code scans, auction status |
| **Authentication** | JWT (HS256) + TOTP + bcrypt | 15-min access tokens, 7-day refresh, hardware 2FA ready |
| **Payment** | Stripe, Square, PayPal, Authorize.net | Tokenization, PCI-DSS 3.2.1, per-auction gateway selection |
| **Hosting** | Linux VPS, Docker-ready | OS-agnostic, container orchestration ready |
| **Storage** | Local filesystem → S3 at 500GB | Auto-migration, cost optimization, backup safety |
| **Testing** | Jest + Supertest | Unit + Integration, 20+ tests per section minimum |
| **Deployment** | Git + CI/CD pipeline | Automated testing, staging validation, production rollout |

### 1.2 Locked Architectural Decisions

**Decision 1: Service-Model-Controller Pattern**
- **Models**: Data validation, schema enforcement, input sanitization
- **Services**: Business logic, cross-model operations, compliance checks
- **Controllers**: HTTP/WebSocket request handling, response formatting
- **Rationale**: Clear separation prevents logic drift, enables testing in isolation, supports scaling

**Decision 2: Real-time Singleton Pattern**
```javascript
// realtimeService ALWAYS exports singleton instance (never class)
module.exports = new RealtimeService();

// Usage: const realtimeService = require('../services/realtimeService');
// DO NOT: const RealtimeService = require(...); new RealtimeService();
```
- **Why**: Ensures single WebSocket server instance, consistent state management, prevents connection leaks

**Decision 3: Authentication Layering (Non-negotiable Order)**
1. JWT token verification (extract from Authorization header)
2. Token signature validation (HS256, exp claim)
3. RBAC role checking (allowedRoles array)
4. Resource ownership verification (userId/schoolId)
5. Compliance checks (2FA if required, session limits)

**Decision 4: Payment Data Isolation**
```javascript
// ABSOLUTE: Raw card data NEVER touches application
// Flow: Frontend → Gateway tokenization → Token only stored in DB
// Log: Transaction ID, amount, status; NEVER card last4, CVV, token value
```

**Decision 5: Multi-Tenant School Architecture**
- Auctions belong to Schools (not global)
- Teachers create auctions within their school
- Students bid on school auctions
- Reports filtered by school context
- **No data leakage between schools** (enforced in queries)

### 1.3 Compliance Lock-In

| Compliance | Implementation | Enforcement |
|-----------|----------------|-------------|
| **PCI-DSS 3.2.1** | Tokenization only, audit trails, encrypted vaults | PaymentService pre-req for any payment |
| **GDPR** | Soft deletes, audit logs, consent tracking, data export | UserModel tracks `deleted_at`, Audit table immutable |
| **COPPA** | Age verification, parental consent, limited data | COPPA_VERIFICATIONS table, FERPA checks |
| **FERPA** | Student data access logging, teacher-only access | AuthMiddleware enforces role + school context |
| **CCPA** | Data deletion, privacy policy, opt-out | User deletion service cascades with audit |
| **WCAG 2.1 AA** | Semantic HTML, ARIA, keyboard navigation | Frontend validation via accessibility.js |

---

## PART 2: CODE ORGANIZATION & PATTERNS

### 2.1 Directory Structure (Canonical)
```
Silent-Auction-Gallery/
├── src/
│   ├── index.js                 # Server startup, WebSocket init, schema loading
│   ├── app.js                   # Express config, middleware, CORS, helmet
│   ├── models/
│   │   └── index.js             # ALL 6+ models in single file (size: <1500 LOC)
│   ├── services/
│   │   ├── authenticationService.js    # JWT, TOTP, RBAC, Sessions (4 classes)
│   │   ├── auctionService.js           # Auction lifecycle, fee calculation
│   │   ├── bidService.js               # Bid validation, auto-bid logic
│   │   ├── paymentService.js           # Gateway abstraction (4+ gateway classes)
│   │   ├── realtimeService.js          # WebSocket, broadcast (singleton)
│   │   ├── biddingService.js           # High-level bidding workflows
│   │   └── [otherServices].js
│   ├── controllers/
│   │   ├── auctionController.js
│   │   ├── bidController.js
│   │   ├── userController.js
│   │   └── [otherControllers].js
│   ├── routes/
│   │   ├── index.js             # Aggregates all routes
│   │   ├── auctionRoutes.js
│   │   ├── bidRoutes.js
│   │   ├── authRoutes.js
│   │   └── [otherRoutes].js
│   ├── middleware/
│   │   └── authMiddleware.js    # JWT, role verification
│   └── utils/
│       ├── validationUtils.js   # Input sanitization, regex patterns
│       ├── dateUtils.js         # Auction time logic, timezone
│       └── authUtils.js         # Password hashing, token generation
├── tests/
│   ├── unit/                    # Models, services, utils (no DB)
│   │   ├── models/
│   │   ├── services/
│   │   └── utils/
│   └── integration/             # Controllers, routes, full flows (with DB)
│       ├── controllers/
│       ├── services/
│       └── routes/
├── public/
│   ├── index.html
│   ├── auctions.html
│   ├── auction-detail.html
│   ├── user-dashboard.html
│   ├── admin-dashboard.html
│   ├── css/
│   │   ├── main.css
│   │   ├── responsive.css
│   │   └── accessibility.css
│   └── js/
│       ├── api-client.js        # HTTP helper, token injection
│       ├── websocket-client.js  # WebSocket, reconnect logic
│       ├── ui-components.js     # Reusable DOM functions
│       └── [pageSpecific].js
├── schema.sql                   # PostgreSQL schema, migrations
├── package.json
├── jest.config.js
├── .env.example
├── .github/
│   └── copilot-instructions.md  # THIS FILE
└── README.md
```

### 2.2 Model Patterns (All in src/models/index.js)

**Every model has these methods:**
```javascript
class [Entity]Model {
  constructor(database) { this.db = database; }
  
  // Standard CRUD
  async create(data) { /* validate, insert */ }
  async read(id) { /* retrieve, validate existence */ }
  async update(id, data) { /* validate, update */ }
  async delete(id) { /* soft delete with audit */ }
  
  // Validation (internal, called by create/update)
  validateInput(data) { /* throw Error if invalid */ }
  
  // Domain-specific
  async [businessLogic](params) { /* transaction-safe */ }
}
```

**Validation Pattern:**
```javascript
validateInput(data) {
  if (!data.email || !validator.isEmail(data.email)) 
    throw new Error('Invalid email format');
  if (data.age && data.age < 13) 
    throw new Error('COPPA: Users under 13 require parental consent');
  // ... all field validations
}
```

### 2.3 Service Patterns

**Standard Service Class:**
```javascript
class [Domain]Service {
  constructor(model, dependencies) {
    this.model = model;
    this.auth = dependencies.authService;
    // ...
  }
  
  async performAction(userId, data) {
    // 1. Validate auth context
    const user = await this.auth.verifyUser(userId);
    
    // 2. Check permissions
    if (user.role !== 'SITE_ADMIN') 
      throw new Error('Unauthorized');
    
    // 3. Business logic
    const result = await this.model.create(data);
    
    // 4. Audit logging
    await this.auditLog({ userId, action: 'CREATE', resource: result.id });
    
    // 5. Real-time broadcast (if relevant)
    realtimeService.broadcast('resource-created', result);
    
    return result;
  }
}

module.exports = [Domain]Service;
```

**Singleton Service Export:**
```javascript
// realtimeService.js - ALWAYS singleton
module.exports = new RealtimeService();

// Other services - ALWAYS class export
module.exports = [ServiceName];
```

### 2.4 Controller Patterns

**Standard Controller Method:**
```javascript
class [Entity]Controller {
  constructor(service) {
    this.service = service;
  }
  
  async handleRequest(req, res, next) {
    try {
      // 1. Auth already verified by authMiddleware
      const userId = req.user.id;
      
      // 2. Validate input
      const { error, value } = this.validateInput(req.body);
      if (error) return res.status(400).json({ success: false, errors: error });
      
      // 3. Call service
      const result = await this.service.performAction(userId, value);
      
      // 4. Standard response format
      return res.json({ 
        success: true, 
        message: 'Operation successful',
        data: result 
      });
    } catch (error) {
      next(error); // Let error middleware handle
    }
  }
}
```

**Response Format (ALL endpoints):**
```javascript
{
  "success": boolean,
  "message": "Human-readable message",
  "data": { /* response payload */ } | null,
  "errors": [ "field-specific error messages" ] | null,
  "timestamp": "2026-01-29T10:30:00Z"
}
```

### 2.5 Authentication & Authorization Patterns

**JWT Service (in authenticationService.js):**
```javascript
class JWTService {
  generateAccessToken(userId, role) {
    // Returns: JWT with 15-min expiry, HS256, issued/audience/jti claims
  }
  
  generateRefreshToken(userId) {
    // Returns: JWT with 7-day expiry, stored in user sessions
  }
  
  verifyToken(token) {
    // Validates signature, expiry, claims; throws if invalid
  }
}
```

**RBAC Service (in authenticationService.js):**
```javascript
class RBACService {
  // Hierarchy: SITE_ADMIN > SCHOOL_ADMIN > TEACHER > STUDENT > BIDDER
  
  canPerformAction(role, action, resource) {
    // Returns boolean; checks role hierarchy + resource type permissions
  }
  
  async enforceAccess(userId, schoolId, action) {
    // Throws if user lacks permission for action in school context
  }
}
```

**Middleware Usage:**
```javascript
// In routes
router.post('/auctions', 
  authMiddleware.verifyToken,
  authMiddleware.verifyRole('SCHOOL_ADMIN', 'SITE_ADMIN'),
  auctionController.create
);
```

### 2.6 Payment Service Pattern

**Multi-Gateway Architecture:**
```javascript
class PaymentGateway {
  // Abstract base
  async tokenizePaymentMethod(cardData) { /* throws */ }
  async chargeCard(token, amount) { /* throws */ }
  async refundCharge(transactionId, amount) { /* throws */ }
}

class StripeGateway extends PaymentGateway {
  // Stripe-specific implementation
}

class SquareGateway extends PaymentGateway {
  // Square-specific implementation
}

class PaymentService {
  async processPayment(auctionId, bidData, gatewayType) {
    // 1. Select gateway (from auction config)
    const gateway = this.getGateway(gatewayType);
    
    // 2. Tokenize (frontend already did this, verify token)
    // 3. Charge via gateway
    // 4. Create transaction record (NO raw card data)
    // 5. Audit log
    // 6. Webhook listener confirms completion
  }
}
```

**PCI-DSS Enforcement:**
```javascript
// ABSOLUTE RULES:
// - No raw card data in logs, responses, or storage
// - Every payment operation logged with timestamp, amount, status
// - Transaction records are immutable (no updates after 48 hours)
// - Tokens encrypted with AES-256 if stored
// - Webhook signature verification mandatory
```

### 2.7 Real-time WebSocket Pattern

**Singleton Initialization:**
```javascript
// src/index.js
const realtimeService = require('./services/realtimeService');
const server = http.createServer(app);

realtimeService.initializeWebSocketServer(server);
server.listen(PORT);

// In any service/controller
const realtimeService = require('../services/realtimeService');
realtimeService.broadcast('event-type', { data });
```

**Client-side Pattern:**
```javascript
// public/js/websocket-client.js
const ws = new WebSocket('wss://SAG.live/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'authenticate', token: jwtToken }));
};

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  switch (type) {
    case 'bid-placed': updateBidUI(data); break;
    case 'auction-status-changed': refreshAuction(data); break;
  }
};
```

---

## PART 3: TESTING REQUIREMENTS (Locked - 20+ Tests Per Section Minimum)

### 3.1 Test Execution Commands
```bash
# All tests
npm test

# Specific test file
npm test -- tests/unit/services/auctionService.test.js

# Watch mode
npm run test:watch

# Coverage report
npm test -- --coverage
```

### 3.2 Unit Test Structure (No Database)

**Location**: `tests/unit/[component]/`

**Template:**
```javascript
describe('[Component]', () => {
  let [dependency];
  
  beforeEach(() => {
    [dependency] = jest.mock(...);
  });
  
  describe('functionality', () => {
    test('should [expected behavior] when [condition]', () => {
      const input = { /* test data */ };
      const result = [component].method(input);
      expect(result).toEqual(expected);
    });
  });
  
  describe('validation', () => {
    test('should reject invalid input', () => {
      expect(() => [component].validate({}))
        .toThrow('Required field missing');
    });
  });
  
  describe('security', () => {
    test('should sanitize XSS attempts', () => {
      const malicious = '<script>alert("xss")</script>';
      const sanitized = [component].sanitize(malicious);
      expect(sanitized).not.toContain('<script>');
    });
  });
});
```

**Required Test Categories per Component:**
- ✅ Happy path (normal operation)
- ✅ Input validation (reject invalid data)
- ✅ Error handling (catch and throw appropriate errors)
- ✅ Security (XSS, injection, privilege escalation attempts)
- ✅ Edge cases (null, undefined, empty arrays, etc.)

### 3.3 Integration Test Structure (With Database)

**Location**: `tests/integration/[layer]/`

**Template:**
```javascript
describe('[API Endpoint] Integration', () => {
  let app, db;
  
  beforeAll(async () => {
    db = await initTestDatabase();
    app = require('../../src/app');
  });
  
  afterAll(async () => {
    await db.query('ROLLBACK'); // Cleanup
  });
  
  describe('POST /auctions', () => {
    test('should create auction with valid payload', async () => {
      const response = await request(app)
        .post('/auctions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ name: 'Spring Auction', ... });
      
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
    });
    
    test('should reject unauthorized request', async () => {
      const response = await request(app)
        .post('/auctions')
        .send({ name: 'Hacker Auction' });
      
      expect(response.status).toBe(401);
    });
    
    test('should validate school_id ownership', async () => {
      // Teacher tries to create auction for different school
      const response = await request(app)
        .post('/auctions')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({ name: 'Auction', school_id: school2.id });
      
      expect(response.status).toBe(403);
      expect(response.body.message).toContain('different school');
    });
  });
});
```

**Required Test Scenarios per Endpoint:**
- ✅ Successful request with valid auth
- ✅ Request with expired/invalid token
- ✅ Request from different user role (should fail)
- ✅ Request with invalid payload
- ✅ Request with missing required fields
- ✅ Cross-school/cross-school access attempts
- ✅ Concurrency edge cases (simultaneous requests)

### 3.4 Minimum Test Coverage by Section

| Section | Unit Tests | Integration Tests | Total |
|---------|------------|------------------|-------|
| **Models** | 50+ | 30+ | **80+** |
| **Auth Service** | 30+ | 20+ | **50+** |
| **Auction Service** | 25+ | 25+ | **50+** |
| **Bid Service** | 25+ | 25+ | **50+** |
| **Payment Service** | 30+ | 20+ | **50+** |
| **Routes (API)** | 10+ | 30+ | **40+** |
| **Real-time** | 15+ | 10+ | **25+** |
| **Controllers** | 20+ | 20+ | **40+** |
| **Utils** | 20+ | — | **20+** |
| **Middleware** | 15+ | 10+ | **25+** |
| **TOTAL** | **240+** | **210+** | **450+** |

---

## PART 4: 14-SECTION PROJECT ROADMAP (With Testing Requirements)

## PART 4: 14-SECTION PROJECT ROADMAP (With Testing Requirements)

### Section 1: Architecture & Database Schema
**Outcome**: Zero rework required. Normalized PostgreSQL schema with compliance built-in.

**Entities**:
- Users (multi-role, 2FA enforced, age verification)
- Schools (College Board code indexed)
- Auctions (lifecycle management, auto-extend)
- Artwork (submission workflow, image tracking)
- Bids (manual + auto-bid support)
- Payment records (transaction audit trail, no raw card data)
- Notifications (delivery status, retry logic)
- Audit logs (GDPR/COPPA/FERPA compliance)
- Charity associations (school-charity mapping)

**Deliverables**:
- ✅ [schema.sql](schema.sql) (465+ lines, production-ready)
- ✅ Foreign keys (referential integrity)
- ✅ Check constraints (business rule validation)
- ✅ Unique indexes (email, College Board codes)
- ✅ Performance indexes (live auction queries)
- ✅ Database triggers (audit logging, status changes)
- ✅ Views (active auctions, winners, revenue summary)
- ✅ Soft deletes (GDPR compliance)

**Testing Requirements**:
- ✅ 20+ schema validation tests
- ✅ Constraint enforcement tests
- ✅ Index performance tests
- ✅ Data integrity tests
- ✅ Referential integrity tests
- ✅ Soft delete verification
- ✅ Migration script validation

**Commit Message**: `Section 1: Database schema with PCI-DSS, GDPR, COPPA compliance enforced`

---

### Section 2: Core Backend Models & Services
**Outcome**: Production-grade data models with complete validation, business logic, compliance enforcement.

**Models Required** (all in [src/models/index.js](src/models/index.js)):
1. **UserModel** (25+ methods):
   - Registration, authentication, password hashing (bcrypt 12 rounds)
   - TOTP 2FA setup/verification
   - COPPA age verification
   - Session management, concurrent session limits
   - Password reset with token validation
   
2. **SchoolModel** (12+ methods):
   - Create, retrieve, update school
   - Admin/teacher/student relationship management
   - College Board code validation
   - School-specific audit log filtering
   
3. **AuctionModel** (15+ methods):
   - Auction lifecycle (creation, approval, bidding, closing)
   - Fee calculation (3–5% sliding, $50 minimum)
   - Reserve price enforcement
   - Auto-extend logic (5 min if bid in last minute)
   - Status transitions (DRAFT → APPROVED → LIVE → CLOSED)
   
4. **ArtworkModel** (12+ methods):
   - Submission workflow
   - Teacher approval/rejection
   - Image upload/storage tracking
   - Artist metadata validation
   
5. **BidModel** (12+ methods):
   - Bid placement validation
   - Auto-bid increment calculation
   - Outbid detection
   - Proxy bidding logic
   
6. **PaymentModel** (10+ methods):
   - Transaction record creation (NO raw card data)
   - Fee calculation and application
   - Refund tracking
   - Payment method tokenization

**Services Required**:
- [authenticationService.js](src/services/authenticationService.js) - 4 classes (JWT, TOTP, RBAC, Sessions)
- [auctionService.js](src/services/auctionService.js) - High-level auction workflows
- [bidService.js](src/services/bidService.js) - Bid validation and placement
- [paymentService.js](src/services/paymentService.js) - Multi-gateway abstraction
- [userService.js](src/services/userService.js) - User management, compliance
- [biddingService.js](src/services/biddingService.js) - Advanced bidding workflows
- [realtimeService.js](src/services/realtimeService.js) - WebSocket singleton

**Testing Requirements**:
- ✅ 50+ unit tests (model validation, business logic)
- ✅ 30+ integration tests (database interactions)
- ✅ Input validation tests (all field types)
- ✅ COPPA/GDPR/FERPA compliance tests
- ✅ Password hashing verification (bcrypt)
- ✅ Transaction safety tests
- ✅ Edge case handling (null, undefined, boundary values)

**Commit Message**: `Section 2: Core models (UserModel, AuctionModel, BidModel) + services with 80+ tests`

---

### Section 3: Auction Management API
**Outcome**: Secure, efficient auction creation, management, execution.

**Features**:
1. **Auction Creation** (POST /auctions):
   - Only SCHOOL_ADMIN or SITE_ADMIN can create
   - Validate artwork belongs to school
   - Set start/end times, reserve price, gateway
   - Require school approval before LIVE status
   
2. **Auction Retrieval** (GET /auctions, GET /auctions/:id):
   - List active auctions (real-time bid count)
   - Pagination support (25 per page)
   - Filter by school, status, charity
   - Soft-deleted auctions excluded
   
3. **Auction Update** (PUT /auctions/:id):
   - Only creator or SITE_ADMIN can update
   - Status transitions enforced (DRAFT → APPROVED → LIVE → CLOSED)
   - Cannot update auction details if LIVE
   - Can only auto-extend if configured
   
4. **Auction Closure** (POST /auctions/:id/close):
   - Trigger winner selection
   - Calculate platform fees
   - Initiate payment processing
   - Send winner notifications
   - Log closure audit trail
   
5. **Real-time Updates**:
   - WebSocket broadcasts bid count changes
   - Auction status changes
   - Time remaining countdown
   - Winner announcement

**Endpoints**:
```javascript
GET    /auctions                    // List all (with pagination)
POST   /auctions                    // Create auction
GET    /auctions/:id                // Retrieve single
PUT    /auctions/:id                // Update auction
DELETE /auctions/:id                // Delete (soft delete)
POST   /auctions/:id/close          // Close and finalize
GET    /auctions/:id/bids           // Get bids for auction
```

**Testing Requirements**:
- ✅ 25+ unit tests (business logic, fee calculation)
- ✅ 25+ integration tests (CRUD operations, auth)
- ✅ Authorization tests (role-based access)
- ✅ Cross-school access prevention tests
- ✅ Status transition validation tests
- ✅ Real-time broadcast verification tests
- ✅ Edge case tests (very old auctions, zero bids, etc.)

**Commit Message**: `Section 3: Auction Management API with status lifecycle, fee calculation, 50+ tests`

---

### Section 4: User Authentication & Authorization
**Outcome**: Secure accounts, enforced 2FA, role-based access control.

**Features**:
1. **User Registration** (POST /auth/register):
   - Email verification (token sent to inbox)
   - Password strength validation (12+ chars, mixed case, special char)
   - COPPA verification (if <13, parental consent required)
   - 2FA setup mandatory (TOTP QR code generated)
   - Audit log creation
   
2. **Email Verification** (POST /auth/verify-email):
   - Token validation (expires 24 hours)
   - Mark email as verified
   - Prevent unverified users from bidding
   
3. **Login** (POST /auth/login):
   - Email/password validation
   - 2FA challenge (TOTP or backup code)
   - Session creation with JTI tracking
   - Return JWT access + refresh tokens
   - Concurrent session limit check (default 5)
   
4. **2FA Endpoints**:
   - POST /auth/2fa/setup - TOTP secret + QR code
   - POST /auth/2fa/verify - Confirm with code
   - POST /auth/2fa/disable - Disable with password
   - POST /auth/2fa/backup-codes - Generate 8 new codes
   
5. **Password Management**:
   - POST /auth/password/reset - Send reset email
   - POST /auth/password/reset/:token - Confirm reset
   - PUT /auth/password/change - Change (user must be logged in)
   - Bcrypt 12-round hashing, salted
   
6. **Logout** (POST /auth/logout):
   - Revoke JWT JTI (add to blacklist)
   - Clear session
   - Audit log
   
7. **Role-Based Access Control**:
   - 5-tier hierarchy: SITE_ADMIN > SCHOOL_ADMIN > TEACHER > STUDENT > BIDDER
   - 35+ granular permissions
   - Resource-level access (schoolId context)
   - Parent access to child accounts (COPPA)

**RBAC Matrix** (partial):
| Action | SITE_ADMIN | SCHOOL_ADMIN | TEACHER | STUDENT | BIDDER |
|--------|-----------|--------------|---------|---------|--------|
| Create Auction | ✓ | ✓ | ✗ | ✗ | ✗ |
| Approve Artwork | ✓ | ✓ | ✓ | ✗ | ✗ |
| Place Bid | ✓ | ✓ | ✓ | ✓ | ✓ |
| View Reports | ✓ | ✓ | ✗ | ✗ | ✗ |
| Delete User | ✓ | ✗ | ✗ | ✗ | ✗ |

**Endpoints**:
```javascript
POST   /auth/register               // User registration
POST   /auth/verify-email/:token    // Email verification
POST   /auth/login                  // User login
POST   /auth/logout                 // Logout
POST   /auth/refresh-token          // Refresh JWT
POST   /auth/2fa/setup              // TOTP setup
POST   /auth/2fa/verify             // TOTP verification
POST   /auth/2fa/disable            // Disable 2FA
POST   /auth/password/reset         // Reset password request
POST   /auth/password/reset/:token  // Complete reset
PUT    /auth/password/change        // Change password
```

**Testing Requirements**:
- ✅ 30+ unit tests (JWT generation, TOTP validation, password hashing)
- ✅ 20+ integration tests (login flow, 2FA, RBAC)
- ✅ Brute force protection tests
- ✅ Session limit enforcement tests
- ✅ Cross-role permission tests
- ✅ COPPA age verification tests
- ✅ Password reset token expiry tests
- ✅ Concurrent session tests

**Commit Message**: `Section 4: Authentication (JWT, TOTP, RBAC) + Authorization with 50+ tests`

---

### Section 5: Payment Processing
**Outcome**: Seamless, PCI-DSS compliant payment processing.

**Features**:
1. **Gateway Integration**:
   - Stripe (primary), Square, PayPal, Authorize.net
   - Per-auction gateway selection
   - Tokenization pre-processing (frontend handles card encryption)
   
2. **Transaction Processing**:
   - Charge winning bid amount + platform fees
   - Refund handling (full/partial, reason codes)
   - Webhook validation (gateway signatures)
   - Idempotency key support (prevent double-charge)
   
3. **Fee Calculation**:
   - Sliding scale: 3–5% + $50 minimum
   - Waivable via donation flag
   - School fee pool accumulation
   - Real-time calculation in auction lifecycle
   
4. **Fraud Detection**:
   - Velocity checks (N transactions per hour)
   - Duplicate detection (same card, same amount, same merchant)
   - Geographic mismatch alerts
   - Machine learning model input (flagged for manual review)
   
5. **Audit & Compliance**:
   - Transaction log (immutable, no updates after 48 hours)
   - NO card data stored (tokens only, encrypted AES-256)
   - PCI-DSS 3.2.1 validation
   - Webhook signature verification (HMAC-SHA256)
   
6. **Refund Workflow**:
   - POST /payments/:transactionId/refund
   - Reason code required (CUSTOMER_REQUEST, FRAUD, DUPLICATE, etc.)
   - Full or partial refund support
   - Audit trail with admin approval
   
7. **Payment Status Endpoints**:
   - GET /payments/:transactionId - Retrieve status
   - GET /auctions/:auctionId/payment-status - Auction payment state
   - Webhook listener (async, fire-and-forget)

**Data Model** (PaymentModel):
```javascript
// NO raw card data stored
{
  id: UUID,
  auctionId: UUID,
  buyerId: UUID,
  amount: Decimal(10,2),
  platformFee: Decimal(10,2),
  gateway: 'stripe' | 'square' | 'paypal' | 'authorize.net',
  tokenId: 'tok_XXXXX' (encrypted),
  transactionId: 'txn_XXXXX',
  status: 'pending' | 'completed' | 'failed' | 'refunded',
  refundedAmount: Decimal(10,2) | null,
  refundReason: string | null,
  webhookVerified: boolean,
  createdAt: timestamp,
  updatedAt: timestamp (only before 48h),
  metadata: { billingZip, last4Last2Digits } // GDPR safe
}
```

**Endpoints**:
```javascript
POST   /payments                    // Process payment (webhook listener)
GET    /payments/:transactionId     // Retrieve payment status
POST   /payments/:transactionId/refund // Initiate refund
GET    /auctions/:auctionId/payment-status // Auction payment state
```

**Testing Requirements**:
- ✅ 30+ unit tests (fee calculation, tokenization validation, fraud detection)
- ✅ 20+ integration tests (gateway mocking, refund flow)
- ✅ Webhook signature validation tests
- ✅ PCI-DSS compliance tests (no card data leak)
- ✅ Idempotency tests (prevent double-charge)
- ✅ Fraud detection tests (velocity, duplicates)
- ✅ Refund workflow tests
- ✅ Edge case tests (network timeout, partial refund)

**Commit Message**: `Section 5: Payment Processing (Stripe, Square, PayPal, Authorize.net) + PCI-DSS, 50+ tests`

---

### Section 6: Frontend Development
**Outcome**: Responsive, accessible (WCAG 2.1 AA), real-time-enabled web application.

**Technology**: Vanilla HTML5, CSS3, ES6+ JavaScript (NO frameworks)

**Pages**:
1. **index.html** - Landing page, featured auctions, school selector
2. **auctions.html** - Browse all auctions (paginated, filtered by school)
3. **auction-detail.html** - Single auction, bid history, real-time updates
4. **user-dashboard.html** - My bids, my auctions (teacher), saved items
5. **admin-dashboard.html** - Auction management, user management, reports
6. **auth.html** - Login/register form, 2FA verification UI

**Frontend Features**:
1. **Authentication UI**:
   - Registration form (email, password, COPPA verification)
   - Login form with 2FA challenge
   - TOTP QR code display
   - Backup code input
   
2. **Auction Browsing**:
   - Real-time bid count updates (WebSocket)
   - Time remaining countdown
   - Sorting (newest, closing soon, price)
   - Filtering (school, status, charity)
   - Pagination (25 per page)
   
3. **Bid Placement**:
   - Proxy bidding UI (show current high bid, suggest next)
   - Auto-bid setup with limit
   - Bid history table (last 10 bids)
   - Real-time outbid notifications
   - QR code display for offline reference
   
4. **Admin Dashboard**:
   - Auction CRUD forms
   - User role management
   - Report generation (CSV export)
   - Real-time auction status monitoring
   - Payment reconciliation
   
5. **Accessibility (WCAG 2.1 AA)**:
   - Semantic HTML (nav, main, section, article)
   - ARIA labels for form controls
   - Keyboard navigation (Tab, Enter, Escape)
   - Color contrast 4.5:1 minimum
   - Focus indicators visible
   - Alt text on all images
   - Screen reader support
   
6. **Responsive Design**:
   - Mobile-first (320px minimum)
   - Tablet optimization (768px)
   - Desktop (1024px+)
   - Touch-friendly buttons (48px minimum)
   - Flexible images/tables

**CSS Organization** ([public/css/](public/css/)):
- [main.css](public/css/main.css) - Component styles
- [responsive.css](public/css/responsive.css) - Media queries
- [accessibility.css](public/css/accessibility.css) - A11y-specific (focus, skip links)

**JavaScript Organization** ([public/js/](public/js/)):
- [api-client.js](public/js/api-client.js) - HTTP helper (auto JWT injection)
- [websocket-client.js](public/js/websocket-client.js) - WebSocket (auto-reconnect)
- [ui-components.js](public/js/ui-components.js) - Reusable DOM functions
- [index.js](public/js/index.js) - Page initialization
- [accessibility.js](public/js/accessibility.js) - A11y helpers

**Testing Requirements**:
- ✅ 10+ unit tests (form validation, utility functions)
- ✅ 20+ integration tests (page rendering, API calls)
- ✅ Accessibility audit (axe-core integration tests)
- ✅ Responsive design tests (different viewport sizes)
- ✅ WebSocket connection tests
- ✅ JWT injection tests (Authorization header)
- ✅ Real-time update tests

**Commit Message**: `Section 6: Frontend (HTML/CSS/JS) with WCAG 2.1 AA, responsive, real-time updates, 30+ tests`

---

### Section 7: Notification System
**Outcome**: Timely, informative notifications (email + SMS optional).

**Features**:
1. **Email Notifications**:
   - User registration confirmation
   - Email verification
   - Outbid alerts (within 1 minute of auction close)
   - Auction ending soon (1 hour before)
   - Winner notification (with payment link)
   - Payment confirmation
   - Refund notification
   - Account security alerts (login from new device)
   
2. **SMS Notifications** (optional):
   - Outbid alerts (critical, high-value auctions)
   - Auction ending soon (configurable)
   - Winner notification
   - Payment reminders
   
3. **Notification Model**:
   - Queued notifications (retry logic, 3 attempts)
   - Delivery status tracking (sent, failed, bounced)
   - User preference settings (opt-in/out per notification type)
   - Unsubscribe link (GDPR/CAN-SPAM compliance)
   
4. **Notification Templates** (Handlebars):
   - Welcome email
   - Email verification
   - Outbid alert
   - Auction ending
   - Winner announcement
   - Payment receipt
   - Refund confirmation
   
5. **Provider Abstraction**:
   - Email: Nodemailer (SMTP, SendGrid compatible)
   - SMS: Twilio API (provider-agnostic)
   
6. **Endpoints**:
   - POST /notifications/preferences - User notification settings
   - GET /notifications - User notification history
   - POST /notifications/:id/resend - Resend failed notification

**Testing Requirements**:
- ✅ 15+ unit tests (template rendering, retry logic)
- ✅ 10+ integration tests (email sending, webhook handling)
- ✅ Email template validation tests
- ✅ SMS provider tests (mocked Twilio)
- ✅ Delivery status tracking tests
- ✅ Opt-out/unsubscribe tests
- ✅ GDPR/CAN-SPAM compliance tests

**Commit Message**: `Section 7: Notification System (Email + SMS) with templates, retry logic, preferences, 25+ tests`

---

### Section 8: Admin Dashboard
**Outcome**: Centralized management and monitoring of auction platform.

**Admin Features**:
1. **Auction Management**:
   - Create/edit/delete auctions
   - Approve pending auctions
   - Manually extend/close auctions
   - Monitor bid activity (live chart)
   - View artwork submissions
   
2. **User Management**:
   - List/search users (by role, school, status)
   - Edit user details
   - Reset user 2FA
   - Deactivate/reactivate accounts
   - View user audit log (all actions)
   
3. **Payment Management**:
   - View all transactions (with status)
   - Process refunds
   - View platform fee accumulation
   - Reconcile with gateway
   - Export payment records (CSV)
   
4. **Reporting**:
   - Auction performance (revenue, bid count, duration)
   - User engagement (registrations, bid count, avg bid value)
   - Financial dashboard (total revenue, fees, school payout)
   - Fraud alerts (flagged transactions)
   - Compliance reports (GDPR/COPPA/FERPA audit trails)
   
5. **Real-time Monitoring**:
   - Live auction status (active, closing, closed)
   - Active bid count
   - User session count
   - Payment processing status
   
6. **Endpoints**:
   - GET /admin/dashboard - Dashboard metrics
   - GET /admin/auctions - Auction list (all statuses)
   - GET /admin/users - User management
   - GET /admin/payments - Payment records
   - GET /admin/reports - Report generation
   - POST /admin/reports/export - CSV export

**Testing Requirements**:
- ✅ 15+ unit tests (report calculation, filtering)
- ✅ 15+ integration tests (CRUD operations, authorization)
- ✅ Authorization tests (SITE_ADMIN only)
- ✅ Data export tests (CSV validation)
- ✅ Real-time metrics tests
- ✅ Audit log tests

**Commit Message**: `Section 8: Admin Dashboard with auction/user/payment management, reporting, real-time monitoring, 30+ tests`

---

### Section 9: Deployment & Testing
**Outcome**: Fully tested, deployment-ready application.

**Activities**:
1. **Continuous Integration**:
   - GitHub Actions pipeline
   - Run all tests (unit + integration) on push
   - ESLint validation
   - Coverage reporting (>80% threshold)
   - Build Docker image
   
2. **Continuous Deployment**:
   - Staging environment (auto-deploy on PR merge)
   - Smoke tests on staging
   - Production deployment (manual approval)
   - Database migration validation
   - Rollback capability
   
3. **User Acceptance Testing (UAT)**:
   - Test scenarios with real users
   - Feedback collection
   - Bug triage
   - Sign-off from stakeholders
   
4. **Performance Testing**:
   - Load test (1000 concurrent users)
   - Auction closure under load
   - Payment processing stress test
   - WebSocket connection stress test
   - Database query optimization
   
5. **Docker & Containerization**:
   - Dockerfile for Node.js app
   - docker-compose for local development
   - PostgreSQL container
   - Environment variable configuration
   
6. **Deployment Checklist**:
   - Database migrations tested
   - Environment variables configured
   - SSL/TLS certificate installed
   - CORS origins updated for production
   - Payment gateway credentials verified
   - Email/SMS providers configured
   - Monitoring/logging configured

**Testing Requirements**:
- ✅ 20+ unit tests (CI validation, build scripts)
- ✅ 20+ integration tests (deployment scenarios)
- ✅ Smoke tests (post-deployment verification)
- ✅ Load tests (1000 concurrent users)
- ✅ Database migration tests

**Commit Message**: `Section 9: CI/CD pipeline, Docker containerization, performance testing, deployment checklist`

---

### Section 10: Data Migration & Schema Validation
**Outcome**: Database fully populated with standardized, validated data.

**Activities**:
1. **Schema Creation**:
   - PostgreSQL initialization
   - Table creation with indexes
   - Trigger setup for audit logging
   - View creation for reporting
   
2. **Seed Data**:
   - Test school data
   - Sample users (all roles)
   - Sample auctions (various statuses)
   - Sample artwork (with images)
   - Sample bids (with bid history)
   
3. **Data Validation**:
   - Foreign key constraint verification
   - Index functionality verification
   - Trigger execution verification
   - Data type validation
   - Constraint enforcement tests
   
4. **Migration Scripts**:
   - Version control (schema_v1.0, v1.1, etc.)
   - Rollback capability
   - Data backup before migration
   - Validation after migration

**Testing Requirements**:
- ✅ 15+ unit tests (schema validation, data type checks)
- ✅ 10+ integration tests (full schema creation, seed data)
- ✅ Migration script tests
- ✅ Constraint enforcement tests
- ✅ Index performance tests

**Commit Message**: `Section 10: Database schema creation, seed data, validation, migration scripts`

---

### Section 11: Security Audit & Penetration Testing
**Outcome**: Identified vulnerabilities, implemented mitigations.

**Activities**:
1. **Vulnerability Scanning**:
   - OWASP Top 10 validation
   - Dependency scanning (npm audit)
   - Code security scanning (SonarQube)
   - API endpoint fuzzing
   
2. **Penetration Testing**:
   - SQL injection attempts
   - XSS injection attempts
   - CSRF validation
   - Privilege escalation attempts
   - Authentication bypass attempts
   - Payment system fraud attempts
   
3. **Security Controls**:
   - Input validation (all endpoints)
   - Output encoding (prevent XSS)
   - CSRF tokens (forms)
   - Rate limiting (login, API)
   - HTTPS/TLS enforcement
   - Security headers (Helmet.js)
   - JWT signature validation
   - Password hashing (bcrypt)
   
4. **Compliance Validation**:
   - PCI-DSS checklist
   - GDPR requirements
   - COPPA verification
   - FERPA audit
   - CCPA rights implementation
   
5. **Remediation**:
   - Fix critical vulnerabilities immediately
   - Schedule medium/low priority fixes
   - Document security decisions
   - Implement security monitoring

**Testing Requirements**:
- ✅ 20+ unit tests (input validation, encoding)
- ✅ 15+ integration tests (authentication, CSRF, rate limiting)
- ✅ Penetration test report (OWASP validation)
- ✅ Dependency vulnerability audit

**Commit Message**: `Section 11: Security audit, penetration testing, vulnerability remediation, compliance validation`

---

### Section 12: UI & UX Testing
**Outcome**: Optimized interface for ease of use and adoption.

**Activities**:
1. **Usability Testing**:
   - Observe users completing tasks (auction bidding, admin management)
   - Measure task completion time
   - Identify friction points
   - Collect qualitative feedback
   
2. **Accessibility Testing**:
   - WCAG 2.1 AA compliance audit
   - Screen reader testing (NVDA, JAWS)
   - Keyboard navigation validation
   - Color contrast verification
   - Form label verification
   
3. **Responsive Design Testing**:
   - Mobile (iPhone 12, Samsung S21)
   - Tablet (iPad)
   - Desktop (1920x1080, 2560x1440)
   - Touch interaction validation
   
4. **Cross-browser Testing**:
   - Chrome, Firefox, Safari, Edge
   - iOS Safari, Chrome mobile
   - Android Chrome, Firefox
   
5. **Performance Optimization**:
   - Page load time (<3 seconds)
   - First contentful paint (<1 second)
   - Interaction to paint (<100ms)
   - Core Web Vitals compliance
   
6. **Iteration**:
   - Refine UI based on feedback
   - Fix accessibility issues
   - Optimize performance bottlenecks
   - A/B test key flows

**Testing Requirements**:
- ✅ 10+ usability test scenarios
- ✅ WCAG 2.1 AA audit (axe-core)
- ✅ Responsive design tests (4+ device sizes)
- ✅ Cross-browser testing (5+ browsers)
- ✅ Performance test report

**Commit Message**: `Section 12: UI/UX testing, accessibility audit (WCAG 2.1 AA), responsive design, performance optimization`

---

### Section 13: API Documentation & Testing
**Outcome**: Comprehensive API documentation, validated endpoints.

**Documentation**:
1. **OpenAPI/Swagger Spec**:
   - All endpoints documented
   - Request/response examples
   - Error codes (400, 401, 403, 404, 500)
   - Authentication requirements
   - Rate limiting info
   
2. **Endpoint Documentation**:
   - Base URL: `https://SAG.live/api`
   - All routes documented (auth, auctions, bids, payments, etc.)
   - Required headers (Authorization, Content-Type)
   - Request body schemas (JSON examples)
   - Response body schemas
   - Example curl commands
   
3. **Error Handling**:
   - Standard error response format
   - Error codes with meanings
   - Troubleshooting guide
   
4. **Rate Limiting**:
   - Public endpoints: 100 requests/minute
   - Authenticated endpoints: 1000 requests/minute
   - Payment endpoints: 10 requests/minute
   
5. **Testing**:
   - API integration tests (Postman/REST client)
   - Endpoint validation (all status codes)
   - Performance benchmarking

**Testing Requirements**:
- ✅ 25+ API endpoint tests (happy path, error cases)
- ✅ Rate limiting tests
- ✅ Authentication tests (invalid token, expired token)
- ✅ CORS tests
- ✅ Response format validation tests

**Commit Message**: `Section 13: API documentation (OpenAPI), endpoint testing, rate limiting, error handling`

---

### Section 14: Monitoring & Logging
**Outcome**: System performance insights, proactive issue detection.

**Activities**:
1. **Monitoring Tools**:
   - Application Performance Monitoring (APM)
   - Real User Monitoring (RUM)
   - Synthetic monitoring (periodic endpoint checks)
   - Alert notifications (Slack, email)
   
2. **Key Metrics**:
   - Request count/rate
   - Response time (p50, p95, p99)
   - Error rate (4xx, 5xx)
   - Payment success rate
   - WebSocket connection count
   - Database connection pool
   - CPU/memory usage
   - Disk space
   
3. **Logging Configuration**:
   - Application logs (info, warn, error)
   - Access logs (HTTP requests)
   - Audit logs (user actions, compliance)
   - Error stack traces
   - Payment webhook logs
   - Authentication attempts
   - Log level: INFO (production), DEBUG (development)
   
4. **Centralized Logging**:
   - Log aggregation (ELK stack or Datadog)
   - Searchable by timestamp, user, action
   - Retention policy (90 days)
   - GDPR compliance (sanitize PII)
   
5. **Alerting**:
   - High error rate (>5% of requests)
   - Payment processing failure
   - Database connection pool exhaustion
   - WebSocket connection anomalies
   - Disk space warning (>80%)
   - Manual review items (fraud flags)

**Testing Requirements**:
- ✅ 10+ logging tests (log output, format validation)
- ✅ 10+ monitoring tests (metric collection, alerting)
- ✅ Alert trigger tests

**Commit Message**: `Section 14: Monitoring (APM, RUM), logging (centralized), alerting, performance dashboards`

---

## PART 5: CRITICAL CONVENTIONS & GOTCHAS

### DO's ✅

1. **Always validate in models**, catch in services, format in controllers
   ```javascript
   // Model: throw on invalid data
   validateInput(data) { throw new Error(...) }
   
   // Service: catch and handle
   try { model.create(data); } catch (e) { logError(e); }
   
   // Controller: format response
   return res.json({ success: false, errors: [...] });
   ```

2. **Use async/await exclusively** - no .then() chains
   ```javascript
   async function work() {
     try {
       const result = await someAsync();
       return result;
     } catch (e) {
       throw new Error('Context: ' + e.message);
     }
   }
   ```

3. **Soft delete everything** (GDPR compliance)
   ```javascript
   async delete(id) {
     return this.db.query(
       'UPDATE users SET deleted_at = NOW() WHERE id = $1',
       [id]
     );
   }
   // In SELECT queries: WHERE deleted_at IS NULL
   ```

4. **Log with context** (for debugging)
   ```javascript
   logger.info('Action completed', {
     userId: user.id,
     auctionId: auction.id,
     action: 'PLACE_BID',
     timestamp: new Date()
   });
   ```

5. **Require authorization before any action**
   ```javascript
   // ALWAYS check JWT first
   authMiddleware.verifyToken(req, res, next);
   
   // THEN check role
   authMiddleware.verifyRole('SCHOOL_ADMIN')(req, res, next);
   
   // THEN check resource ownership
   if (auction.schoolId !== user.schoolId) throw new Error('Unauthorized');
   ```

### DON'Ts ❌

1. **Never instantiate realtimeService**
   ```javascript
   // WRONG
   const RealtimeService = require('../services/realtimeService');
   new RealtimeService();
   
   // CORRECT
   const realtimeService = require('../services/realtimeService');
   realtimeService.broadcast(...);
   ```

2. **Never log card data or tokens**
   ```javascript
   // WRONG
   logger.info('Payment processed', { cardNumber: '4111...', token });
   
   // CORRECT
   logger.info('Payment processed', {
     transactionId: 'txn_123',
     amount: 99.99,
     last4: '1111'
   });
   ```

3. **Never trust client input**
   ```javascript
   // WRONG - directly use req.body
   const auction = await auctionModel.create(req.body);
   
   // CORRECT - validate and sanitize
   const { error, value } = validateAuctionInput(req.body);
   if (error) throw error;
   const auction = await auctionModel.create(value);
   ```

4. **Never update paid transactions**
   ```javascript
   // WRONG
   await paymentModel.update(transactionId, { status: 'updated' });
   
   // CORRECT - immutable after 48 hours
   if (Date.now() - transaction.createdAt > 48*60*60*1000)
     throw new Error('Transaction immutable');
   ```

5. **Never bypass RBAC checks**
   ```javascript
   // WRONG - skip role check
   if (req.user) { /* process */ }
   
   // CORRECT - enforce role AND resource context
   if (req.user.role !== 'SCHOOL_ADMIN' || 
       auction.schoolId !== req.user.schoolId)
     throw new Error('Unauthorized');
   ```

---

## PART 6: GIT COMMIT CONVENTIONS

### Commit Message Format
```
[SECTION #] [COMPONENT]: [Concise description] (#TESTS)

[SECTION #]:  Section 1-14 (e.g., Section 5)
[COMPONENT]:  Database, Backend, Frontend, Tests, etc.
[Description]: Clear, action-oriented (e.g., "Implement Stripe payment processing")
[#TESTS]:      Number of unit + integration tests (e.g., 50+, 30+)

Example:
Section 5: Payment Processing - Integrate Stripe/Square gateways, PCI-DSS tokenization (50+ tests)
Section 3: Auction API - Implement auction lifecycle, status transitions, auto-extend (50+ tests)
Section 4: Authentication - JWT/TOTP/RBAC implementation, session management (50+ tests)
```

### Branch Naming
```
section/[number]-[name]
e.g., section/5-payment-processing, section/3-auction-api
```

---

## PART 7: ENVIRONMENT VARIABLES REFERENCE

```bash
# Database
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=auction_gallery
PG_USER=postgres
PG_PASSWORD=securepassword

# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# JWT & Auth
JWT_SECRET=your-secret-key-min-32-chars-long
JWT_ACCESS_EXPIRY=900s        # 15 minutes
JWT_REFRESH_EXPIRY=604800s    # 7 days
TOTP_WINDOW=1                 # ±1 time steps = 60 sec window

# Payment Gateways
STRIPE_API_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
SQUARE_API_KEY=sq_live_xxx
SQUARE_WEBHOOK_SECRET=xxx

# Email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@SAG.live
SMTP_PASSWORD=xxx

# SMS (Twilio)
TWILIO_ACCOUNT_SID=AC_xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE=+1234567890

# Frontend
API_BASE_URL=https://SAG.live/api
WS_URL=wss://SAG.live/ws

# Storage
STORAGE_TYPE=local          # or 's3'
S3_BUCKET=auction-gallery
S3_REGION=us-east-1
S3_ACCESS_KEY=xxx
S3_SECRET_KEY=xxx
STORAGE_THRESHOLD_GB=500    # Auto-migrate to S3 at 500GB

# Monitoring
APM_ENABLED=true
LOG_AGGREGATION_URL=https://logs.example.com
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/...
```

---

## PART 8: QUICK START FOR AI AGENTS

1. **Understanding the Codebase**:
   - Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design
   - Review [schema.sql](schema.sql) for database structure
   - Check [src/models/index.js](src/models/index.js) for data validation

2. **Before Making Changes**:
   - Identify affected section (1-14)
   - Check existing tests for patterns
   - Verify RBAC/compliance requirements in [ARCHITECTURE.md](ARCHITECTURE.md)
   - Follow Service-Model-Controller pattern

3. **When Adding Features**:
   - Model validation first (src/models/index.js)
   - Service business logic (src/services/)
   - Controller HTTP handling (src/controllers/)
   - Routes (src/routes/)
   - Unit + Integration tests (tests/)
   - Update this file if architectural patterns change

4. **Testing Checklist**:
   - ✅ 20+ tests minimum per section
   - ✅ Unit tests (no DB)
   - ✅ Integration tests (with DB)
   - ✅ Auth/RBAC tests
   - ✅ Compliance tests (GDPR, COPPA, PCI-DSS)
   - ✅ Run: `npm test`

5. **Commit & Deploy**:
   - Follow commit format (see PART 6)
   - Ensure all tests pass
   - Update [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) with progress
   - Tag for release: `v1.0.0-sectionX`

---

**Status**: ✅ Authoritative Master Prompt - Locked & Ready for Production Development
