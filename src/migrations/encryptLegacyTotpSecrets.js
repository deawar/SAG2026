/**
 * One-time, idempotent migration: encrypt any legacy plaintext TOTP secrets.
 * A ciphertext is "iv:cipher" (contains ':'); a base32 secret never contains
 * ':', so the `NOT LIKE '%:%'` filter selects only plaintext rows. Safe to run
 * on every boot — once encrypted, a row no longer matches the filter.
 *
 * @param {{ query: Function }} db
 * @param {{ encryptSecret: (s: string) => string }} twoFactorService
 * @returns {Promise<number>} how many secrets were encrypted
 */
async function encryptLegacyTotpSecrets(db, twoFactorService) {
  const { rows } = await db.query(
    "SELECT id, two_fa_secret FROM users WHERE two_fa_secret IS NOT NULL AND two_fa_secret NOT LIKE '%:%'"
  );
  for (const row of rows) {
    await db.query(
      'UPDATE users SET two_fa_secret = $1 WHERE id = $2',
      [twoFactorService.encryptSecret(row.two_fa_secret), row.id]
    );
  }
  return rows.length;
}

module.exports = { encryptLegacyTotpSecrets };
