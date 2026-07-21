'use strict';

const GalleryGrantModel = require('../../../src/models/galleryGrantModel');

describe('GalleryGrantModel', () => {
  let fakeDb;
  let model;

  beforeEach(() => {
    fakeDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    model = new GalleryGrantModel(fakeDb);
  });

  // ── getViewerGrantAccess ──────────────────────────────────────────────────

  describe('getViewerGrantAccess', () => {
    const HOST_SCHOOL = 'school-host-1';

    // Branch 1: TEACHER with a matching ACCEPTED grant → allowed:true via invited_teacher
    it('returns allowed:true via invited_teacher when TEACHER has ACCEPTED grant', async () => {
      const grantId = 'grant-abc';
      fakeDb.query.mockResolvedValueOnce({ rows: [{ id: grantId }] });

      const viewer = { id: 'teacher-1', role: 'TEACHER', school_id: 'school-other' };
      const result = await model.getViewerGrantAccess(viewer, HOST_SCHOOL);

      expect(result).toEqual({ allowed: true, via: 'invited_teacher', grantId });

      // Verify query params: $1=hostSchoolId, $2=viewer.id
      const [sql, params] = fakeDb.query.mock.calls[0];
      expect(params).toEqual([HOST_SCHOOL, viewer.id]);
      expect(sql).toMatch(/invited_teacher_user_id=\$2/);
      expect(sql).toMatch(/status='ACCEPTED'/);
    });

    // Branch 2: TEACHER with no matching grant → allowed:false
    it('returns allowed:false when TEACHER has no ACCEPTED grant', async () => {
      fakeDb.query.mockResolvedValueOnce({ rows: [] });

      const viewer = { id: 'teacher-2', role: 'TEACHER', school_id: 'school-other' };
      const result = await model.getViewerGrantAccess(viewer, HOST_SCHOOL);

      expect(result).toEqual({ allowed: false });
      expect(fakeDb.query).toHaveBeenCalledTimes(1);
    });

    // Branch 3: STUDENT with member row → allowed:true via enabled_student
    it('returns allowed:true via enabled_student when STUDENT has a member row', async () => {
      const grantId = 'grant-xyz';
      fakeDb.query.mockResolvedValueOnce({ rows: [{ id: grantId }] });

      const viewer = { id: 'student-1', role: 'STUDENT', school_id: 'school-invited' };
      const result = await model.getViewerGrantAccess(viewer, HOST_SCHOOL);

      expect(result).toEqual({ allowed: true, via: 'enabled_student', grantId });

      // Verify query params: $1=hostSchoolId, $2=viewer.id, $3=viewer.school_id
      const [sql, params] = fakeDb.query.mock.calls[0];
      expect(params).toEqual([HOST_SCHOOL, viewer.id, viewer.school_id]);
      expect(sql).toMatch(/gallery_grant_members/);
      expect(sql).toMatch(/g\.status='ACCEPTED'/);
    });

    // Branch 4: STUDENT without member row → allowed:false
    it('returns allowed:false when STUDENT has no member row', async () => {
      fakeDb.query.mockResolvedValueOnce({ rows: [] });

      const viewer = { id: 'student-2', role: 'STUDENT', school_id: 'school-invited' };
      const result = await model.getViewerGrantAccess(viewer, HOST_SCHOOL);

      expect(result).toEqual({ allowed: false });
      expect(fakeDb.query).toHaveBeenCalledTimes(1);
    });

    // Edge: STUDENT with no school_id → deny without querying
    it('returns allowed:false for STUDENT with no school_id (never queries)', async () => {
      const viewer = { id: 'student-3', role: 'STUDENT', school_id: null };
      const result = await model.getViewerGrantAccess(viewer, HOST_SCHOOL);

      expect(result).toEqual({ allowed: false });
      expect(fakeDb.query).not.toHaveBeenCalled();
    });

    // Edge: SCHOOL_ADMIN also gets the teacher-path lookup
    it('returns allowed:true via invited_teacher for SCHOOL_ADMIN with ACCEPTED grant', async () => {
      const grantId = 'grant-admin';
      fakeDb.query.mockResolvedValueOnce({ rows: [{ id: grantId }] });

      const viewer = { id: 'admin-1', role: 'SCHOOL_ADMIN', school_id: 'school-other' };
      const result = await model.getViewerGrantAccess(viewer, HOST_SCHOOL);

      expect(result).toEqual({ allowed: true, via: 'invited_teacher', grantId });
      const [, params] = fakeDb.query.mock.calls[0];
      expect(params).toEqual([HOST_SCHOOL, viewer.id]);
    });

    // Edge: unrecognised role → deny without querying
    it('returns allowed:false for an unrecognised role (deny-by-default)', async () => {
      const viewer = { id: 'bidder-1', role: 'BIDDER', school_id: null };
      const result = await model.getViewerGrantAccess(viewer, HOST_SCHOOL);

      expect(result).toEqual({ allowed: false });
      expect(fakeDb.query).not.toHaveBeenCalled();
    });
  });
});
