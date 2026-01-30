# Section 8: Admin Dashboard - Implementation Plan

**Status**: 🚀 Starting Implementation  
**Target Duration**: 35 hours  
**Target Tests**: 25+ (15 unit + 10 integration)  
**Completion Date**: February 5, 2026  

---

## Overview

The Admin Dashboard provides a centralized management platform for site administrators and school administrators to manage auctions, users, payments, and monitor compliance across the entire system. This section implements the administrative backend and frontend interface with full RBAC enforcement, real-time monitoring, and comprehensive compliance reporting.

---

## Objectives

1. **User Management** - View, manage, and audit all users with RBAC
2. **Auction Management** - Approve/reject auctions, manage lifecycle, set fees
3. **Payment Management** - View transactions, process refunds, monitor fraud
4. **Compliance Reporting** - Generate GDPR/COPPA/FERPA/CCPA audit reports
5. **Real-time Monitoring** - Dashboard metrics, active auctions, system health
6. **Audit Logging** - Track all administrative actions for compliance

---

## Architecture

### Role Hierarchy (LOCKED)

```
SITE_ADMIN (Global)
├── All permissions
├── All schools access
├── System configuration
└── Compliance reporting

SCHOOL_ADMIN (Organization)
├── Manage own school's users
├── Approve/reject school's auctions
├── View school's payments
└── Limited compliance reports

TEACHER (Educator)
├── Submit artworks
├── Create auctions
├── Manage own artworks
└── View own auctions

STUDENT (Learner)
├── View auctions
├── Browse artworks
└── Limited participation

BIDDER (Participant)
├── Place bids
├── View bid history
└── Minimal permissions
```

### Data Access Rules (LOCKED)

- **SITE_ADMIN**: No data restrictions (all schools, all users, all auctions)
- **SCHOOL_ADMIN**: Only own school's data (enforce `school_id` in queries)
- **TEACHER**: Only own artworks/auctions (enforce `user_id` in queries)
- **Other roles**: No admin access (enforced by middleware)

### Multi-tenant Isolation (CRITICAL)

Every admin query must include school-level filtering:
```javascript
// ✅ CORRECT - Isolates to school
const auctions = await pool.query(
  'SELECT * FROM auctions WHERE school_id = $1',
  [schoolId]
);

// ❌ WRONG - Data leak across schools
const auctions = await pool.query('SELECT * FROM auctions');
```

---

## Database Schema Changes

### New Tables

#### `admin_audit_logs` (For GDPR/FERPA compliance)
```sql
CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  reason VARCHAR(255),
  ip_address INET,
  user_agent VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (admin_id, created_at),
  INDEX (resource_type, created_at)
);
```

#### `admin_actions` (For authorization tracking)
```sql
CREATE TABLE admin_actions (
  id SERIAL PRIMARY KEY,
  action_name VARCHAR(100) UNIQUE,
  description VARCHAR(255),
  required_role VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `compliance_reports` (For audit generation)
```sql
CREATE TABLE compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type VARCHAR(50), -- 'GDPR', 'COPPA', 'FERPA', 'CCPA'
  generated_by UUID REFERENCES users(id),
  school_id UUID REFERENCES schools(id),
  start_date DATE,
  end_date DATE,
  summary JSONB, -- {users_deleted: N, data_exported: N, consents_tracked: N}
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `dashboard_metrics` (For real-time stats)
```sql
CREATE TABLE dashboard_metrics (
  id SERIAL PRIMARY KEY,
  metric_type VARCHAR(50), -- 'active_auctions', 'pending_approval', 'daily_revenue'
  school_id UUID REFERENCES schools(id),
  value INTEGER,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (school_id, recorded_at)
);
```

---

## Service Layer: AdminService

### File: `src/services/adminService.js`

#### User Management Methods
```javascript
// 20+ methods total

// User CRUD
getUserById(userId, adminId)          // ✅ Enforces RBAC + school isolation
listUsers(filters, adminId)            // ✅ Paginated, searchable
updateUserRole(userId, newRole, adminId)  // ✅ Role change audit
deactivateUser(userId, reason, adminId)   // ✅ Soft delete, logged
exportUserData(userId)                 // ✅ GDPR compliance
```

#### Auction Management
```javascript
getAuctionById(auctionId, adminId)     // ✅ School isolation check
listAuctionsByStatus(status, adminId)  // ✅ DRAFT, PENDING, APPROVED, LIVE, CLOSED
approveAuction(auctionId, adminId)     // ✅ Status transition + audit
rejectAuction(auctionId, reason, adminId) // ✅ Rejection reason logged
setAuctionFee(auctionId, feePercent, adminId) // ✅ Override default fee
extendAuction(auctionId, hours, adminId)     // ✅ Extend end time
closeForcibly(auctionId, reason, adminId)    // ✅ Force close
```

#### Payment Management
```javascript
getPaymentById(paymentId, adminId)     // ✅ Transaction audit
listPayments(filters, adminId)         // ✅ Searchable, paginated
processRefund(paymentId, amount, reason, adminId)  // ✅ Refund audit
detectFraud(paymentId)                 // ✅ Fraud flags
getPaymentStatistics(period, adminId)  // ✅ Revenue, gateway splits
```

#### Compliance & Auditing
```javascript
generateGDPRReport(startDate, endDate, schoolId)  // ✅ Soft deletes, exports
generateCOPPAReport(startDate, endDate, schoolId) // ✅ Age verification
generateFERPAReport(startDate, endDate, schoolId) // ✅ Student access logs
generateCCPAReport(startDate, endDate, schoolId)  // ✅ Data deletion requests
getAuditLog(filters)                   // ✅ Admin action history
logAdminAction(adminId, action, resource, details) // ✅ Auto-log
```

#### Real-time Monitoring
```javascript
getDashboardStats(schoolId)            // ✅ Active auctions, revenue, users
getSystemHealth()                      // ✅ DB health, payment gateway status
getActiveAuctions(schoolId, limit=10)  // ✅ Auctions in LIVE status
getPendingApprovals(schoolId)          // ✅ PENDING_APPROVAL auctions
getRecentTransactions(schoolId, limit=20) // ✅ Last 20 payments
```

---

## Controller Layer: AdminController

### File: `src/controllers/adminController.js`

#### HTTP Endpoints (15+ methods)

```javascript
// Users
GET    /api/admin/users/:userId         // Get user details
GET    /api/admin/users                 // List users (paginated)
PUT    /api/admin/users/:userId/role    // Change user role
DELETE /api/admin/users/:userId         // Deactivate user
GET    /api/admin/users/:userId/data    // Export user data (GDPR)

// Auctions
GET    /api/admin/auctions/:auctionId   // Get auction details
GET    /api/admin/auctions              // List auctions by status
POST   /api/admin/auctions/:auctionId/approve  // Approve auction
POST   /api/admin/auctions/:auctionId/reject   // Reject auction
PUT    /api/admin/auctions/:auctionId/fee      // Set custom fee
PUT    /api/admin/auctions/:auctionId/extend   // Extend auction
POST   /api/admin/auctions/:auctionId/close    // Force close

// Payments
GET    /api/admin/payments/:paymentId   // Get payment details
GET    /api/admin/payments              // List payments
POST   /api/admin/payments/:paymentId/refund  // Process refund
GET    /api/admin/payments/statistics   // Revenue stats

// Compliance
GET    /api/admin/reports/gdpr          // Generate GDPR report
GET    /api/admin/reports/coppa         // Generate COPPA report
GET    /api/admin/reports/ferpa         // Generate FERPA report
GET    /api/admin/reports/ccpa          // Generate CCPA report
GET    /api/admin/audit-logs            // View audit logs

// Dashboard
GET    /api/admin/dashboard/stats       // Dashboard metrics
GET    /api/admin/dashboard/health      // System health
```

---

## Routes: AdminRoutes

### File: `src/routes/adminRoutes.js`

```javascript
// All routes require:
// 1. verifyToken (JWT valid)
// 2. verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN'])
// 3. Resource ownership check (school_id match for SCHOOL_ADMIN)

router.get('/users/:userId', 
  verifyToken, 
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']), 
  adminController.getUserById
);

router.post('/auctions/:auctionId/approve',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  validateAuctionOwnership,
  adminController.approveAuction
);

// ... 13 more routes following same pattern
```

---

## Frontend: Admin Dashboard UI

### File: `public/admin-dashboard.html`

#### Sections

1. **User Management**
   - Search/filter users by role, school, status
   - View user details, activity
   - Change roles, deactivate users
   - Export user data

2. **Auction Management**
   - View pending approvals (count badge)
   - Approve/reject with reason
   - Override auction fees
   - Extend/force close auctions
   - View auction analytics

3. **Payment Dashboard**
   - Recent transactions (paginated)
   - Search by user/amount/gateway
   - Process refunds
   - View fraud flags
   - Revenue statistics by gateway

4. **Compliance Reports**
   - Generate GDPR/COPPA/FERPA/CCPA reports
   - View report history
   - Download as JSON/CSV
   - Compliance status dashboard

5. **Real-time Monitoring**
   - Active auction count
   - Daily revenue
   - Pending approvals
   - System health status
   - Recent admin actions

6. **Audit Logs**
   - All admin actions with timestamp
   - Filter by admin, action type, resource
   - View action details (old/new values)
   - Export audit trail

---

## Testing Strategy

### Unit Tests: `tests/unit/services/adminService.test.js` (20+ tests)

#### User Management (5 tests)
- ✅ `getUserById()` - Enforces school isolation
- ✅ `listUsers()` - Respects RBAC, pagination
- ✅ `updateUserRole()` - Audit logged
- ✅ `deactivateUser()` - Soft delete, reason tracked
- ✅ `exportUserData()` - GDPR format

#### Auction Management (5 tests)
- ✅ `approveAuction()` - Status transitions
- ✅ `rejectAuction()` - Reason captured
- ✅ `setAuctionFee()` - Fee override logged
- ✅ `extendAuction()` - Time calculation
- ✅ `closeForcibly()` - Force close validation

#### Payment Management (4 tests)
- ✅ `processRefund()` - Idempotent, logged
- ✅ `getPaymentStatistics()` - Aggregation correct
- ✅ `detectFraud()` - Fraud scoring
- ✅ Refund validation

#### Compliance (4 tests)
- ✅ `generateGDPRReport()` - Correct data
- ✅ `generateCOPPAReport()` - Age checks
- ✅ `logAdminAction()` - Audit trail
- ✅ `getAuditLog()` - Filtering, pagination

#### Controller (2 tests)
- ✅ Response formatting
- ✅ Error handling

### Integration Tests: `tests/integration/services/adminService.integration.test.js` (10+ tests)

- ✅ Multi-tenant isolation (School_A cannot see School_B)
- ✅ RBAC enforcement (SCHOOL_ADMIN can't access other schools)
- ✅ Audit logging (Actions tracked in DB)
- ✅ Approve workflow (Draft → Approved → Live)
- ✅ Refund workflow (Payment → Refund → Audit)
- ✅ GDPR report generation (Accurate, complete)
- ✅ Real-time stats updates
- ✅ Compliance report generation
- ✅ Authorization errors (403 when not authorized)
- ✅ Invalid state transitions (can't close already-closed)

---

## Security Requirements

### RBAC Enforcement (Critical)

Every admin method must verify:
```javascript
// Check 1: Is user an admin?
if (!['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(admin.role)) {
  throw new Error('NOT_AUTHORIZED');
}

// Check 2: For SCHOOL_ADMIN, does resource belong to their school?
if (admin.role === 'SCHOOL_ADMIN' && auction.school_id !== admin.school_id) {
  throw new Error('CROSS_SCHOOL_ACCESS');
}
```

### Audit Logging (Required)

Every action must log:
```javascript
await logAdminAction({
  admin_id: adminId,
  action: 'AUCTION_APPROVED',
  resource_type: 'AUCTION',
  resource_id: auctionId,
  old_values: { status: 'PENDING_APPROVAL' },
  new_values: { status: 'APPROVED' },
  reason: 'Admin approval for fundraiser',
  ip_address: req.ip,
  user_agent: req.headers['user-agent']
});
```

### Data Isolation (Critical)

School-level queries must filter:
```javascript
// ✅ CORRECT
const auctions = await getAuctionsByStatus(status, schoolId);

// ❌ WRONG - Would leak data
const auctions = await getAuctionsByStatus(status);
```

---

## Compliance Integration

### GDPR
- ✅ Soft deletes logged
- ✅ Data export in GDPR format
- ✅ Audit trail of data access
- ✅ Right to be forgotten tracked

### COPPA
- ✅ Age verification audit
- ✅ Parental consent tracking
- ✅ Minor data deletion enforcement
- ✅ Audit report generation

### FERPA
- ✅ Student access logging
- ✅ Educator-only access enforcement
- ✅ Data protection measures
- ✅ Audit report with access logs

### CCPA
- ✅ Data deletion requests tracked
- ✅ Opt-out enforcement
- ✅ Data sale prohibition
- ✅ Compliance report

---

## Implementation Timeline

### Phase 1: Database & Service (Hours 1-10)
- [ ] Update schema.sql with new tables
- [ ] Create AdminService with 20+ methods
- [ ] Implement audit logging
- [ ] Write unit tests (20+)

### Phase 2: Controller & Routes (Hours 11-20)
- [ ] Create AdminController with 15+ methods
- [ ] Define routes with RBAC middleware
- [ ] Implement compliance report generation
- [ ] Write integration tests (10+)

### Phase 3: Frontend (Hours 21-30)
- [ ] Build user management UI
- [ ] Build auction management UI
- [ ] Build payment dashboard
- [ ] Add real-time monitoring
- [ ] Compliance reporting UI

### Phase 4: Testing & Documentation (Hours 31-35)
- [ ] Run full test suite (30+ tests)
- [ ] Security review
- [ ] Multi-tenant isolation verification
- [ ] Create SECTION_8_README.md
- [ ] Update IMPLEMENTATION_SUMMARY.md

---

## Success Criteria

- ✅ 30+ tests written and passing
- ✅ 100% RBAC enforcement (no data leaks)
- ✅ 100% multi-tenant isolation (schools isolated)
- ✅ All audit logging functional
- ✅ All 4 compliance reports generate correctly
- ✅ Real-time dashboard metrics accurate
- ✅ Zero security vulnerabilities
- ✅ Full documentation complete

---

## Deliverables

### Code Files
1. `src/services/adminService.js` (400+ lines)
2. `src/controllers/adminController.js` (300+ lines)
3. `src/routes/adminRoutes.js` (150+ lines)
4. Updated `schema.sql` with admin tables

### Test Files
1. `tests/unit/services/adminService.test.js` (400+ lines, 20+ tests)
2. `tests/integration/services/adminService.integration.test.js` (300+ lines, 10+ tests)

### Documentation
1. `SECTION_8_README.md` (Comprehensive feature guide)
2. `SECTION_8_COMPLETION_REPORT.md` (Results & metrics)

### Frontend
1. Updated `public/admin-dashboard.html` (500+ lines)

---

## Next Steps

1. ✅ Read this plan document
2. 🔄 Update `schema.sql` with admin tables
3. 🔄 Implement `AdminService`
4. 🔄 Implement `AdminController` & routes
5. 🔄 Write comprehensive tests
6. 🔄 Build admin dashboard UI
7. 🔄 Run full test suite
8. 🔄 Document completion

---

**Estimated Completion**: February 5, 2026  
**Test Target**: 30+ tests (exceeding 25+ requirement)  
**Status**: 🚀 Ready to begin implementation
