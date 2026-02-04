/**
 * Role Hierarchy Visibility Tests
 * File: tests/unit/utils/roleHierarchyUtils.test.js
 * Created: February 3, 2026
 * 
 * Tests:
 * - canAccessRole() - role privilege comparison
 * - canViewAuction() - auction visibility by role
 * - canEditAuction() - auction edit permissions by role
 * - canViewArtwork() - artwork visibility by role
 * - filterAuctionsByRole() - batch filtering
 * - filterArtworkByRole() - batch filtering
 * - sanitizeResponseByRole() - sensitive field removal
 */

const roleHierarchyUtils = require('../../../src/utils/roleHierarchyUtils');

describe('Role Hierarchy Utilities', () => {
  // Sample test data
  const siteAdmin = { id: '1', role: 'SITE_ADMIN', schoolId: 'school-1' };
  const schoolAdmin = { id: '2', role: 'SCHOOL_ADMIN', schoolId: 'school-1' };
  const teacher = { id: '3', role: 'TEACHER', schoolId: 'school-1' };
  const student = { id: '4', role: 'STUDENT', schoolId: 'school-1' };
  const bidder = { id: '5', role: 'BIDDER', schoolId: 'school-1' };

  const schoolAuction = {
    id: 'auction-1',
    school_id: 'school-1',
    status: 'APPROVED',
    created_by: '2'
  };

  const draftAuction = {
    id: 'auction-2',
    school_id: 'school-1',
    status: 'DRAFT',
    created_by: '2'
  };

  const approvedArtwork = {
    id: 'art-1',
    school_id: 'school-1',
    status: 'APPROVED',
    submitted_by: '3'
  };

  const draftArtwork = {
    id: 'art-2',
    school_id: 'school-1',
    status: 'DRAFT',
    submitted_by: '4'
  };

  // ============ canAccessRole Tests ============
  describe('canAccessRole()', () => {
    test('SITE_ADMIN can access all roles', () => {
      expect(roleHierarchyUtils.canAccessRole('SITE_ADMIN', 'SITE_ADMIN')).toBe(true);
      expect(roleHierarchyUtils.canAccessRole('SITE_ADMIN', 'SCHOOL_ADMIN')).toBe(true);
      expect(roleHierarchyUtils.canAccessRole('SITE_ADMIN', 'TEACHER')).toBe(true);
      expect(roleHierarchyUtils.canAccessRole('SITE_ADMIN', 'STUDENT')).toBe(true);
      expect(roleHierarchyUtils.canAccessRole('SITE_ADMIN', 'BIDDER')).toBe(true);
    });

    test('SCHOOL_ADMIN can access SCHOOL_ADMIN and lower', () => {
      expect(roleHierarchyUtils.canAccessRole('SCHOOL_ADMIN', 'SITE_ADMIN')).toBe(false);
      expect(roleHierarchyUtils.canAccessRole('SCHOOL_ADMIN', 'SCHOOL_ADMIN')).toBe(true);
      expect(roleHierarchyUtils.canAccessRole('SCHOOL_ADMIN', 'TEACHER')).toBe(true);
      expect(roleHierarchyUtils.canAccessRole('SCHOOL_ADMIN', 'STUDENT')).toBe(true);
      expect(roleHierarchyUtils.canAccessRole('SCHOOL_ADMIN', 'BIDDER')).toBe(true);
    });

    test('STUDENT cannot access TEACHER or higher', () => {
      expect(roleHierarchyUtils.canAccessRole('STUDENT', 'TEACHER')).toBe(false);
      expect(roleHierarchyUtils.canAccessRole('STUDENT', 'SCHOOL_ADMIN')).toBe(false);
      expect(roleHierarchyUtils.canAccessRole('STUDENT', 'SITE_ADMIN')).toBe(false);
      expect(roleHierarchyUtils.canAccessRole('STUDENT', 'STUDENT')).toBe(true);
      expect(roleHierarchyUtils.canAccessRole('STUDENT', 'BIDDER')).toBe(true);
    });

    test('Invalid role returns false', () => {
      expect(roleHierarchyUtils.canAccessRole('INVALID_ROLE', 'STUDENT')).toBe(false);
      expect(roleHierarchyUtils.canAccessRole('STUDENT', 'INVALID_ROLE')).toBe(false);
    });
  });

  // ============ canViewAuction Tests ============
  describe('canViewAuction()', () => {
    test('SITE_ADMIN can view all auctions', () => {
      expect(roleHierarchyUtils.canViewAuction(siteAdmin, schoolAuction)).toBe(true);
      expect(roleHierarchyUtils.canViewAuction(siteAdmin, draftAuction)).toBe(true);
    });

    test('SCHOOL_ADMIN can view all auctions in own school', () => {
      expect(roleHierarchyUtils.canViewAuction(schoolAdmin, schoolAuction)).toBe(true);
      expect(roleHierarchyUtils.canViewAuction(schoolAdmin, draftAuction)).toBe(true);
    });

    test('SCHOOL_ADMIN cannot view auctions from other schools', () => {
      const otherSchoolAuction = { ...schoolAuction, school_id: 'school-2' };
      expect(roleHierarchyUtils.canViewAuction(schoolAdmin, otherSchoolAuction)).toBe(false);
    });

    test('TEACHER can only view APPROVED auctions in own school', () => {
      expect(roleHierarchyUtils.canViewAuction(teacher, schoolAuction)).toBe(true);
      expect(roleHierarchyUtils.canViewAuction(teacher, draftAuction)).toBe(false);
    });

    test('STUDENT can only view APPROVED auctions in own school', () => {
      expect(roleHierarchyUtils.canViewAuction(student, schoolAuction)).toBe(true);
      expect(roleHierarchyUtils.canViewAuction(student, draftAuction)).toBe(false);
    });

    test('BIDDER can only view APPROVED auctions in own school', () => {
      expect(roleHierarchyUtils.canViewAuction(bidder, schoolAuction)).toBe(true);
      expect(roleHierarchyUtils.canViewAuction(bidder, draftAuction)).toBe(false);
    });

    test('returns false for null/undefined inputs', () => {
      expect(roleHierarchyUtils.canViewAuction(null, schoolAuction)).toBe(false);
      expect(roleHierarchyUtils.canViewAuction(student, null)).toBe(false);
    });
  });

  // ============ canEditAuction Tests ============
  describe('canEditAuction()', () => {
    test('SITE_ADMIN can edit any auction', () => {
      expect(roleHierarchyUtils.canEditAuction(siteAdmin, schoolAuction)).toBe(true);
    });

    test('SCHOOL_ADMIN can edit auctions in own school', () => {
      expect(roleHierarchyUtils.canEditAuction(schoolAdmin, schoolAuction)).toBe(true);
    });

    test('SCHOOL_ADMIN cannot edit auctions from other schools', () => {
      const otherSchoolAuction = { ...schoolAuction, school_id: 'school-2' };
      expect(roleHierarchyUtils.canEditAuction(schoolAdmin, otherSchoolAuction)).toBe(false);
    });

    test('TEACHER can only edit own auctions', () => {
      const teacherOwnAuction = { ...schoolAuction, created_by: '3' };
      expect(roleHierarchyUtils.canEditAuction(teacher, teacherOwnAuction)).toBe(true);
      expect(roleHierarchyUtils.canEditAuction(teacher, schoolAuction)).toBe(false);
    });

    test('STUDENT and BIDDER cannot edit', () => {
      expect(roleHierarchyUtils.canEditAuction(student, schoolAuction)).toBe(false);
      expect(roleHierarchyUtils.canEditAuction(bidder, schoolAuction)).toBe(false);
    });
  });

  // ============ canViewArtwork Tests ============
  describe('canViewArtwork()', () => {
    test('SITE_ADMIN can view all artwork', () => {
      expect(roleHierarchyUtils.canViewArtwork(siteAdmin, approvedArtwork)).toBe(true);
      expect(roleHierarchyUtils.canViewArtwork(siteAdmin, draftArtwork)).toBe(true);
    });

    test('SCHOOL_ADMIN can view all artwork in own school', () => {
      expect(roleHierarchyUtils.canViewArtwork(schoolAdmin, approvedArtwork)).toBe(true);
      expect(roleHierarchyUtils.canViewArtwork(schoolAdmin, draftArtwork)).toBe(true);
    });

    test('TEACHER can view own submissions + approved artwork', () => {
      const teacherOwnArtwork = { ...draftArtwork, submitted_by: '3' };
      expect(roleHierarchyUtils.canViewArtwork(teacher, teacherOwnArtwork)).toBe(true);
      expect(roleHierarchyUtils.canViewArtwork(teacher, approvedArtwork)).toBe(true);
      expect(roleHierarchyUtils.canViewArtwork(teacher, draftArtwork)).toBe(false);
    });

    test('STUDENT can view own submissions + approved artwork', () => {
      const studentOwnArtwork = { ...draftArtwork, submitted_by: '4' };
      expect(roleHierarchyUtils.canViewArtwork(student, studentOwnArtwork)).toBe(true);
      expect(roleHierarchyUtils.canViewArtwork(student, approvedArtwork)).toBe(true);
      expect(roleHierarchyUtils.canViewArtwork(student, draftArtwork)).toBe(false);
    });

    test('BIDDER can only view APPROVED artwork', () => {
      expect(roleHierarchyUtils.canViewArtwork(bidder, approvedArtwork)).toBe(true);
      expect(roleHierarchyUtils.canViewArtwork(bidder, draftArtwork)).toBe(false);
    });
  });

  // ============ filterAuctionsByRole Tests ============
  describe('filterAuctionsByRole()', () => {
    const auctions = [schoolAuction, draftAuction];

    test('SITE_ADMIN sees all auctions', () => {
      const filtered = roleHierarchyUtils.filterAuctionsByRole(siteAdmin, auctions);
      expect(filtered.length).toBe(2);
    });

    test('SCHOOL_ADMIN sees own school auctions', () => {
      const filtered = roleHierarchyUtils.filterAuctionsByRole(schoolAdmin, auctions);
      expect(filtered.length).toBe(2);
    });

    test('TEACHER sees only APPROVED auctions', () => {
      const filtered = roleHierarchyUtils.filterAuctionsByRole(teacher, auctions);
      expect(filtered.length).toBe(1);
      expect(filtered[0].status).toBe('APPROVED');
    });

    test('STUDENT sees only APPROVED auctions', () => {
      const filtered = roleHierarchyUtils.filterAuctionsByRole(student, auctions);
      expect(filtered.length).toBe(1);
    });

    test('returns empty array for invalid input', () => {
      expect(roleHierarchyUtils.filterAuctionsByRole(student, null)).toEqual([]);
      expect(roleHierarchyUtils.filterAuctionsByRole(student, 'not-an-array')).toEqual([]);
    });
  });

  // ============ sanitizeResponseByRole Tests ============
  describe('sanitizeResponseByRole()', () => {
    const sensitiveData = {
      id: 'art-1',
      title: 'Mona Lisa',
      submitted_by: 'user-123',
      artist_email: 'artist@example.com',
      artist_phone: '555-1234',
      submission_notes: 'Internal review notes',
      internal_comments: 'Needs approval',
      approval_reason: 'High quality work'
    };

    test('SITE_ADMIN sees all fields', () => {
      const sanitized = roleHierarchyUtils.sanitizeResponseByRole(sensitiveData, 'SITE_ADMIN');
      expect(sanitized.submitted_by).toBeDefined();
      expect(sanitized.artist_email).toBeDefined();
      expect(sanitized.submission_notes).toBeDefined();
    });

    test('TEACHER sees all fields', () => {
      const sanitized = roleHierarchyUtils.sanitizeResponseByRole(sensitiveData, 'TEACHER');
      expect(sanitized.submitted_by).toBeDefined();
      expect(sanitized.artist_email).toBeDefined();
    });

    test('STUDENT has sensitive fields removed', () => {
      const sanitized = roleHierarchyUtils.sanitizeResponseByRole(sensitiveData, 'STUDENT');
      expect(sanitized.submitted_by).toBeUndefined();
      expect(sanitized.artist_email).toBeUndefined();
      expect(sanitized.artist_phone).toBeUndefined();
      expect(sanitized.submission_notes).toBeUndefined();
      expect(sanitized.title).toBe('Mona Lisa'); // Keep public data
    });

    test('BIDDER has sensitive fields removed', () => {
      const sanitized = roleHierarchyUtils.sanitizeResponseByRole(sensitiveData, 'BIDDER');
      expect(sanitized.submitted_by).toBeUndefined();
      expect(sanitized.artist_email).toBeUndefined();
      expect(sanitized.internal_comments).toBeUndefined();
    });
  });

  // ============ getRoleIndex Tests ============
  describe('getRoleIndex()', () => {
    test('returns correct index for valid roles', () => {
      expect(roleHierarchyUtils.getRoleIndex('SITE_ADMIN')).toBe(0);
      expect(roleHierarchyUtils.getRoleIndex('SCHOOL_ADMIN')).toBe(1);
      expect(roleHierarchyUtils.getRoleIndex('TEACHER')).toBe(2);
      expect(roleHierarchyUtils.getRoleIndex('STUDENT')).toBe(3);
      expect(roleHierarchyUtils.getRoleIndex('BIDDER')).toBe(4);
    });

    test('returns -1 for invalid role', () => {
      expect(roleHierarchyUtils.getRoleIndex('INVALID')).toBe(-1);
    });
  });
});
