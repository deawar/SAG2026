# Silent Auction Gallery - Production Architecture

## 1. System Overview

This is a production-grade, PCI-compliant, WCAG 2.1 AA compliant web application for managing school-based charity art auctions.

### Technology Stack
- **Backend**: Node.js + Express.js
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Database**: PostgreSQL (primary), MySQL-compatible
- **Hosting**: Linux VPS, Docker-ready
- **Storage**: Local filesystem → S3-compatible (auto-migration at 500GB)
- **Security**: TLS 1.2+, JWT, TOTP 2FA, bcrypt hashing, input validation, output encoding

### Compliance Requirements
- **WCAG 2.1 Level AA**: Accessibility for all users
- **PCI-DSS 3.2.1**: Payment card security (tokenization, no storage)
- **COPPA**: Children's Online Privacy (13+ verification)
- **FERPA**: Student education privacy (student data handling)
- **GDPR**: EU user data protection (data rights, consent)
- **CCPA**: California privacy rights

## 2. Security Architecture

### Authentication Flow
```
User → Login → JWT Token + TOTP Challenge → 2FA Verification → Session
                ↓
         Token stored in httpOnly Cookie (for APIs)
         CSRF token in HTML forms
```

### Authorization Hierarchy
```
Site Admin (1)
  ├── School Admin (many)
  │   ├── Teacher (many)
  │   │   ├── Student (many) [13+ or COPPA-verified]
  │   │   └── Artwork submissions
  │   └── Bidders (unlimited)
  ├── Auctions (multiple per school)
  ├── User management
  └── Compliance reporting
```

### Payment Security
```
User Payment → HTTPS → Tokenization Gateway → PCI-compliant Processor
  ↓
No card data stored locally
Only tokens stored in audit-encrypted vault
```

## 3. Data Flow Architecture

### Auction Lifecycle
```
1. Teacher creates auction (School Admin approval)
2. Students submit artwork (Teacher approval)
3. Artwork displayed in gallery
4. Bidding period opens
5. Bidders place bids (real-time updates)
6. Auction closes (automatic or manual)
7. Winner notified + payment processing
8. Funds transferred to school
```

### Real-time Updates
```
WebSocket connections for:
- Live bid updates
- Auction status changes
- Notifications
- QR code scans
```

## 4. Data Model Architecture

### Core Entity Relationships
```
Users (auth, roles)
  ├── UserSessions (JWT, 2FA state)
  ├── UserAuditLogs (compliance tracking)
  └── UserPreferences

Schools
  ├── SchoolAdmins
  ├── Teachers
  ├── Auctions
  │   ├── Artwork
  │   ├── Bids
  │   ├── Payments
  │   └── AuctionSchedule
  └── SchoolSettings

Payments
  ├── PaymentGatewayConfig
  ├── PaymentTokens (encrypted)
  ├── Transactions (audit trail)
  └── PlatformFees

Compliance
  ├── UserConsents (GDPR, COPPA)
  ├── DataAccessLogs
  ├── DataRetentionPolicies
  └── ComplianceReports
```

## 5. API Design Patterns

### RESTful Endpoints
```
Authentication
  POST /api/v1/auth/register
  POST /api/v1/auth/login
  POST /api/v1/auth/2fa/verify
  POST /api/v1/auth/logout
  POST /api/v1/auth/refresh

Users
  GET /api/v1/users/:id
  PUT /api/v1/users/:id
  DELETE /api/v1/users/:id
  POST /api/v1/users/:id/consent

Schools
  GET /api/v1/schools
  POST /api/v1/schools
  GET /api/v1/schools/:schoolId
  PUT /api/v1/schools/:schoolId

Auctions
  GET /api/v1/auctions
  POST /api/v1/auctions
  GET /api/v1/auctions/:auctionId
  PUT /api/v1/auctions/:auctionId
  POST /api/v1/auctions/:auctionId/bids
  GET /api/v1/auctions/:auctionId/bids

Artwork
  POST /api/v1/artwork
  GET /api/v1/artwork/:id
  PUT /api/v1/artwork/:id
  DELETE /api/v1/artwork/:id

Payments
  POST /api/v1/payments
  GET /api/v1/payments/:id
  GET /api/v1/payments/:id/status
  POST /api/v1/payments/:id/refund

Admin
  GET /api/v1/admin/users
  GET /api/v1/admin/auctions
  GET /api/v1/admin/compliance
  POST /api/v1/admin/audit-log
```

### Response Format
```json
{
  "success": true,
  "statusCode": 200,
  "data": { "..." },
  "meta": {
    "timestamp": "2026-01-26T10:00:00Z",
    "version": "1.0.0",
    "requestId": "uuid"
  },
  "errors": null
}
```

## 6. Security Measures

### Input Validation
- Whitelist validation (not blacklist)
- Type checking (string, number, email, phone, URL)
- Length limits
- Format validation (regex patterns)
- SQL injection prevention (parameterized queries)
- XSS prevention (HTML encoding, CSP headers)

### Output Encoding
- HTML encoding for web output
- JSON encoding for API responses
- URL encoding for redirects
- Always escape user-generated content

### Password Policy
- Minimum 12 characters
- Uppercase, lowercase, numbers, special characters
- Not a common password (breach database check)
- Monthly rotation option (not forced)
- Bcrypt with salt rounds 12

### 2FA Implementation
- TOTP (Time-based One-Time Password) via Google Authenticator, Authy, etc.
- Backup codes (8) for account recovery
- SMS as fallback (optional, rate-limited)

### Session Management
- JWT tokens with 15-minute expiry
- Refresh tokens with 7-day expiry
- httpOnly, Secure, SameSite cookies
- Session revocation capability
- Concurrent session limits per user

### Network Security
- TLS 1.2+ (minimum)
- HSTS headers (1 year, includeSubDomains)
- CSP headers (restrict script, style, image sources)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Helmet.js security headers

## 7. Compliance Architecture

### COPPA (Children's Online Privacy Protection)
- Parental consent for users < 13
- Age verification at registration
- Limited data collection for children
- Parental access to child's account
- Data deletion on parent request

### FERPA (Family Educational Rights and Privacy Act)
- Student education records are private
- Parent/student can access records
- No disclosure without consent
- Audit logs for access
- 3-year retention (then delete)

### GDPR (General Data Protection Regulation)
- User consent for data processing
- Right to access data
- Right to data portability
- Right to be forgotten
- Data processing agreements
- Privacy impact assessments

### CCPA (California Consumer Privacy Act)
- User access to personal information
- Opt-out of data sales
- Non-discrimination for opting out
- Verification of deletion requests

## 8. Component Interfaces

### Authentication Service
```javascript
class AuthenticationService {
  async registerUser(userData, schoolId) → User
  async loginUser(email, password, 2faToken) → {token, refreshToken}
  async verify2FA(sessionId, code) → {token, refreshToken}
  async refreshToken(refreshToken) → {token, refreshToken}
  async logoutUser(userId, tokenId) → void
  async resetPassword(email) → {resetCode}
  async verifyPasswordReset(code, newPassword) → User
}
```

### Auction Service
```javascript
class AuctionService {
  async createAuction(auctionData, schoolId) → Auction
  async getAuction(auctionId) → Auction
  async updateAuction(auctionId, updates) → Auction
  async startAuction(auctionId) → Auction
  async endAuction(auctionId) → Auction
  async placeBid(auctionId, bidderId, amount) → Bid
  async getAutoNextBid(auctionId, currentBid) → number
  async finalizeAuction(auctionId) → {winner, amount, fee}
}
```

### Payment Service
```javascript
class PaymentService {
  async processPayment(paymentData) → {transactionId, status}
  async refundPayment(transactionId, reason) → {refundId, status}
  async getPaymentStatus(transactionId) → PaymentStatus
  async calculatePlatformFee(amount) → {fee, total}
  async tokenizeCard(cardData, gateway) → {token, lastFour}
}
```

### Compliance Service
```javascript
class ComplianceService {
  async recordUserConsent(userId, consentType) → Consent
  async getUserData(userId) → UserData
  async deleteUserData(userId, reason) → void
  async exportUserData(userId, format) → Stream
  async logDataAccess(userId, action, reason) → void
  async generateComplianceReport(period) → Report
}
```

## 9. Error Handling Strategy

### Error Codes
```
Authentication: 1000-1099
Authorization: 1100-1199
Validation: 1200-1299
Payment: 1300-1399
Auction: 1400-1499
Compliance: 1500-1599
Server: 1600-1699
```

### Error Response Format
```json
{
  "success": false,
  "statusCode": 400,
  "error": {
    "code": "1234",
    "message": "User-friendly error message",
    "details": "Technical details for logging"
  }
}
```

## 10. Deployment Architecture

### Environment Separation
- **Development**: Local Docker, hot-reload
- **Staging**: Production-like, testing
- **Production**: Multi-instance, load-balanced, CDN

### Containerization
- Docker for consistency
- Docker Compose for local dev
- Kubernetes-ready manifests

### Monitoring
- Application logs (Winston)
- Database query logs
- Payment transaction logs
- Audit logs (compliance)
- Security events
- Real-time alerts

## 11. Version Control & CI/CD

### Git Workflow
- Feature branches: `feature/auction-bidding`
- Bugfix branches: `bugfix/payment-issue`
- Release branches: `release/v1.0.0`
- Hotfix branches: `hotfix/security-patch`

### CI/CD Pipeline
1. Code push to repository
2. Linting (ESLint)
3. Unit tests (Jest)
4. Integration tests
5. Security scanning (OWASP)
6. Build container image
7. Deploy to staging
8. Smoke tests
9. Deploy to production (manual approval)

## 12. Scalability Considerations

### Database Scaling
- Read replicas for reporting
- Connection pooling
- Query optimization and indexes
- Archive old data (>1 year) to cold storage

### Application Scaling
- Stateless design (scale horizontally)
- Load balancing
- Session storage in Redis
- Cache layer (Redis) for hot data

### Storage Scaling
- Auto-migration to S3 at 500GB
- CDN for artwork images
- Compression for large files

## 13. Testing Strategy

### Test Pyramid
```
Unit Tests (60%): Models, services, utils
Integration Tests (30%): API endpoints, database
E2E Tests (10%): User workflows, payments
```

### Coverage Goals
- Minimum 80% code coverage
- 100% coverage for security-critical code
- Performance testing for load scenarios
- Security testing (OWASP Top 10)

