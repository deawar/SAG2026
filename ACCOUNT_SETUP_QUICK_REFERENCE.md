# Account Setup Quick Reference
**Print & Laminate for Front Desk**

---

## 🚀 QUICK SETUP SEQUENCE

```
Step 1: Register Super Admin (System owner) → Teacher account → Promote via SQL
Step 2: Super Admin creates School Admin(s)
Step 3: School Admin creates Teacher(s)
Step 4: Teacher uploads CSV → System generates student registration links
Step 5: Teacher shares links with students → Students self-register
```

---

## 📊 ROLE QUICK REFERENCE

| Role | Purpose | Created By | Can Create | Can Approve | Key Limitation |
|------|---------|-----------|-----------|------------|-----------------|
| **SITE_ADMIN** | System owner | SQL/Database | Anyone | Anything | Must be promoted |
| **SCHOOL_ADMIN** | School leader | SITE_ADMIN | Teachers, Admins | Auctions, Artwork | Can't see other schools |
| **TEACHER** | Instructor | SCHOOL_ADMIN | Students (via CSV) | Artwork | Own school only |
| **STUDENT** | Participant | Teacher (CSV) or Self | Artwork submissions | Own only | Can't see drafts |
| **BIDDER** | External | SITE_ADMIN | Nothing | Nothing | Read-only (future) |

---

## 🔐 PASSWORD REQUIREMENTS

**Minimum:** 12 characters  
**Must Include:**
- ✅ 1 UPPERCASE (A-Z)
- ✅ 1 lowercase (a-z)
- ✅ 1 Number (0-9)
- ✅ 1 Special char (!@#$%^&*)

**❌ BAD Examples:**
- `password123` (no uppercase, special char)
- `Password123` (only 11 chars)
- `PASSWORD123!` (no lowercase)

**✅ GOOD Examples:**
- `SchoolAuction2026!`
- `Happy$Auction26!`
- `Spring2026@Bidding`

---

## 📧 ACCOUNT CREATION CHECKLIST

### Super Admin Setup
- [ ] Register as Teacher on registration page
- [ ] Complete 2FA setup (scan QR code)
- [ ] IT promotes to SITE_ADMIN via database
- [ ] Test login to admin dashboard

### School Admin Setup
- [ ] SITE_ADMIN goes to Admin Dashboard
- [ ] Click Users → Add New User
- [ ] Enter: Name, Email, Phone, School, Role=SCHOOL_ADMIN
- [ ] System sends invitation email
- [ ] School Admin completes registration + 2FA

### Teacher Setup
- [ ] SCHOOL_ADMIN goes to Admin Dashboard
- [ ] Click Users → Add New User
- [ ] Enter: Name, Email, Phone, School, Role=TEACHER
- [ ] System sends invitation
- [ ] Teacher completes registration + 2FA
- [ ] Teacher can now access Teacher Dashboard

### Student Setup (via CSV)
- [ ] Teacher prepares CSV: Name, Email (one per line)
- [ ] Go to Teacher Dashboard → Students
- [ ] Click "Upload Student List"
- [ ] Select CSV file
- [ ] System generates unique links
- [ ] Teacher copies links
- [ ] Teacher emails links to students
- [ ] Students click links → register → activate

### Student Setup (Direct Registration)
- [ ] Student goes to: registration page
- [ ] Selects: "Student" account type
- [ ] Fills in: Name, Email, Phone, Password, DOB
- [ ] Completes 2FA setup
- [ ] Account active immediately

---

## 🔑 ESSENTIAL URLs

| Task | URL |
|------|-----|
| Home Page | `http://localhost:3000/` |
| Login | `http://localhost:3000/login.html` |
| Register | `http://localhost:3000/register.html` |
| Super Admin Dashboard | `http://localhost:3000/admin-dashboard.html` |
| Teacher Dashboard | `http://localhost:3000/teacher-dashboard.html` |
| Student Dashboard | `http://localhost:3000/user-dashboard.html` |
| Browse Auctions | `http://localhost:3000/auctions.html` |
| Forgot Password | `http://localhost:3000/login.html` → "Forgot Password?" |
| CSV Registration Link | `http://localhost:3000/register.html?token=UUID&email=student@school.edu` |

---

## 🆘 COMMON ISSUES & FIXES

| Problem | Solution |
|---------|----------|
| "Email already registered" | Click "Forgot Password?" to recover or use different email |
| "Password doesn't meet requirements" | Add uppercase, number, special char; min 12 chars |
| "2FA code not working" | Check phone time is correct; code only works 30 sec; wait 15 min if locked |
| "Lost 2FA authenticator" | Contact admin to reset; admin sends re-setup email |
| "Can't see other schools' data" | Normal! SCHOOL_ADMIN sees only their school |
| "CSV upload failed" | Check file is .csv; has headers; valid emails; no empty rows |
| "Student registration link expired" | Token valid 30 days; teacher can resend from dashboard |

---

## 👤 DEFAULT ROLE PERMISSIONS SUMMARY

### SITE_ADMIN
- ✅ View all schools, all users, all auctions
- ✅ Create/delete any account
- ✅ Edit any auction or artwork
- ✅ Approve/reject anything
- ✅ Process refunds
- ✅ Access all reports
- ✅ Reset any user's 2FA

### SCHOOL_ADMIN
- ✅ View users in own school
- ✅ Create teachers and students
- ✅ View/approve all auctions in school
- ✅ Approve student artwork
- ✅ View school financial reports
- ❌ See other schools' data
- ❌ Delete users (can deactivate)

### TEACHER
- ✅ Create and manage auctions
- ✅ Upload CSV of students
- ✅ Generate registration links
- ✅ Approve student artwork submissions
- ✅ Bid on auctions (like a student)
- ❌ See draft auctions from other teachers
- ❌ Manage non-student users

### STUDENT
- ✅ View approved auctions
- ✅ Place bids
- ✅ Submit artwork (pending approval)
- ✅ View own bids and submissions
- ❌ See draft items
- ❌ Approve artwork
- ❌ Create auctions

### BIDDER (Future)
- ✅ View approved auctions only
- ✅ Place bids
- ✅ View bid history
- ❌ See artist names/details
- ❌ Create anything
- ❌ Edit anything

---

## 📋 CSV UPLOAD TEMPLATE

**File Name:** `students.csv`

**Required Format:**
```
Name,Email
John Smith,john@school.edu
Jane Doe,jane@school.edu
Michael Johnson,michael@school.edu
```

**Rules:**
- ✅ First row is headers
- ✅ Comma-separated values
- ✅ One student per line
- ✅ Valid email format required
- ✅ No empty rows
- ✅ Max 1000 students per file

**Common Mistakes:**
- ❌ Using semicolons instead of commas
- ❌ Missing header row
- ❌ Invalid email format
- ❌ Extra spaces before/after names
- ❌ File type is .txt instead of .csv

---

## 2️⃣ TWO-FACTOR AUTHENTICATION (2FA)

**What it is:** Extra security using your phone

**Setup:**
1. Scan QR code with Authenticator app
2. Enter 6-digit code to confirm
3. Save 8 backup codes in secure place

**Apps to Use:**
- Google Authenticator (free)
- Authy (free, cloud backup)
- Microsoft Authenticator (free)
- 1Password (if you have it)

**Using 2FA:**
1. Enter email and password
2. Open authenticator app
3. Read 6-digit code
4. Enter code (valid 30 seconds)
5. Logged in!

**If You Lose Your Phone:**
- Use backup code (single-use)
- Or contact admin to reset

---

## 🚨 SECURITY REMINDERS

**PASSWORDS:**
- Never share via email/chat
- Don't use same password as other sites
- Don't write on sticky notes
- Change every 90 days

**2FA:**
- Don't disable it to save time
- Save backup codes in password manager
- Backup your authenticator app

**DATA:**
- Don't screenshot and email student lists
- Don't print and leave on desk
- Keep school's private data confidential
- Report suspicious activity

---

## ☎️ SUPPORT

**Need Help?**
- Email: support@sag.live
- Phone: 1-888-SAG-LIVE (1-888-724-5483)
- Chat: sag.live/support
- Hours: 9AM-5PM EST, Mon-Fri

**Online Help:**
- FAQ: sag.live/help/faq
- Videos: sag.live/help/videos
- Knowledge Base: sag.live/help/kb

---

## 📝 ACCOUNT CREATION FORM TEMPLATE

**For Creating Users Manually (Admin Only)**

```
SUPER ADMIN CREATION:
[ ] First Name: ________________
[ ] Last Name: _________________
[ ] Email: ____________________
[ ] Phone: ____________________
[ ] Promote via SQL to SITE_ADMIN
[ ] 2FA setup confirmed

SCHOOL ADMIN CREATION:
[ ] First Name: ________________
[ ] Last Name: _________________
[ ] Email: ____________________
[ ] Phone: ____________________
[ ] School: ____________________
[ ] Role: SCHOOL_ADMIN
[ ] Invitation sent _______(date)
[ ] Registration completed _______(date)
[ ] 2FA setup confirmed _______(date)

TEACHER CREATION:
[ ] First Name: ________________
[ ] Last Name: _________________
[ ] Email: ____________________
[ ] Phone: ____________________
[ ] School: ____________________
[ ] Role: TEACHER
[ ] Invitation sent _______(date)
[ ] Registration completed _______(date)
[ ] 2FA setup confirmed _______(date)
[ ] Can access Teacher Dashboard ✓
```

---

**Last Updated:** February 4, 2026  
**Print Date:** _______________  
**Contact:** support@sag.live
