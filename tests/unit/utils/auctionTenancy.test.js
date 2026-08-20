const { schoolCanManage } = require('../../../src/utils/auctionTenancy');

describe('schoolCanManage', () => {
  test('SITE_ADMIN can manage any school (even with null own school)', () => {
    expect(schoolCanManage('SITE_ADMIN', null, 'school-B')).toBe(true);
    expect(schoolCanManage('SITE_ADMIN', 'school-A', 'school-B')).toBe(true);
  });
  test('SCHOOL_ADMIN can manage only their own school', () => {
    expect(schoolCanManage('SCHOOL_ADMIN', 'school-A', 'school-A')).toBe(true);
    expect(schoolCanManage('SCHOOL_ADMIN', 'school-A', 'school-B')).toBe(false);
  });
  test('SCHOOL_ADMIN with no school never matches', () => {
    expect(schoolCanManage('SCHOOL_ADMIN', null, 'school-A')).toBe(false);
    expect(schoolCanManage('SCHOOL_ADMIN', undefined, undefined)).toBe(false);
  });
  test('other roles cannot manage', () => {
    expect(schoolCanManage('TEACHER', 'school-A', 'school-A')).toBe(false);
    expect(schoolCanManage('STUDENT', 'school-A', 'school-A')).toBe(false);
  });
});
