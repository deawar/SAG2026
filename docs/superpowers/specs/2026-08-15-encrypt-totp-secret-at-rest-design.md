# Encrypt TOTP secrets at rest (parity with backup codes)

**Date:** 2026-08-15
**Status:** Design approved, pending spec review

## Problem

The TOTP shared secret (`users.two_fa_secret`) is stored in **plaintext**
(`schema.sql:81`, `VARCHAR(32)`), while the 2FA backup codes in the same table
are encrypted. Anyone with read access to the database (dump, backup, injection)
can reconstruct any user's authenticator and defeat their 2FA.

## Goal

Encrypt `two_fa_secret` at rest using the same mechanism that already protects
the backup codes, migrate existing plaintext secrets, and keep every current
2FA user working with no re-enrollment.

**Non-goal:** the broader AES-GCM + real-key encryption hardening
(`docs/superpowers/specs/2026-07-19-encryption-migration-scope.md`). This task
reaches parity with the backup codes now; that later effort will re-encrypt all
fields (this one included) under the stronger scheme.

## Current state (verified)

- `_encryptData(data)` / `_decryptData(encrypted)` in `authenticationService.js`
  (~lines 326/336): AES-256-CBC, key `scrypt(process.env.ENCRYPTION_KEY ||
  'default-key', 'salt', 32)`, output format `"<iv-hex>:<cipher-hex>"`.
- **Write site (single):** `confirmSetup` (`authenticationService.js:259`)
  persists `two_fa_secret = secret` (plaintext) alongside the already-encrypted
  backup codes.
- **Runtime read site (single):** `verify2FA` (`userController.js:641`) —
  `twoFactorService.verifyToken(user.two_fa_secret, code)`.
- `verifyToken(secret, token)` is also called inside `confirmSetup` with the
  *plaintext* setup secret supplied by the client — this must keep accepting
  plaintext (we only encrypt when persisting).
- Column `two_fa_secret VARCHAR(32)` — too small for ciphertext.
- **Distinguishable:** an encrypted value contains `:` plus hex; a base32 TOTP
  secret (A–Z, 2–7) never contains `:`. This lets read + migration tell
  encrypted from legacy-plaintext reliably.
- Startup migrations already run idempotent `ALTER TABLE`s in `src/index.js`
  (schema.sql changes do NOT reach the live DB on their own — schema-drift
  pattern).

## Design

### 1. Encryption helpers on the 2FA service

Add two small methods that wrap the existing `_encryptData`/`_decryptData`:

- `encryptSecret(secret)` → `_encryptData(secret)`.
- `decryptSecret(stored)` → if `stored` is truthy and contains `:`, return
  `_decryptData(stored)`; otherwise return `stored` unchanged (legacy plaintext
  fallback). A tiny `isEncrypted(v)` predicate (`typeof v === 'string' &&
  v.includes(':')`) backs the check and is unit-tested.

These keep the AES-CBC mechanism identical to the backup codes and centralize
the encrypted-vs-plaintext decision in one tested place.

### 2. Encrypt on write

In `confirmSetup`, persist `two_fa_secret = this.encryptSecret(secret)` instead
of the plaintext `secret`. Backup-code encryption there is unchanged.

### 3. Decrypt on read (with plaintext fallback)

In `verify2FA` (`userController.js:641`), verify against the decrypted secret:
`verifyToken(this.authService.twoFactorService.decryptSecret(user.two_fa_secret), code)`.
The fallback means a legacy plaintext secret still verifies, so no user is
locked out during (or after) rollout. It stays as a permanent safety net.

### 4. Widen the column

- `schema.sql:81`: `two_fa_secret VARCHAR(32)` → `two_fa_secret TEXT`.
- `src/index.js` startup migrations: idempotent
  `ALTER TABLE users ALTER COLUMN two_fa_secret TYPE TEXT`.

### 5. One-time migration of existing plaintext secrets

In `src/index.js`, after the column widen, encrypt existing plaintext secrets:

- `SELECT id, two_fa_secret FROM users WHERE two_fa_secret IS NOT NULL AND
  two_fa_secret NOT LIKE '%:%'` (the `NOT LIKE '%:%'` selects legacy plaintext).
- For each row: `UPDATE users SET two_fa_secret = <encryptSecret(secret)> WHERE
  id = $1`, using the same encryption as the service (an `AuthenticationService`/
  `TwoFactorService` instance, or a shared helper, wired at startup).
- Idempotent: already-encrypted rows contain `:` and are excluded, so the block
  is safe to run on every boot. After the first deploy, **0 plaintext secrets
  remain**.

### 6. Data flow

```
2FA setup:  client secret (plaintext) --confirmSetup--> encryptSecret --> DB (iv:cipher)
2FA verify: DB two_fa_secret --decryptSecret(fallback)--> plaintext --> verifyToken(code)
boot:       ALTER two_fa_secret TYPE TEXT
            then: encrypt every legacy-plaintext row (once; idempotent)
```

## Error / edge handling

- Decrypt failure or a value without `:` → treated as legacy plaintext (used
  as-is); 2FA still verifies. No 500s from the read path.
- Migration errors are non-fatal to boot (wrapped like the other startup
  migrations, which log a warning and continue).
- `ENCRYPTION_KEY` unset falls back to `'default-key'` exactly as backup codes
  do today — no behavior change vs. the existing encrypted field. (Hardening
  the key is the separate scoped effort.)

## Testing

- `isEncrypted`/`decryptSecret`: encrypted input round-trips to the original;
  plaintext input passes through unchanged.
- `confirmSetup` stores a `:`-format (encrypted) `two_fa_secret`, not the
  plaintext.
- `verify2FA` succeeds when the stored secret is encrypted AND when it is a
  legacy plaintext value (fallback path).
- Migration query logic: a plaintext row is encrypted; an already-encrypted row
  is not selected (idempotency).

## Files touched (estimate)

- `src/services/authenticationService.js` — `encryptSecret`/`decryptSecret`/
  `isEncrypted`; encrypt in `confirmSetup`.
- `src/controllers/userController.js` — decrypt in `verify2FA`.
- `schema.sql` — column type.
- `src/index.js` — startup `ALTER` + one-time encrypt migration.
- Tests: service unit tests + a verify2FA test covering both secret forms.

## Rollout

Deploy runs the `ALTER` and the one-time encrypt migration on boot. No
re-enrollment, no user-visible change; existing 2FA keeps working throughout.

## Out of scope

- AES-GCM / authenticated encryption and real key management (separate spec).
- Changing the 2FA flow, backup-code handling, or any other field.
