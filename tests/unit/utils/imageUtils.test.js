const { validateImageDataUrl } = require('../../../src/utils/imageUtils');

describe('validateImageDataUrl', () => {
  test('accepts a valid png data URL', () => {
    const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    expect(validateImageDataUrl(url)).toBe(url);
  });
  test('accepts jpeg/gif/webp', () => {
    expect(validateImageDataUrl('data:image/jpeg;base64,/9j/4AAQ==')).toMatch(/^data:image\/jpeg/);
    expect(validateImageDataUrl('data:image/gif;base64,R0lGOD==')).toMatch(/^data:image\/gif/);
    expect(validateImageDataUrl('data:image/webp;base64,UklGRg==')).toMatch(/^data:image\/webp/);
  });
  test('rejects svg (stored-XSS vector), missing data, and non-image', () => {
    expect(validateImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(validateImageDataUrl(null)).toBeNull();
    expect(validateImageDataUrl('')).toBeNull();
    expect(validateImageDataUrl('not-a-data-url')).toBeNull();
  });
});
