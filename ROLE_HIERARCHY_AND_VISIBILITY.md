# Role Hierarchy & Visibility Controls
**Document Date**: February 3, 2026  
**Status**: Implementation Specification  
**Section**: 4.2 (Authentication & Authorization Enhancement)

---

## 1. Role Hierarchy (Linear)

```
┌─────────────────────────────────────────┐
│  SITE_ADMIN (Super Admin)               │ ← Can manage entire platform
│  ├─ All permissions                     │
│  ├─ Manage all schools                  │
│  ├─ View all auctions                   │
│  └─ Override any decision                │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│  SCHOOL_ADMIN (Admin)                   │ ← Can manage school + users
│  ├─ Manage school users & roles         │
│  ├─ Create & manage auctions            │
│  ├─ View school auctions                │
│  ├─ Approve/reject artwork              │
│  └─ Cannot view other schools           │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│  TEACHER                                 │ ← Can create auctions & submissions
│  ├─ Create/manage auctions              │
│  ├─ Submit artwork                      │
│  ├─ Manage students (CSV upload)        │
│  ├─ View student activity               │
│  ├─ Approve artwork submissions         │
│  └─ Place bids like STUDENT             │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│  STUDENT                                 │ ← Can bid on approved artwork
│  ├─ View approved auctions              │
│  ├─ Submit artwork (subject to approval)│
│  ├─ Bid on artwork                      │
│  ├─ View own submissions                │
│  └─ Cannot see draft/unapproved items   │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│  BIDDER                                  │ ← Read-only access (future)
│  ├─ View approved auctions only         │
│  ├─ View approved artwork only          │
│  ├─ Bid on artwork                      │
│  ├─ View bidding history                │
│  └─ NO: Create, edit, delete, approve   │
└─────────────────────────────────────────┘
```

---

## 2. Permission Matrix

| Action | SITE_ADMIN | SCHOOL_ADMIN | TEACHER | STUDENT | BIDDER |
|--------|:----------:|:------------:|:-------:|:-------:|:------:|
| **USERS** |
| Create user | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit user | ✅ | ✅* | ❌ | ✅** | ❌ |
| Delete user | ✅ | ❌ | ❌ | ❌ | ❌ |
| View user list | ✅ | ✅* | ❌ | ❌ | ❌ |
| Reset 2FA | ✅ | ✅* | ❌ | ❌ | ❌ |
| **AUCTIONS** |
| Create auction | ✅ | ✅ | ✅ | ❌ | ❌ |
| View all auctions | ✅ | ✅ | ✅ | ❌ | ❌ |
| View approved auctions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit auction (draft) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publish auction | ✅ | ✅ | ✅ | ❌ | ❌ |
| Close auction | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete auction | ✅ | ❌ | ❌ | ❌ | ❌ |
| **ARTWORK** |
| Submit artwork | ✅ | ✅ | ✅ | ✅ | ❌ |
| View draft artwork | ✅ | ✅ | ✅* | ❌ | ❌ |
| View approved artwork | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve artwork | ✅ | ✅ | ✅* | ❌ | ❌ |
| Reject artwork | ✅ | ✅ | ✅* | ❌ | ❌ |
| Delete artwork | ✅ | ✅ | ✅* | ❌ | ❌ |
| **BIDS** |
| Place bid | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own bids | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all bids | ✅ | ✅* | ✅* | ❌ | ❌ |
| Retract bid | ✅ | ✅ | ✅ | ✅ | ✅ |
| **PAYMENTS** |
| View all payments | ✅ | ✅* | ❌ | ❌ | ❌ |
| Process refund | ✅ | ✅ | ❌ | ❌ | ❌ |
| View payment receipt | ✅ | ✅ | ✅* | ✅* | ✅ |
| **REPORTS** |
| View analytics | ✅ | ✅ | ✅* | ❌ | ❌ |
| Export reports | ✅ | ✅ | ❌ | ❌ | ❌ |

**Legend**:  
✅ = Full access  
✅* = Scoped access (only own school/submissions)  
✅** = Can edit own profile only  
❌ = No access

---

## 3. Data Visibility Rules

### 3.1 Auctions - What Each Role Sees

**SITE_ADMIN**: 
- ALL auctions (DRAFT, APPROVED, LIVE, CLOSED)
- From ALL schools
- With full metadata

**SCHOOL_ADMIN**:
- ALL auctions from THEIR SCHOOL (DRAFT, APPROVED, LIVE, CLOSED)
- Cannot see other schools' auctions
- With full metadata

**TEACHER**:
- Own auctions (DRAFT, APPROVED, LIVE, CLOSED)
- Other approved auctions from THEIR SCHOOL
- Cannot see other schools' auctions
- Cannot see draft auctions from other teachers

**STUDENT**:
- APPROVED auctions only
- From THEIR SCHOOL
- Cannot see DRAFT, PENDING, or private auctions
- Cannot see other schools' auctions

**BIDDER** (future role):
- APPROVED & LIVE auctions only
- From THEIR SCHOOL (or public/partner schools)
- Cannot see DRAFT, PENDING, CLOSED auctions
- Only see auction title + approved artwork + bid info

### 3.2 Artwork - What Each Role Sees

**SITE_ADMIN**:
- ALL artwork (DRAFT, SUBMITTED, APPROVED, REJECTED)
- From ALL schools
- Includes artist name, email, submission notes

**SCHOOL_ADMIN**:
- ALL artwork from THEIR SCHOOL
- DRAFT, SUBMITTED, APPROVED, REJECTED
- Includes artist name, email, submission notes

**TEACHER**:
- Own submissions (all statuses)
- Other teacher's APPROVED submissions
- SUBMITTED artwork for review (if teacher-approver)
- Cannot see other schools' artwork

**STUDENT**:
- APPROVED artwork only
- From auctions they can see
- Own DRAFT submissions
- Cannot see other students' draft submissions

**BIDDER**:
- APPROVED artwork only
- Cannot see artist email/contact info
- Cannot see submission notes or draft artwork

### 3.3 User Visibility

**SITE_ADMIN**:
- Sees ALL users + roles

**SCHOOL_ADMIN**:
- Sees all users in OWN school
- Can change roles (for own school)
- Cannot see other schools' users

**TEACHER**:
- Sees students in own classes
- Cannot see other teachers
- Cannot manage user roles

**STUDENT**:
- Sees own profile
- Cannot view other students/teachers

**BIDDER**:
- Sees only own profile
- Minimal metadata visible

---

## 4. API Filtering Rules

### 4.1 Auction List Endpoint: `GET /api/auctions`

**Current Issue**: Returns all auctions regardless of user role

**Required Filtering**:

```javascript
// Pseudo-code for filtering by role
async function filterAuctionsByRole(user, auctions) {
  if (user.role === 'SITE_ADMIN') {
    // Return ALL auctions
    return auctions;
  }
  
  if (user.role === 'SCHOOL_ADMIN') {
    // Filter to own school
    return auctions.filter(a => a.school_id === user.schoolId);
  }
  
  if (user.role === 'TEACHER') {
    // Filter to own school + approved only
    return auctions.filter(a => 
      a.school_id === user.schoolId && 
      a.status === 'APPROVED'
    );
  }
  
  if (user.role === 'STUDENT' || user.role === 'BIDDER') {
    // Filter to own school + approved + live/ended
    return auctions.filter(a =>
      a.school_id === user.schoolId &&
      a.status === 'APPROVED' &&
      ['LIVE', 'CLOSED'].includes(a.status)
    );
  }
}
```

### 4.2 Artwork Visibility Endpoint: `GET /api/auctions/:id/artwork`

**Current Issue**: No filtering by approval status

**Required Filtering**:

```javascript
async function filterArtworkByRole(user, artwork) {
  if (user.role === 'SITE_ADMIN') {
    // All artwork
    return artwork;
  }
  
  if (user.role === 'SCHOOL_ADMIN') {
    // All artwork in own school
    return artwork.filter(a => a.school_id === user.schoolId);
  }
  
  if (user.role === 'TEACHER') {
    // Own submissions + approved artwork in school
    return artwork.filter(a =>
      (a.submitted_by === user.id) ||
      (a.school_id === user.schoolId && a.status === 'APPROVED')
    );
  }
  
  if (user.role === 'STUDENT' || user.role === 'BIDDER') {
    // Only approved artwork in school
    return artwork.filter(a =>
      a.school_id === user.schoolId && 
      a.status === 'APPROVED'
    );
  }
}
```

### 4.3 Hide Sensitive Fields

**For BIDDER and STUDENT roles**, exclude:
- `submitted_by` (artist identity)
- `artist_email`
- `submission_notes`
- `internal_comments`
- `approval_reason`
- `rejected_reason`

---

## 5. Implementation Checklist

### Backend (src/)

- [ ] **authMiddleware.js**
  - [ ] Add role hierarchy constants
  - [ ] Add role comparison function (canAccessRole)
  - [ ] Add new middleware: `verifyRoleOrHigher(minRole)`

- [ ] **controllers/auctionController.js**
  - [ ] Filter `listAuctions()` by role + status
  - [ ] Filter `getAuction()` response by role
  - [ ] Filter `getAuctionArtwork()` by approval status + role
  - [ ] Hide sensitive fields for BIDDER/STUDENT

- [ ] **controllers/artworkController.js** (if exists)
  - [ ] Filter `listArtwork()` by role + status
  - [ ] Filter `getArtwork()` response by role
  - [ ] Hide artist details for BIDDER/STUDENT

- [ ] **controllers/userController.js**
  - [ ] Filter `listUsers()` by school context
  - [ ] Add `verifyResourceOwnership()` check

- [ ] **services/auctionService.js**
  - [ ] Add `applyRoleFilter()` method
  - [ ] Add `canViewAuction(user, auction)` method
  - [ ] Add `canEditAuction(user, auction)` method

- [ ] **utils/validationUtils.js**
  - [ ] Add `ROLE_HIERARCHY` constant
  - [ ] Add `canAccessRole(userRole, requiredRole)` function
  - [ ] Add `filterSensitiveFields(data, userRole)` function

### Frontend (public/js/)

- [ ] **api-client.js**
  - [ ] Document visibility rules in request docs
  - [ ] Add debug logging for filtered results

- [ ] **ui-components.js**
  - [ ] Hide admin controls for STUDENT/BIDDER
  - [ ] Hide approval buttons for STUDENT
  - [ ] Hide submission form for BIDDER

- [ ] **auction-detail.js**
  - [ ] Hide edit buttons for unauthorized roles
  - [ ] Hide draft artwork submissions
  - [ ] Hide artist details for BIDDER

### Database (schema.sql)

- [ ] Verify indexes on `school_id` and `status` columns
- [ ] Add index on `submitted_by` for artwork filtering
- [ ] Add index on `approval_status` for queries

---

## 6. Search Function (Future - Phase 13)

Once visibility is locked down, implement search:

```javascript
// Search by Artist
GET /api/search/artist?q=name&school_id=X

// Search by Artwork Title
GET /api/search/artwork?q=title&school_id=X

// Search by School (SITE_ADMIN only)
GET /api/search/schools?q=name

// Results filtered by user role + approval status
```

---

## 7. Configuration in .env

```env
# Role Hierarchy (do not modify)
ROLE_HIERARCHY=SITE_ADMIN,SCHOOL_ADMIN,TEACHER,STUDENT,BIDDER

# Default role for new users (STUDENT or BIDDER)
DEFAULT_USER_ROLE=STUDENT

# Require school_id for all queries (enforces school boundaries)
ENFORCE_SCHOOL_ISOLATION=true

# Hide artist details for BIDDER and STUDENT roles
HIDE_ARTIST_DETAILS_FOR_BIDDER=true

# Show/hide draft auctions to teachers
SHOW_DRAFT_TO_TEACHER=true
```

---

## 8. Testing Requirements

### Unit Tests

- [ ] `roleHierarchy.test.js` - 15+ tests for role comparisons
- [ ] `visibilityFilters.test.js` - 20+ tests for filtering logic
- [ ] `fieldSanitization.test.js` - 10+ tests for sensitive field hiding

### Integration Tests

- [ ] `auctionVisibility.integration.test.js` - 25+ tests
  - [ ] SITE_ADMIN sees all
  - [ ] SCHOOL_ADMIN sees own school only
  - [ ] TEACHER sees approved + own drafts
  - [ ] STUDENT/BIDDER sees approved only
  
- [ ] `artworkVisibility.integration.test.js` - 20+ tests
  - [ ] Each role sees correct artwork status
  - [ ] Artist details hidden for BIDDER
  - [ ] Submission notes hidden

- [ ] `userVisibility.integration.test.js` - 15+ tests
  - [ ] SCHOOL_ADMIN cannot see other schools
  - [ ] TEACHER cannot manage roles

---

## 9. Security Considerations

### Defense in Depth

1. **Auth Middleware** (verifyToken + verifyRole)
2. **Service Layer** (applyRoleFilter before returning)
3. **Database Queries** (include role-based WHERE clauses)
4. **Response Filtering** (exclude sensitive fields)

### Prevent Data Leaks

- ❌ Never return unfiltered user lists
- ❌ Never show artist email to BIDDER
- ❌ Never show DRAFT auctions to STUDENT
- ❌ Never show other schools' data
- ✅ Always apply role filter at service layer
- ✅ Always sanitize responses before sending

---

## 10. Deployment Notes

1. **Database Migration**: Run `schema.sql` to create indexes
2. **Environment Setup**: Add ROLE_HIERARCHY to .env
3. **Testing**: Run all visibility tests before production
4. **Monitoring**: Log denied access attempts
5. **Rollback**: Easy reversal if visibility logic breaks (stateless filters)

---

**Next**: Implement filtering in auctionController.js + create test suite
