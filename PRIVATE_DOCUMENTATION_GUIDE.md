# Private Documentation Access Guide
**Version:** 1.0  
**Date:** February 4, 2026  
**Audience:** Authorized Administrators & Staff Only

---

## 🔐 Sensitive Documentation (Private Storage Only)

The following documents contain step-by-step operational procedures and should **NOT** be stored in public GitHub repositories. They have been moved to private, access-controlled storage.

### Documents Moved to Private Storage:

1. **ACCOUNT_SETUP_GUIDE.md** (4,500+ words)
   - Complete account creation workflows for all 5 roles
   - Step-by-step procedures for system setup
   - Troubleshooting guides
   - Daily task procedures

2. **ACCOUNT_SETUP_QUICK_REFERENCE.md** (400+ lines)
   - Print-friendly quick reference
   - CSV template with examples
   - Common issues & fixes
   - Password/2FA instructions

3. **DOCUMENTATION_INDEX_ACCOUNTS.md** (13 KB)
   - Navigation index for all account documentation
   - "I need to..." quick links
   - Training recommendations

4. **ACCOUNT_SETUP_DELIVERY_SUMMARY.md** (18 KB)
   - Complete delivery summary and statistics
   - Quality metrics and maintenance guide

---

## 📍 Where to Find Private Documentation

### **Option 1: Internal Wiki (RECOMMENDED)**
- **Platform:** Notion, Confluence, or equivalent
- **Access:** Staff request form on main website
- **Update:** Wiki admin updates from local copies
- **Backup:** Automatic wiki backups

**How to access:**
1. Request access via: `support@sag.live`
2. Wait for approval (24-48 hours)
3. Bookmark private wiki URL
4. Documents auto-sync when updated

---

### **Option 2: Protected Admin Portal**
- **Platform:** Built-in to SAG dashboard (future)
- **Access:** Admin login required
- **Location:** `https://sag.live/admin/documentation`
- **Backup:** Database-backed, encrypted

**How to access:**
1. Log in to admin dashboard
2. Click: Documentation → Account Setup Guides
3. Select guide you need
4. Read or download PDF

---

### **Option 3: Email Distribution**
- **Method:** Encrypted email to authorized staff
- **Frequency:** As needed or quarterly updates
- **Password Protected:** PDF with separate password
- **Tracking:** Delivery and read receipts

**How to request:**
1. Email: `documentation@sag.live`
2. Subject: "Request Account Setup Documentation"
3. Include: Your role and why you need it
4. Receive: Encrypted PDF within 24 hours

---

### **Option 4: Google Drive (Private Folder)**
- **Access:** Shared with staff members only
- **Versioning:** Google Docs automatic versions
- **Collaboration:** Comments for questions
- **Offline:** Download for offline access

**How to access:**
1. Request link via: `admin@sag.live`
2. Add to "Shared with me" in Google Drive
3. Can view/download/comment
4. Cannot share further without approval

---

## 🔍 Public vs. Private Documentation

### **✅ PUBLIC (Stays in GitHub)**

| Document | Audience | Reason |
|----------|----------|--------|
| ROLE_HIERARCHY_AND_VISIBILITY.md | Developers | Technical specification, not procedures |
| ROLE_HIERARCHY_IMPLEMENTATION_SUMMARY.md | Developers/QA | Implementation details, not step-by-step |
| README.md | Everyone | General overview and setup |
| ARCHITECTURE.md | Developers | System design, not procedures |
| API documentation | Developers | Technical API specs |
| Security specification | Security team | General security practices |

**Why public:**
- Technical content, not operational procedures
- Helps developers understand system
- No sensitive workflow information
- No email formats or specific URLs
- No support contact details

---

### **🔐 PRIVATE (Removed from GitHub)**

| Document | Reason |
|----------|--------|
| ACCOUNT_SETUP_GUIDE.md | Step-by-step procedures expose attack vectors |
| ACCOUNT_SETUP_QUICK_REFERENCE.md | Contains exact URLs and email templates |
| DOCUMENTATION_INDEX_ACCOUNTS.md | Navigation to all procedural docs |
| ACCOUNT_SETUP_DELIVERY_SUMMARY.md | Aggregates all operational procedures |

**Why private:**
- Detailed procedures could be weaponized
- Specific URLs and endpoints revealed
- Account creation workflows documented
- Support contact information exposed
- Email formats and token structures shown

---

## 🚀 Recommended Implementation Timeline

### **Phase 1: Immediate (This Week)**
- [ ] Set up internal Wiki (Notion or Confluence)
- [ ] Upload 4 private documents
- [ ] Create access request form
- [ ] Notify staff of new location
- [ ] Remove from public GitHub (✅ DONE)
- [ ] Add to .gitignore (✅ DONE)

### **Phase 2: Short Term (This Month)**
- [ ] Create PDF versions with watermarks
- [ ] Set up Google Drive shared folder
- [ ] Create email distribution list
- [ ] Document access procedures
- [ ] Train staff on access process

### **Phase 3: Medium Term (Q1 2026)**
- [ ] Build admin portal documentation section
- [ ] Integrate with SSO/authentication
- [ ] Add search functionality
- [ ] Create automatic update process
- [ ] Implement access logging

### **Phase 4: Long Term (Q2 2026)**
- [ ] Deprecate manual distribution
- [ ] Archive old email versions
- [ ] Migrate to centralized wiki
- [ ] Implement encryption at rest
- [ ] Create audit trail of access

---

## 🔐 Access Control Best Practices

### **Who Should Have Access:**
- ✅ SITE_ADMIN (Super Admin)
- ✅ SCHOOL_ADMIN (School Administrators)
- ✅ IT Support Staff
- ✅ Documentation Team
- ⚠️ TEACHER (Only if creating accounts)
- ❌ STUDENT
- ❌ BIDDER

### **Access Control Implementation:**

**Option 1: Notion/Wiki Permissions**
```
Workspace: SAG Documentation
├── Public Section (anyone can view)
│   ├── Architecture.md
│   ├── API Guide.md
│   └── Security Overview.md
├── Admin Section (admin-only)
│   ├── Account Setup Guide.md (access control required)
│   ├── Quick Reference.md
│   └── Troubleshooting.md
└── IT Section (IT admin-only)
    └── Deployment Guide.md
```

**Option 2: Google Drive Sharing**
```
Drive: SAG Documentation (Private)
├── Shared with: admin@sag.live
├── Shared with: support@sag.live
├── Link: Restricted (anyone with link needs to request)
├── Permissions: View-only (no downloading unless approved)
└── Audit log: Track all access
```

**Option 3: Protected PDFs**
```
Encryption: AES-256
Password: [Different per role group]
- Super Admins: Password A
- School Admins: Password B (limited access)
- Support Staff: Password C (read-only)
Distribution: Email with separate password email
```

---

## 📋 Access Request Process

### **For Staff Requesting Documentation:**

1. **Email Request**
   ```
   To: documentation@sag.live
   Subject: Request Access - [Your Role]
   
   Body:
   - Your Name
   - School (if applicable)
   - Your Role (Super Admin, School Admin, Teacher, etc.)
   - Why you need documentation
   - Which documents (Account Setup Guide, etc.)
   ```

2. **Approval Process (24-48 hours)**
   - Documentation team reviews request
   - Verifies role and permissions
   - Approves or requests more info
   - Sends confirmation with access details

3. **Access Granted**
   - Wiki invite sent
   - Google Drive folder shared
   - Or encrypted PDF emailed
   - Access confirmed via test login

---

## 🔄 Keeping Documentation in Sync

### **Workflow for Documentation Updates:**

1. **Local Development**
   - Edit documents locally (kept in .gitignore)
   - Make changes to: ACCOUNT_SETUP_GUIDE.md, etc.
   - Test changes locally

2. **Update Private Storage**
   - Upload updated version to Wiki
   - Update Google Drive document
   - Email updated PDF to distribution list
   - Version control in Wiki

3. **Announce Changes**
   - Email staff: "Documentation Updated"
   - Highlight: What changed, why, when to read
   - Archive old version
   - Log version history

4. **GitHub Remains Clean**
   - These files stay in .gitignore
   - Never committed to public repo
   - Private storage is source of truth

---

## ⚠️ Security Reminders

### **DO:**
✅ Keep .gitignore updated with sensitive files  
✅ Review access logs monthly  
✅ Update private docs when system changes  
✅ Request written password for encrypted PDFs  
✅ Track who has received sensitive documentation  
✅ Audit access to private wiki/portal regularly  
✅ Revoke access when staff leaves  

### **DON'T:**
❌ Store sensitive docs in public GitHub  
❌ Email unencrypted PDFs  
❌ Share access with unauthorized users  
❌ Post documentation links in public channels  
❌ Screenshot sensitive procedures  
❌ Discuss specific procedures in public forums  
❌ Allow contractors/vendors to have access  

---

## 📞 Support

**For Access Requests:**
- Email: `documentation@sag.live`
- Include: Role, reason, which documents

**For Questions About Documentation:**
- Email: `support@sag.live`
- Availability: 9AM-5PM EST, Monday-Friday

**For Security Concerns:**
- Email: `security@sag.live` (urgent)
- Include: What, when, where, who was affected

---

## 📊 Status

| Item | Status | Date | Owner |
|------|--------|------|-------|
| Remove from GitHub | ✅ COMPLETE | Feb 4, 2026 | System Admin |
| Add to .gitignore | ✅ COMPLETE | Feb 4, 2026 | System Admin |
| Set up Notion Wiki | ⏳ PENDING | Feb 5-6, 2026 | Docs Team |
| Upload documents | ⏳ PENDING | Feb 6, 2026 | Docs Team |
| Create access form | ⏳ PENDING | Feb 6, 2026 | Docs Team |
| Notify staff | ⏳ PENDING | Feb 6, 2026 | Management |
| Set up email dist. | ⏳ PENDING | Feb 7, 2026 | IT Admin |

---

**Last Updated:** February 4, 2026  
**Version:** 1.0  
**Next Review:** March 4, 2026
