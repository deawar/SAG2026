# Teacher: Add Individual Student — Design

**Date:** 2026-07-12
**Status:** Approved (design)

## Goal

Let a teacher add a single student to their roster from the teacher dashboard, in
addition to the existing CSV bulk upload. Adding a student creates an invite and sends
the invite email immediately.

## Context

The current roster mechanism is invite-based, not direct account creation:

- `POST /api/teacher/csv-upload` accepts `{ students: [ { name, email }, ... ] }` and
  inserts one `registration_tokens` row per student (columns: `token`, `teacher_id`,
  `student_email` (CITEXT), `student_name`, `created_by_user_id`, `token_expires_at`
  default now + 30 days). It does NOT create user accounts and does NOT deduplicate.
- `POST /api/teacher/send-invites` (`{ tokenIds: [...] }`) emails the
  `student-registration-invite` template with a link
  `${FRONTEND_URL}/register.html?token=…&email=…`.
- The student (or a parent, for under-13) then self-registers through the existing
  COPPA-aware `/api/auth/register` flow. This design does not touch that flow.
- `GET /api/teacher/students` returns `{ registered, pending }` by joining
  `registration_tokens` to `users` on `LOWER(email)` where `role='STUDENT'`.

Decisions confirmed with the user:
1. Add-student creates an **invite** (registration token), same model as CSV — keeps
   COPPA parental-consent handling intact. NOT a ready-made account.
2. The invite email is **sent immediately** on add (best-effort); the student also
   appears in the pending list so the teacher can resend via the existing control.

## Approach

A dedicated `POST /api/teacher/students` endpoint for one student. Chosen over reusing
`/api/teacher/csv-upload` with a one-element array (no dedup, two round-trips for
"add & send", misleading endpoint name) and over overloading the CSV endpoint with a
flag (muddies a working path).

## Backend

### Route
`POST /api/teacher/students` — added to `src/routes/teacherRoutes.js`, which already
applies `verifyToken` + `verifyRole('TEACHER','SCHOOL_ADMIN','SITE_ADMIN')`. A non-staff
role (e.g. STUDENT) is rejected 403 at the router.

### Controller: `TeacherController.addStudent(req, res)`
Body: `{ name, email }`.

1. Resolve `userId = req.user.id`.
2. Validate:
   - `name`: string, trimmed length 1–200 → else 400.
   - `email`: `ValidationUtils.isValidEmail(email)` → else 400.
3. Normalize: `name = name.trim()`, `email = email.toLowerCase().trim()`.
4. Duplicate detection for this teacher (email compared case-insensitively):
   - Unused, unexpired invite token already exists
     (`teacher_id = userId AND LOWER(student_email) = email AND used_at IS NULL AND
     token_expires_at > NOW()`) → 409 `ALREADY_INVITED`.
   - Already-registered student with that email under this teacher
     (a `registration_tokens` row for this teacher whose email matches a
     non-deleted `users` row with `role='STUDENT'`) → 409 `ALREADY_REGISTERED`.
5. Insert one `registration_tokens` row (same INSERT shape as `uploadCSV`): new
   `token = uuidv4()`, `teacher_id`, `student_email`, `student_name`, `created_by_user_id`.
6. Send the invite email immediately, **best-effort**, via a shared helper (below).
   On SMTP failure: do not fail the request; return `inviteSent: false`.
7. Write an `audit_logs` entry (teacher added a student), mirroring existing inserts in
   this controller (`action_category`, `action_type`, `resource_type='USER'` or
   `'REGISTRATION_TOKEN'`, `action_details` JSON with the token id + email).
8. Respond `201` with
   `{ success: true, student: { id, token, studentName, studentEmail, used:false,
   invitedAt }, inviteSent: <bool> }`.

### Shared invite-email helper
Extract the per-token email step currently inline in `sendInvites` into a private
static helper, e.g.
`_sendRegistrationInvite({ teacherName, schoolName, token, studentEmail, studentName })`
that builds the link, renders `student-registration-invite`, and calls
`emailProvider.send(...)`. Both `sendInvites` and `addStudent` call it so the two paths
send byte-identical invites. `addStudent` fetches teacher name + school name with the
same query `sendInvites` uses.

## Frontend (`public/js/teacher-dashboard.js` + teacher dashboard HTML)

- Add an **"Add Student"** form near the CSV upload: `Student Name` + `Email` inputs and
  an "Add & Invite" button. Single `name` field, consistent with CSV (the student's
  first/last name is captured when they self-register).
- On submit: `POST /api/teacher/students { name, email }`.
  - Success → toast `Invited {name}` (or, if `inviteSent:false`, `Added {name} — invite
    email could not be sent, use Send Invites to retry`), clear the form, call
    `loadStudents()` so the new pending entry appears.
  - 409 → inline error: already invited / already registered.
  - 400 → inline validation error.

## Error handling

| Condition | Status | Body `error` |
|-----------|--------|--------------|
| Missing/invalid name | 400 | `INVALID_NAME` |
| Invalid email | 400 | `INVALID_EMAIL` |
| Duplicate pending invite | 409 | `ALREADY_INVITED` |
| Already-registered student | 409 | `ALREADY_REGISTERED` |
| Non-staff role | 403 | (router) |
| SMTP send failure | 201 | success, `inviteSent:false` |

## Testing

Integration tests (mirror `tests/integration/routes/teacherApprovalIntegrationTest.spec.js`
harness — module-mocked `pool`, locally-signed JWT):

1. Teacher adds a student → 201, token inserted, invite email attempted, `inviteSent:true`.
2. Duplicate unused/unexpired invite → 409 `ALREADY_INVITED`.
3. Already-registered student → 409 `ALREADY_REGISTERED`.
4. Invalid email → 400.
5. Missing/blank name → 400.
6. Non-teacher token (STUDENT) → 403.
7. SMTP failure path → 201 with `inviteSent:false` (email helper throws, add still succeeds).

## Scope guard

No change to: the CSV path, `/api/auth/register`, the COPPA/parental-consent flow, or how
students self-register. This adds only a single-student on-ramp to the same invite pipeline.
The shared-helper extraction is the only refactor, and it is behavior-preserving for the
existing `send-invites` path.
