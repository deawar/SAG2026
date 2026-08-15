process.env.NODE_ENV = 'test';

const { TwoFactorService } = require('../../../src/services/authenticationService');

function makeService(db) {
  return new TwoFactorService({ db: db || { query: jest.fn().mockResolvedValue({ rows: [] }) } });
}

describe('TwoFactorService secret crypto', () => {
  test('isEncrypted: true only for a string containing ":"', () => {
    const svc = makeService();
    expect(svc.isEncrypted('abcd:ef01')).toBe(true);
    expect(svc.isEncrypted('JBSWY3DPEHPK3PXP')).toBe(false);
    expect(svc.isEncrypted(null)).toBe(false);
    expect(svc.isEncrypted(undefined)).toBe(false);
  });

  test('encryptSecret → decryptSecret round-trips the original', () => {
    const svc = makeService();
    const enc = svc.encryptSecret('JBSWY3DPEHPK3PXP');
    expect(svc.isEncrypted(enc)).toBe(true);
    expect(enc).not.toBe('JBSWY3DPEHPK3PXP');
    expect(svc.decryptSecret(enc)).toBe('JBSWY3DPEHPK3PXP');
  });

  test('decryptSecret passes a legacy plaintext value through unchanged', () => {
    const svc = makeService();
    expect(svc.decryptSecret('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
  });

  test('decryptSecret degrades to the stored value when decryption throws (no 500)', () => {
    const svc = makeService();
    // Has a ":" so isEncrypted() is true, but is not valid ciphertext → _decryptData throws.
    const malformed = 'deadbeef:notvalidhex';
    expect(() => svc.decryptSecret(malformed)).not.toThrow();
    expect(svc.decryptSecret(malformed)).toBe(malformed);
  });

  test('confirmSetup persists an ENCRYPTED two_fa_secret', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const svc = makeService(db);
    jest.spyOn(svc, 'verifyToken').mockReturnValue(true);

    await svc.confirmSetup('user-1', 'JBSWY3DPEHPK3PXP', '123456', ['CODE1', 'CODE2']);

    const storedSecret = db.query.mock.calls[0][1][0]; // UPDATE params: [secret, backupCodes, userId]
    expect(svc.isEncrypted(storedSecret)).toBe(true);
    expect(svc.decryptSecret(storedSecret)).toBe('JBSWY3DPEHPK3PXP');
  });
});
