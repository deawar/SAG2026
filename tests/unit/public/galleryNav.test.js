/** @jest-environment jsdom */
const UIComponents = require('../../../public/js/ui-components.js');

describe('UIComponents.galleryNavTarget', () => {
  test.each(['STUDENT', 'TEACHER', 'SCHOOL_ADMIN'])('%s → School Gallery', (role) => {
    expect(UIComponents.galleryNavTarget(role))
      .toEqual({ label: 'School Gallery', href: '/gallery.html' });
  });

  test('SITE_ADMIN / BIDDER / unknown → null', () => {
    expect(UIComponents.galleryNavTarget('SITE_ADMIN')).toBeNull();
    expect(UIComponents.galleryNavTarget('BIDDER')).toBeNull();
    expect(UIComponents.galleryNavTarget(undefined)).toBeNull();
  });
});
