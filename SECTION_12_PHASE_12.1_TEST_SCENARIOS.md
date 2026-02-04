# Section 12: Phase 12.1 - Test Scenario Development
**Project**: Silent Auction Gallery  
**Phase**: 12.1 Usability Testing  
**Status**: 🟡 IN PROGRESS - Scenario Development  
**Date**: February 3, 2026

---

## OVERVIEW

This document contains 12+ detailed usability test scenarios covering all user roles, happy paths, and error cases. Each scenario includes:
- **Scenario ID**: Unique identifier
- **Role**: Which user type performs this task
- **Objective**: What the user is trying to accomplish
- **Preconditions**: Setup required before testing
- **Steps**: Numbered steps to perform
- **Expected Outcome**: What should happen
- **Success Criteria**: How to know if the test passed
- **Time Estimate**: Expected duration

---

## SCENARIO 1: New Student Registration & Email Verification

**Scenario ID**: US-001  
**Role**: New User (Student)  
**Objective**: Register for a Silent Auction Gallery account  
**Estimated Time**: 3-5 minutes  
**Complexity**: Low

### Preconditions
- User has valid email address
- User has not registered before
- Website is accessible

### Steps
1. Navigate to index.html (landing page)
2. Click "Sign Up" or "Get Started" button
3. Verify registration form displays with fields:
   - First Name
   - Last Name
   - Email
   - Password
   - Confirm Password
   - Age verification (checkbox)
4. Fill in form with:
   - First Name: "John"
   - Last Name: "Student"
   - Email: Valid email (e.g., john.student@test.com)
   - Password: "SecurePass123!" (meets requirements)
   - Confirm Password: Same password
   - Check age verification
5. Click "Register" button
6. Verify success message: "Check your email to verify your account"
7. Open email inbox for the email address used
8. Find verification email from SAG.live
9. Click verification link in email
10. Verify page shows: "Email verified successfully"
11. Verify automatic redirect to login page

### Expected Outcomes
- ✅ Registration form validates and accepts all input
- ✅ Form rejects weak passwords with clear error message
- ✅ Form rejects mismatched passwords with error message
- ✅ Success message appears after registration
- ✅ Verification email arrives within 2 minutes
- ✅ Verification link works and confirms email
- ✅ User can proceed to login

### Success Criteria
- User completes registration in under 5 minutes
- No errors encountered
- Email verification works
- Clear feedback at each step
- Form is intuitive and understandable

### Acceptance Thresholds
- ✅ Pass: All steps completed successfully
- ⚠️ Warning: Any step takes >1 minute
- ❌ Fail: Any step produces unexpected error

---

## SCENARIO 2: Student Login with 2FA (TOTP)

**Scenario ID**: US-002  
**Role**: Registered Student  
**Objective**: Login to account with two-factor authentication  
**Estimated Time**: 4-6 minutes  
**Complexity**: Medium

### Preconditions
- Student account registered and email verified
- User has access to authenticator app (Google Authenticator, Authy, etc.)
- User's 2FA is set up (TOTP enabled)

### Steps
1. Navigate to login.html
2. Verify login form displays:
   - Email field
   - Password field
   - "Forgot Password?" link
3. Enter email: (student's email from Scenario 1)
4. Enter password: (student's password)
5. Click "Login" button
6. Verify page shows: "Enter your 2FA code"
7. Show authenticator app with 6-digit code
8. Copy code from authenticator app
9. Paste code into 2FA input field
10. Click "Verify" button
11. Verify redirect to student dashboard
12. Verify user name displayed in header

### Expected Outcomes
- ✅ Login form is accessible and displays correctly
- ✅ Credentials accepted without 2FA code
- ✅ 2FA challenge appears after password entry
- ✅ 6-digit code from authenticator app works
- ✅ User successfully authenticated and logged in
- ✅ Dashboard displays student's information

### Success Criteria
- User completes login in under 6 minutes
- 2FA code accepted without errors
- Dashboard loads immediately after auth
- User can see their username in interface

### Error Cases to Test
- ❌ Expired 2FA code (should show "Code expired, try again")
- ❌ Invalid 2FA code (should show "Invalid code")
- ❌ Empty 2FA code field (should show "Code required")
- ❌ Wrong password (should show "Invalid credentials")

---

## SCENARIO 3: Browse Active Auctions (Student)

**Scenario ID**: US-003  
**Role**: Logged-in Student  
**Objective**: View available auctions and filter/search  
**Estimated Time**: 3-4 minutes  
**Complexity**: Low

### Preconditions
- User is logged in (completed Scenario 2)
- At least 5 active auctions exist in system
- User's school has active auctions

### Steps
1. From dashboard, click "Browse Auctions" or navigate to auctions.html
2. Verify auction list displays with:
   - Auction title
   - Artwork image
   - Current bid amount
   - Time remaining
   - Number of bids
3. Observe pagination (should show 25 per page)
4. Verify sorting options present:
   - Newest first
   - Closing soon
   - Price (high to low)
5. Click "Closing Soon" sort
6. Verify auctions sorted by time remaining (ascending)
7. Click filter by "My School"
8. Verify only school's auctions displayed
9. Scroll through list - verify 3+ auctions visible
10. Click on one auction title

### Expected Outcomes
- ✅ Auction list loads within 2 seconds
- ✅ Images load properly
- ✅ Pagination works correctly
- ✅ Sorting changes list order immediately
- ✅ Filter works without page reload
- ✅ Can click on auction to view details

### Success Criteria
- User can view 5+ auctions
- Sorting/filtering works intuitively
- Page responds quickly (<1 second)
- Layout is clean and easy to scan

---

## SCENARIO 4: View Auction Details & Bid History

**Scenario ID**: US-004  
**Role**: Logged-in Student  
**Objective**: View detailed auction info and place initial bid  
**Estimated Time**: 4-5 minutes  
**Complexity**: Medium

### Preconditions
- User is logged in
- Active auction available to bid on
- Auction has active bidding (not closed)
- User's bid amount is ready

### Steps
1. From auction list, click on an auction
2. Verify auction-detail.html displays:
   - Large artwork image
   - Auction title
   - Current bid amount
   - Reserve price (if visible)
   - Time remaining (countdown timer)
   - Number of bids
   - Bid history table (last 10 bids shown)
3. Observe bid history with columns:
   - Bidder (anonymous or initials)
   - Bid amount
   - Time of bid
4. Scroll down to bid form
5. Verify bid placement section:
   - Current bid display
   - Minimum next bid calculated and shown
   - Bid input field
   - "Place Bid" button
6. Verify "Auto-bid" option available
7. Enter bid amount (minimum suggested amount)
8. Click "Place Bid" button
9. Observe real-time update:
   - Bid count increases
   - Bid history updates
   - Current bid updates
10. Verify bid success message

### Expected Outcomes
- ✅ Auction details load correctly
- ✅ Countdown timer visible and updating
- ✅ Bid history displays last 10 bids
- ✅ Bid form calculates minimum next bid correctly
- ✅ Bid accepted immediately
- ✅ Real-time update visible (if using WebSocket)
- ✅ User appears in bid history

### Success Criteria
- All auction info visible and accurate
- Bid placed without errors
- Bid history updates in real-time
- Minimum bid calculation correct
- No page reload needed for updates

---

## SCENARIO 5: Auto-Bid Setup & Outbid Notification

**Scenario ID**: US-005  
**Role**: Logged-in Student  
**Objective**: Set up automatic bidding and receive outbid notification  
**Estimated Time**: 3-4 minutes  
**Complexity**: Medium

### Preconditions
- User has placed at least one bid (Scenario 4)
- Another test user available to place higher bid
- Real-time notifications enabled

### Steps
1. From auction detail page, click "Auto-Bid" option
2. Verify auto-bid form displays:
   - Current bid amount
   - Maximum bid input
   - Auto-increment amount
3. Enter maximum bid (e.g., $250)
4. Click "Enable Auto-Bid"
5. Verify success message: "Auto-bid enabled"
6. (Have test user place higher bid via separate browser/account)
7. Verify user receives notification:
   - Visual alert (notification badge)
   - Message: "You've been outbid in [Auction Title]"
   - Bid amount shown
8. Click notification to return to auction
9. Verify new higher bid reflected on page
10. Verify auto-bid still active and auto-responded

### Expected Outcomes
- ✅ Auto-bid form appears and accepts max bid
- ✅ Auto-bid enabled message shown
- ✅ When outbid, notification appears
- ✅ Notification includes auction name and new bid
- ✅ Clicking notification navigates to auction
- ✅ Auto-bid counter-bid placed automatically

### Success Criteria
- Auto-bid setup is intuitive (<1 minute)
- Outbid notification appears within 3 seconds
- User can dismiss/ignore notification
- Can edit or cancel auto-bid easily

---

## SCENARIO 6: Auction Ending Soon Notification

**Scenario ID**: US-006  
**Role**: Logged-in Student  
**Objective**: Receive notification when auction is ending soon  
**Estimated Time**: 2 minutes (plus waiting for notification)  
**Complexity**: Low

### Preconditions
- User is following an auction (favorited or bid on)
- Auction will end within next 1 hour
- User has notification preferences enabled

### Steps
1. From dashboard, go to "My Auctions" or similar section
2. Verify "Followed Auctions" or "Active Bids" visible
3. Leave page and do other activities
4. Wait for auction to reach 1-hour mark before closing
5. Verify notification appears:
   - Visual indicator (email or in-app notification)
   - Message: "[Auction Title] ends in 1 hour"
6. Click notification
7. Navigate to auction detail page
8. Verify time remaining shows < 1 hour

### Expected Outcomes
- ✅ Notification appears when threshold reached
- ✅ Notification includes auction name
- ✅ Notification clickable to navigate to auction
- ✅ User can customize notification preferences
- ✅ Notification doesn't block other activities

### Success Criteria
- Notification delivered on time
- User finds notification intuitive
- Can snooze or dismiss notification
- Clear time remaining display

---

## SCENARIO 7: Proceed to Checkout & Payment

**Scenario ID**: US-007  
**Role**: Winning Bidder (Student)  
**Objective**: Complete payment for won auction  
**Estimated Time**: 5-7 minutes  
**Complexity**: High

### Preconditions
- User has won an auction (placed highest bid)
- Auction has ended
- Payment gateway available (Stripe sandbox)
- User has not paid yet

### Steps
1. From dashboard, navigate to "My Wins" or "Checkout"
2. Verify auction listed under "Won Auctions"
3. Verify payment info displayed:
   - Artwork image
   - Auction title
   - Final bid amount
   - Platform fee (calculated and shown)
   - Total amount due
4. Click "Proceed to Payment" button
5. Verify payment form displays:
   - Card number field
   - Expiration date field
   - CVV field
   - Billing address fields
6. Note: Card fields should be from Stripe (tokenized, not raw input)
7. Fill in test card: 4111 1111 1111 1111
8. Fill in expiry: 12/25
9. Fill in CVV: 123
10. Fill in billing zip: 12345
11. Click "Complete Payment"
12. Verify success page:
    - Order confirmation number
    - Amount charged
    - Delivery/pickup instructions
    - Invoice downloadable

### Expected Outcomes
- ✅ Checkout page shows correct total
- ✅ Platform fee calculated correctly (3-5%)
- ✅ Payment form is secure (Stripe hosted)
- ✅ Payment processes without errors
- ✅ Confirmation shows order number
- ✅ User cannot see raw card data
- ✅ Invoice/receipt available

### Success Criteria
- User completes payment in under 7 minutes
- No raw card data exposed
- Clear confirmation of charges
- Next steps clearly communicated

### Error Cases to Test
- ❌ Declined card: "Card was declined"
- ❌ Expired card: "Card has expired"
- ❌ Invalid CVV: "Invalid security code"
- ❌ Network error: "Payment failed, please try again"

---

## SCENARIO 8: Teacher Create New Auction

**Scenario ID**: US-008  
**Role**: Teacher (TEACHER role)  
**Objective**: Create and submit new auction  
**Estimated Time**: 8-10 minutes  
**Complexity**: High

### Preconditions
- Teacher account created and logged in
- Teacher has permission to create auctions
- Artwork already submitted/approved (or available)
- School exists in system

### Steps
1. From teacher dashboard, click "Create New Auction"
2. Verify auction creation form:
   - Auction title field
   - Description field
   - Start time picker
   - End time picker
   - Reserve price field
   - Category dropdown
   - Payment gateway selector
   - Artwork selector (choose from submitted)
3. Fill in form:
   - Title: "Spring Art Auction 2026"
   - Description: "Featuring student artwork"
   - Start: Today at 6:00 PM
   - End: Tomorrow at 8:00 PM
   - Reserve: $50
   - Category: "Student Artwork"
   - Gateway: "Stripe"
4. Click "Choose Artwork" and select one
5. Verify artwork preview appears
6. Click "Create Auction" button
7. Verify success page:
   - Auction created with ID shown
   - Status: "DRAFT - Pending Approval"
   - Message: "Awaiting school admin approval"
   - Link to view auction

### Expected Outcomes
- ✅ Form displays all required fields
- ✅ Date/time pickers are user-friendly
- ✅ Artwork selection works
- ✅ Form validates before submission
- ✅ Auction created in DRAFT status
- ✅ Awaiting approval message shown
- ✅ Teacher can view draft auction

### Success Criteria
- Form is intuitive and clear
- No confusing fields or options
- Validation catches errors early
- Success confirmation is clear

### Error Cases to Test
- ❌ Missing title: "Title required"
- ❌ End before start: "End time must be after start"
- ❌ Negative reserve: "Reserve must be positive"
- ❌ No artwork selected: "Artwork selection required"

---

## SCENARIO 9: School Admin Approve Auction

**Scenario ID**: US-009  
**Role**: School Admin (SCHOOL_ADMIN role)  
**Objective**: Review and approve pending auction  
**Estimated Time**: 3-4 minutes  
**Complexity**: Medium

### Preconditions
- School admin logged in
- Pending auction exists (from Scenario 8)
- Admin can see pending auctions list

### Steps
1. From admin dashboard, click "Pending Approvals"
2. Verify pending auctions listed
3. Click on pending auction from Scenario 8
4. Verify approval detail page:
   - Auction info
   - Artwork image
   - Teacher name
   - Dates and times
   - Reserve price
   - Description
5. Review all information
6. Click "Approve" button
7. Optional: Add comment or notes
8. Confirm approval
9. Verify success: "Auction approved and scheduled"
10. Verify status changed to "APPROVED"

### Expected Outcomes
- ✅ Pending list shows all awaiting approval
- ✅ Auction details clearly displayed
- ✅ Approve/reject buttons clearly visible
- ✅ Optional comment field
- ✅ Confirmation message on success
- ✅ Auction moves to approved list

### Success Criteria
- Clear workflow for admin
- Easy to find pending auctions
- Decision captured with optional notes
- No ambiguity about what happens next

---

## SCENARIO 10: Admin Dashboard Overview & Reporting

**Scenario ID**: US-010  
**Role**: School Admin (SCHOOL_ADMIN role)  
**Objective**: View dashboard metrics and generate report  
**Estimated Time**: 4-5 minutes  
**Complexity**: Medium

### Preconditions
- School admin logged in
- Multiple auctions exist (5+)
- At least 10 bids placed
- Dashboard accessible

### Steps
1. Navigate to admin-dashboard.html
2. Verify dashboard displays:
   - Total active auctions
   - Total revenue (this month/all time)
   - Total platform fees
   - New users this month
   - Total bids placed
   - Average bid value
3. Verify charts/graphs:
   - Revenue trend (monthly)
   - Bid activity (hourly/daily)
   - Top auctions (by bid count)
4. Click "Generate Report"
5. Verify report options:
   - Date range selector
   - Report type dropdown (Revenue, Activity, Users, etc.)
   - Export format (CSV, PDF)
6. Select:
   - Date range: Last 30 days
   - Report type: Revenue Report
   - Format: CSV
7. Click "Generate & Download"
8. Verify file downloads
9. Open file and verify:
   - Correct data
   - Proper formatting
   - All auctions included

### Expected Outcomes
- ✅ Dashboard loads quickly (<2 sec)
- ✅ All metrics display correctly
- ✅ Numbers are accurate
- ✅ Charts render properly
- ✅ Report generation works
- ✅ CSV/PDF exports correctly
- ✅ Data is complete and accurate

### Success Criteria
- Admin can understand metrics at a glance
- Report generation is one-click
- Export file is usable in Excel/sheets
- Data appears accurate

---

## SCENARIO 11: Mobile Experience - Auction Browsing on Phone

**Scenario ID**: US-011  
**Role**: Student (Mobile)  
**Objective**: Browse and bid on auction using mobile phone  
**Estimated Time**: 5-6 minutes  
**Complexity**: Medium

### Preconditions
- User logged in on mobile device (iPhone or Android)
- Active auction available
- Mobile device with screen size: 390-430px width

### Steps
1. From mobile dashboard, tap "Browse Auctions"
2. Verify layout adapts to mobile:
   - Single column layout
   - Large touch targets (48px minimum)
   - Readable text (16px minimum)
   - Images scale properly
3. Scroll through auction list:
   - Verify no horizontal scrolling
   - Verify touch-friendly spacing
4. Tap on auction
5. Verify auction detail page:
   - Image visible and scalable
   - Title readable
   - Bid information clear
   - Bid form accessible
6. Scroll to bid section
7. Enter bid amount (large input field)
8. Tap "Place Bid" (large button, 48px+)
9. Verify bid placed without zooming needed
10. Verify success message visible

### Expected Outcomes
- ✅ No horizontal scrolling
- ✅ All buttons/inputs 48px or larger
- ✅ Text readable without zoom
- ✅ Touch interactions responsive
- ✅ Forms mobile-optimized
- ✅ Images load and scale properly
- ✅ Bid placed on mobile

### Success Criteria
- User completes auction browsing/bidding on mobile
- No manual zoom required
- Touch targets large enough
- Page loads quickly (<3 sec)
- Layout is clean on small screen

---

## SCENARIO 12: Error Recovery - Handling Failed Bid

**Scenario ID**: US-012  
**Role**: Student  
**Objective**: Handle and recover from failed bid placement  
**Estimated Time**: 3-4 minutes  
**Complexity**: Medium

### Preconditions
- User logged in
- Active auction available
- Network or system able to simulate failure

### Steps
1. Navigate to active auction
2. Enter bid amount
3. Click "Place Bid"
4. Verify error occurs (network timeout or server error)
5. Verify error message:
   - Clear explanation (e.g., "Bid placement failed")
   - Reason if available (e.g., "Network timeout")
   - Action to take (e.g., "Please try again")
6. Verify bid was NOT placed:
   - Bid count unchanged
   - Bid not in history
7. Click "Retry" button
8. Verify bid placement attempted again
9. Verify success this time
10. Verify bid now appears in history

### Expected Outcomes
- ✅ Error message is clear and helpful
- ✅ Bid is not double-charged/placed on failure
- ✅ User can easily retry
- ✅ Retry succeeds without issues
- ✅ User understands what happened
- ✅ No frustration with process

### Success Criteria
- Error handling is user-friendly
- No data loss or duplication
- Clear path to resolve issue
- User can recover without assistance

---

## SCENARIO 13: Accessibility - Keyboard Navigation

**Scenario ID**: US-013  
**Role**: Any user (Accessibility focus)  
**Objective**: Complete auction browsing and bidding using only keyboard  
**Estimated Time**: 5-7 minutes  
**Complexity**: Medium

### Preconditions
- Website loaded in browser
- No mouse or trackpad available
- Keyboard with Tab, Enter, Arrow keys functional

### Steps
1. From landing page, use Tab to navigate
2. Verify focus indicators visible on all interactive elements:
   - Buttons
   - Links
   - Form fields
3. Use Tab to move through navigation menu
4. Press Enter on "Browse Auctions" link
5. Verify auction list loads
6. Use Tab to focus on auction
7. Press Enter on auction title
8. Verify auction detail page loads
9. Use Tab to navigate to bid form
10. Tab into bid amount field
11. Enter bid amount using keyboard
12. Use Tab to focus on "Place Bid" button
13. Press Enter to place bid
14. Verify bid placed successfully
15. Verify success message announced (screen reader compatible)

### Expected Outcomes
- ✅ All interactive elements reachable via Tab
- ✅ Focus indicators visible (not hidden)
- ✅ Enter key triggers buttons/links
- ✅ Arrow keys work in dropdowns
- ✅ No keyboard traps
- ✅ Tab order logical and expected
- ✅ Escape key closes modals

### Success Criteria
- Complete task using only keyboard
- No elements unreachable
- Focus always visible
- User never confused about where focus is
- No keyboard traps encountered

---

## TESTING TIMELINE

### Day 1 (Feb 4)
- AM: Scenarios 1-3 (Registration, Login, Browsing)
- PM: Scenarios 4-5 (Auction details, Auto-bid)

### Day 2 (Feb 5)
- AM: Scenarios 6-7 (Notifications, Checkout)
- PM: Scenarios 8-9 (Teacher create, Admin approve)

### Day 3 (Feb 6)
- AM: Scenarios 10-11 (Admin dashboard, Mobile)
- PM: Scenarios 12-13 (Error handling, Accessibility)

---

## PARTICIPANT RECRUITMENT

**Target**: 8-10 test participants
**Distribution**:
- 4-5 Students (various tech skill levels)
- 2-3 Teachers
- 1-2 School Admins

**Recruiting Criteria**:
- Mix of ages (18-65)
- Mix of tech skill (novice to advanced)
- Various devices (iPhone, Android, Desktop)
- Some with accessibility needs (color blindness, etc.)

---

## OBSERVATION NOTES TEMPLATE

For each scenario and participant, record:

```
Participant: [Name/ID]
Scenario: [Scenario ID & Name]
Start Time: [Time]
End Time: [Time]
Total Duration: [Minutes]

Success: Y / N / Partial

Issues Encountered:
1. [Issue]
2. [Issue]

Observations:
- [What did user struggle with?]
- [What was intuitive?]
- [Any confusion?]
- [Any delight moments?]

Quotes (if interesting):
"[User quote]"

Recommendations:
- [What should be fixed?]

Rating (1-5):
Ease of Use: [1-5]
Clarity: [1-5]
Enjoyment: [1-5]
```

---

## SUCCESS CRITERIA SUMMARY

### Overall Test Success
- ✅ 8+ participants complete testing
- ✅ 80%+ of participants complete primary tasks
- ✅ Average task time aligns with estimates (<10% variance)
- ✅ No critical usability barriers identified
- ✅ Clear improvement priorities identified

### Individual Scenario Success
- ✅ Scenario 1-3: 100% completion (Low complexity)
- ✅ Scenario 4-7: 85%+ completion (Medium-High)
- ✅ Scenario 8-10: 80%+ completion (Medium-High)
- ✅ Scenario 11-13: 75%+ completion (Mobile/A11y)

### Documentation
- ✅ All issues logged with participant ID
- ✅ Screenshots/videos of key moments
- ✅ User quotes captured
- ✅ Severity levels assigned to issues
- ✅ Improvement recommendations clear

---

## NEXT STEPS

1. **Step 1 (Now)**: Review and refine scenarios
2. **Step 2 (Today)**: Recruit test participants (5 confirm)
3. **Step 3 (Tomorrow)**: Conduct Day 1 testing
4. **Step 4 (Feb 5)**: Conduct Day 2 testing
5. **Step 5 (Feb 6)**: Conduct Day 3 testing
6. **Step 6 (Feb 7)**: Analyze results and create report

---

**Status**: ✅ SCENARIO DEVELOPMENT COMPLETE  
**Ready for**: Participant recruitment and testing execution  
**Next Milestone**: First usability test session (Feb 4 morning)

