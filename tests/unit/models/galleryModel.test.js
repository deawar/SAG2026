'use strict';

const GalleryModel = require('../../../src/models/galleryModel');

describe('GalleryModel', () => {
  let fakeDb;
  let model;

  beforeEach(() => {
    fakeDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    model = new GalleryModel(fakeDb);
  });

  // ── getSchoolGalleryItems ─────────────────────────────────────────────────

  describe('getSchoolGalleryItems', () => {
    it('calls db.query with schoolId as the only parameter', async () => {
      await model.getSchoolGalleryItems('s1');
      expect(fakeDb.query).toHaveBeenCalledTimes(1);
      const [_sql, params] = fakeDb.query.mock.calls[0];
      expect(params).toEqual(['s1']);
    });

    it('filters on u.school_id = $1 (live school membership — transfer-safety invariant)', async () => {
      await model.getSchoolGalleryItems('s1');
      const [sql] = fakeDb.query.mock.calls[0];
      expect(sql).toMatch(/u\.school_id = \$1/);
    });

    it('does NOT reference pi.school_id (snapshot column must be ignored)', async () => {
      await model.getSchoolGalleryItems('s1');
      const [sql] = fakeDb.query.mock.calls[0];
      expect(sql).not.toMatch(/pi\.school_id/);
    });

    it('filters on shared_to_gallery = true', async () => {
      await model.getSchoolGalleryItems('s1');
      const [sql] = fakeDb.query.mock.calls[0];
      expect(sql).toMatch(/shared_to_gallery = true/);
    });

    it("filters on moderation_status = 'VISIBLE'", async () => {
      await model.getSchoolGalleryItems('s1');
      const [sql] = fakeDb.query.mock.calls[0];
      expect(sql).toMatch(/moderation_status = 'VISIBLE'/);
    });

    it('returns the rows array from the query result', async () => {
      const fakeRows = [{ id: 'x', title: 'Painting' }];
      fakeDb.query.mockResolvedValue({ rows: fakeRows });
      const result = await model.getSchoolGalleryItems('s1');
      expect(result).toBe(fakeRows);
    });
  });

  // ── setItemGalleryFlags ───────────────────────────────────────────────────

  describe('setItemGalleryFlags', () => {
    it('returns the updated row when the item belongs to the student', async () => {
      const row = { id: 'i1', shared_to_gallery: true, gallery_comments_allowed: false };
      fakeDb.query.mockResolvedValue({ rows: [row] });
      const result = await model.setItemGalleryFlags('i1', 'u1', { sharedToGallery: true, commentsAllowed: false });
      expect(result).toEqual(row);
    });

    it('returns null when the item does not belong to the student', async () => {
      fakeDb.query.mockResolvedValue({ rows: [] });
      const result = await model.setItemGalleryFlags('i1', 'u1', { sharedToGallery: true });
      expect(result).toBeNull();
    });

    it('passes null for undefined sharedToGallery so COALESCE keeps existing value', async () => {
      await model.setItemGalleryFlags('i1', 'u1', { commentsAllowed: true });
      const [_sql, params] = fakeDb.query.mock.calls[0];
      // params[2] = sharedToGallery arg (undefined → null)
      expect(params[2]).toBeNull();
      expect(params[3]).toBe(true);
    });

    it('passes null for undefined commentsAllowed so COALESCE keeps existing value', async () => {
      await model.setItemGalleryFlags('i1', 'u1', { sharedToGallery: false });
      const [_sql, params] = fakeDb.query.mock.calls[0];
      expect(params[2]).toBe(false);
      expect(params[3]).toBeNull();
    });
  });

  // ── addToRoster ───────────────────────────────────────────────────────────

  describe('addToRoster', () => {
    it('inserts with ON CONFLICT DO NOTHING (idempotent)', async () => {
      await model.addToRoster('school1', 'student1', 'admin1');
      const [sql, params] = fakeDb.query.mock.calls[0];
      expect(sql).toMatch(/ON CONFLICT/i);
      expect(sql).toMatch(/DO NOTHING/i);
      expect(params).toEqual(['school1', 'student1', 'admin1']);
    });

    it('returns undefined (void)', async () => {
      const result = await model.addToRoster('school1', 'student1', 'admin1');
      expect(result).toBeUndefined();
    });
  });

  // ── removeFromRoster ──────────────────────────────────────────────────────

  describe('removeFromRoster', () => {
    it('returns rowCount from the DELETE query', async () => {
      fakeDb.query.mockResolvedValue({ rows: [], rowCount: 1 });
      const count = await model.removeFromRoster('school1', 'student1');
      expect(count).toBe(1);
    });

    it('returns 0 when the student was not on the roster', async () => {
      fakeDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
      const count = await model.removeFromRoster('school1', 'student1');
      expect(count).toBe(0);
    });

    it('passes schoolId and studentUserId as parameters', async () => {
      await model.removeFromRoster('s1', 'u1');
      const [_sql, params] = fakeDb.query.mock.calls[0];
      expect(params).toEqual(['s1', 'u1']);
    });
  });

  // ── resolveViewer ─────────────────────────────────────────────────────────

  describe('resolveViewer', () => {
    it('returns {id, role, school_id} for a known non-deleted user', async () => {
      const row = { id: 'u1', role: 'STUDENT', school_id: 's1' };
      fakeDb.query.mockResolvedValue({ rows: [row] });
      const result = await model.resolveViewer('u1');
      expect(result).toEqual(row);
    });

    it('returns null for an unknown or soft-deleted user', async () => {
      fakeDb.query.mockResolvedValue({ rows: [] });
      const result = await model.resolveViewer('ghost');
      expect(result).toBeNull();
    });

    it('queries by userId and excludes deleted_at IS NOT NULL rows', async () => {
      await model.resolveViewer('u1');
      const [sql, params] = fakeDb.query.mock.calls[0];
      expect(params).toEqual(['u1']);
      expect(sql).toMatch(/deleted_at IS NULL/);
    });
  });
});
