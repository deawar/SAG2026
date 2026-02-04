# Documentation Index - Account Setup & Role Management
**Last Updated:** February 4, 2026

---

## 📚 Available Documentation

### 1. **ACCOUNT_SETUP_GUIDE.md** (21 KB)
**Purpose:** Comprehensive user guide for creating and managing accounts  
**Audience:** System administrators, school admins, teachers, support staff  
**Contents:**
- Quick Start (5-step setup process)
- Role Overview (capabilities for each of 5 roles)
- Account Creation Workflows (6 detailed workflows)
- Role-Specific Daily Tasks (what each role does)
- Account Management (change roles, reset passwords, 2FA)
- Troubleshooting (20+ common issues with solutions)
- Security Best Practices
- FAQ (10+ frequently asked questions)
- Support & Help Information
- Role Comparison Matrix (70+ capabilities)

**When to Use:** 
- First-time system setup
- Training new administrators
- Onboarding teachers/staff
- Reference when something is unclear

**Read Time:** 30-45 minutes

---

### 2. **ACCOUNT_SETUP_QUICK_REFERENCE.md** (8.5 KB)
**Purpose:** Printable quick reference guide  
**Audience:** Front desk staff, admins, anyone at front computer  
**Contents:**
- Quick Setup Sequence (5 steps)
- Role Quick Reference Table
- Password Requirements (12+ chars, complexity rules)
- Account Creation Checklist (per role)
- Essential URLs (registration, login, dashboards)
- Common Issues & Fixes (quick troubleshooting)
- Role Permissions Summary (one-page overview)
- CSV Upload Template (with examples)
- 2FA Setup Instructions
- Security Reminders
- Support Contact Information
- Printable Form Template

**When to Use:**
- Print and laminate for desk reference
- Quick lookup while helping users
- Share during staff meetings
- Post near front desk

**Read Time:** 10 minutes (or print and scan as needed)

---

### 3. **ROLE_HIERARCHY_AND_VISIBILITY.md** (14 KB)
**Purpose:** Complete technical specification of role hierarchy and visibility rules  
**Audience:** Developers, system architects, security teams  
**Contents:**
- 5-tier Role Hierarchy (SITE_ADMIN → SCHOOL_ADMIN → TEACHER → STUDENT → BIDDER)
- Permission Matrix (60+ permissions by role)
- Data Visibility Rules (what each role sees)
- API Filtering Rules (with pseudo-code examples)
- Security Defense-in-Depth Strategy
- Implementation Checklist (25+ items)
- Testing Requirements (50+ tests)
- Configuration (.env variables)
- Search Function Specification (Phase 13)
- Deployment Notes

**When to Use:**
- Understanding permission system deeply
- Adding new roles or permissions
- Security review/audit
- Training developers
- Integration testing

**Read Time:** 45-60 minutes (technical)

---

### 4. **ROLE_HIERARCHY_IMPLEMENTATION_SUMMARY.md** (12 KB)
**Purpose:** Overview of role hierarchy implementation (technical summary)  
**Audience:** Developers, QA engineers, project managers  
**Contents:**
- Objective Achieved
- Implementation Details (utility functions, controller integration)
- Security Improvements (before/after comparison)
- Visibility Matrix (visual role × capability grid)
- Implementation Timeline
- Code Examples (4 detailed examples)
- Verification Checklist
- Next Steps (Phase 5-8)
- Key Learnings

**When to Use:**
- Understanding what was implemented
- Reviewing security improvements
- Code review
- Quality assurance testing
- Project status updates

**Read Time:** 20-30 minutes

---

## 🎯 Quick Navigation

**I need to...**

### Set Up System for First Time
→ Start with **ACCOUNT_SETUP_GUIDE.md** (Section: Quick Start)  
→ Follow Workflow 1: Initial System Setup

### Create School Admin
→ **ACCOUNT_SETUP_GUIDE.md** (Section: Workflow 2)  
→ Or **ACCOUNT_SETUP_QUICK_REFERENCE.md** (Checklist)

### Create Teachers
→ **ACCOUNT_SETUP_GUIDE.md** (Section: Workflow 3)  
→ Provides 2 options (manual or self-registration)

### Upload Student List (CSV)
→ **ACCOUNT_SETUP_GUIDE.md** (Section: Workflow 4)  
→ Or **ACCOUNT_SETUP_QUICK_REFERENCE.md** (CSV Template)  
→ Template shows exact format needed

### Fix a Password Issue
→ **ACCOUNT_SETUP_QUICK_REFERENCE.md** (Common Issues)  
→ Or **ACCOUNT_SETUP_GUIDE.md** (Troubleshooting)

### Reset User 2FA
→ **ACCOUNT_SETUP_GUIDE.md** (Section: Reset 2FA)  
→ 3 scenarios covered (user lost device, admin reset, etc.)

### Understand What Each Role Can Do
→ **ACCOUNT_SETUP_GUIDE.md** (Appendix: Role Comparison Matrix)  
→ Shows 20+ capabilities per role

### Train New Admins/Teachers
→ **ACCOUNT_SETUP_GUIDE.md** (Sections: Role-Specific Guides)  
→ Each role has dedicated "Daily Tasks" section

### Print Quick Reference for Front Desk
→ **ACCOUNT_SETUP_QUICK_REFERENCE.md**  
→ Print and laminate the whole document

### Understand Security & Visibility Rules (Technical)
→ **ROLE_HIERARCHY_AND_VISIBILITY.md**  
→ **ROLE_HIERARCHY_IMPLEMENTATION_SUMMARY.md**

### Find Support Information
→ **ACCOUNT_SETUP_GUIDE.md** (Section: Support & Help)  
→ Email, phone, chat, and online resources listed

---

## 📊 Documentation Statistics

| Document | Pages | Words | Target Audience | Detail Level |
|----------|-------|-------|-----------------|--------------|
| Account Setup Guide | ~20 | 4,500+ | Admins/Teachers | High |
| Quick Reference | ~5 | 1,500+ | All Staff | Medium |
| Role Hierarchy Spec | ~12 | 3,000+ | Developers | Very High |
| Implementation Summary | ~10 | 2,500+ | Technical | High |
| **TOTAL** | **~47** | **~11,500** | **All Levels** | **Comprehensive** |

---

## 🔄 Document Relationships

```
ACCOUNT_SETUP_GUIDE.md
    ↓ (User implements)
    ├─→ Creates SITE_ADMIN
    ├─→ Creates SCHOOL_ADMIN
    ├─→ Creates TEACHER
    ├─→ Teachers upload CSV
    └─→ Students register

ACCOUNT_SETUP_QUICK_REFERENCE.md
    ↓ (Print & use)
    ├─→ Checklist for creation
    ├─→ Troubleshooting lookup
    ├─→ CSV template
    └─→ Security reminders

ROLE_HIERARCHY_AND_VISIBILITY.md
    ↓ (Technical foundation)
    ├─→ Defines permissions
    ├─→ Specifies visibility rules
    ├─→ API filtering rules
    └─→ Testing requirements

ROLE_HIERARCHY_IMPLEMENTATION_SUMMARY.md
    ↓ (Implementation report)
    ├─→ What was built
    ├─→ Security improvements
    ├─→ Code examples
    └─→ Verification status
```

---

## ✅ All 5 Roles Covered

### SITE_ADMIN (Super Admin)
**Setup Guide:** Pages 23-24, Workflows 1  
**Quick Ref:** Page 2 (Role Table), Page 3 (Checklist)  
**Technical:** ROLE_HIERARCHY_AND_VISIBILITY.md, Section 1  

**How to Create:**
1. Register as Teacher via registration page
2. System admin promotes via SQL to SITE_ADMIN
3. Set up 2FA during registration
4. Access admin dashboard

---

### SCHOOL_ADMIN
**Setup Guide:** Pages 25-26, Workflow 2  
**Quick Ref:** Page 3 (Checklist)  
**Technical:** ROLE_HIERARCHY_AND_VISIBILITY.md, Section 1  

**How to Create:**
1. SITE_ADMIN creates via Admin Dashboard
2. Invitation sent to email
3. User completes registration + 2FA
4. Access admin dashboard (school-scoped)

---

### TEACHER
**Setup Guide:** Pages 27-28, Workflow 3  
**Quick Ref:** Page 3 (Checklist)  
**Technical:** ROLE_HIERARCHY_AND_VISIBILITY.md, Section 1  

**How to Create:**
- Option A: SCHOOL_ADMIN creates via Admin Dashboard
- Option B: Teacher self-registers, awaits approval
**Access:** Teacher Dashboard at teacher-dashboard.html

---

### STUDENT
**Setup Guide:** Pages 29-35, Workflows 4-5  
**Quick Ref:** Page 3 (Checklist), Pages 4-5 (CSV Template)  
**Technical:** ROLE_HIERARCHY_AND_VISIBILITY.md, Section 3.2  

**How to Create:**
- Option A: Teacher uploads CSV → generates links → students register
- Option B: Direct registration via registration page
**Access:** User Dashboard at user-dashboard.html

---

### BIDDER (Future Role)
**Setup Guide:** Pages 36-37, Workflow 6  
**Quick Ref:** Page 2 (Role Table)  
**Technical:** ROLE_HIERARCHY_AND_VISIBILITY.md, Section 1  

**Status:** Currently future role (Phase 13+)  
**Timeline:** Q2 2026 (tentative)

---

## 📱 Recommended Usage Pattern

### **Day 1: Initial Setup**
1. Read **ACCOUNT_SETUP_GUIDE.md** → Workflow 1 (Super Admin)
2. Print **ACCOUNT_SETUP_QUICK_REFERENCE.md** for reference
3. Create first Super Admin account

### **Day 2: School Setup**
1. **ACCOUNT_SETUP_GUIDE.md** → Workflow 2 (School Admin)
2. Create School Admin(s)
3. School Admin creates first teacher

### **Day 3: Teacher & Student Setup**
1. **ACCOUNT_SETUP_GUIDE.md** → Workflow 3 (Teachers)
2. **ACCOUNT_SETUP_GUIDE.md** → Workflow 4 (CSV Upload)
3. Teachers upload student lists
4. Students register via links

### **Ongoing: Maintenance**
1. Use **ACCOUNT_SETUP_QUICK_REFERENCE.md** for daily issues
2. Reference **ACCOUNT_SETUP_GUIDE.md** for detailed solutions
3. Use **Troubleshooting** section for problems

---

## 🆘 Troubleshooting by Problem

| Problem | Document | Section | Page |
|---------|----------|---------|------|
| Email already registered | Setup Guide | Troubleshooting | 44 |
| Password doesn't meet requirements | Quick Ref | Password Requirements | 3 |
| 2FA code not working | Setup Guide | Troubleshooting | 45 |
| CSV upload failed | Quick Ref | Common Issues | 8 |
| Student registration link expired | Setup Guide | Troubleshooting | 45 |
| Can't see other schools' data | Quick Ref | Common Issues | 8 |
| Change user role | Setup Guide | Managing Accounts | 46 |
| Reset user password | Setup Guide | Managing Accounts | 47 |
| Reset user 2FA | Setup Guide | Managing Accounts | 48 |

---

## 🔐 Security Information

### Password Requirements
**All Documents** → Quick Ref has quick version (page 3)  
**Setup Guide** → Full details in Troubleshooting (page 44)

**Summary:**
- Minimum 12 characters
- 1 UPPERCASE letter
- 1 lowercase letter
- 1 Number
- 1 Special character (!@#$%^&*)

### 2FA Setup
**All Documents** → Quick Ref has instructions (page 10)  
**Setup Guide** → Detailed in Workflow sections (pages 22-37)

**Steps:**
1. Scan QR code with authenticator app
2. Enter 6-digit code
3. Save 8 backup codes

---

## 📞 Support Resources

**Email:** support@sag.live  
**Phone:** 1-888-SAG-LIVE (1-888-724-5483)  
**Chat:** sag.live/support  
**Hours:** 9AM-5PM EST, Monday-Friday

**Online Resources:**
- FAQ: sag.live/help/faq
- Videos: sag.live/help/videos
- Knowledge Base: sag.live/help/kb

---

## 📋 Document Checklist

Before going live, ensure:

- [ ] ACCOUNT_SETUP_GUIDE.md printed and shared with admins
- [ ] ACCOUNT_SETUP_QUICK_REFERENCE.md printed and laminated for front desk
- [ ] All admins have read relevant sections
- [ ] Support contact info posted visibly
- [ ] Password requirements printed/posted
- [ ] CSV template available for teachers
- [ ] 2FA instructions available
- [ ] Troubleshooting guide accessible
- [ ] FAQ reviewed by support team
- [ ] Security best practices understood by all

---

## 🎓 Training Recommendations

### For Super Admin (IT/System Owner)
- [ ] Read entire **ACCOUNT_SETUP_GUIDE.md** (90 min)
- [ ] Read **ROLE_HIERARCHY_AND_VISIBILITY.md** (60 min)
- [ ] Practice all workflows with test accounts
- [ ] Review SQL/database operations
- [ ] Set up 2FA backup procedures

### For School Admin
- [ ] Read **ACCOUNT_SETUP_GUIDE.md** (60 min)
- [ ] Focus on Workflows 2-3 and Management sections
- [ ] Print **QUICK_REFERENCE.md** for daily use
- [ ] Practice creating users
- [ ] Review CSV upload process

### For Teachers
- [ ] Read **ACCOUNT_SETUP_GUIDE.md** → Role-Specific Guides (30 min)
- [ ] Focus on Workflow 4 (CSV Upload)
- [ ] Print CSV template
- [ ] Practice CSV upload with test data
- [ ] Review 2FA setup

### For Support Team
- [ ] Read entire **ACCOUNT_SETUP_GUIDE.md** (90 min)
- [ ] Deep dive on Troubleshooting section
- [ ] Print all **QUICK_REFERENCE.md** sections
- [ ] Practice resetting passwords/2FA
- [ ] Memorize support contact escalation

---

**Last Updated:** February 4, 2026  
**Version:** 1.0  
**Maintained By:** Documentation Team

---

## Quick Links

- [Full Account Setup Guide](./ACCOUNT_SETUP_GUIDE.md)
- [Quick Reference (Printable)](./ACCOUNT_SETUP_QUICK_REFERENCE.md)
- [Role Hierarchy & Visibility Spec](./ROLE_HIERARCHY_AND_VISIBILITY.md)
- [Implementation Summary](./ROLE_HIERARCHY_IMPLEMENTATION_SUMMARY.md)
