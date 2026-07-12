/** @jest-environment jsdom */
const UIComponents = require('../../../public/js/ui-components.js');

describe('UIComponents.portfolioNavTarget', () => {
  test('STUDENT → My Portfolio', () => {
    expect(UIComponents.portfolioNavTarget('STUDENT'))
      .toEqual({ label: 'My Portfolio', href: '/portfolio.html' });
  });

  test.each(['TEACHER', 'SCHOOL_ADMIN', 'SITE_ADMIN'])('%s → Student Portfolios', (role) => {
    expect(UIComponents.portfolioNavTarget(role))
      .toEqual({ label: 'Student Portfolios', href: '/teacher-portfolios.html' });
  });

  test('BIDDER → null', () => {
    expect(UIComponents.portfolioNavTarget('BIDDER')).toBeNull();
  });

  test('unknown / empty / undefined → null', () => {
    expect(UIComponents.portfolioNavTarget('')).toBeNull();
    expect(UIComponents.portfolioNavTarget(undefined)).toBeNull();
  });
});
