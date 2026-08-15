# Encrypt TOTP Secret At Rest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt `users.two_fa_secret` at rest (parity with the already-encrypted backup codes), migrate existing plaintext secrets, and keep every current 2FA user working with no re-enrollment.

**Architecture:** Reuse the existing AES-256-CBC `_encryptData`/`_decryptData` on `TwoFactorService`. Encrypt the secret when persisting (`confirmSetup`); decrypt on read with a plaintext fallback (`verify2FA`). Widen the column to TEXT and run a one-time, idempotent startup migration that encrypts legacy plaintext secrets (distinguished by the absence of `:` in the ciphertext format).

**Tech Stack:** Node/Express, PostgreSQL, `speakeasy` (TOTP), Node `crypto`, Jest.

**Spec:** `docs/superpowers/specs/2026-08-15-encrypt-totp-secret-at-rest-design.md`

## Global Constraints

- Encryption reuses the existing `_encryptData`/`_decryptData` (AES-256-CBC, output `"<iv-hex>:<cipher-hex>"`, key `scrypt(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32)`). No AES-GCM/key change here (separate scoped effort).
- A value is "encrypted" iff it is a string containing `:`. A base32 TOTP secret (A–Z, 2–7) never contains `:`.
- The read path MUST fall back to treating a non-`:` value as legacy plaintext, so existing users' 2FA keeps working.
- `verifyToken(secret, token)` still receives plaintext during setup (the client's secret) — do NOT change `verifyToken`; only decrypt the STORED secret in `verify2FA`.
- The startup migration is idempotent and non-fatal (wrapped in the existing `try/catch` that logs a warning and continues).

## File Structure

- **Modify** `src/services/authenticationService.js` — add `isEncrypted`/`encryptSecret`/`decryptSecret` to `TwoFactorService`; encrypt in `confirmSetup`.
- **Modify** `src/controllers/userController.js` — decrypt the stored secret in `verify2FA`.
- **Create** `src/migrations/encryptLegacyTotpSecrets.js` — the one-time migration as a testable function.
- **Modify** `schema.sql` — `two_fa_secret` column type.
- **Modify** `src/index.js` — startup `ALTER` + call the migration.
- **Create** tests: `tests/unit/services/twoFactorSecretCrypto.test.js`, `tests/unit/migrations/encryptLegacyTotpSecrets.test.js`, `tests/unit/controllers/verify2faDecrypt.test.js`.

---

### Task 1: `TwoFactorService` crypto helpers + encrypt on write

**Files:**
- Modify: `src/services/authenticationService.js` (`TwoFactorService`: add helpers; `confirmSetup` line ~259)
- Test: `tests/unit/services/twoFactorSecretCrypto.test.js`

**Interfaces:**
- Consumes: existing `this._encryptData(data)` / `this._decryptData(encrypted)` on `TwoFactorService`.
- Produces: `isEncrypted(v) → boolean`; `encryptSecret(secret) → string` (`iv:cipher`); `decryptSecret(stored) → string` (decrypted, or `stored` unchanged when not encrypted). `confirmSetup` persists an encrypted `two_fa_secret`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/services/twoFactorSecretCrypto.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/services/twoFactorSecretCrypto.test.js`
Expected: FAIL — `svc.isEncrypted`/`encryptSecret`/`decryptSecret` are not functions, and `confirmSetup` stores plaintext.

- [ ] **Step 3: Add the helpers**

In `src/services/authenticationService.js`, inside `class TwoFactorService`, add these methods (place them just before `_encryptData`):

```javascript
  /** True iff the value is an encrypted blob ("iv:cipher"); base32 secrets have no ":". */
  isEncrypted(value) {
    return typeof value === 'string' && value.includes(':');
  }

  /** Encrypt a TOTP secret for storage (same scheme as backup codes). */
  encryptSecret(secret) {
    return this._encryptData(secret);
  }

  /** Decrypt a stored TOTP secret; pass legacy plaintext values through unchanged. */
  decryptSecret(stored) {
    return this.isEncrypted(stored) ? this._decryptData(stored) : stored;
  }
```

- [ ] **Step 4: Encrypt the secret in `confirmSetup`**

In `confirmSetup`, change the UPDATE params (line ~259) from:

```javascript
      [secret, [encrypted], userId]
```

to:

```javascript
      [this.encryptSecret(secret), [encrypted], userId]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/unit/services/twoFactorSecretCrypto.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/services/authenticationService.js tests/unit/services/twoFactorSecretCrypto.test.js
git commit -m "feat(2fa): encrypt TOTP secret at rest in confirmSetup (parity with backup codes)"
```

---

### Task 2: Decrypt the stored secret in `verify2FA`

**Files:**
- Modify: `src/controllers/userController.js` (`verify2FA` line 641)
- Test: `tests/unit/controllers/verify2faDecrypt.test.js`

**Interfaces:**
- Consumes: `decryptSecret` (Task 1). `verify2FA` verifies against `twoFactorService.decryptSecret(user.two_fa_secret)`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/controllers/verify2faDecrypt.test.js`:

```javascript
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }

const UserController = require('../../../src/controllers/userController');
const { TwoFactorService } = require('../../../src/services/authenticationService');

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    cookie() { return this; },
    json(p) { this.body = p; return this; }
  };
}

// Build a controller whose verify2FA reaches the TOTP check. twoFactorService is
// a real TwoFactorService (so decryptSecret works); verifyToken is spied so we
// can assert it receives the DECRYPTED secret.
function setup(storedSecret) {
  const twoFactorService = new TwoFactorService({ db: { query: jest.fn() } });
  const verifySpy = jest.spyOn(twoFactorService, 'verifyToken').mockReturnValue(true);
  const authService = {
    twoFactorService,
    jwtService: { verifyAccessToken: jest.fn(() => ({ sub: 'user-1', purpose: '2fa_challenge' })) }
  };
  const userModel = {
    getById: jest.fn().mockResolvedValue({
      id: 'user-1', email: 'u@e.com', role: 'TEACHER', school_id: 's1',
      first_name: 'U', last_name: 'Ser', two_fa_enabled: true, two_fa_secret: storedSecret
    }),
    updateLastLogin: jest.fn().mockResolvedValue(undefined)
  };
  const ctrl = new UserController(userModel, authService);
  ctrl._createSessionRecord = jest.fn().mockResolvedValue(undefined);
  return { ctrl, verifySpy, twoFactorService };
}

async function callVerify(ctrl) {
  const res = fakeRes();
  await ctrl.verify2FA(
    { body: { code: '123456' }, headers: { authorization: 'Bearer temp' } },
    res, jest.fn()
  );
  return res;
}

describe('verify2FA decrypts the stored TOTP secret', () => {
  test('encrypted stored secret → verifyToken receives the decrypted secret', async () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const tfs = new TwoFactorService({ db: { query: jest.fn() } });
    const encrypted = tfs.encryptSecret(plaintext);

    const { ctrl, verifySpy } = setup(encrypted);
    const res = await callVerify(ctrl);

    expect(verifySpy).toHaveBeenCalledWith(plaintext, '123456');
    expect(res.body.success).toBe(true);
  });

  test('legacy plaintext stored secret still verifies (fallback)', async () => {
    const { ctrl, verifySpy } = setup('JBSWY3DPEHPK3PXP');
    const res = await callVerify(ctrl);

    expect(verifySpy).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP', '123456');
    expect(res.body.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/controllers/verify2faDecrypt.test.js`
Expected: FAIL on the encrypted case — `verifyToken` currently receives the raw encrypted string, not `plaintext`.

- [ ] **Step 3: Decrypt in `verify2FA`**

In `src/controllers/userController.js`, change line 641 from:

```javascript
      const isValid = this.authService.twoFactorService.verifyToken(user.two_fa_secret, code);
```

to:

```javascript
      const secret = this.authService.twoFactorService.decryptSecret(user.two_fa_secret);
      const isValid = this.authService.twoFactorService.verifyToken(secret, code);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/controllers/verify2faDecrypt.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/userController.js tests/unit/controllers/verify2faDecrypt.test.js
git commit -m "feat(2fa): decrypt stored TOTP secret on verify (plaintext fallback)"
```

---

### Task 3: One-time migration function (encrypt legacy plaintext secrets)

**Files:**
- Create: `src/migrations/encryptLegacyTotpSecrets.js`
- Test: `tests/unit/migrations/encryptLegacyTotpSecrets.test.js`

**Interfaces:**
- Consumes: a `db` with `query(sql, params)`; a `twoFactorService` with `encryptSecret(secret)`.
- Produces: `encryptLegacyTotpSecrets(db, twoFactorService) → Promise<number>` — encrypts every user whose `two_fa_secret` is non-null and contains no `:`; returns the count encrypted.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/migrations/encryptLegacyTotpSecrets.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/migrations/encryptLegacyTotpSecrets.test.js`
Expected: FAIL — `Cannot find module '../../../src/migrations/encryptLegacyTotpSecrets'`.

- [ ] **Step 3: Create the migration function**

Create `src/migrations/encryptLegacyTotpSecrets.js`:

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/migrations/encryptLegacyTotpSecrets.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/migrations/encryptLegacyTotpSecrets.js tests/unit/migrations/encryptLegacyTotpSecrets.test.js
git commit -m "feat(2fa): one-time migration to encrypt legacy plaintext TOTP secrets"
```

---

### Task 4: Widen the column + wire the startup migration

**Files:**
- Modify: `schema.sql:81`
- Modify: `src/index.js` (startup migrations block, ~line 107)

**Interfaces:**
- Consumes: `TwoFactorService` (exported from `src/services/authenticationService.js`); `encryptLegacyTotpSecrets` (Task 3).

- [ ] **Step 1: Widen the column in schema.sql**

In `schema.sql`, change line 81 from:

```sql
  two_fa_secret VARCHAR(32),
```

to:

```sql
  two_fa_secret TEXT,
```

- [ ] **Step 2: Wire the ALTER + migration into `src/index.js`**

In `src/index.js`, inside the startup-migrations `try { … }` block, after the artwork `image_url` ALTER (`await db.query('ALTER TABLE artwork ALTER COLUMN image_url TYPE TEXT');`, ~line 107), add:

```javascript
        // Encrypt the TOTP secret at rest (parity with backup codes).
        // Widen the column for ciphertext, then encrypt any legacy plaintext
        // secrets once (idempotent — ciphertext contains ':').
        await db.query('ALTER TABLE users ALTER COLUMN two_fa_secret TYPE TEXT');
        const { TwoFactorService } = require('./services/authenticationService');
        const { encryptLegacyTotpSecrets } = require('./migrations/encryptLegacyTotpSecrets');
        const encryptedCount = await encryptLegacyTotpSecrets(db, new TwoFactorService({ db }));
        if (encryptedCount > 0) {
          console.log(`✅ Encrypted ${encryptedCount} legacy TOTP secret(s)`);
        }
```

- [ ] **Step 3: Verify the app still boots and nothing regressed**

Run: `npm test`
Expected: PASS (the app-level tests use `createApp`/mockDb and don't run the `index.js` boot path; they must remain green). The migration function itself is covered by Task 3.

Run: `node -e "require('./src/migrations/encryptLegacyTotpSecrets'); require('./src/services/authenticationService'); console.log('requires OK')"`
Expected: prints `requires OK` (no circular-require or syntax error in the wiring).

- [ ] **Step 4: Commit**

```bash
git add schema.sql src/index.js
git commit -m "feat(2fa): widen two_fa_secret to TEXT and run encrypt migration on boot"
```

---

### Task 5: Full suite + lint

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS, 0 failures (new tests: 4 + 2 + 2).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no NEW errors versus the current baseline (5 errors / warnings pre-existing). If a new global/complexity error is introduced, address it following existing conventions and report it.

- [ ] **Step 3: Commit any fixups (only if needed)**

```bash
git add -A
git commit -m "chore: lint/test fixups for TOTP-secret encryption"
```

---

## Manual verification (post-deploy, DB-backed)

1. Boot logs show the startup migrations complete; if any legacy plaintext secrets existed, `Encrypted N legacy TOTP secret(s)` appears once.
2. In the DB, `SELECT two_fa_secret FROM users WHERE two_fa_enabled` shows only `iv:cipher` values (no bare base32), and `... NOT LIKE '%:%'` returns 0 rows.
3. An existing 2FA user logs in and their authenticator code is accepted (decrypt-on-read works).
4. A fresh 2FA enrollment stores an encrypted secret and the code is accepted.

## Self-review

- **Spec coverage:** helpers + encrypt-on-write (Task 1) ✓; decrypt-on-read with plaintext fallback (Task 2) ✓; column widen (Task 4) ✓; one-time idempotent migration (Task 3 function + Task 4 wiring) ✓; tests for isEncrypted/round-trip/passthrough, confirmSetup stores ciphertext, verify2FA for both forms, migration selects only plaintext (Tasks 1-3) ✓; reuse of `_encryptData` for parity ✓; access token/flow untouched ✓.
- **Placeholder scan:** every code step contains real code; the only non-automated verification is the boot-time migration (Task 4 Step 3), which is covered by the Task 3 function test plus a require-smoke check and the manual checklist.
- **Name consistency:** `isEncrypted`, `encryptSecret`, `decryptSecret`, `encryptLegacyTotpSecrets(db, twoFactorService)` used identically across tasks; migration UPDATE SQL identical in the function and its test.

## Out of scope

- AES-GCM / authenticated encryption and real key management (separate spec).
- Backup-code handling, the 2FA flow, or any other field.
