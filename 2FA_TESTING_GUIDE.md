# 2FA Testing Guide - Quick Reference

## Quick Start: Testing 2FA End-to-End

### Prerequisites
- ✅ Server running on port 3000 (`npm run dev`)
- ✅ Authenticator app installed (Google Authenticator, Microsoft Authenticator, or Authy)
- ✅ Database connected and initialized

---

## Test Scenario 1: Enable 2FA for New User

### Step 1: Create Test Account
1. Navigate to `http://localhost:3000/`
2. Click "Sign Up"
3. Enter details:
   - Email: `2fatest@example.com`
   - First Name: `Test`
   - Last Name: `User`
   - Password: `SecurePass@123`
   - Phone: `555-0100` (optional)
4. Click "Register"
5. ✅ Account created

### Step 2: Login
1. Click "Login"
2. Enter:
   - Email: `2fatest@example.com`
   - Password: `SecurePass@123`
3. Click "Login"
4. ✅ Redirected to dashboard (2FA not enabled yet)

### Step 3: Enable 2FA
1. Dashboard loads
2. Click "Security Settings" tab
3. Find "Two-Factor Authentication" section
4. Click "Enable 2FA" button
5. ✅ Redirected to `/2fa-setup.html` (Step 1)

### Step 4: Scan QR Code (Step 1)
1. Page displays QR code and secret code
2. Open authenticator app on phone
3. Tap "+" or "Add Account"
4. Select "Scan QR Code"
5. Scan the displayed QR code
6. ✅ Authenticator app adds account "Silent-Auction-Gallery:2fatest@example.com"
7. Authenticator now generates 6-digit codes
8. Click "Next" button to proceed

### Step 5: Verify Code (Step 2)
1. Redirected to `/2fa-setup.html` (Step 2)
2. Page shows: "Enter verification code from your authenticator"
3. Open authenticator app
4. Find the code for "Silent-Auction-Gallery"
5. Copy the 6-digit code
6. Paste into code input field on page
7. Click "Verify" button
8. ✅ Code accepted, proceed to Step 3

### Step 6: Save Backup Codes (Step 3)
1. Page displays 8 backup codes (e.g., SAG2FA01, SAG2FA02, etc.)
2. Three options available:
   - "Download Codes" - Downloads as text file
   - "Copy to Clipboard" - Copies all codes
   - Screenshot the codes with phone camera
3. Choose one method to save codes
4. ⚠️ **IMPORTANT:** Save codes in secure location (password manager, etc.)
5. Click "Done" or "Back to Dashboard"
6. ✅ 2FA is now enabled!

---

## Test Scenario 2: Login with 2FA Enabled

### Step 1: Logout
1. Click user dropdown menu in top-right
2. Click "Logout"
3. ✅ Redirected to homepage

### Step 2: Login with Email/Password
1. Click "Login"
2. Enter:
   - Email: `2fatest@example.com`
   - Password: `SecurePass@123`
3. Click "Login"
4. ✅ System detects 2FA is enabled

### Step 3: 2FA Verification
1. ✅ Redirected to `/2fa-verify.html` (not dashboard)
2. Page shows: "Enter verification code from authenticator"
3. Open authenticator app
4. Find code for "Silent-Auction-Gallery"
5. Copy 6-digit code
6. Paste into code input field
7. Click "Verify" button
8. ✅ Code accepted

### Step 4: Successfully Logged In
1. ✅ Redirected to dashboard
2. Verification message: "Successfully verified 2FA"
3. Dashboard fully accessible
4. ✅ Login complete with 2FA!

---

## Test Scenario 3: Using Backup Code (Device Lost)

### Setup (from Test Scenario 1)
- ✅ User has 2FA enabled with backup codes saved

### Test Steps
1. Logout from dashboard
2. Click "Login"
3. Enter:
   - Email: `2fatest@example.com`
   - Password: `SecurePass@123`
4. Click "Login"
5. ✅ Redirected to `/2fa-verify.html`
6. See message: "Enter verification code from authenticator"
7. **Alternative:** Click "Don't have authenticator?" link
8. ✅ Code input changes to backup code input
9. Enter one of saved backup codes (e.g., `SAG2FA01`)
10. Click "Verify" button
11. ✅ Backup code accepted
12. ✅ Redirected to dashboard (logged in successfully)
13. ⚠️ Note: Backup code `SAG2FA01` is now marked as used (cannot use again)

---

## Test Scenario 4: Disable 2FA

### Setup (from Test Scenario 1)
- ✅ User has 2FA enabled

### Test Steps
1. Logged into dashboard
2. Click "Security Settings" tab
3. Find "Two-Factor Authentication" section
4. Click "Disable 2FA" button (replaces "Enable 2FA")
5. Modal appears asking for password confirmation
6. Enter password: `SecurePass@123`
7. Click "Disable 2FA" button in modal
8. ✅ 2FA disabled successfully
9. Page refreshes
10. Button now shows "Enable 2FA" again

### Verify Disable Worked
1. Logout from dashboard
2. Login with email/password
3. ✅ NO 2FA verification page appears
4. ✅ Redirected directly to dashboard (normal login flow)

---

## Test Scenario 5: Invalid 2FA Code

### Setup
- ✅ User has 2FA enabled
- ✅ At `/2fa-verify.html` page

### Test Steps
1. Page shows code input field
2. Enter **invalid** code: `000000`
3. Click "Verify" button
4. ✅ Error message appears: "Invalid verification code"
5. Code input clears
6. Allow retry
7. Enter **valid** code from authenticator
8. Click "Verify" button
9. ✅ Code accepted, proceed with login

---

## Test Scenario 6: Rate Limiting (Optional)

### Setup
- ✅ User has 2FA enabled
- ✅ At `/2fa-verify.html` page

### Test Steps
1. Attempt to verify with invalid codes 5 times
   - Enter: `000000` → Click Verify → Error
   - Enter: `111111` → Click Verify → Error
   - Enter: `222222` → Click Verify → Error
   - Enter: `333333` → Click Verify → Error
   - Enter: `444444` → Click Verify → Error
2. On 5th attempt:
   - ✅ Error message: "Too many failed attempts. Try again in 15 minutes."
3. ✅ Page is now locked for 15 minutes
4. After 15 minutes, can retry

---

## Expected Behavior Summary

### ✅ Should Work

| Feature | Expected Outcome |
|---------|------------------|
| Generate TOTP secret | QR code displays |
| Scan QR code | Authenticator app shows account with 6-digit codes |
| Enter valid TOTP code | Code accepted, 2FA enabled |
| Enter invalid TOTP code | Error shown, allow retry |
| Login with 2FA enabled | Redirected to 2FA verification page |
| Enter valid code at login | Logged in successfully |
| Use backup code at login | Logged in successfully |
| Disable 2FA | Removes 2FA requirement |
| Download backup codes | Text file downloaded |
| Copy backup codes | Codes in clipboard |

### ❌ Should Fail

| Feature | Expected Outcome |
|---------|------------------|
| Setup without authentication | Redirected to login page |
| Use non-existent code | Error: "Invalid code" |
| Use already-used backup code | Error: "Code already used" |
| Disable 2FA with wrong password | Error: "Invalid password" |
| Bypass TOTP during login | Cannot access dashboard |

---

## Troubleshooting

### QR Code Not Displaying
1. Open browser DevTools (F12)
2. Check Console tab for errors
3. Check Network tab for `/2fa/setup` endpoint
4. Verify backend is returning QR code data

### 2FA Always Invalid
1. Check device time is synchronized
2. Try code from earlier time window (codes change every 30 sec)
3. Verify QR code was scanned correctly
4. Try manually entering secret code instead of scanning QR

### Can't Login After Enabling 2FA
1. Use backup code instead of TOTP code
2. Ask admin to reset 2FA for account
3. Check server logs for errors
4. Verify database two_fa_secret field is not null

### Backup Codes Downloading as Corrupted File
1. Clear browser cache
2. Try "Copy to Clipboard" instead
3. Check browser download folder for permissions
4. Try different browser

---

## Security Notes

⚠️ **Important:**
- Backup codes should be saved in secure location (password manager, safe, etc.)
- Each backup code can only be used once
- After using backup code, user should disable and re-enable 2FA to get new codes
- If all backup codes are used, user cannot recover account without admin help
- TOTP secret should never be shared with anyone
- Screenshots of QR code should be deleted after scanning

---

## Quick Copy-Paste Test Commands

### Create Test User (via curl)
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "2fatest@example.com",
    "password": "SecurePass@123",
    "firstName": "Test",
    "lastName": "User",
    "phoneNumber": "555-0100"
  }'
```

### Login Test User (via curl)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "2fatest@example.com",
    "password": "SecurePass@123"
  }'
```

### Check 2FA Status (via database)
```bash
psql -U postgres -d auction_gallery -c \
  "SELECT email, two_fa_enabled FROM users WHERE email = '2fatest@example.com';"
```

---

## When to Ask for Help

Contact development team if:
- [ ] QR code is not displaying on setup page
- [ ] Authenticator app cannot scan QR code
- [ ] TOTP code is always rejected as invalid
- [ ] Backup codes are not generating
- [ ] Login flow is not redirecting to 2FA verification
- [ ] 2FA cannot be disabled
- [ ] Backup code is marked as used but user doesn't remember using it
- [ ] Rate limiting is not working

---

## Success Criteria Checklist

- [ ] New user can enable 2FA successfully
- [ ] QR code scans correctly in authenticator app
- [ ] 6-digit codes from app work for verification
- [ ] Backup codes are generated and displayed
- [ ] User with 2FA enabled is redirected to verification page during login
- [ ] Valid 2FA code allows login
- [ ] Invalid 2FA code shows error
- [ ] Backup code can be used as alternative
- [ ] Used backup code is marked and cannot be reused
- [ ] 2FA can be disabled with correct password
- [ ] After disable, login works without 2FA verification

🎉 **All tests passed = 2FA is production-ready!**
