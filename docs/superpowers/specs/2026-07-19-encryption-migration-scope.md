# Encryption Hardening — Migration Scope (#2)

**Status:** SCOPED, not implemented. Created 2026-07-19. Do this in the next session.

## Problem (found by the new security lint)

`_encryptData` / `_decryptData` are **duplicated identically** in two files and are weak:

- `src/services/authenticationService.js:326` (`_encryptData`) / `:336` (`_decryptData`)
- `src/models/index.js:614` (`_encryptData`) / `:624` (`_decryptData`)

Each uses:
```js
const algorithm = 'aes-256-cbc';                                   // no integrity (not AEAD)
const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32); // hardcoded fallback key + static salt
```
Weaknesses: (1) AES-CBC has no authentication tag (ciphertext is malleable, no tamper detection);
(2) fallback key `'default-key'` means if `ENCRYPTION_KEY` is unset, data is encrypted under a
publicly-known key; (3) a single static salt `'salt'` for all key derivation; (4) logic duplicated
in two places (drift risk).

## What is actually encrypted (blast radius)

Only **2FA backup codes** (`JSON.stringify(backupCodes)`), stored in `users.backup_codes`:
- write: `models/index.js:385`, `authenticationService.js:252`, `authenticationService.js:308`
- read: `_decryptData` in both files.

So existing ciphertext at rest = backup codes of users who set up 2FA. A cipher change must still
be able to **read** those, or those users' backup codes become invalid (they'd have to regenerate).

## Recommended approach — shared util + versioned format (zero data migration)

1. **Single shared module** `src/utils/encryption.js` exporting `encrypt(plaintext)` / `decrypt(payload)`.
   Delete both duplicated copies; have `authenticationService.js` and `models/index.js` require it.
2. **Require the key — no fallback.** Read `ENCRYPTION_KEY` once at module load; if missing/short,
   throw at startup (fail fast). (Confirm prod has `ENCRYPTION_KEY` set BEFORE deploying — if prod was
   relying on the `'default-key'` fallback, existing codes were encrypted under `'default-key'`; the
   legacy decrypt path below must use that same derivation to read them, then re-encrypt on next write.)
3. **New format = AES-256-GCM**, output `v2:<saltHex>:<ivHex>:<authTagHex>:<cipherHex>` with a random
   16-byte salt per record (scrypt) and 12-byte IV. `decrypt` detects the `v2:` prefix → GCM path.
4. **Legacy read path:** payloads WITHOUT the `v2:` prefix are the old `iv:ciphertext` CBC format →
   decrypt with the existing CBC derivation (static `'salt'`, key from `ENCRYPTION_KEY || 'default-key'`
   for transition only). This keeps every existing backup code readable with no data migration.
5. **Re-encrypt on write:** any time backup codes are (re)generated they get written in `v2:` GCM. Old
   `v2`-less rows naturally age out; optionally add a one-off script later to bulk re-encrypt.

This is zero-downtime and needs no DB migration.

## Tasks (TDD, ~1 focused session)

1. `src/utils/encryption.js` + unit tests: GCM round-trip; tamper (flip a byte) → decrypt throws;
   legacy CBC payload still decrypts; missing `ENCRYPTION_KEY` → throws at load.
2. Replace both `_encryptData`/`_decryptData` with `require('../utils/encryption')` calls (adjust path
   per file). Keep call sites identical (`encrypt(JSON.stringify(codes))`, `JSON.parse(decrypt(...))`).
3. Run the 2FA tests (backup-code setup/verify) + full suite (852). Then `npm run lint:prune` to drop
   the now-fixed `sonarjs/encryption-secure-mode` suppressions (models/index.js, authenticationService.js).
4. Ops: verify `ENCRYPTION_KEY` is set in the prod/staging env (and is the SAME value already in use, so
   legacy codes still decrypt) BEFORE deploy. Document it in `.env.example`.

## Deferred / open

- Whether to also rotate `ENCRYPTION_KEY` (out of scope — would require decrypting all legacy first).
- Optional bulk re-encrypt script for existing rows.

Baselined lint findings this resolves: `sonarjs/encryption-secure-mode` at `src/models/index.js`
and `src/services/authenticationService.js` (see `node scripts/lint-security-report.js`).
