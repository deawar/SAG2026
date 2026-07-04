const { publicArtistName } = require('../../../src/utils/piiUtils');

describe('publicArtistName', () => {
  test('reduces "First Last" to "First L."', () => {
    expect(publicArtistName('Ava Rodriguez')).toBe('Ava R.');
  });
  test('accepts separate first/last args', () => {
    expect(publicArtistName('Ava', 'Rodriguez')).toBe('Ava R.');
  });
  test('single name passes through with no initial', () => {
    expect(publicArtistName('Ava')).toBe('Ava');
  });
  test('null / empty returns empty string', () => {
    expect(publicArtistName(null)).toBe('');
    expect(publicArtistName('')).toBe('');
  });
});
