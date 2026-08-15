# Show the registered School in Account Settings (+ time-aware greeting)

**Date:** 2026-08-15
**Status:** Design approved, pending spec review

## Problem

Students, teachers, and school admins have no clear indication in Account
Settings of which school they're registered to. The profile API returns
`schoolId` but not the school name, and no dashboard surfaces the school name in
Account Settings.

Separately, the teacher dashboard header greeting is hardcoded "Good morning,"
regardless of the actual time of day.

## Goals

1. Show the user's school **name** (read-only) in Account Settings, for the
   roles that have a school.
2. Keep the teacher header school badge working (it already does) and make it
   degrade gracefully when a teacher has no school.
3. Make the teacher header greeting reflect the actual local time of day.

**Non-goals:** editing or switching schools; adding the school to roles that
don't have one; a school chip in the student/admin *headers* (only the Account
Settings row for those).

## Current state (verified)

- `getProfile` (`GET /api/user/profile`, `userController.js:695`) returns
  `data` with `schoolId` but **no** `schoolName`. All three dashboards
  (user, teacher, admin) load this endpoint.
- Account Settings → Profile Information (`user-dashboard.html#account`) shows
  Full Name, Email, Phone — **no school**. Teachers reach Account Settings via
  this same page (their dropdown links to `/user-dashboard.html#account`), so
  students and teachers **share** this section.
- The teacher header **already** shows a school badge: `/api/teacher/teacher-info`
  returns `schoolName` (`teacherController.js:600`), and `loadTeacherInfo()`
  (called on init) sets `#teacher-school-badge` to it. Confirmed rendering
  locally. Edge case: when `schoolName` is empty, the code only overwrites the
  badge when non-empty, so the default "Loading…" text can persist.
- The teacher greeting is hardcoded: `teacher-dashboard.html:73` —
  `Good morning, <strong id="teacher-name">Teacher</strong>.`

## Design

### 1. Backend — add `schoolName` to the profile response

Extend `getProfile` so `data` includes `schoolName`:

- When the user has a `school_id`, look up the name with a localized query
  (`SELECT name FROM schools WHERE id = $1`) and return it as `schoolName`.
- When there is no `school_id`, return `schoolName: null`.

Scope the change to `getProfile` (do not modify the widely-used
`userModel.getById`), so the blast radius is one method. No other profile
fields change.

### 2. Account Settings — read-only School row (students + teachers)

In the Profile Information section of `user-dashboard.html#account`, add a
**read-only** "School" row (static text, e.g. a `<p>`/definition row with
`id="profile-school"`, **not** an editable `<input>` and **not** part of the
profile form submit). When the profile loads in `user-dashboard.js`:

- If `data.schoolName` is present, set the row's text and show it.
- If `data.schoolName` is null/empty, **hide the row entirely** (its container
  starts hidden and is only revealed when a name exists).

Because it is display-only and outside the form, the school can never be edited
or submitted.

### 3. Admin dashboard — read-only School row

In the admin dashboard's profile/account view (the one that consumes
`/api/user/profile`, `admin-dashboard.js:1864`), add the same read-only
"School" row with the same show/hide-when-null behavior. Site-admins (no
school) therefore don't see the row; school-admins see their school.

### 4. Teacher header — badge polish + time-aware greeting

- **Badge:** keep the existing `#teacher-school-badge` behavior. Fix the
  edge case so that when `schoolName` is empty/absent the badge does not remain
  stuck on "Loading…" — clear or hide it instead.
- **Greeting:** replace the hardcoded "Good morning" with a time-aware word.
  Wrap the greeting word in its own element (e.g.
  `<span id="teacher-greeting">Good morning</span>, <strong id="teacher-name">…</strong>.`)
  and set it in `teacher-dashboard.js` from the browser's local time:
  - 05:00–11:59 → "Good morning"
  - 12:00–16:59 → "Good afternoon"
  - 17:00–04:59 → "Good evening"
  The name element (`#teacher-name`) is unchanged.

## Data flow

```
GET /api/user/profile ─┐
  (getProfile now       ├─> user-dashboard.js  -> #profile-school (show/hide)
   returns schoolName)   ├─> admin-dashboard.js -> admin school row (show/hide)
                         │
GET /api/teacher/teacher-info (already returns schoolName)
                         └─> teacher-dashboard.js -> #teacher-school-badge
                             + time-of-day -> #teacher-greeting
```

## Error / edge handling

- No school (bidder, site-admin, unaffiliated): the Account Settings School row
  is hidden; the teacher badge is cleared/hidden rather than "Loading…".
- Profile fetch failure: the School row stays hidden (default state); no error
  surface change.
- The greeting derives from the client clock; no server round-trip.

## Testing

- **Backend (unit):** `getProfile` returns `schoolName` for a user with a
  school (mocked school lookup), and `schoolName: null` for a user without one.
- **Frontend (unit/jsdom or focused):**
  - The Account Settings School row is populated and shown when `schoolName`
    is present, and hidden when it's null.
  - The teacher greeting resolves to morning/afternoon/evening for
    representative hours (e.g. 09:00, 14:00, 20:00).
  - The teacher badge shows the name when present and is cleared (not
    "Loading…") when absent.
- **Manual (post-deploy, DB-backed login):** log in as a teacher → header shows
  the correct greeting + school; Account Settings shows the read-only school.
  Log in as a school-admin → admin profile shows the school. Bidder/site-admin →
  no school row.

## Files touched (estimate)

- Backend: `src/controllers/userController.js` (`getProfile`).
- Frontend: `public/user-dashboard.html` (School row markup),
  `public/js/user-dashboard.js` (populate/hide),
  `public/admin-dashboard.html` + `public/js/admin-dashboard.js` (School row),
  `public/teacher-dashboard.html` (greeting span),
  `public/js/teacher-dashboard.js` (greeting + badge edge case).
- Tests: profile controller test; a focused frontend test for the greeting +
  row show/hide.

## Out of scope

- Editing/switching schools; school chips in the student/admin headers;
  changing any other profile field.
