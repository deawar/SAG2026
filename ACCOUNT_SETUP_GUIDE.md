# Account Setup Guide - Silent Auction Gallery
**Version**: 1.0  
**Date**: February 4, 2026  
**Audience**: System Administrators, School Admins, Teachers

---

## Table of Contents
1. [Quick Start](#quick-start)
2. [Role Overview](#role-overview)
3. [Account Creation Workflows](#account-creation-workflows)
4. [Role-Specific Guides](#role-specific-guides)
5. [Managing Accounts](#managing-accounts)
6. [Troubleshooting](#troubleshooting)
7. [Security Best Practices](#security-best-practices)

---

## Quick Start

**First Time Setup** (in order):
1. ✅ Create **Super Admin** (system owner)
2. ✅ Create **School Admin(s)** (school leadership)
3. ✅ Create **Teacher(s)** (content creators)
4. ✅ Create **Student(s)** (via teacher CSV upload or direct registration)
5. ✅ (Optional) Create **Bidder(s)** (read-only accounts for external bidders)

---

## Role Overview

### 🔴 **SITE_ADMIN** (Super Admin)
**What they can do:**
- Manage ALL schools
- Create/delete school administrator accounts
- View all auctions from all schools
- Manage all users
- Approve/reject any artwork
- Process refunds
- Access system-wide reports
- Reset 2FA for any user

**Who needs this:**
- System owner
- IT administrator
- Platform support team

**Minimum recommended:** 1-2 per organization

---

### 🟠 **SCHOOL_ADMIN** (Admin)
**What they can do:**
- Manage school users and roles
- Create and manage auctions
- Approve/reject student artwork
- View school's auctions and financial data
- Reset teacher 2FA
- Cannot see other schools' data

**Who needs this:**
- School principal/director
- Auction coordinator
- School finance manager

**Minimum recommended:** 1-2 per school

---

### 🟡 **TEACHER**
**What they can do:**
- Create and manage auctions
- Upload CSV to bulk-create student accounts
- Generate student registration links
- Submit artwork for approval
- Approve student artwork
- Bid on auctions (like students)
- View their own students' status

**Who needs this:**
- Art teachers
- Auction coordinators
- Content administrators

**How many:** As needed per school

---

### 🟢 **STUDENT**
**What they can do:**
- View approved auctions
- Submit artwork (subject to teacher approval)
- Place bids on approved items
- View their own submissions and bids
- Cannot see other students' drafts
- Cannot see unapproved artwork

**Who needs this:**
- All student participants

**How created:**
- Teacher uploads CSV file with student list
- Students receive registration link via email
- Student clicks link and completes registration

---

### 🔵 **BIDDER** (Future Role)
**What they can do:**
- View approved auctions only (read-only)
- Place bids
- View bidding history
- Cannot create accounts
- Cannot see artist names or details
- Cannot approve or edit anything

**Who needs this:**
- External bidders
- Alumni/donors
- Community members (future expansion)

---

## Account Creation Workflows

### Workflow 1: Initial System Setup (Super Admin)

**Step 1: Access Registration Page**
1. Go to: `http://localhost:3000/` (or your domain)
2. Click **"Sign Up"** button

**Step 2: Choose Account Type**
- Select: **Teacher** (this will be converted to SITE_ADMIN)
- ℹ️ Note: The first Super Admin must register as Teacher, then system admin will promote them

**Step 3: Complete Registration**
```
First Name: [Your first name]
Last Name: [Your last name]
Email: [Your email - ideally generic like admin@school.edu]
Phone: [Your mobile number]
Password: [12+ chars, uppercase, lowercase, number, special char]
Confirm Password: [Same password]
Account Type: Teacher
```

**Step 4: Set Up 2FA (Two-Factor Authentication)**
1. After registration, system shows TOTP QR code
2. Scan with authenticator app (Google Authenticator, Authy, etc.)
3. Enter 6-digit code to confirm
4. Save backup codes in secure location

**Step 5: Promote to SITE_ADMIN** (System Administrator Only)
- Contact IT to promote via database or admin panel
- SQL: `UPDATE users SET role = 'SITE_ADMIN' WHERE email = 'admin@school.edu'`

✅ **Super Admin account is now active**

---

### Workflow 2: Create School Admin

**Prerequisites:**
- ✅ Super Admin account exists and logged in
- ✅ School record created in system

**Steps:**

1. **Go to Admin Dashboard**
   - URL: `http://localhost:3000/admin-dashboard.html`

2. **Navigate to User Management**
   - Click: "Users" → "Add New User"

3. **Fill in User Details**
   ```
   First Name: [School principal name]
   Last Name: [Last name]
   Email: [admin@schoolname.edu]
   Phone: [Mobile number]
   School: [Select from dropdown]
   Role: SCHOOL_ADMIN
   ```

4. **System sends invitation email**
   - Recipient clicks link
   - Completes password setup
   - Sets up 2FA

✅ **School Admin account is active**

---

### Workflow 3: Create Teacher Account

**Prerequisites:**
- ✅ School Admin is logged in
- ✅ School is selected in system

**Option A: Manual Creation (School Admin)**

1. **Go to User Management**
   - Click: "Users" → "Add New User"

2. **Fill in Teacher Details**
   ```
   First Name: [Teacher first name]
   Last Name: [Last name]
   Email: [teacher@school.edu]
   Phone: [Mobile number]
   School: [Auto-filled to admin's school]
   Role: TEACHER
   ```

3. **System sends invitation**
   - Teacher receives email
   - Clicks registration link
   - Sets password
   - Enables 2FA

✅ **Teacher account is active**

**Option B: Teacher Self-Registration**

1. **Teacher goes to**: `http://localhost:3000/register.html`

2. **Selects Account Type**: "Teacher"

3. **Completes Registration**
   ```
   All required fields as above
   ```

4. **Awaits Approval**
   - ⏳ School Admin approves new teacher account
   - ✅ Once approved, teacher can access dashboard

---

### Workflow 4: Create Student Accounts (via Teacher CSV Upload)

**Prerequisites:**
- ✅ Teacher account exists and logged in
- ✅ Teacher has access to Teacher Dashboard

**Step 1: Prepare CSV File**

Create a file named `students.csv` with this format:

```csv
Name,Email
John Smith,john.smith@school.edu
Jane Doe,jane.doe@school.edu
Michael Johnson,michael.johnson@school.edu
Sarah Williams,sarah.williams@school.edu
```

**Important:**
- First row = headers (Name, Email)
- One student per line
- Valid email addresses required
- No special characters in names (except hyphen, apostrophe)

**Step 2: Upload CSV**

1. **Go to Teacher Dashboard**
   - URL: `http://localhost:3000/teacher-dashboard.html`
   - Login as Teacher

2. **Click: "Students" section** (left sidebar)

3. **Click: "Upload Student List"**

4. **Select CSV file** from computer

5. **Click: "Upload and Generate Links"**

**Step 3: System Generates Links**

System displays:
```
Student Name | Email | Registration Link | Status | Actions
────────────────────────────────────────────────────────────
John Smith | john.smith@... | [Copy] | Pending | [Resend]
Jane Doe   | jane.doe@... | [Copy] | Pending | [Resend]
...
```

**Step 4: Share Links with Students**

1. **Copy Link** (click "Copy" button next to each student)

2. **Send via Email/LMS**
   - Paste link in email
   - Student clicks link to register
   - Link format: `http://localhost:3000/register.html?token=ABC123&email=student@school.edu`

3. **Student Registration**
   - Link pre-fills email
   - Student enters: First Name, Last Name, Phone
   - Student creates password
   - System sets role: STUDENT
   - Account is active immediately

✅ **Student accounts are created and active**

---

### Workflow 5: Create Student Account (Direct Registration)

**Prerequisites:**
- ✅ Registration page accessible
- ✅ Student has invitation link OR knows registration URL

**Step 1: Student Goes to Registration**
- URL: `http://localhost:3000/register.html`

**Step 2: Select Account Type**
- Choose: **"Student"** (radio button)
- Note: "I want to bid on artwork (need invitation link)"

**Step 3: Complete Registration**
```
Account Type: Student ✓
First Name: [Student's first name]
Last Name: [Student's last name]
Email: [student@school.edu]
Phone: [Mobile number]
Date of Birth: [MM/DD/YYYY] (COPPA verification)
Password: [12+ chars with uppercase, lowercase, number, special char]
Confirm Password: [Same password]
I agree to Terms: [✓ Checkbox]
```

**Step 4: Set Up 2FA**
1. Scan QR code with authenticator app
2. Enter 6-digit code
3. Save backup codes

✅ **Student account is ready**

---

### Workflow 6: Create Bidder Account (Future)

**Note:** Bidder role currently limited use. Timeline: Q2 2026

**Prerequisites:**
- ✅ Super Admin logged in
- ✅ External bidder invited

**Steps:**

1. **Admin Dashboard** → Users → Add New User

2. **Fill Details**
   ```
   First Name: [Bidder first name]
   Last Name: [Last name]
   Email: [bidder@external.org]
   Phone: [Phone number]
   School: [Select school they bid in]
   Role: BIDDER
   ```

3. **Bidder receives invitation**
   - Completes registration
   - 2FA setup required
   - Can only view/bid on approved items

---

## Role-Specific Guides

### Super Admin Daily Tasks

**Login:**
```
URL: http://localhost:3000/login.html
Email: admin@school.edu
Password: [Your password]
2FA: [6-digit code from authenticator]
```

**Dashboard Access:**
- URL: `http://localhost:3000/admin-dashboard.html`

**Common Tasks:**

1. **Promote User to SITE_ADMIN**
   ```
   Admin Dashboard → Users
   Find user by email
   Click "Edit"
   Change Role to: SITE_ADMIN
   Save
   ```

2. **Reset User 2FA**
   ```
   Admin Dashboard → Users
   Find user
   Click "Reset 2FA"
   System sends re-setup link to user
   ```

3. **View All Auctions**
   ```
   Admin Dashboard → Auctions
   All auctions visible (all schools, all statuses)
   Can edit/delete as needed
   ```

4. **Process Refund**
   ```
   Admin Dashboard → Payments
   Find transaction
   Click "Refund"
   Enter reason
   Confirm
   ```

---

### School Admin Daily Tasks

**Login:**
```
URL: http://localhost:3000/login.html
Email: school.admin@school.edu
Password: [Password]
2FA: [Code]
```

**Dashboard Access:**
```
URL: http://localhost:3000/admin-dashboard.html
(Limited to your school)
```

**Common Tasks:**

1. **Create New Teacher**
   ```
   Admin Dashboard → Users → Add New User
   Fill in teacher details
   Role: TEACHER
   System sends invitation
   ```

2. **Approve New Auction**
   ```
   Admin Dashboard → Auctions
   Find auction in "DRAFT" status
   Click "Approve"
   Auction becomes visible to students
   ```

3. **Review Student Artwork**
   ```
   Admin Dashboard → Submissions
   View pending submissions
   Click "Approve" or "Reject"
   Send feedback to student
   ```

4. **View School Reports**
   ```
   Admin Dashboard → Reports
   View auction revenue
   View bidding statistics
   Export as CSV
   ```

---

### Teacher Daily Tasks

**Login:**
```
URL: http://localhost:3000/login.html
Email: teacher@school.edu
Password: [Password]
2FA: [Code]
```

**Dashboard Access:**
```
URL: http://localhost:3000/teacher-dashboard.html
```

**Common Tasks:**

1. **Upload Student List (CSV)**
   ```
   Teacher Dashboard → Students section
   Upload CSV file
   Copy registration links
   Email links to students
   ```

2. **Create Auction**
   ```
   Teacher Dashboard → My Auctions
   Click "Create New Auction"
   Fill in details:
     - Title
     - Description
     - Start/End dates
     - Minimum bid
     - Select artwork
   Submit for approval
   ```

3. **Approve Student Artwork**
   ```
   Teacher Dashboard → Submissions
   Review each submission
   Click "Approve" (visible to students)
   Or "Reject" with feedback
   ```

4. **Bid on Auction**
   ```
   Go to: http://localhost:3000/auctions.html
   Click auction
   Enter bid amount
   System confirms if you win/outbid
   ```

---

### Student Daily Tasks

**Login:**
```
URL: http://localhost:3000/login.html
Email: student@school.edu
Password: [Password]
2FA: [Code]
```

**Dashboard Access:**
```
URL: http://localhost:3000/user-dashboard.html
```

**Common Tasks:**

1. **View Available Auctions**
   ```
   Go to: http://localhost:3000/auctions.html
   See all approved auctions
   Click to view artwork
   See current bids
   ```

2. **Place a Bid**
   ```
   Auctions page → Select item
   Enter bid amount (must exceed current)
   Click "Place Bid"
   Get confirmation
   ```

3. **Submit Artwork**
   ```
   User Dashboard → Submissions
   Click "Submit Artwork"
   Upload image
   Enter title & description
   Submit for teacher approval
   Wait for approval notification
   ```

4. **View Bidding History**
   ```
   User Dashboard → My Bids
   See all bids placed
   See won/lost auctions
   View payment status
   ```

---

## Managing Accounts

### Change User Role

**As Super Admin:**
1. Go to: Admin Dashboard
2. Click: Users
3. Find user by email or name
4. Click: "Edit"
5. Change "Role" dropdown
6. Click: "Save Changes"
7. System sends notification to user

**Roles Available:**
- SITE_ADMIN (full access)
- SCHOOL_ADMIN (school only)
- TEACHER (content creation)
- STUDENT (bidding)
- BIDDER (read-only)

---

### Deactivate User Account

**As School Admin or Super Admin:**
1. Users section
2. Find user
3. Click "Deactivate"
4. Confirm action
5. User cannot log in

**To Reactivate:**
1. Users section
2. Find user (show inactive users)
3. Click "Activate"
4. User can log in again

---

### Reset User Password

**User Forgot Password:**
1. Go to: `http://localhost:3000/login.html`
2. Click: "Forgot Password?"
3. Enter email
4. Check email for reset link
5. Click link (expires in 24 hours)
6. Enter new password
7. Login with new password

**Admin Reset User Password:**
1. Admin Dashboard → Users
2. Find user
3. Click "Reset Password"
4. System sends reset email
5. User follows email link

---

### Reset 2FA (Two-Factor Authentication)

**User Lost Authenticator App:**
1. Go to: `http://localhost:3000/login.html`
2. Click: "Can't access 2FA?"
3. Enter email and answer security questions
4. Email confirmation sent
5. Admin reviews request
6. Admin approves in dashboard

**Admin Reset 2FA:**
1. Admin Dashboard → Users
2. Find user
3. Click: "Reset 2FA"
4. Confirmation dialog
5. System sends setup link to user
6. User re-scans QR code with new app

---

## Troubleshooting

### Problem: "Email already registered"
**Solution:**
- Email is already in system
- Try "Forgot Password" to recover account
- Or use different email address

### Problem: "Password does not meet requirements"
**Solution:**
Password must have:
- ✅ At least 12 characters
- ✅ At least 1 UPPERCASE letter
- ✅ At least 1 lowercase letter
- ✅ At least 1 number (0-9)
- ✅ At least 1 special character (!@#$%^&*)

**Example strong password:**
- `SchoolAuction2026!` ✅
- `Password123` ❌ (only 11 chars, no special char)
- `mypassword` ❌ (no uppercase, number, special char)

### Problem: "2FA code not working"
**Solution:**
1. Check phone time is correct (synchronized with server)
2. Enter code immediately after generation
3. Each code is only valid for 30 seconds
4. If multiple failed attempts, wait 15 minutes
5. Use backup code if available

**Backup Codes:**
- 8 codes generated during 2FA setup
- Each code is single-use
- Keep in secure location (password manager)
- Use if authenticator app lost

### Problem: "Cannot see other schools' auctions"
**Solution (if SCHOOL_ADMIN):**
- School admins can ONLY see their own school
- This is by design for data security
- Contact Super Admin to see other schools

**Solution (if STUDENT):**
- Students only see APPROVED auctions
- Contact teacher if auction not visible
- Auction may still be in DRAFT status

### Problem: "Upload CSV failed"
**Solution:**
1. Check file format: must be `.csv` (comma-separated)
2. First row must be headers: `Name,Email`
3. All emails must be valid format: `name@domain.com`
4. No special characters in names
5. No empty rows
6. File size under 10MB

**Example Valid CSV:**
```
Name,Email
John Doe,john@school.edu
Jane Smith,jane@school.edu
```

### Problem: "Student registration link expired"
**Solution:**
1. Tokens valid for 30 days
2. Teacher can resend link from Teacher Dashboard
3. Click "Resend" next to student name
4. New link sent to student email

---

## Security Best Practices

### Passwords
✅ **DO:**
- Use 12+ characters
- Mix uppercase, lowercase, numbers, special chars
- Use unique password per account
- Store in password manager (LastPass, 1Password, etc.)
- Change every 90 days

❌ **DON'T:**
- Share password via email or chat
- Use same password across sites
- Write password on sticky notes
- Use simple words (Password123, 12345678)
- Share account with colleagues

### Two-Factor Authentication (2FA)
✅ **DO:**
- Enable for all accounts (required on signup)
- Save backup codes in password manager
- Use authenticator app (Google, Authy, Microsoft)
- Backup your authenticator (if using cloud app)

❌ **DON'T:**
- Screenshot QR code and email it
- Share backup codes
- Disable 2FA to "simplify" things
- Lose your backup codes

### Account Access
✅ **DO:**
- Log out after session ends
- Use strong WiFi (not public)
- Keep operating system updated
- Use antivirus software

❌ **DON'T:**
- Leave browser open with logged-in session
- Log in on public computers
- Use internet café computers
- Log in over unencrypted WiFi (public networks)

### Data Handling
✅ **DO:**
- Keep student data confidential
- Only share with authorized personnel
- Report suspicious activity immediately

❌ **DON'T:**
- Screenshot and email student lists
- Share with external parties
- Print and leave on desk
- Forward confidential data unsecured

---

## FAQ - Frequently Asked Questions

**Q: How many Super Admins do we need?**
A: Recommend 1-2 maximum. More = more accounts to compromise. Delegate to School Admins instead.

**Q: Can a teacher create their own student accounts?**
A: Yes! Teachers upload CSV file and system generates unique registration links.

**Q: Can students change their own password?**
A: Yes. Go to User Dashboard → Account Settings → Change Password.

**Q: What if a teacher leaves mid-year?**
A: School Admin can deactivate teacher account. Students unaffected. Teacher's auctions transferred to School Admin.

**Q: Can an Admin account bid on auctions?**
A: Yes! School Admins and Teachers have bidding permissions (like students).

**Q: How long do registration links work?**
A: 30 days from creation. After that, student must be re-invited.

**Q: Can we import users from Google Classroom?**
A: Not yet. Phase 14 (Future). For now, manually create CSV or use LMS integration.

**Q: What happens if a student forgets their password?**
A: They can click "Forgot Password?" on login page and reset via email.

**Q: Can we bulk-deactivate students?**
A: Not yet. Currently one-by-one in dashboard. Contact support for bulk operations.

---

## Support & Help

**For Technical Issues:**
- Email: support@sag.live
- Phone: 1-888-SAG-LIVE
- Chat: Available 9AM-5PM EST weekdays

**For Account Issues:**
- Password reset: Click "Forgot Password?" on login
- 2FA issues: Contact your school admin
- Billing: Contact school finance department

**Online Resources:**
- FAQ: http://sag.live/help/faq
- Video Tutorials: http://sag.live/help/videos
- Knowledge Base: http://sag.live/help/kb

---

## Appendix: Role Comparison

| Capability | Super Admin | School Admin | Teacher | Student | Bidder |
|------------|:----------:|:------------:|:-------:|:-------:|:------:|
| **Create** |
| Schools | ✅ | ❌ | ❌ | ❌ | ❌ |
| Users | ✅ | ✅* | ❌ | ❌ | ❌ |
| Auctions | ✅ | ✅ | ✅ | ❌ | ❌ |
| Artwork | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Approve** |
| Artwork | ✅ | ✅ | ✅** | ❌ | ❌ |
| Auctions | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View** |
| All Schools | ✅ | ❌ | ❌ | ❌ | ❌ |
| All Users | ✅ | ✅* | ❌ | ❌ | ❌ |
| Draft Items | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approved Items | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Bid** |
| Place Bids | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Bids | ✅ | ✅* | ✅* | ✅ | ✅ |
| **Manage** |
| Users | ✅ | ✅* | ❌ | ❌ | ❌ |
| Refunds | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reports | ✅ | ✅* | ✅* | ❌ | ❌ |

**Legend:**
- ✅ = Full access
- ✅* = Limited to own school/scope
- ✅** = If designated as approver
- ❌ = No access

---

**Last Updated:** February 4, 2026  
**Version:** 1.0  
**Maintained By:** Silent Auction Gallery Team
