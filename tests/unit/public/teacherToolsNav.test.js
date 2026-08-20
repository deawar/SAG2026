/** @jest-environment jsdom */
const UIComponents = require('../../../public/js/ui-components.js');

describe('UIComponents.teacherToolsNavTarget', () => {
  test('SCHOOL_ADMIN → Teacher Tools link', () => {
    expect(UIComponents.teacherToolsNavTarget('SCHOOL_ADMIN'))
      .toEqual({ label: 'Teacher Tools', href: '/teacher-dashboard.html' });
  });

  test.each(['TEACHER', 'STUDENT', 'BIDDER', 'SITE_ADMIN', undefined])(
    '%s → null (link not shown)',
    (role) => {
      expect(UIComponents.teacherToolsNavTarget(role)).toBeNull();
    }
  );
});

describe('UIComponents.injectTeacherToolsLink', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<ul class="nav-list"></ul><div id="user-dropdown"></div>';
  });

  test('injects the link into nav + dropdown for SCHOOL_ADMIN', () => {
    UIComponents.injectTeacherToolsLink('SCHOOL_ADMIN');
    expect(document.querySelector('.nav-list a.nav-link[href="/teacher-dashboard.html"]')).not.toBeNull();
    expect(document.querySelector('#user-dropdown a.dropdown-item[href="/teacher-dashboard.html"]')).not.toBeNull();
  });

  test('injects nothing for a TEACHER', () => {
    UIComponents.injectTeacherToolsLink('TEACHER');
    expect(document.querySelector('a[href="/teacher-dashboard.html"]')).toBeNull();
  });

  test('is idempotent — no duplicate link on repeat calls', () => {
    UIComponents.injectTeacherToolsLink('SCHOOL_ADMIN');
    UIComponents.injectTeacherToolsLink('SCHOOL_ADMIN');
    expect(document.querySelectorAll('a[href="/teacher-dashboard.html"]').length).toBe(2); // one nav, one dropdown
  });
});
