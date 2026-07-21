# School Gallery — Plan D: Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the (currently dormant, backend-only) School Gallery usable: a gallery page with pre-moderated comment threads, student share/comments toggles on the portfolio page, the invite-accept page the Plan B email already links to, and a staff management page (roster, invites/grants, enablement, moderation queue).

**Architecture:** Follows the site's established frontend pattern exactly — static HTML pages + per-page vanilla-JS files using `window.apiClient`, `window.authManager`, `UIComponents` (`requireAuth`, `initializeNavbar`, `showAlert`); ALL user-derived text rendered via DOM APIs / `.textContent` (never `innerHTML`). Reuses `portfolio-grid`/`portfolio-card` + modal + form CSS classes; **no new visual language** (consistency over novelty — do not invoke frontend-design). Task 1 adds four small backend enablers the UI needs.

**Tech Stack:** Vanilla JS (browser), Express backend, Jest (+ jsdom for `ui-components` pure helpers; supertest for backend).

**Spec:** `docs/superpowers/specs/2026-07-20-school-gallery-design.md`. **Builds on Plans A+B+C (merged, HEAD 61e5f5d, 931 tests).** Backend endpoints already live: `GET /api/gallery/:schoolId`, `PATCH /api/gallery/items/:id/share`, roster POST/DELETE, grants invite/accept/revoke/list, members POST/DELETE, comments submit/read/pending/approve/reject.

## Global Constraints
- **XSS rule:** any user-derived string reaches the DOM only via `.textContent` / `createElement` — never string-concatenated HTML. (Spec threat #6: comment bodies render via `textContent`.)
- **PII:** gallery + comment UI shows artist/author **first name only** (backend already projects this — the UI must not add fields).
- **Auth pattern:** pages call `UIComponents.requireAuth('/')` then `UIComponents.initializeNavbar()` on `DOMContentLoaded` (mirrors `portfolio.js:1179-1184`).
- **Page scaffold:** copy `portfolio.html`'s head (fonts + 4 CSS), navbar, footer, alert container, and script order (`theme-manager`, `accessibility`, `api-client`, `auth-manager`, `ui-components`, page script).
- **Gallery selection:** `gallery.html?school=<id>`; default = viewer's own `schoolId` from `authManager.getUser()`. Cross-school viewers arrive via a link shared by their teacher (v1 — no "galleries I can see" listing endpoint; YAGNI).
- **Comment UX:** submit → tell the student it's **awaiting teacher approval** (comments are pre-moderated; only APPROVED render).
- Baseline: **931 tests**, lint 0 (errors). Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure
- `src/routes/portfolioRoutes.js` — MODIFY: own-items list returns gallery flags.
- `src/controllers/galleryController.js`, `src/models/galleryModel.js`, `src/models/galleryGrantModel.js`, `src/routes/galleryRoutes.js` — MODIFY: accept returns `hostSchoolId`; `GET /roster`; `GET /grants/:id/members`.
- `public/js/ui-components.js` — MODIFY: `galleryNavTarget` + `injectGalleryLink` (+ `_injectNavLink` refactor).
- `public/js/portfolio.js` — MODIFY: share/comments toggles on own cards.
- `public/css/main.css` — MODIFY: small `.portfolio-gallery-controls` + `.gallery-*` styles.
- `public/gallery.html` + `public/js/gallery.js` — CREATE.
- `public/gallery-invite.html` + `public/js/gallery-invite.js` — CREATE.
- `public/gallery-manage.html` + `public/js/gallery-manage.js` — CREATE.
- Tests: extend `tests/integration/routes/galleryGrants.spec.js` + `tests/integration/routes/galleryComments.spec.js` (or new `galleryRosterMembers.spec.js`), portfolio list spec, CREATE `tests/unit/public/galleryNav.test.js`.

---

## Task 1: Backend enablers

**Files:** Modify `src/routes/portfolioRoutes.js`, `src/controllers/galleryController.js`, `src/models/galleryModel.js`, `src/models/galleryGrantModel.js`, `src/routes/galleryRoutes.js`; Tests: existing portfolio list spec + `tests/integration/routes/galleryRosterMembers.spec.js` (CREATE) + one assertion in `galleryGrants.spec.js`.

**Interfaces — Produces:**
- `GET /api/portfolio` items now include `sharedToGallery: boolean`, `galleryCommentsAllowed: boolean`.
- `POST /api/gallery/grants/:id/accept` response now includes `hostSchoolId`.
- `GET /api/gallery/roster` (host TEACHER/SCHOOL_ADMIN) → `{ success, roster: [{ studentUserId, firstName, lastName, gradeLevel }] }`.
- `GET /api/gallery/grants/:id/members` (bound invited TEACHER) → `{ success, members: [{ studentUserId }] }`.

- [ ] **Step 1 (portfolio flags):** in `src/routes/portfolioRoutes.js` `GET /` (line ~82) add the two columns to the SELECT:
```sql
        `SELECT id, title, description, medium, artist_grade, image_url,
                portfolio_status, submission_state, rejection_reason, created_at,
                shared_to_gallery, gallery_comments_allowed
```
and in `mapItem` (line ~22, after `unreadCount`):
```js
    sharedToGallery: row.shared_to_gallery === true,
    galleryCommentsAllowed: row.gallery_comments_allowed === true
```
Add/extend an assertion in the existing portfolio list integration test (the spec that exercises `GET /api/portfolio`): mock row includes `shared_to_gallery: true, gallery_comments_allowed: false`; assert `res.body.items[0].sharedToGallery === true` and `galleryCommentsAllowed === false`.
- [ ] **Step 2 (accept returns hostSchoolId):** in `galleryController.acceptGrant` success response change to:
```js
      return res.json({ success: true, grantId: grant.id, status: 'ACCEPTED', hostSchoolId: grant.host_school_id });
```
In `galleryGrants.spec.js` test 3 (`accept with matching band → 200`) add `expect(res.body.hostSchoolId).toBe(HOST_SCHOOL);`.
- [ ] **Step 3 (roster list):** `src/models/galleryModel.js` add after `removeFromRoster`:
```js
  async listRoster(schoolId) {
    const r = await this.db.query(
      `SELECT gr.student_user_id AS "studentUserId", u.first_name AS "firstName",
              u.last_name AS "lastName", u.grade_level AS "gradeLevel"
         FROM gallery_roster gr
         JOIN users u ON u.id = gr.student_user_id AND u.deleted_at IS NULL
        WHERE gr.school_id = $1
        ORDER BY u.last_name ASC, u.first_name ASC`,
      [schoolId]
    );
    return r.rows;
  }
```
`galleryController` add (near `addRoster`):
```js
  // GET /api/gallery/roster  (host TEACHER/SCHOOL_ADMIN)
  static async listRoster(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      if (!viewer || !['TEACHER', 'SCHOOL_ADMIN'].includes(viewer.role) || !viewer.school_id) {
        return res.status(403).json({ success: false, message: 'Only a teacher/admin can manage the roster.' });
      }
      const roster = await model.listRoster(viewer.school_id);
      return res.json({ success: true, roster });
    } catch (e) { return next(e); }
  }
```
Route (with the other roster routes, before `/:schoolId`): `router.get('/roster', verifyRole('TEACHER', 'SCHOOL_ADMIN'), GalleryController.listRoster);`
- [ ] **Step 4 (grant members list):** `src/models/galleryGrantModel.js` add after `removeMember`:
```js
  async listMembers(grantId) {
    const r = await this.db.query(
      'SELECT student_user_id AS "studentUserId" FROM gallery_grant_members WHERE grant_id = $1',
      [grantId]
    );
    return r.rows;
  }
```
`galleryController` add (near `enableMember`):
```js
  // GET /api/gallery/grants/:id/members  (bound invited TEACHER)
  static async listMembers(req, res, next) {
    try {
      const viewer = await model.resolveViewer(req.user.id);
      const g = await grants.getGrantForRevoker(req.params.id);
      if (!g || !viewer || viewer.id !== g.invited_teacher_user_id) {
        return res.status(403).json({ success: false, message: 'Only the invited teacher can view enabled students.' });
      }
      const members = await grants.listMembers(g.id);
      return res.json({ success: true, members });
    } catch (e) { return next(e); }
  }
```
Route: `router.get('/grants/:id/members', verifyRole('TEACHER'), GalleryController.listMembers);` (next to the POST members route).
- [ ] **Step 5 (tests):** CREATE `tests/integration/routes/galleryRosterMembers.spec.js` with the same harness as `galleryComments.spec.js` (env secrets, pool + notificationService mocks, `createApp(mockDb)`, `tok()`). Cases:
  1. host TEACHER `GET /api/gallery/roster` → 200 with rows (mocks: resolveViewer teacher; listRoster row) and query param `[HOST_SCHOOL]`.
  2. STUDENT `GET /api/gallery/roster` → 403.
  3. bound invited TEACHER `GET /api/gallery/grants/:id/members` → 200 (mocks: resolveViewer invited teacher; getGrantForRevoker `{ invited_teacher_user_id: <viewer> }`; listMembers row).
  4. non-bound TEACHER → 403.
- [ ] **Step 6: Run** new/changed specs then full `npx jest` → green; `npx eslint .` → 0 errors.
- [ ] **Step 7: Commit** `feat(gallery): backend enablers for frontend — portfolio flags, accept hostSchoolId, roster + member lists`.

---

## Task 2: Role-aware "School Gallery" nav link

**Files:** Modify `public/js/ui-components.js`; Create `tests/unit/public/galleryNav.test.js`.

**Interfaces — Produces:** `UIComponents.galleryNavTarget(role)` → `{label:'School Gallery', href:'/gallery.html'}` for STUDENT/TEACHER/SCHOOL_ADMIN, else `null`; `UIComponents.injectGalleryLink(role)`.

- [ ] **Step 1: Write failing jsdom test** `tests/unit/public/galleryNav.test.js` (mirrors `portfolioNav.test.js`):
```js
/** @jest-environment jsdom */
const UIComponents = require('../../../public/js/ui-components.js');

describe('UIComponents.galleryNavTarget', () => {
  test.each(['STUDENT', 'TEACHER', 'SCHOOL_ADMIN'])('%s → School Gallery', (role) => {
    expect(UIComponents.galleryNavTarget(role))
      .toEqual({ label: 'School Gallery', href: '/gallery.html' });
  });

  test('SITE_ADMIN / BIDDER / unknown → null', () => {
    expect(UIComponents.galleryNavTarget('SITE_ADMIN')).toBeNull();
    expect(UIComponents.galleryNavTarget('BIDDER')).toBeNull();
    expect(UIComponents.galleryNavTarget(undefined)).toBeNull();
  });
});
```
Run → FAIL (`galleryNavTarget` not a function).
- [ ] **Step 2: Implement** in `public/js/ui-components.js`. Refactor `injectPortfolioLink` (line ~894): move its body (everything after the `target` lookup) into a new private helper, then delegate both links to it:
```js
  static _injectNavLink(target) {
    if (!target) { return; }
    const onThisPage = window.location.pathname === target.href;

    // Top nav
    const navList = document.querySelector('.nav-list');
    if (navList && !navList.querySelector('a.nav-link[href="' + target.href + '"]')) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'nav-link';
      a.href = target.href;
      a.textContent = target.label;
      if (onThisPage) { a.setAttribute('aria-current', 'page'); }
      li.appendChild(a);
      navList.appendChild(li);
    }

    // User dropdown menu
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown && !dropdown.querySelector('a.dropdown-item[href="' + target.href + '"]')) {
      const a = document.createElement('a');
      a.className = 'dropdown-item';
      a.setAttribute('role', 'menuitem');
      a.href = target.href;
      a.textContent = target.label;
      const logout = document.getElementById('logout-btn');
      if (logout) { dropdown.insertBefore(a, logout); } else { dropdown.appendChild(a); }
    }
  }

  static injectPortfolioLink(role) {
    UIComponents._injectNavLink(UIComponents.portfolioNavTarget(role));
  }

  /**
   * Map a user role to its School Gallery nav destination.
   * @param {string} role
   * @returns {{label:string, href:string}|null}
   */
  static galleryNavTarget(role) {
    if (role === 'STUDENT' || role === 'TEACHER' || role === 'SCHOOL_ADMIN') {
      return { label: 'School Gallery', href: '/gallery.html' };
    }
    return null;
  }

  static injectGalleryLink(role) {
    UIComponents._injectNavLink(UIComponents.galleryNavTarget(role));
  }
```
In `updateAuthUI` (line ~1004), after `UIComponents.injectPortfolioLink(user.role);` add:
```js
      // School Gallery link — students + school staff
      UIComponents.injectGalleryLink(user.role);
```
- [ ] **Step 3: Run** `npx jest tests/unit/public` → PASS (incl. existing portfolioNav tests — refactor must not change behavior). Full suite green; lint 0.
- [ ] **Step 4: Commit** `feat(gallery): role-aware School Gallery nav link`.

---

## Task 3: Portfolio share/comments toggles

**Files:** Modify `public/js/portfolio.js`, `public/css/main.css`.

**Interfaces — Consumes:** `item.sharedToGallery` / `item.galleryCommentsAllowed` (Task 1), `PATCH /api/gallery/items/:id/share` `{ sharedToGallery?, commentsAllowed? }` → `{ item: { id, sharedToGallery, commentsAllowed } }`.

- [ ] **Step 1: Add the control block** in `renderCard` (portfolio.js, after `body.appendChild(badge);` line ~612):
```js
  // ---- School Gallery sharing (student per-piece opt-in + comment toggle) ----
  const galleryBox = document.createElement('div');
  galleryBox.className = 'portfolio-gallery-controls';

  const shareLabel = document.createElement('label');
  shareLabel.className = 'portfolio-gallery-toggle';
  const shareCb = document.createElement('input');
  shareCb.type = 'checkbox';
  shareCb.checked = item.sharedToGallery === true;
  shareCb.setAttribute('aria-label', 'Share ' + (item.title || 'artwork') + ' to the school gallery');
  const shareText = document.createElement('span');
  shareText.textContent = 'Share to School Gallery';
  shareLabel.appendChild(shareCb);
  shareLabel.appendChild(shareText);
  galleryBox.appendChild(shareLabel);

  const commentsLabel = document.createElement('label');
  commentsLabel.className = 'portfolio-gallery-toggle';
  const commentsCb = document.createElement('input');
  commentsCb.type = 'checkbox';
  commentsCb.checked = item.galleryCommentsAllowed === true;
  commentsCb.disabled = item.sharedToGallery !== true;
  commentsCb.setAttribute('aria-label', 'Allow gallery comments on ' + (item.title || 'artwork'));
  const commentsText = document.createElement('span');
  commentsText.textContent = 'Allow comments';
  commentsLabel.appendChild(commentsCb);
  commentsLabel.appendChild(commentsText);
  galleryBox.appendChild(commentsLabel);

  shareCb.addEventListener('change', () => updateGalleryFlags(item, { sharedToGallery: shareCb.checked }, shareCb, commentsCb));
  commentsCb.addEventListener('change', () => updateGalleryFlags(item, { commentsAllowed: commentsCb.checked }, commentsCb, commentsCb));

  body.appendChild(galleryBox);
```
- [ ] **Step 2: Add the handler** (new function near `toggleStatus`):
```js
/**
 * PATCHes a gallery flag for one of the student's own pieces and syncs the
 * card's two checkboxes. Reverts the checkbox on failure.
 * @param {object} item
 * @param {object} payload - { sharedToGallery } or { commentsAllowed }
 * @param {HTMLInputElement} changedCb - checkbox that fired
 * @param {HTMLInputElement} commentsCb - the comments checkbox (for enable/disable sync)
 */
async function updateGalleryFlags(item, payload, changedCb, commentsCb) {
  try {
    const data = await window.apiClient.patch('/api/gallery/items/' + item.id + '/share', payload);
    item.sharedToGallery = data.item.sharedToGallery === true;
    item.galleryCommentsAllowed = data.item.commentsAllowed === true;
    commentsCb.disabled = item.sharedToGallery !== true;
    if (payload.sharedToGallery === true) {
      UIComponents.showAlert('Shared to your school gallery. Your teacher manages who can see it.', 'success');
    } else if (payload.sharedToGallery === false) {
      UIComponents.showAlert('Removed from the school gallery.', 'success');
    }
  } catch (err) {
    changedCb.checked = !changedCb.checked;
    UIComponents.showAlert(err.message || 'Could not update gallery sharing.', 'error');
  }
}
```
- [ ] **Step 3: CSS** — append to `public/css/main.css`:
```css
/* School Gallery share controls on portfolio cards (Plan D) */
.portfolio-gallery-controls {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border, #ddd);
  font-size: 0.85rem;
}
.portfolio-gallery-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
}
.portfolio-gallery-toggle input[type="checkbox"] { accent-color: var(--color-primary, #4a6da7); }
```
- [ ] **Step 4: Run** full `npx jest` → green (no jsdom test renders these cards; behavior verified in live QA); `npx eslint .` → 0 errors.
- [ ] **Step 5: Commit** `feat(gallery): student share/comments toggles on portfolio cards`.

---

## Task 4: Gallery page — `gallery.html` + `gallery.js`

**Files:** Create `public/gallery.html`, `public/js/gallery.js`; Modify `public/css/main.css` (one small block).

**Interfaces — Consumes:** `GET /api/gallery/:schoolId` → `{ items: [{ id,title,medium,imageUrl,artistGrade,artistFirstName,commentsAllowed,createdAt }] }`; `GET/POST /api/gallery/items/:id/comments`.

- [ ] **Step 1: `public/gallery.html`** — full page (scaffold copied from `portfolio.html`; nav WITHOUT the hardcoded My Portfolio item so injection handles roles; title/breadcrumb "School Gallery"):
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="School Gallery - student artwork shared by the school">
    <title>School Gallery - Silent Auction Gallery</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garant:ital,wght@0,500;0,600;0,700;1,400;1,600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap">
    <link rel="stylesheet" href="/css/theme.css">
    <link rel="stylesheet" href="/css/main.css">
    <link rel="stylesheet" href="/css/responsive.css">
    <link rel="stylesheet" href="/css/accessibility.css">
    <link rel="icon" type="image/x-icon" href="/favicon/favicon.ico">
</head>
<body>
    <a href="#main-content" class="skip-to-main">Skip to main content</a>
    <header class="navbar" role="banner">
        <div class="navbar-container">
            <div class="navbar-brand">
                <a href="/" class="logo" aria-label="Silent Auction Gallery Home">
                    <img src="/images/logo/SAGLive.png" alt="Silent Auction Gallery Logo" class="logo-img">
                    <span class="logo-text">SAG</span>
                </a>
            </div>
            <nav class="navbar-nav" role="navigation" aria-label="Main Navigation">
                <ul class="nav-list">
                    <li><a href="/auctions.html" class="nav-link">Auctions</a></li>
                    <li><a href="/" class="nav-link">Home</a></li>
                    <li><a href="/bidder-welcome.html" class="nav-link">For Bidders</a></li>
                </ul>
            </nav>
            <div class="navbar-auth">
                <button class="btn btn-profile" id="user-menu-btn" aria-label="User account menu" aria-expanded="false">
                    <span id="user-name"></span>
                    <span class="menu-icon" aria-hidden="true">▼</span>
                </button>
                <div class="user-dropdown" id="user-dropdown" style="display:none;" role="menu">
                    <a href="/user-dashboard.html" class="dropdown-item" role="menuitem">Dashboard</a>
                    <button class="dropdown-item" id="logout-btn" role="menuitem">Logout</button>
                </div>
            </div>
            <button class="menu-toggle" id="menu-toggle" aria-label="Toggle navigation menu" aria-expanded="false">
                <span aria-hidden="true"></span>
                <span aria-hidden="true"></span>
                <span aria-hidden="true"></span>
            </button>
        </div>
    </header>

    <main id="main-content" class="main-content">
        <div class="container">
            <nav class="breadcrumb" role="navigation" aria-label="Breadcrumb navigation">
                <ol>
                    <li><a href="/">Home</a></li>
                    <li><span aria-current="page">School Gallery</span></li>
                </ol>
            </nav>

            <div class="page-header" role="region" aria-label="Page Header">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
                    <h1>School Gallery</h1>
                    <a class="btn btn-secondary" id="gallery-manage-link" href="/gallery-manage.html" style="display:none;">Manage Gallery</a>
                </div>
                <p class="section-help" id="gallery-subtitle">Artwork shared by students of this school.</p>
            </div>

            <p id="gallery-status" class="section-help" aria-live="polite">Loading gallery…</p>
            <div class="portfolio-grid" id="gallery-grid" aria-label="Shared artwork"></div>
        </div>
    </main>

    <!-- Full-Screen Lightbox -->
    <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Full-screen image view" hidden>
        <button class="lightbox-close-btn" id="lightbox-close" aria-label="Close image view">&times;</button>
        <img id="lightbox-img" src="" alt="" class="lightbox-img-full">
    </div>

    <!-- Comment Thread Modal (approved comments + pre-moderated compose) -->
    <div class="modal" id="comment-modal" role="dialog" aria-modal="true" aria-labelledby="comment-modal-title" hidden style="display:none;">
        <div class="modal-content modal-medium">
            <button class="modal-close" id="comment-modal-close" aria-label="Close comment thread">&times;</button>
            <h2 id="comment-modal-title">Comments</h2>
            <div class="comment-thread" id="comment-thread">
                <ul class="comment-thread__list" id="comment-thread-list" aria-live="polite" aria-label="Comment thread">
                    <li class="comment-thread__empty" id="comment-thread-empty">Loading comments…</li>
                </ul>
                <div class="comment-thread__compose" id="comment-compose" style="display:none;">
                    <p class="section-help">Comments are reviewed by a teacher before they appear.</p>
                    <label for="comment-body-input" class="sr-only">Write a comment</label>
                    <textarea id="comment-body-input" class="form-control" placeholder="Write a kind comment… (max 2000 characters)" maxlength="2000" rows="3" aria-describedby="comment-char-count"></textarea>
                    <p class="comment-thread__char-count" id="comment-char-count" aria-live="polite">0 / 2000</p>
                    <button type="button" class="btn btn-primary btn-sm comment-thread__submit" id="comment-submit-btn">Post Comment</button>
                </div>
            </div>
        </div>
    </div>

    <div id="alert-container" class="alert-container" role="region" aria-live="polite" aria-atomic="true"></div>

    <footer class="footer" role="contentinfo">
        <div class="container">
            <div class="footer-content">
                <div class="footer-section">
                    <h3>About SAG</h3>
                    <p>Silent Auction Gallery supports education through art.</p>
                </div>
                <div class="footer-section">
                    <h3>Quick Links</h3>
                    <ul>
                        <li><a href="/auctions.html">Auctions</a></li>
                        <li><a href="/">Home</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h3>Legal</h3>
                    <ul>
                        <li><a href="/privacy.html">Privacy Policy</a></li>
                        <li><a href="/terms.html">Terms of Service</a></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2026 Silent Auction Gallery. All rights reserved.</p>
            </div>
        </div>
    </footer>

    <script src="/js/theme-manager.js"></script>
    <script src="/js/accessibility.js"></script>
    <script src="/js/api-client.js"></script>
    <script src="/js/auth-manager.js"></script>
    <script src="/js/ui-components.js"></script>
    <script src="/js/gallery.js"></script>
</body>
</html>
```
- [ ] **Step 2: `public/js/gallery.js`:**
```js
/**
 * School Gallery page — renders a school's shared artwork with pre-moderated
 * comment threads.
 *  - School: ?school=<id> URL param, else the viewer's own schoolId.
 *  - All user-derived text via DOM APIs / .textContent (XSS rule).
 *  - Comments: GET shows APPROVED only; POST is held for teacher approval.
 */

/** The school whose gallery is shown. */
let _schoolId = null;
/** Current viewer ({ role, schoolId, ... }) from authManager. */
let _viewer = null;
/** Items keyed by id (for the comment modal). */
let _itemsById = {};
/** Item whose comment thread is open (null when closed). */
let _commentItemId = null;

/* ========================= Gallery load & render ========================= */

async function loadGallery() {
  const statusEl = document.getElementById('gallery-status');
  const grid = document.getElementById('gallery-grid');
  grid.textContent = '';
  try {
    const data = await window.apiClient.get('/api/gallery/' + encodeURIComponent(_schoolId));
    const items = (data && data.items) ? data.items : [];
    _itemsById = {};
    items.forEach((it) => { _itemsById[it.id] = it; });
    if (items.length === 0) {
      statusEl.textContent = 'No artwork has been shared to this gallery yet.';
      return;
    }
    statusEl.textContent = '';
    items.forEach((item) => grid.appendChild(renderGalleryCard(item)));
  } catch (err) {
    statusEl.textContent = err.message || 'You do not have access to this gallery.';
  }
}

/**
 * Builds one gallery card. First name only — never full identity.
 * @param {object} item
 * @returns {HTMLElement}
 */
function renderGalleryCard(item) {
  const card = document.createElement('div');
  card.className = 'portfolio-card';
  card.dataset.id = item.id;

  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'portfolio-card-img-wrapper';
  if (item.imageUrl) {
    const img = document.createElement('img');
    img.src = item.imageUrl;
    img.alt = item.title || 'Artwork image';
    img.className = 'portfolio-card-img';
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'View full-screen image of ' + (item.title || 'artwork'));
    img.addEventListener('click', () => openLightbox(item.imageUrl, item.title));
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(item.imageUrl, item.title); }
    });
    imgWrapper.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'portfolio-card-img-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = 'No Image';
    imgWrapper.appendChild(placeholder);
  }
  card.appendChild(imgWrapper);

  const body = document.createElement('div');
  body.className = 'portfolio-card-body';

  const title = document.createElement('h3');
  title.className = 'portfolio-card-title';
  title.textContent = item.title || '(Untitled)';
  body.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'portfolio-card-meta';
  meta.textContent = ['by ' + (item.artistFirstName || 'a student'), item.medium, item.artistGrade]
    .filter(Boolean).join(' · ');
  body.appendChild(meta);
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'portfolio-card-actions';
  if (item.commentsAllowed) {
    const commentBtn = document.createElement('button');
    commentBtn.type = 'button';
    commentBtn.className = 'portfolio-comment-btn';
    commentBtn.setAttribute('aria-label', 'Comments for ' + (item.title || 'artwork'));
    const label = document.createElement('span');
    label.textContent = 'Comments';
    commentBtn.appendChild(label);
    commentBtn.addEventListener('click', () => openCommentThread(item.id));
    actions.appendChild(commentBtn);
  }
  card.appendChild(actions);
  return card;
}

/* ============================== Lightbox ================================ */

function openLightbox(src, title) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (!lb || !img) { return; }
  img.src = src;
  img.alt = title || 'Artwork image';
  lb.hidden = false;
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) { lb.hidden = true; }
}

/* =========================== Comment thread ============================= */

async function openCommentThread(itemId) {
  _commentItemId = itemId;
  const modal = document.getElementById('comment-modal');
  if (!modal) { return; }
  modal.hidden = false;
  modal.style.display = 'flex';

  // Compose box: students only (backend also enforces STUDENTS_ONLY).
  const compose = document.getElementById('comment-compose');
  if (compose) {
    compose.style.display = (_viewer && _viewer.role === 'STUDENT') ? '' : 'none';
  }
  await loadComments(itemId);
  const textarea = document.getElementById('comment-body-input');
  if (textarea) { textarea.value = ''; updateCharCount(); }
}

function closeCommentThread() {
  const modal = document.getElementById('comment-modal');
  if (modal) { modal.hidden = true; modal.style.display = 'none'; }
  _commentItemId = null;
}

async function loadComments(itemId) {
  const list = document.getElementById('comment-thread-list');
  if (!list) { return; }
  list.textContent = '';
  const loading = document.createElement('li');
  loading.className = 'comment-thread__empty';
  loading.textContent = 'Loading comments…';
  list.appendChild(loading);
  try {
    const data = await window.apiClient.get('/api/gallery/items/' + encodeURIComponent(itemId) + '/comments');
    const comments = (data && data.comments) ? data.comments : [];
    list.textContent = '';
    if (comments.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'comment-thread__empty';
      empty.textContent = 'No comments yet.';
      list.appendChild(empty);
      return;
    }
    comments.forEach((c) => {
      const li = document.createElement('li');
      li.className = 'comment-thread__item';
      const author = document.createElement('strong');
      author.textContent = c.authorFirstName || 'A student';
      li.appendChild(author);
      const bodyP = document.createElement('p');
      bodyP.textContent = c.body;
      li.appendChild(bodyP);
      const when = document.createElement('small');
      const d = new Date(c.createdAt);
      when.textContent = isNaN(d.getTime()) ? '' : d.toLocaleDateString();
      li.appendChild(when);
      list.appendChild(li);
    });
  } catch (err) {
    list.textContent = '';
    const errLi = document.createElement('li');
    errLi.className = 'comment-thread__empty';
    errLi.textContent = err.message || 'Could not load comments.';
    list.appendChild(errLi);
  }
}

async function submitComment() {
  if (!_commentItemId) { return; }
  const textarea = document.getElementById('comment-body-input');
  const body = textarea ? textarea.value.trim() : '';
  if (body.length < 1) {
    UIComponents.showAlert('Write a comment first.', 'error');
    return;
  }
  try {
    await window.apiClient.post('/api/gallery/items/' + encodeURIComponent(_commentItemId) + '/comments', { body });
    if (textarea) { textarea.value = ''; updateCharCount(); }
    UIComponents.showAlert('Comment submitted — it will appear once a teacher approves it.', 'success');
  } catch (err) {
    UIComponents.showAlert(err.message || 'Could not post your comment.', 'error');
  }
}

function updateCharCount() {
  const textarea = document.getElementById('comment-body-input');
  const counter = document.getElementById('comment-char-count');
  if (textarea && counter) { counter.textContent = textarea.value.length + ' / 2000'; }
}

/* ================================ Init ================================== */

document.addEventListener('DOMContentLoaded', () => {
  UIComponents.requireAuth('/');
  UIComponents.initializeNavbar();

  _viewer = window.authManager ? window.authManager.getUser() : null;
  const params = new URLSearchParams(window.location.search);
  _schoolId = params.get('school') || (_viewer && _viewer.schoolId) || null;

  const statusEl = document.getElementById('gallery-status');
  if (!_schoolId) {
    if (statusEl) { statusEl.textContent = 'No gallery to show. Ask your teacher for a gallery link.'; }
  } else {
    // Staff of the shown school get the management entry point.
    if (_viewer && (_viewer.role === 'TEACHER' || _viewer.role === 'SCHOOL_ADMIN') &&
        (!params.get('school') || params.get('school') === _viewer.schoolId)) {
      const manage = document.getElementById('gallery-manage-link');
      if (manage) { manage.style.display = ''; }
    }
    loadGallery();
  }

  const lbClose = document.getElementById('lightbox-close');
  if (lbClose) { lbClose.addEventListener('click', closeLightbox); }
  const lb = document.getElementById('lightbox');
  if (lb) { lb.addEventListener('click', (e) => { if (e.target === lb) { closeLightbox(); } }); }

  const cClose = document.getElementById('comment-modal-close');
  if (cClose) { cClose.addEventListener('click', closeCommentThread); }
  const cSubmit = document.getElementById('comment-submit-btn');
  if (cSubmit) { cSubmit.addEventListener('click', submitComment); }
  const cInput = document.getElementById('comment-body-input');
  if (cInput) { cInput.addEventListener('input', updateCharCount); }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeCommentThread(); closeLightbox(); }
  });
});
```
- [ ] **Step 3: Run** full `npx jest` → green; `npx eslint .` → 0 errors (public/ is linted — match its rules).
- [ ] **Step 4: Commit** `feat(gallery): School Gallery page with pre-moderated comment threads`.

---

## Task 5: Invite-accept page — `gallery-invite.html` + `gallery-invite.js`

**Files:** Create `public/gallery-invite.html`, `public/js/gallery-invite.js`.

**Interfaces — Consumes:** `POST /api/gallery/grants/:id/accept` `{ token }` → `{ success, grantId, status, hostSchoolId }` (Task 1); errors: 404 `INVALID_TOKEN`, 409 `BAND_MISMATCH` (explicit message), 403 role. URL shape (already emailed by Plan B): `/gallery-invite.html?grant=<id>&token=<raw>`.

- [ ] **Step 1: `public/gallery-invite.html`** — same scaffold as `gallery.html` (head, navbar, footer, alert container, scripts) with this `<main>` and `gallery-invite.js` as the page script:
```html
    <main id="main-content" class="main-content">
        <div class="container">
            <div class="page-header" role="region" aria-label="Page Header">
                <h1>Gallery Invitation</h1>
            </div>
            <section class="card" aria-labelledby="invite-h" style="max-width:560px;margin:0 auto;padding:1.5rem;">
                <h2 id="invite-h" class="sr-only">Invitation status</h2>
                <p id="invite-status" aria-live="polite">Checking your invitation…</p>
                <div id="invite-actions" style="display:none;margin-top:1rem;">
                    <button type="button" class="btn btn-primary" id="invite-accept-btn">Accept Invitation</button>
                </div>
                <div id="invite-success" style="display:none;margin-top:1rem;">
                    <a class="btn btn-primary" id="invite-gallery-link" href="/gallery.html">View the Gallery</a>
                    <a class="btn btn-secondary" href="/gallery-manage.html">Enable My Students</a>
                </div>
                <div id="invite-login" style="display:none;margin-top:1rem;">
                    <a class="btn btn-primary" href="/login.html">Log In</a>
                </div>
            </section>
        </div>
    </main>
```
- [ ] **Step 2: `public/js/gallery-invite.js`:**
```js
/**
 * Gallery invitation acceptance page. Link arrives by email:
 *   /gallery-invite.html?grant=<id>&token=<raw>
 * Must be logged in as a TEACHER/SCHOOL_ADMIN of a same-band school to accept.
 */

document.addEventListener('DOMContentLoaded', () => {
  UIComponents.initializeNavbar();

  const statusEl = document.getElementById('invite-status');
  const actionsEl = document.getElementById('invite-actions');
  const successEl = document.getElementById('invite-success');
  const loginEl = document.getElementById('invite-login');

  const params = new URLSearchParams(window.location.search);
  const grantId = params.get('grant');
  const token = params.get('token');

  if (!grantId || !token) {
    statusEl.textContent = 'This invitation link is invalid or incomplete. Please use the link from your email.';
    return;
  }

  const user = window.authManager ? window.authManager.getUser() : null;
  if (!user) {
    statusEl.textContent = 'Please log in with your teacher or school-admin account, then open this invitation link again from your email.';
    loginEl.style.display = '';
    return;
  }
  if (user.role !== 'TEACHER' && user.role !== 'SCHOOL_ADMIN') {
    statusEl.textContent = 'Only a teacher or school admin can accept a gallery invitation.';
    return;
  }

  statusEl.textContent = 'Another school has invited your school to view their student art gallery.';
  actionsEl.style.display = '';

  const acceptBtn = document.getElementById('invite-accept-btn');
  acceptBtn.addEventListener('click', async () => {
    acceptBtn.disabled = true;
    statusEl.textContent = 'Accepting…';
    try {
      const data = await window.apiClient.post(
        '/api/gallery/grants/' + encodeURIComponent(grantId) + '/accept', { token });
      statusEl.textContent = 'Invitation accepted! You can now view the gallery and enable your students.';
      actionsEl.style.display = 'none';
      const link = document.getElementById('invite-gallery-link');
      if (link && data.hostSchoolId) {
        link.href = '/gallery.html?school=' + encodeURIComponent(data.hostSchoolId);
      }
      successEl.style.display = '';
    } catch (err) {
      acceptBtn.disabled = false;
      statusEl.textContent = err.message || 'Could not accept this invitation.';
    }
  });
});
```
- [ ] **Step 3: Run** full `npx jest` → green; `npx eslint .` → 0 errors.
- [ ] **Step 4: Commit** `feat(gallery): invitation acceptance page (gallery-invite.html)`.

---

## Task 6: Management page — `gallery-manage.html` + `gallery-manage.js`

**Files:** Create `public/gallery-manage.html`, `public/js/gallery-manage.js`.

**Interfaces — Consumes:** `GET /api/gallery/comments/pending`, `POST /api/gallery/comments/:id/approve|reject`, `GET /api/gallery/roster`, `POST /api/gallery/roster` `{studentUserId}`, `DELETE /api/gallery/roster/:studentUserId`, `POST /api/gallery/grants` `{invitedEmail}`, `GET /api/gallery/grants` → `{host, invited}`, `POST /api/gallery/grants/:id/revoke`, `GET/POST/DELETE /api/gallery/grants/:id/members`, `GET /api/teacher/students` → `{registered:[{userId, studentName, ...}]}`.

- [ ] **Step 1: `public/gallery-manage.html`** — same scaffold; `<main>`:
```html
    <main id="main-content" class="main-content">
        <div class="container">
            <nav class="breadcrumb" role="navigation" aria-label="Breadcrumb navigation">
                <ol>
                    <li><a href="/">Home</a></li>
                    <li><a href="/gallery.html">School Gallery</a></li>
                    <li><span aria-current="page">Manage</span></li>
                </ol>
            </nav>
            <div class="page-header" role="region" aria-label="Page Header">
                <h1>Manage School Gallery</h1>
            </div>

            <section aria-labelledby="moderation-h" style="margin-bottom:var(--spacing-2xl);">
                <h2 id="moderation-h">Comments Awaiting Approval (<span id="pending-count">0</span>)</h2>
                <p class="section-help">Comments never appear in the gallery until you approve them.</p>
                <ul id="pending-list" class="comment-thread__list" aria-live="polite"></ul>
            </section>

            <section aria-labelledby="roster-h" style="margin-bottom:var(--spacing-2xl);">
                <h2 id="roster-h">Gallery Roster</h2>
                <p class="section-help">Only students on the roster can have shared artwork in the gallery.</p>
                <div class="form-row" style="align-items:flex-end;gap:1rem;">
                    <div class="form-group" style="flex:1;">
                        <label for="roster-student-select">Add a student</label>
                        <select id="roster-student-select" class="form-control"><option value="">Loading students…</option></select>
                    </div>
                    <button type="button" class="btn btn-primary" id="roster-add-btn">Add to Roster</button>
                </div>
                <ul id="roster-list" aria-live="polite" style="list-style:none;padding:0;"></ul>
            </section>

            <section aria-labelledby="grants-h" style="margin-bottom:var(--spacing-2xl);">
                <h2 id="grants-h">Share With Another School</h2>
                <p class="section-help">Invite a teacher or school admin (same grade band) by email. They must be registered to accept.</p>
                <div class="form-row" style="align-items:flex-end;gap:1rem;" id="invite-row">
                    <div class="form-group" style="flex:1;">
                        <label for="invite-email-input">Teacher / admin email</label>
                        <input type="email" id="invite-email-input" class="form-control" placeholder="teacher@otherschool.edu" autocomplete="off">
                    </div>
                    <button type="button" class="btn btn-primary" id="invite-send-btn">Send Invitation</button>
                </div>
                <ul id="host-grants-list" aria-live="polite" style="list-style:none;padding:0;"></ul>
            </section>

            <section aria-labelledby="enable-h">
                <h2 id="enable-h">Galleries Shared With Us</h2>
                <p class="section-help">For each accepted invitation, choose which of your students may view (least privilege).</p>
                <div id="invited-grants"></div>
            </section>
        </div>
    </main>
```
- [ ] **Step 2: `public/js/gallery-manage.js`:**
```js
/**
 * School Gallery management (TEACHER / SCHOOL_ADMIN):
 *  - host: comment moderation queue, roster, cross-school invitations + revoke
 *  - invited teacher: enable/disable own students per accepted grant
 * All user-derived text via DOM APIs / .textContent (XSS rule).
 */

let _viewer = null;
/** registered students of this teacher: [{ userId, studentName }] */
let _students = [];

/* ========================= Moderation queue ========================= */

async function loadPending() {
  const list = document.getElementById('pending-list');
  const count = document.getElementById('pending-count');
  list.textContent = '';
  try {
    const data = await window.apiClient.get('/api/gallery/comments/pending');
    const rows = (data && data.comments) ? data.comments : [];
    count.textContent = String(rows.length);
    if (rows.length === 0) {
      const li = document.createElement('li');
      li.className = 'comment-thread__empty';
      li.textContent = 'No comments waiting.';
      list.appendChild(li);
      return;
    }
    rows.forEach((c) => {
      const li = document.createElement('li');
      li.className = 'comment-thread__item';
      const head = document.createElement('p');
      const author = document.createElement('strong');
      author.textContent = c.authorFirstName || 'A student';
      head.appendChild(author);
      const origin = document.createElement('span');
      origin.textContent = (c.authorOrigin === 'CROSS_SCHOOL' ? ' (another school)' : '') +
        ' on “' + (c.itemTitle || 'Untitled') + '”';
      head.appendChild(origin);
      li.appendChild(head);
      const bodyP = document.createElement('p');
      bodyP.textContent = c.body;
      li.appendChild(bodyP);
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '0.5rem';
      const approve = document.createElement('button');
      approve.type = 'button';
      approve.className = 'btn btn-primary btn-sm';
      approve.textContent = 'Approve';
      approve.addEventListener('click', () => moderate(c.id, 'approve'));
      const reject = document.createElement('button');
      reject.type = 'button';
      reject.className = 'btn btn-secondary btn-sm';
      reject.textContent = 'Reject';
      reject.addEventListener('click', () => moderate(c.id, 'reject'));
      actions.appendChild(approve);
      actions.appendChild(reject);
      li.appendChild(actions);
      list.appendChild(li);
    });
  } catch (err) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = err.message || 'Could not load the moderation queue.';
    list.appendChild(li);
  }
}

async function moderate(commentId, action) {
  try {
    await window.apiClient.post('/api/gallery/comments/' + encodeURIComponent(commentId) + '/' + action, {});
    UIComponents.showAlert(action === 'approve' ? 'Comment approved.' : 'Comment rejected.', 'success');
    loadPending();
  } catch (err) {
    UIComponents.showAlert(err.message || 'Could not moderate that comment.', 'error');
  }
}

/* ============================= Roster ============================== */

async function loadRoster() {
  const list = document.getElementById('roster-list');
  list.textContent = '';
  try {
    const data = await window.apiClient.get('/api/gallery/roster');
    const roster = (data && data.roster) ? data.roster : [];
    populateStudentSelect(roster);
    if (roster.length === 0) {
      const li = document.createElement('li');
      li.className = 'comment-thread__empty';
      li.textContent = 'No students on the roster yet.';
      list.appendChild(li);
      return;
    }
    roster.forEach((s) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.alignItems = 'center';
      li.style.padding = '0.35rem 0';
      const name = document.createElement('span');
      name.textContent = ((s.firstName || '') + ' ' + (s.lastName || '')).trim() +
        (s.gradeLevel ? ' · ' + s.gradeLevel : '');
      li.appendChild(name);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-secondary btn-sm';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        try {
          await window.apiClient.delete('/api/gallery/roster/' + encodeURIComponent(s.studentUserId));
          UIComponents.showAlert('Removed from the roster. Their shared items leave the gallery immediately.', 'success');
          loadRoster();
        } catch (err) {
          UIComponents.showAlert(err.message || 'Could not remove that student.', 'error');
        }
      });
      li.appendChild(remove);
      list.appendChild(li);
    });
  } catch (err) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = err.message || 'Could not load the roster.';
    list.appendChild(li);
  }
}

/** Fill the add-student select with registered students NOT already rostered. */
function populateStudentSelect(roster) {
  const select = document.getElementById('roster-student-select');
  if (!select) { return; }
  const onRoster = new Set(roster.map((s) => s.studentUserId));
  select.textContent = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = _students.length ? 'Choose a student…' : 'No registered students found';
  select.appendChild(placeholder);
  _students
    .filter((s) => s.userId && !onRoster.has(s.userId))
    .forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.userId;
      opt.textContent = s.studentName || s.studentEmail || s.userId;
      select.appendChild(opt);
    });
}

async function addToRoster() {
  const select = document.getElementById('roster-student-select');
  const studentUserId = select ? select.value : '';
  if (!studentUserId) {
    UIComponents.showAlert('Choose a student first.', 'error');
    return;
  }
  try {
    await window.apiClient.post('/api/gallery/roster', { studentUserId });
    UIComponents.showAlert('Student added to the gallery roster.', 'success');
    loadRoster();
  } catch (err) {
    UIComponents.showAlert(err.message || 'Could not add that student.', 'error');
  }
}

/* ======================= Grants (host side) ======================== */

async function loadGrants() {
  const hostList = document.getElementById('host-grants-list');
  const invitedBox = document.getElementById('invited-grants');
  hostList.textContent = '';
  invitedBox.textContent = '';
  try {
    const data = await window.apiClient.get('/api/gallery/grants');
    renderHostGrants((data && data.host) ? data.host : [], hostList);
    renderInvitedGrants((data && data.invited) ? data.invited : [], invitedBox);
  } catch (err) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = err.message || 'Could not load invitations.';
    hostList.appendChild(li);
  }
}

function renderHostGrants(grants, list) {
  if (grants.length === 0) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = 'No invitations sent yet.';
    list.appendChild(li);
    return;
  }
  grants.forEach((g) => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.padding = '0.35rem 0';
    const label = document.createElement('span');
    label.textContent = g.invited_email + ' — ' + g.status;
    li.appendChild(label);
    if (g.status === 'PENDING' || g.status === 'ACCEPTED') {
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'btn btn-secondary btn-sm';
      revoke.textContent = 'Revoke';
      revoke.addEventListener('click', async () => {
        try {
          await window.apiClient.post('/api/gallery/grants/' + encodeURIComponent(g.id) + '/revoke', {});
          UIComponents.showAlert('Access revoked. It stops working immediately.', 'success');
          loadGrants();
        } catch (err) {
          UIComponents.showAlert(err.message || 'Could not revoke.', 'error');
        }
      });
      li.appendChild(revoke);
    }
    list.appendChild(li);
  });
}

async function sendInvite() {
  const input = document.getElementById('invite-email-input');
  const invitedEmail = input ? input.value.trim() : '';
  if (!invitedEmail) {
    UIComponents.showAlert('Enter the email to invite.', 'error');
    return;
  }
  try {
    const data = await window.apiClient.post('/api/gallery/grants', { invitedEmail });
    if (input) { input.value = ''; }
    UIComponents.showAlert(data.inviteSent === false
      ? 'Invitation created, but the email could not be sent — share the link manually.'
      : 'Invitation sent.', 'success');
    loadGrants();
  } catch (err) {
    UIComponents.showAlert(err.message || 'Could not send the invitation.', 'error');
  }
}

/* ================== Enablement (invited-teacher side) ================== */

function renderInvitedGrants(grants, box) {
  const accepted = grants.filter((g) => g.status === 'ACCEPTED');
  if (accepted.length === 0) {
    const p = document.createElement('p');
    p.className = 'comment-thread__empty';
    p.textContent = 'No other school has shared a gallery with you.';
    box.appendChild(p);
    return;
  }
  accepted.forEach((g) => {
    const section = document.createElement('div');
    section.style.marginBottom = '1rem';
    const head = document.createElement('p');
    const link = document.createElement('a');
    link.href = '/gallery.html?school=' + encodeURIComponent(g.host_school_id);
    link.textContent = 'View shared gallery';
    head.appendChild(link);
    section.appendChild(head);
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    section.appendChild(ul);
    box.appendChild(section);
    renderEnablement(g, ul);
  });
}

async function renderEnablement(grant, ul) {
  let enabled = new Set();
  try {
    const data = await window.apiClient.get('/api/gallery/grants/' + encodeURIComponent(grant.id) + '/members');
    enabled = new Set(((data && data.members) || []).map((m) => m.studentUserId));
  } catch (err) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = err.message || 'Could not load enabled students.';
    ul.appendChild(li);
    return;
  }
  const registered = _students.filter((s) => s.userId);
  if (registered.length === 0) {
    const li = document.createElement('li');
    li.className = 'comment-thread__empty';
    li.textContent = 'No registered students to enable.';
    ul.appendChild(li);
    return;
  }
  registered.forEach((s) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'portfolio-gallery-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = enabled.has(s.userId);
    cb.setAttribute('aria-label', 'Allow ' + (s.studentName || 'student') + ' to view the shared gallery');
    const name = document.createElement('span');
    name.textContent = s.studentName || s.studentEmail || s.userId;
    label.appendChild(cb);
    label.appendChild(name);
    li.appendChild(label);
    ul.appendChild(li);
    cb.addEventListener('change', async () => {
      try {
        if (cb.checked) {
          await window.apiClient.post('/api/gallery/grants/' + encodeURIComponent(grant.id) + '/members',
            { studentUserId: s.userId });
        } else {
          await window.apiClient.delete('/api/gallery/grants/' + encodeURIComponent(grant.id) + '/members/' +
            encodeURIComponent(s.userId));
        }
      } catch (err) {
        cb.checked = !cb.checked;
        UIComponents.showAlert(err.message || 'Could not update that student.', 'error');
      }
    });
  });
}

/* ================================ Init ================================== */

document.addEventListener('DOMContentLoaded', async () => {
  UIComponents.requireAuth('/');
  UIComponents.initializeNavbar();

  _viewer = window.authManager ? window.authManager.getUser() : null;
  if (!_viewer || (_viewer.role !== 'TEACHER' && _viewer.role !== 'SCHOOL_ADMIN')) {
    window.location.href = '/gallery.html';
    return;
  }

  const addBtn = document.getElementById('roster-add-btn');
  if (addBtn) { addBtn.addEventListener('click', addToRoster); }
  const inviteBtn = document.getElementById('invite-send-btn');
  if (inviteBtn) { inviteBtn.addEventListener('click', sendInvite); }

  // Student list first (roster select + enablement need it); TEACHER only —
  // SCHOOL_ADMIN has no /api/teacher/students scope.
  if (_viewer.role === 'TEACHER') {
    try {
      const data = await window.apiClient.get('/api/teacher/students');
      _students = (data && data.registered) ? data.registered : [];
    } catch (err) { _students = []; }
  }

  loadPending();
  loadRoster();
  loadGrants();
});
```
- [ ] **Step 3: Run** full `npx jest` → green; `npx eslint .` → 0 errors.
- [ ] **Step 4: Commit** `feat(gallery): staff management page — moderation queue, roster, invites, enablement`.

---

## Self-review (plan vs spec — frontend subset)
- Student per-piece opt-in + comment toggle UI → Task 3 (needs flags from Task 1a). ✅
- Gallery view (guarded API; PII-minimal fields only rendered) → Task 4. ✅
- Comment thread: APPROVED-only display, student-only compose, "awaiting approval" messaging (pre-moderation surfaced to users) → Task 4. ✅
- Invite email link target `/gallery-invite.html?grant=&token=` (Plan B `_sendGrantInvite`) now exists → Task 5; band-mismatch/expired errors surface backend messages verbatim. ✅
- Teacher decides to share externally; enablement least-privilege UI; revoke immediate → Task 6. ✅
- Host-only moderation queue UI → Task 6 (`GET /comments/pending` is host-scoped server-side). ✅
- Roster management UI → Task 6 (list endpoint added in Task 1c). ✅
- Nav discoverability → Task 2 (SITE_ADMIN excluded: no default school; they use admin tooling). ✅
- XSS: every render path in Tasks 3–6 uses `createElement`/`.textContent`. ✅
- Type consistency: `hostSchoolId` (Task 1b) consumed in Task 5; `roster[].studentUserId/firstName/lastName/gradeLevel` (1c) in Task 6; `members[].studentUserId` (1d) in Task 6; `items[].sharedToGallery/galleryCommentsAllowed` (1a) in Task 3; `_injectNavLink` used by both nav links (Task 2). ✅
- Out of scope: "galleries I can view" discovery listing for enabled students (teacher shares the link), comment notifications, SITE_ADMIN gallery browser, archived semesters (spec v1 exclusions).

## After Plan D
Deploy: VPS redeploy picks up Plans B+C+D (startup DDL creates `gallery_grants`, `gallery_grant_members`, `gallery_comments`). Live QA checklist: share a piece → appears in gallery; comment → hidden until approve; invite/accept across bands → explicit error; revoke → immediate 403; transfer → items vanish + opt-in reset.
