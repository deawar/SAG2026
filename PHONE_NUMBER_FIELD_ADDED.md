# Phone Number Field Added to Registration

## Changes Made

### Purpose
Added mobile phone number field to registration form to support:
- Two-Factor Authentication (2FA) via SMS
- Account communication and notifications
- Payment verification and security
- Account recovery options

### Files Modified

#### 1. `public/index.html` (Registration Modal Form)
**Added:**
```html
<div class="form-group">
    <label for="register-phone">Mobile Phone Number</label>
    <input type="tel" id="register-phone" name="phone" placeholder="+1 (555) 123-4567" 
           pattern="[0-9+\-\s\(\)]{10,}" required aria-required="true">
    <small>Required for 2FA, communications, and payment verification</small>
</div>
```

**Position:** Between last name and password fields

**Features:**
- Type: `tel` (for proper mobile keyboards on mobile devices)
- Pattern: Accepts digits, +, -, spaces, parentheses (min 10 chars)
- Placeholder: Shows example format
- Required: Cannot submit form without phone
- Accessible: Proper label and aria-required

#### 2. `public/js/index.js` (Form Handler)
**Updated handleRegister() to:**
- Extract phone field: `const phone = document.getElementById('register-phone').value;`
- Validate phone exists: Check included in required fields validation
- Validate phone format: Regex pattern matching (10+ chars, numbers/+/-/spaces/parens)
- Pass to backend: `authManager.register({ ..., phone, ... })`
- Improved error messages for missing name fields

**Added Validation:**
```javascript
// Validate phone format
const phoneRegex = /^[0-9+\-\s\(\)]{10,}$/;
if (!phoneRegex.test(phone)) {
    UIComponents.showAlert('Please enter a valid phone number', 'error');
    return;
}
```

#### 3. `src/controllers/userController.js` (Backend Registration)
**Changes:**
- Extract phone from request: Added `phone` to destructuring
- Sanitize phone: `const sanitizedPhone = phone ? ValidationUtils.sanitizeString(phone, 20) : null;`
- Pass to model: Added `phoneNumber: sanitizedPhone` to user creation

**Code:**
```javascript
const { email, password, firstName, lastName, dateOfBirth, schoolId, phone, role = 'STUDENT' } = req.body;
// ...
const sanitizedPhone = phone ? ValidationUtils.sanitizeString(phone, 20) : null;
const user = await this.userModel.create({
    // ... existing fields ...
    phoneNumber: sanitizedPhone,
    // ... other fields ...
});
```

## Data Flow

```
User enters phone in form
    ↓
Frontend validates format (10+ chars, basic validation)
    ↓
Sent to API as: { ..., phone: "+1 (555) 123-4567", ... }
    ↓
Backend extracts phone from request
    ↓
Sanitized for safety: removes any injection attempts
    ↓
Stored in database users.phone_number column
    ↓
Used for:
    - 2FA via SMS
    - Account recovery
    - Payment verification
    - Communication
```

## Database Storage

The phone number is stored in the `users` table:
```sql
phone_number VARCHAR(20)
```

Column was already defined in schema.sql, just now being used during registration.

## Next Steps (For 2FA Implementation)

Once phone is captured and stored:
1. During login: Offer SMS 2FA option
2. Send verification code via SMS to phone number
3. User enters code to complete login
4. Can set up TOTP app as additional 2FA method

## Status
✅ **COMPLETE** - Phone field is now:
- Required on registration form
- Validated for proper format
- Captured and stored in database
- Ready for 2FA SMS integration
- Accessible with proper form labels and validation messages

## Testing
1. Run: `npm run dev`
2. Go to: `http://localhost:3000`
3. Click "Sign Up"
4. Try registering without phone → Error: "Please fill in all required fields"
5. Enter invalid phone (too short) → Error: "Please enter a valid phone number"
6. Enter valid phone (e.g., "+1 (555) 123-4567" or "5551234567") → Should register successfully
