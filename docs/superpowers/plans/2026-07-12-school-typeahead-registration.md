# School Typeahead on Registration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-field school picker (search box + `<select>`) on registration with a single accessible typeahead combobox that stores the chosen school's `school_id`.

**Architecture:** A new self-contained browser module (`public/js/school-combobox.js`) renders a WAI-ARIA combobox over the existing `GET /api/schools/search/:query` endpoint and writes the selected id into a hidden `input[name="school_id"]`. `register.html` swaps its two fields for the combobox markup; `auth-pages.js` drops its old search-into-`<select>` wiring and points validation at the hidden input. No backend or schema changes.

**Tech Stack:** Vanilla ES5-compatible browser JS (no framework, no build step), existing Jest for the one pure helper, existing Express schools API.

## Global Constraints

- No new dependencies; no build step. Plain browser JS served from `public/`.
- Render all school data via `textContent` / `createElement` — never `innerHTML` with API data.
- The visible input must NOT be named `school_id`; only the hidden input carries `name="school_id"` so the existing submit payload (`schoolId: this.formData.school_id`) is unchanged.
- Must pick an existing school: `school_id` is required for STUDENT/TEACHER/SCHOOL_ADMIN; BIDDER hides the school group and drops the requirement.
- Editing the input after a selection clears the hidden `school_id`.
- Search API: `GET /api/schools/search/:query?limit=10` → `{ success:true, data:[{ id, name, city, state_province, ... }] }`; requires query length ≥ 2 (returns 400 otherwise).
- Lint must stay at 0 errors. Full Jest suite must stay green (currently 826 passing on `main`; this branch starts from that state).
- Display format for a suggestion: `"<name> — <city>, <state_province>"` (em dash `—`), degrading gracefully when city/state are missing.

---

### Task 1: School combobox module + pure-helper unit test

**Files:**
- Create: `public/js/school-combobox.js`
- Test: `tests/unit/public/schoolCombobox.test.js`

**Interfaces:**
- Produces (global, for the browser): `window.SchoolCombobox.init({ inputEl, listboxEl, hiddenEl })` and `window.SchoolCombobox.formatSchoolOption(school)`.
- Produces (CommonJS, for tests): `module.exports = { initSchoolCombobox, formatSchoolOption }`.
- `formatSchoolOption(school: {name?, city?, state_province?}) => string`.
- `initSchoolCombobox({ inputEl: HTMLInputElement, listboxEl: HTMLElement, hiddenEl: HTMLInputElement }) => void`.
- Consumes: `GET /api/schools/search/:query?limit=10`.

- [ ] **Step 1: Write the failing test for the pure helper**

Create `tests/unit/public/schoolCombobox.test.js`:

```js
const { formatSchoolOption } = require('../../../public/js/school-combobox.js');

describe('formatSchoolOption', () => {
  test('name + city + state', () => {
    expect(formatSchoolOption({ name: 'Lincoln High School', city: 'Chicago', state_province: 'IL' }))
      .toBe('Lincoln High School — Chicago, IL');
  });

  test('name only when city and state are missing', () => {
    expect(formatSchoolOption({ name: 'Homeschool Co-op' })).toBe('Homeschool Co-op');
  });

  test('city without state', () => {
    expect(formatSchoolOption({ name: 'Reno Prep', city: 'Reno' })).toBe('Reno Prep — Reno');
  });

  test('trims surrounding whitespace', () => {
    expect(formatSchoolOption({ name: '  Reno Prep  ', city: ' Reno ', state_province: ' NV ' }))
      .toBe('Reno Prep — Reno, NV');
  });

  test('missing/blank name yields just the locality or empty', () => {
    expect(formatSchoolOption({ city: 'Reno', state_province: 'NV' })).toBe(' — Reno, NV');
    expect(formatSchoolOption({})).toBe('');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest tests/unit/public/schoolCombobox.test.js`
Expected: FAIL — `Cannot find module '.../public/js/school-combobox.js'`.

- [ ] **Step 3: Create the module with the helper + combobox wiring**

Create `public/js/school-combobox.js`:

```js
/**
 * Single-input school typeahead (WAI-ARIA combobox) used on registration.
 * Renders suggestions from GET /api/schools/search/:query and writes the
 * chosen school's id into a hidden input[name="school_id"].
 */
(function () {
  'use strict';

  var MIN_CHARS = 2;
  var DEBOUNCE_MS = 250;
  var RESULT_LIMIT = 10;

  /**
   * Display label for one school suggestion.
   * @param {{name?:string, city?:string, state_province?:string}} school
   * @returns {string} e.g. "Lincoln High School — Chicago, IL"
   */
  function formatSchoolOption(school) {
    var name = (school && school.name ? String(school.name) : '').trim();
    var city = (school && school.city ? String(school.city) : '').trim();
    var state = (school && school.state_province ? String(school.state_province) : '').trim();
    var locality = [city, state].filter(Boolean).join(', ');
    if (name && locality) { return name + ' — ' + locality; }
    if (locality) { return ' — ' + locality; }
    return name;
  }

  /**
   * Wire a single-input school typeahead.
   * @param {{inputEl:HTMLInputElement, listboxEl:HTMLElement, hiddenEl:HTMLInputElement}} opts
   */
  function initSchoolCombobox(opts) {
    var inputEl = opts.inputEl;
    var listboxEl = opts.listboxEl;
    var hiddenEl = opts.hiddenEl;
    if (!inputEl || !listboxEl || !hiddenEl) { return; }

    var debounceTimer = null;
    var requestSeq = 0;   // guards against out-of-order responses
    var activeIndex = -1; // highlighted option index
    var options = [];     // [{ id, label }]

    function closeList() {
      listboxEl.replaceChildren();
      listboxEl.hidden = true;
      inputEl.setAttribute('aria-expanded', 'false');
      inputEl.removeAttribute('aria-activedescendant');
      activeIndex = -1;
      options = [];
    }

    function renderMessage(text) {
      listboxEl.replaceChildren();
      var li = document.createElement('li');
      li.className = 'school-combobox__empty';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-disabled', 'true');
      li.textContent = text;
      listboxEl.appendChild(li);
      listboxEl.hidden = false;
      inputEl.setAttribute('aria-expanded', 'true');
      activeIndex = -1;
      options = [];
    }

    function renderOptions(schools) {
      listboxEl.replaceChildren();
      options = [];
      schools.forEach(function (school, i) {
        var li = document.createElement('li');
        li.className = 'school-combobox__option';
        li.id = 'school-option-' + i;
        li.setAttribute('role', 'option');
        li.dataset.schoolId = school.id;
        li.textContent = formatSchoolOption(school);
        li.addEventListener('mousedown', function (e) {
          e.preventDefault(); // keep focus in the input so blur doesn't pre-empt selection
          selectOption(i);
        });
        listboxEl.appendChild(li);
        options.push({ id: school.id, label: li.textContent });
      });
      listboxEl.hidden = false;
      inputEl.setAttribute('aria-expanded', 'true');
      activeIndex = -1;
    }

    function highlight(index) {
      var items = listboxEl.querySelectorAll('.school-combobox__option');
      items.forEach(function (el) { el.classList.remove('is-active'); });
      if (index >= 0 && index < items.length) {
        items[index].classList.add('is-active');
        inputEl.setAttribute('aria-activedescendant', items[index].id);
        activeIndex = index;
      }
    }

    function selectOption(index) {
      var opt = options[index];
      if (!opt) { return; }
      inputEl.value = opt.label;
      hiddenEl.value = opt.id;
      closeList();
    }

    function search(query) {
      var seq = ++requestSeq;
      fetch('/api/schools/search/' + encodeURIComponent(query) + '?limit=' + RESULT_LIMIT)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (seq !== requestSeq) { return; } // a newer keystroke superseded this
          var results = (data && data.success && Array.isArray(data.data)) ? data.data : [];
          if (results.length === 0) {
            renderMessage("No matches — can't find your school? Contact your school administrator.");
          } else {
            renderOptions(results);
          }
        })
        .catch(function () {
          if (seq !== requestSeq) { return; }
          renderMessage('School search is unavailable — please try again.');
        });
    }

    inputEl.addEventListener('input', function () {
      hiddenEl.value = ''; // editing invalidates any prior selection
      var q = inputEl.value.trim();
      clearTimeout(debounceTimer);
      if (q.length < MIN_CHARS) { closeList(); return; }
      debounceTimer = setTimeout(function () { search(q); }, DEBOUNCE_MS);
    });

    inputEl.addEventListener('keydown', function (e) {
      var items = listboxEl.querySelectorAll('.school-combobox__option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length) { highlight(Math.min(activeIndex + 1, items.length - 1)); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length) { highlight(Math.max(activeIndex - 1, 0)); }
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0) { e.preventDefault(); selectOption(activeIndex); }
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    // Close after a click outside; the 150ms delay lets an option mousedown land first.
    inputEl.addEventListener('blur', function () { setTimeout(closeList, 150); });

    closeList();
  }

  if (typeof window !== 'undefined') {
    window.SchoolCombobox = { init: initSchoolCombobox, formatSchoolOption: formatSchoolOption };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initSchoolCombobox: initSchoolCombobox, formatSchoolOption: formatSchoolOption };
  }
})();
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx jest tests/unit/public/schoolCombobox.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint the new file**

Run: `npx eslint public/js/school-combobox.js`
Expected: 0 errors (warnings acceptable).

- [ ] **Step 6: Commit**

```bash
git add public/js/school-combobox.js tests/unit/public/schoolCombobox.test.js
git commit -m "feat(register): school typeahead combobox module + helper test"
```

---

### Task 2: Wire the combobox into registration

**Files:**
- Modify: `public/register.html` (school fields markup ~lines 204–238; script includes ~lines 531–536)
- Modify: `public/js/auth-pages.js` (school wiring ~233–283; `validateRegisterStep` ~450/466; `_applyBidderMode` ~413–416; remove now-dead `loadSchools`/`searchSchools`)
- Modify: `public/css/main.css` (combobox styles)

**Interfaces:**
- Consumes: `window.SchoolCombobox.init({ inputEl, listboxEl, hiddenEl })` from Task 1.
- Produces: a hidden `input#school-id[name="school_id"]` whose value flows into `this.formData.school_id` via the existing `saveStepData` (which iterates `form.querySelectorAll('input, textarea, select')`).

- [ ] **Step 1: Replace the two school fields in `public/register.html`**

Replace the block from `<!-- School Selection with Search (hidden for BIDDER) -->` through the closing `</div><!-- /#school-fields-group -->` (currently lines ~204–238) with:

```html
                        <!-- School Selection — single typeahead (hidden for BIDDER) -->
                        <div id="school-fields-group">
                        <div class="form-group">
                            <label for="school-combobox">Find Your School <span aria-label="required">*</span></label>
                            <p class="school-search-help">Start typing your school name and choose it from the list.</p>

                            <div class="school-combobox">
                                <input
                                    type="text"
                                    id="school-combobox"
                                    class="form-control"
                                    role="combobox"
                                    aria-autocomplete="list"
                                    aria-expanded="false"
                                    aria-controls="school-listbox"
                                    autocomplete="off"
                                    placeholder="Type school name (e.g., Lincoln High)"
                                    aria-describedby="school-help school-error"
                                >
                                <ul id="school-listbox" class="school-combobox__listbox"
                                    role="listbox" aria-label="School suggestions" aria-live="polite" hidden></ul>
                            </div>

                            <input type="hidden" id="school-id" name="school_id">
                            <small id="school-help" class="help-text">Select your school from the suggestions.</small>
                            <small id="school-error" class="error-message" role="alert"></small>
                        </div>
                        </div><!-- /#school-fields-group -->
```

- [ ] **Step 2: Add the module script include in `public/register.html`**

Immediately before the `auth-pages.js` include (`<script src="/js/auth-pages.js"></script>`, ~line 536), add:

```html
    <script src="/js/school-combobox.js"></script>
```

- [ ] **Step 3: Replace the old school-search wiring in `public/js/auth-pages.js`**

Remove the two lookups at lines ~233–234:

```js
    const schoolSelect = form.querySelector('select[name="school_id"]');
    const schoolSearch = form.querySelector('#school-search');
```

and the entire wiring block at lines ~256–283 (from `// Set up school search functionality — type-to-search, no pre-load` through the closing brace of the `if (schoolSearch && schoolSelect) { ... }`). Replace both with:

```js
    // School typeahead combobox: single input → hidden input[name="school_id"]
    const schoolInput = form.querySelector('#school-combobox');
    const schoolListbox = form.querySelector('#school-listbox');
    const schoolHidden = form.querySelector('#school-id');
    if (schoolInput && schoolListbox && schoolHidden && window.SchoolCombobox) {
      window.SchoolCombobox.init({ inputEl: schoolInput, listboxEl: schoolListbox, hiddenEl: schoolHidden });
    }
```

- [ ] **Step 4: Point step validation at the hidden input**

In `validateRegisterStep` (~line 450) change:

```js
      const school = form.querySelector('select[name="school_id"]');
```

to:

```js
      const school = form.querySelector('input[name="school_id"]');
```

and change the school error message (~line 466) from:

```js
        if (!school?.value) {errors.school = 'School is required';}
```

to:

```js
        if (!school?.value) {errors.school = 'Please select your school from the list';}
```

- [ ] **Step 5: Update `_applyBidderMode` to the new elements**

Replace the school lookups in `_applyBidderMode` (~lines 413–416):

```js
    const schoolSelect = form.querySelector('select[name="school_id"]');
    if (schoolSelect) {schoolSelect.required = false; schoolSelect.removeAttribute('aria-required');}
    const schoolSearch = form.querySelector('#school-search');
    if (schoolSearch) {schoolSearch.required = false;}
```

with:

```js
    const schoolHidden = form.querySelector('input[name="school_id"]');
    if (schoolHidden) {schoolHidden.required = false; schoolHidden.removeAttribute('aria-required');}
    const schoolInput = form.querySelector('#school-combobox');
    if (schoolInput) {schoolInput.required = false;}
```

(The `#school-fields-group` is already hidden by the existing `schoolGroup.style.display = 'none'` a few lines above; leave that as-is.)

- [ ] **Step 6: Remove the now-dead `loadSchools` and `searchSchools` methods**

Delete the `loadSchools(selectElement)` and `searchSchools(query, selectElement)` methods (the two `<select>`-populating methods). First confirm they have no other callers:

Run: `git grep -nE "loadSchools|searchSchools" public/js/`
Expected after deletion: no matches (the only references were the wiring block removed in Step 3). If any other caller exists, stop and report rather than delete.

- [ ] **Step 7: Add combobox styles to `public/css/main.css`**

Append:

```css
/* ===== Registration — School typeahead combobox ===== */
.school-combobox {
    position: relative;
}

.school-combobox__listbox {
    list-style: none;
    margin: 0;
    padding: 0;
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    z-index: 20;
    background: var(--color-white, #ffffff);
    border: 1px solid var(--color-lighter-gray, #cccccc);
    border-radius: var(--radius-sm);
    max-height: 260px;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.school-combobox__option,
.school-combobox__empty {
    padding: 8px 12px;
    font-size: var(--font-size-sm);
}

.school-combobox__option {
    cursor: pointer;
}

.school-combobox__option.is-active,
.school-combobox__option:hover {
    background: var(--color-lightest-gray, #eef2ff);
}

.school-combobox__empty {
    color: var(--color-gray, #666666);
    cursor: default;
}
```

- [ ] **Step 8: Verify syntax, lint, and suite**

Run: `node --check public/js/auth-pages.js && node --check public/js/school-combobox.js`
Expected: no output (OK).

Run: `npm run lint`
Expected: `0 errors` (warnings unchanged).

Run: `npm test`
Expected: full suite green (826 + the 5 new helper tests from Task 1 = 831 passing), 0 failures. No backend changed.

- [ ] **Step 9: Manual QA (record results)**

Serve the app locally and, on the registration page as a STUDENT/TEACHER/SCHOOL_ADMIN:
1. Type ≥2 chars → suggestions appear as `Name — City, ST`.
2. Click a suggestion → input shows the name; DevTools shows `#school-id` value set; list closes.
3. Keyboard: Down/Up highlight, Enter selects, Esc closes; focus stays usable.
4. Edit the text after selecting → `#school-id` clears; a new search runs.
5. Search a nonsense string → "Contact your school administrator" hint; `#school-id` stays empty.
6. Try to advance past step 1 without selecting → blocked with "Please select your school from the list".
7. Switch to BIDDER → school group hidden; can complete registration with no school.
8. Simulate a failed search (offline) → "School search is unavailable" hint; no half-set state.
9. Check mobile / tablet / desktop widths — the listbox overlays correctly.

- [ ] **Step 10: Commit**

```bash
git add public/register.html public/js/auth-pages.js public/css/main.css
git commit -m "feat(register): single school typeahead replaces search+select"
```

---

## Notes for the executor

- After Task 2, run the final whole-branch review (opus) via `scripts/review-package $(git merge-base main HEAD) HEAD`, then `superpowers:finishing-a-development-branch`.
- This is a pure frontend change; it takes effect on the next deploy of `public/`. No migration, no startup DDL.
- Do not push without asking. `main` is the base; this branch is `feature/school-typeahead-registration`.
