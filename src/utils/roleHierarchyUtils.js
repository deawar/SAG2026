/**
 * Role Hierarchy Utilities
 * File: src/utils/roleHierarchyUtils.js
 * Created: February 3, 2026
 * 
 * Provides:
 * - Role comparison functions
 * - Visibility filtering logic
 * - Sensitive field sanitization
 * - Permission checking
 */

/**
 * Role Hierarchy Definition (top to bottom)
 * Higher index = lower privilege
 */
const ROLE_HIERARCHY = [
  'SITE_ADMIN',      // 0 - Can do anything
  'SCHOOL_ADMIN',    // 1 - Can manage school
  'TEACHER',         // 2 - Can create content
  'STUDENT',         // 3 - Can bid on approved
  'BIDDER'           // 4 - Read-only access
];

/**
 * Check if userRole1 has >= privilege as userRole2
 * 
 * Examples:
 * - canAccessRole('SITE_ADMIN', 'TEACHER') → true (admin > teacher)
 * - canAccessRole('STUDENT', 'TEACHER') → false (student < teacher)
 * - canAccessRole('TEACHER', 'TEACHER') → true (equal)
 * 
 * @param {string} userRole - User's current role
 * @param {string} requiredRole - Minimum required role
 * @returns {boolean} True if user has required privilege level
 */
function canAccessRole(userRole, requiredRole) {
  const userIndex = ROLE_HIERARCHY.indexOf(userRole);
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);

  if (userIndex === -1 || requiredIndex === -1) {
    console.warn(`Invalid role: ${userRole} or ${requiredRole}`);
    return false;
  }

  // Higher role (lower index) can access lower roles
  return userIndex <= requiredIndex;
}

/**
 * Check if user can view an auction based on role and status
 * 
 * Rules:
 * - SITE_ADMIN: sees all (DRAFT, APPROVED, LIVE, CLOSED)
 * - SCHOOL_ADMIN: sees own school (DRAFT, APPROVED, LIVE, CLOSED)
 * - TEACHER: sees own school + APPROVED only
 * - STUDENT/BIDDER: sees APPROVED only
 * 
 * @param {Object} user - User object { id, role, schoolId }
 * @param {Object} auction - Auction object { school_id, status }
 * @returns {boolean} True if user can view auction
 */
function canViewAuction(user, auction) {
  if (!user || !user.role || !auction) {
    return false;
  }

  // School isolation: enforce school_id matching
  const sameSchool = user.schoolId === auction.school_id;

  switch (user.role) {
    case 'SITE_ADMIN':
      // Can see all auctions from all schools
      return true;

    case 'SCHOOL_ADMIN':
      // Can see all auctions from own school only
      return sameSchool;

    case 'TEACHER':
      // Can see APPROVED auctions from own school
      return sameSchool && auction.status === 'APPROVED';

    case 'STUDENT':
      // Can see APPROVED auctions from own school
      return sameSchool && auction.status === 'APPROVED';

    case 'BIDDER':
      // Can see APPROVED auctions from own school (future role)
      return sameSchool && auction.status === 'APPROVED';

    default:
      return false;
  }
}

/**
 * Check if user can edit an auction
 * 
 * Rules:
 * - SITE_ADMIN: can edit all
 * - SCHOOL_ADMIN: can edit own school auctions
 * - TEACHER: can edit own auctions only
 * - STUDENT/BIDDER: cannot edit
 * 
 * @param {Object} user - User object { id, role, schoolId }
 * @param {Object} auction - Auction object { id, school_id, created_by }
 * @returns {boolean} True if user can edit auction
 */
function canEditAuction(user, auction) {
  if (!user || !auction) {
    return false;
  }

  switch (user.role) {
    case 'SITE_ADMIN':
      return true;

    case 'SCHOOL_ADMIN':
      return user.schoolId === auction.school_id;

    case 'TEACHER':
      // Can only edit own auctions
      return user.schoolId === auction.school_id && user.id === auction.created_by;

    case 'STUDENT':
    case 'BIDDER':
      return false;

    default:
      return false;
  }
}

/**
 * Check if user can view artwork based on role and approval status
 * 
 * Rules:
 * - SITE_ADMIN: sees all (DRAFT, SUBMITTED, APPROVED, REJECTED)
 * - SCHOOL_ADMIN: sees all in own school
 * - TEACHER: sees own submissions + APPROVED artwork
 * - STUDENT: sees own draft submissions + APPROVED artwork only
 * - BIDDER: sees APPROVED artwork only
 * 
 * @param {Object} user - User object { id, role, schoolId }
 * @param {Object} artwork - Artwork object { school_id, status, submitted_by }
 * @returns {boolean} True if user can view artwork
 */
function canViewArtwork(user, artwork) {
  if (!user || !artwork) {
    return false;
  }

  const ownSubmission = user.id === artwork.submitted_by;
  const sameSchool = user.schoolId === artwork.school_id;

  switch (user.role) {
    case 'SITE_ADMIN':
      return true;

    case 'SCHOOL_ADMIN':
      return sameSchool;

    case 'TEACHER':
      // Can see own submissions + approved artwork in school
      return sameSchool && (ownSubmission || artwork.status === 'APPROVED');

    case 'STUDENT':
      // Can see own draft submissions + approved artwork only
      return sameSchool && (ownSubmission || artwork.status === 'APPROVED');

    case 'BIDDER':
      // Can see approved artwork only
      return sameSchool && artwork.status === 'APPROVED';

    default:
      return false;
  }
}

/**
 * Check if user can approve artwork
 * 
 * Rules:
 * - SITE_ADMIN: can approve all
 * - SCHOOL_ADMIN: can approve in own school
 * - TEACHER: can approve in own school (if designatedApprover)
 * - STUDENT/BIDDER: cannot approve
 * 
 * @param {Object} user - User object { id, role, schoolId }
 * @param {Object} artwork - Artwork object { school_id, status }
 * @param {boolean} isDesignatedApprover - Is user a designated approver for school
 * @returns {boolean} True if user can approve
 */
function canApproveArtwork(user, artwork, isDesignatedApprover = false) {
  if (!user || !artwork) {
    return false;
  }

  const sameSchool = user.schoolId === artwork.school_id;

  switch (user.role) {
    case 'SITE_ADMIN':
      return true;

    case 'SCHOOL_ADMIN':
      return sameSchool;

    case 'TEACHER':
      // Only if designated approver for school
      return sameSchool && isDesignatedApprover;

    case 'STUDENT':
    case 'BIDDER':
      return false;

    default:
      return false;
  }
}

/**
 * Filter auction array by user visibility
 * 
 * @param {Object} user - User object { id, role, schoolId }
 * @param {Array} auctions - Array of auction objects
 * @returns {Array} Filtered auctions
 */
function filterAuctionsByRole(user, auctions) {
  if (!Array.isArray(auctions)) {
    return [];
  }

  return auctions.filter(auction => canViewAuction(user, auction));
}

/**
 * Filter artwork array by user visibility
 * 
 * @param {Object} user - User object { id, role, schoolId }
 * @param {Array} artwork - Array of artwork objects
 * @returns {Array} Filtered artwork
 */
function filterArtworkByRole(user, artwork) {
  if (!Array.isArray(artwork)) {
    return [];
  }

  return artwork.filter(item => canViewArtwork(user, item));
}

/**
 * Sanitize response by removing sensitive fields for certain roles
 * 
 * Fields hidden from STUDENT and BIDDER:
 * - submitted_by (artist identity)
 * - artist_email
 * - artist_phone
 * - submission_notes
 * - internal_comments
 * - approval_reason
 * - rejected_reason
 * 
 * @param {Object} data - Data object to sanitize
 * @param {string} userRole - User's role
 * @returns {Object} Sanitized data
 */
function sanitizeResponseByRole(data, userRole) {
  if (!data) {
    return data;
  }

  // Create shallow copy to avoid mutation
  const sanitized = { ...data };

  // Hide artist details from STUDENT and BIDDER
  if (userRole === 'STUDENT' || userRole === 'BIDDER') {
    const fieldsToHide = [
      'submitted_by',
      'artist_email',
      'artist_phone',
      'artist_name_full',
      'submission_notes',
      'internal_comments',
      'approval_reason',
      'rejected_reason',
      'created_by',
      'created_by_email'
    ];

    fieldsToHide.forEach(field => {
      delete sanitized[field];
    });
  }

  return sanitized;
}

/**
 * Sanitize array of objects by removing sensitive fields
 * 
 * @param {Array} dataArray - Array of objects to sanitize
 * @param {string} userRole - User's role
 * @returns {Array} Sanitized array
 */
function sanitizeArrayByRole(dataArray, userRole) {
  if (!Array.isArray(dataArray)) {
    return dataArray;
  }

  return dataArray.map(item => sanitizeResponseByRole(item, userRole));
}

/**
 * Check if user owns a resource (can be extended for other resources)
 * 
 * @param {Object} user - User object { id }
 * @param {Object} resource - Resource object { created_by, submitted_by, user_id, teacher_id }
 * @returns {boolean} True if user owns resource
 */
function isResourceOwner(user, resource) {
  if (!user || !resource) {
    return false;
  }

  return (
    user.id === resource.created_by ||
    user.id === resource.submitted_by ||
    user.id === resource.user_id ||
    user.id === resource.teacher_id
  );
}

/**
 * Verify user can access resource in given school context
 * 
 * @param {Object} user - User object { id, role, schoolId }
 * @param {Object} resource - Resource object { school_id }
 * @returns {boolean} True if user can access resource
 */
function canAccessSchoolResource(user, resource) {
  if (!user || !resource) {
    return false;
  }

  // SITE_ADMIN can access all
  if (user.role === 'SITE_ADMIN') {
    return true;
  }

  // All others: must match school_id
  return user.schoolId === resource.school_id;
}

/**
 * Get role index for comparison
 * Lower index = higher privilege
 * 
 * @param {string} role - Role name
 * @returns {number} Index in hierarchy (-1 if invalid)
 */
function getRoleIndex(role) {
  return ROLE_HIERARCHY.indexOf(role);
}

/**
 * Get role name at given index
 * 
 * @param {number} index - Index in hierarchy
 * @returns {string} Role name (or null if invalid)
 */
function getRoleByIndex(index) {
  return ROLE_HIERARCHY[index] || null;
}

module.exports = {
  ROLE_HIERARCHY,
  canAccessRole,
  canViewAuction,
  canEditAuction,
  canViewArtwork,
  canApproveArtwork,
  filterAuctionsByRole,
  filterArtworkByRole,
  sanitizeResponseByRole,
  sanitizeArrayByRole,
  isResourceOwner,
  canAccessSchoolResource,
  getRoleIndex,
  getRoleByIndex
};
