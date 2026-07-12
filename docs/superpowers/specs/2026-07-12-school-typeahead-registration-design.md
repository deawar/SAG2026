# Design: Single School Typeahead on Registration

**Date:** 2026-07-12
**Status:** Approved (design)
**Area:** User registration — school selection UX
**Type:** Frontend-only UX change (no backend/schema changes)

## Problem

Registration currently presents **two** school fields:
1. `#school-search` — a free-text box to search by name/location
2. `#school` — a separate `<select name="school_id">` the user must then pick from

Users must type in one box and then choose in another. We want a **single input**: as the user types the school name, matching schools auto-populate as suggestions, and picking one selects the school. This applies to registration for all school-affiliated roles.

## Goal

Replace the two-field pattern with one accessible typeahead **combobox** that, on selection, stores the chosen school's `school_id`. Keep the change small, dependency-free, and consistent with the app's vanilla-JS / no-build / DOM-only conventions.

## Non-goals / Scope boundaries

- **No new backend or schema work.** The search API already exists (`GET /api/schools/search/:query`, also `GET /api/schools?search=`).
- **No school creation during registration.** Users must select an existing school (decision: "must pick an existing school"). If a school is missing, they are directed to their school administrator. A self-service "add my school" flow is explicitly out of scope.
- **No free-text school submission.** `school_id` must reference a real school row.
- **Registration only.** The admin dashboard has a similar search+select pattern in a few places; this change does **not** rewire admin. The new code is structured so it *could* be reused there later (YAGNI — not done now).
- **BIDDER unchanged.** Bidders never see school fields; that behavior is preserved.

## Current state (as-is)

- `public/register.html` — `#school-search` text input + `#school` `<select name="school_id">` inside `#school-fields-group`.
- `public/js/auth-pages.js`:
  - `loadSchools(selectElement)` populates the `<select>` from `/api/schools`.
  - `searchSchools(query, selectElement)` calls `/api/schools/search/:query` and repopulates the `<select>`.
  - Step validation reads `select[name="school_id"]` and `#school-search` (~line 233).
  - `_applyBidderMode` disables/hides both fields (~lines 413–416).
  - Submit reads the selected `school_id` (~lines 450, 654: `schoolId: this.formData.school_id`).
- `src/routes/schoolRoutes.js` (backend) already returns school objects shaped `{ id, name, city, state_province }` from the search endpoint.

## Design (to-be)

### Component: school combobox

In `register.html`, replace `#school-search` + `#school` with one combobox inside `#school-fields-group`:

- A text input `#school-combobox` (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls="school-listbox"`).
- A suggestions list `#school-listbox` (`role="listbox"`, `aria-live="polite"`) rendered directly beneath the input; hidden when empty/closed.
- A **hidden** `<input type="hidden" name="school_id" id="school-id">` holding the selected school's id. This preserves the existing submit payload shape (`schoolId: formData.school_id`).
- Help text: "Start typing your school name and choose it from the list."

### Behavior / data flow

1. User types in `#school-combobox`.
2. On input, if the trimmed value length ≥ 2, debounce ~250 ms, then call `GET /api/schools/search/:query`. In-flight requests are cancelled/superseded so out-of-order responses can't render (guard with a request sequence token or `AbortController`).
3. Render up to ~10 results as list options, each showing `Name — City, ST` via `textContent` (never `innerHTML`). Each option carries its `school_id` (e.g., `dataset.schoolId`).
4. User selects an option (mouse click or keyboard Enter on the active option): the input's value becomes the school name, the hidden `#school-id` is set to that option's id, the list closes, `aria-expanded="false"`.
5. **Edit-after-select clears selection:** if the user changes the input text after having selected, the hidden `#school-id` is cleared, so a stale id can never be submitted alongside a changed name. A new search runs.
6. Below 2 chars, or on clear, the list closes and `#school-id` is empty.

### Validation & error handling

- For STUDENT / TEACHER / SCHOOL_ADMIN, a non-empty `#school-id` is **required** to proceed/submit (mirrors today's `required` select). BIDDER mode clears this requirement and hides the group (unchanged).
- If the user typed text but `#school-id` is empty at submit/step-advance, block with an inline error: "Please select your school from the list."
- **No matches:** the dropdown shows one non-selectable item: "No matches — can't find your school? Contact your school administrator." (`school_id` stays empty.)
- **Search/network error:** show an inline, non-blocking message ("School search is unavailable — please try again"); never leave a partially-set state.

### Accessibility (WAI-ARIA combobox pattern)

- `role="combobox"` on the input; `role="listbox"` on the suggestions; `role="option"` per item.
- `aria-expanded` reflects open/closed; `aria-controls` points to the listbox; `aria-activedescendant` tracks the highlighted option.
- Keyboard: Down/Up move the active option, Enter selects, Esc closes and returns focus to the input, Tab closes without selecting (leaving `school_id` empty → validation catches it).
- Listbox is `aria-live="polite"` so results/no-match are announced. Consistent with the keyboard/aria handling already used in the portfolio modals.

### Impact on existing code

- `public/register.html` — swap the two fields for the combobox markup + hidden input; keep `#school-fields-group` wrapper and BIDDER hide logic hooks.
- `public/js/auth-pages.js`:
  - Replace `loadSchools`/`searchSchools`-into-`<select>` usage with the combobox module's own search.
  - Update the ~4 references from `select[name="school_id"]` / `#school-search` to the hidden `#school-id` input + combobox (step validation, `_applyBidderMode`, submit).
  - Submit payload is unchanged (`schoolId: formData.school_id`) because the hidden input keeps `name="school_id"`.
- New self-contained combobox logic (a small module/functions) — structured for possible later reuse in the admin dashboard, but only wired into registration here.
- `public/css/*` — styles for the combobox input, listbox, active/hover option, and no-match hint; responsive at existing breakpoints.

## Testing

- The repo has **no browser/JS unit-test harness**, so DOM interaction is verified by manual QA.
- Extract a **pure helper** (e.g., `formatSchoolOption(school)` and/or a results-normalizer) and unit-test it with the existing Jest setup.
- Backend search endpoint is already covered by existing tests — unchanged.
- **Manual QA checklist:**
  1. Type ≥2 chars → suggestions appear (name — city, state).
  2. Select a suggestion → input shows name, hidden `school_id` set, list closes.
  3. Edit the text after selecting → `school_id` clears; new search runs.
  4. No-match query → "contact your school administrator" hint; `school_id` stays empty.
  5. Submit/advance without selecting → blocked with the inline error.
  6. Keyboard only: Down/Up/Enter/Esc/Tab behave per the ARIA pattern; focus management correct.
  7. BIDDER mode → school group hidden, no school requirement.
  8. Search/network error → inline retry message, no half-set state.
  9. Responsive at mobile/tablet/desktop widths.

## Rollout

Pure frontend change served as static assets — takes effect on the next deploy of `public/`. No migration, no startup DDL, no data backfill.
