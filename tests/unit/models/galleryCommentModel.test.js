'use strict';
const GalleryCommentModel = require('../../../src/models/galleryCommentModel');

const fakeDb = () => ({ query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) });

describe('GalleryCommentModel', () => {
  test('createComment inserts PENDING and returns the row', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'PENDING', created_at: 't' }], rowCount: 1 });
    const m = new GalleryCommentModel(db);
    const row = await m.createComment({ portfolioItemId: 'i1', authorUserId: 'u1', authorSchoolId: 's1', body: 'nice' });
    expect(row).toEqual({ id: 'c1', status: 'PENDING', created_at: 't' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO gallery_comments');
    expect(params).toEqual(['i1', 'u1', 's1', 'nice']);
  });

  test('listApprovedForItem filters APPROVED and selects first name only', async () => {
    const db = fakeDb();
    const m = new GalleryCommentModel(db);
    await m.listApprovedForItem('i1');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("c.status = 'APPROVED'");
    expect(sql).toContain('first_name');
    expect(sql).not.toContain('last_name');
    expect(sql).not.toContain('email');
    expect(params).toEqual(['i1']);
  });

  test('listPendingForSchool keys on the owner live school', async () => {
    const db = fakeDb();
    const m = new GalleryCommentModel(db);
    await m.listPendingForSchool('s1');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("c.status = 'PENDING'");
    expect(sql).toContain('owner.school_id = $1');
    expect(params).toEqual(['s1']);
  });

  test('moderateComment is school-scoped and PENDING-only; null when no row', async () => {
    const db = fakeDb();
    const m = new GalleryCommentModel(db);
    const out = await m.moderateComment('c1', 's1', 'APPROVED', 'mod1');
    expect(out).toBeNull();
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("c.status = 'PENDING'");
    expect(sql).toContain('owner.school_id = $2');
    expect(params).toEqual(['c1', 's1', 'APPROVED', 'mod1']);
  });
});
