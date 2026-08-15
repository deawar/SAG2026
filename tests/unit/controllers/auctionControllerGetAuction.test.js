/**
 * AuctionController.getAuction — owner visibility (regression: teacher editing
 * their own DRAFT could not load it to prefill the edit form).
 */

process.env.NODE_ENV = 'test';

jest.mock('../../../src/services/auctionService');

const auctionService = require('../../../src/services/auctionService');
const auctionController = require('../../../src/controllers/auctionController');

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

describe('AuctionController.getAuction — owner visibility', () => {
  const draftOwnedByTeacher = {
    auctionId: 'a1',
    title: 'My Draft',
    description: 'desc',
    schoolId: 'school-1',
    status: 'DRAFT',
    startTime: '2026-09-01T10:00:00.000Z',
    endTime: '2026-09-02T10:00:00.000Z',
    createdBy: 'teacher-1'
  };

  test('a teacher can view their OWN draft auction (owner bypass) — 200', async () => {
    auctionService.getAuction.mockResolvedValue(draftOwnedByTeacher);
    const req = { params: { auctionId: 'a1' }, user: { id: 'teacher-1', role: 'TEACHER', schoolId: 'school-1' } };
    const res = fakeRes();

    await auctionController.getAuction(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.auction.title).toBe('My Draft');
    expect(res.body.auction.createdBy).toBe('teacher-1');
    // the prefill flow needs the start/end times present
    expect(res.body.auction.startTime).toBeTruthy();
    expect(res.body.auction.endTime).toBeTruthy();
  });

  test('a teacher canNOT view a DIFFERENT owner\'s draft — 403', async () => {
    auctionService.getAuction.mockResolvedValue({ ...draftOwnedByTeacher, createdBy: 'someone-else' });
    const req = { params: { auctionId: 'a1' }, user: { id: 'teacher-1', role: 'TEACHER', schoolId: 'school-1' } };
    const res = fakeRes();

    await auctionController.getAuction(req, res);

    expect(res.statusCode).toBe(403);
  });

  test('gallery visibility still works: teacher views APPROVED auction in own school — 200', async () => {
    auctionService.getAuction.mockResolvedValue({ ...draftOwnedByTeacher, status: 'APPROVED', createdBy: 'someone-else' });
    const req = { params: { auctionId: 'a1' }, user: { id: 'teacher-1', role: 'TEACHER', schoolId: 'school-1' } };
    const res = fakeRes();

    await auctionController.getAuction(req, res);

    expect(res.statusCode).toBe(200);
  });
});
