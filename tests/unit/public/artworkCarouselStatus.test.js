/** @jest-environment jsdom */
const ArtworkCarousel = require('../../../public/js/artwork-carousel.js');

describe('ArtworkCarousel effective status badge', () => {
  const carousel = () => {
    document.body.innerHTML = '<div id="c"></div>';
    return new ArtworkCarousel('c', {});
  };

  test('LIVE with future endTime renders the Live badge', () => {
    const c = carousel();
    const item = { status: 'LIVE', endTime: new Date(Date.now() + 3600000).toISOString() };
    const html = c._renderStatusBadge(c._effectiveStatus(item));
    expect(html).toContain('status-active');
    expect(html).toContain('>Live<');
  });

  test('LIVE with past endTime renders the Ended badge (stale DB status)', () => {
    const c = carousel();
    const item = { status: 'LIVE', endTime: new Date(Date.now() - 3600000).toISOString() };
    const html = c._renderStatusBadge(c._effectiveStatus(item));
    expect(html).toContain('status-ended');
    expect(html).toContain('>Ended<');
  });

  test('LIVE with no endTime stays Live; ENDED stays Ended', () => {
    const c = carousel();
    expect(c._effectiveStatus({ status: 'LIVE', endTime: null })).toBe('LIVE');
    expect(c._effectiveStatus({ status: 'ENDED', endTime: null })).toBe('ENDED');
  });
});
