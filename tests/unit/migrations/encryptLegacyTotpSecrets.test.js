const { encryptLegacyTotpSecrets } = require('../../../src/migrations/encryptLegacyTotpSecrets');

describe('encryptLegacyTotpSecrets', () => {
  test('encrypts each plaintext row and returns the count', async () => {
    const db = {
      query: jest.fn()
        // SELECT legacy rows
        .mockResolvedValueOnce({ rows: [
          { id: 'a', two_fa_secret: 'PLAINONE' },
          { id: 'b', two_fa_secret: 'PLAINTWO' }
        ] })
        // subsequent UPDATEs
        .mockResolvedValue({ rows: [] })
    };
    const twoFactorService = { encryptSecret: jest.fn((s) => `iv:${s}`) };

    const count = await encryptLegacyTotpSecrets(db, twoFactorService);

    expect(count).toBe(2);
    // one SELECT + two UPDATEs
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query).toHaveBeenNthCalledWith(2,
      'UPDATE users SET two_fa_secret = $1 WHERE id = $2', ['iv:PLAINONE', 'a']);
    expect(db.query).toHaveBeenNthCalledWith(3,
      'UPDATE users SET two_fa_secret = $1 WHERE id = $2', ['iv:PLAINTWO', 'b']);
  });

  test('no plaintext rows → 0 updates', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) };
    const twoFactorService = { encryptSecret: jest.fn() };

    const count = await encryptLegacyTotpSecrets(db, twoFactorService);

    expect(count).toBe(0);
    expect(twoFactorService.encryptSecret).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1); // SELECT only
  });
});
