# Silent Auction Gallery

**Silent Auction Gallery (SAG) turns student artwork into funding for school art programs.** Teachers host online silent auctions of their students' art; parents, neighbors, and local supporters bid; and the proceeds go wherever the school community needs them most — art supplies, classroom equipment, field trips, or a charity chosen by the teacher and the students themselves.

Live at **[SAG.live](https://sag.live)**.

## Why it matters

Art programs are often the first to lose funding. SAG gives schools a self-service fundraising platform that:

- **Celebrates student work.** Every piece is exhibited in a gallery, not a spreadsheet — students see their art valued by their community.
- **Keeps money in the classroom.** Schools run their own auctions and direct 100% of proceeds to the cause they choose, minus a small transparent platform fee that sustains the service.
- **Involves students safely.** Students participate — building portfolios, opting artwork into galleries, receiving peer feedback — inside guardrails designed for minors from the ground up (see [Safeguarding students](#safeguarding-students) below).
- **Connects schools.** Art teachers can share their school's gallery with same-grade-band classes at other schools, so students see and encourage each other's work across communities.

## What the platform does

### Fundraising auctions
- Full auction lifecycle with an approval workflow: draft → school approval → live → ended.
- **Scheduled automation:** auctions go live and close on their scheduled dates automatically — winners are determined, winning bids recorded, and winner notifications emailed without staff intervention. Anti-sniping auto-extension is supported.
- **Real-time bidding** over WebSockets with live updates, bid history, and time-remaining displays.
- **Printable QR labels** for each artwork so in-person exhibition visitors can bid from their phones.
- **Payments** through pluggable gateways — Stripe, Square, and PayPal integrations — with gateway credentials stored encrypted. Each school connects its own account; funds flow to the school, not to us.

### Student portfolios
- Students build a portfolio of their work (in-progress and completed pieces), submit finished pieces to auctions, and track submission status.
- Teachers review, approve, or return submissions, and moderate portfolio content, including bulk-upload tooling for whole-class onboarding.
- Per-piece comment threads let teachers give feedback and students ask questions.

### School galleries (multi-school exhibition)
- Every school gets a gallery of student work, independent of auctions. Sharing is **opt-in per piece by the student** — consent is the default question, not an afterthought.
- Teachers curate a roster of participating students and can invite a teacher at another school (same grade band only) to view the gallery; the invited teacher then chooses which of their students may view it — least-privilege at every step.
- Gallery comments are **pre-moderated**: nothing a student writes is visible to anyone until a teacher at the host school approves it. Cross-school commenting is limited to students in the same grade as the artist.
- Revoking a share, or a student changing schools, withdraws access immediately and resets the student's sharing consent.

### Roles for everyone involved
Site administrators, school administrators, teachers, students, and bidders each get exactly the capabilities they need — multi-school (multi-tenant) with deny-by-default authorization between schools.

## Safeguarding students

SAG is built for minors' participation, and the protections are structural, not bolted on:

- **COPPA-aligned onboarding:** students register through teacher-issued invitations with a parental-consent flow; staff accounts are provisioned by administrators through a separate path.
- **PII minimization (FERPA-minded):** outside a student's own school, viewers see artwork, title, medium, grade, and **first name only** — never surnames, emails, or birthdates. Public auction pages never expose bidder identities or student contact information.
- **Human review before visibility:** artwork enters galleries only by student opt-in and teacher rostering; every gallery comment is held until a teacher approves it; auction submissions pass teacher review.
- **Comprehensive audit trail:** compliance-relevant actions — cross-school access, invitations, consent changes, moderation decisions, auction closures — are written to an append-only audit log, and denied access attempts are recorded as security events.
- **Immediate revocation:** access grants are re-checked live on every request; nothing is cached that could outlive a revocation.

## Security posture

- Authentication with JWT sessions, bcrypt password hashing, and **two-factor authentication (TOTP)** for staff accounts.
- Hardened HTTP surface: Helmet security headers, rate limiting, input validation and sanitization, parameterized SQL throughout, HTTPS support.
- All user-generated text is rendered with safe DOM APIs (no HTML injection paths).
- Automated security gates in CI: dependency and container vulnerability scanning plus a security-focused ESLint ruleset that blocks new findings on every change.
- Payment gateway credentials encrypted at rest; ongoing hardening is tracked in the project's security specs.

## Accessibility & inclusion

The interface is built to WCAG-informed standards: semantic landmarks, skip-to-content links, ARIA labeling, full keyboard operability (including carousels, modals, and lightboxes), respect for OS dark-mode preferences, and responsive layouts from phones (QR-code bidding at exhibitions) to desktops.

## Engineering stewardship

Grant-funded software should be maintainable. SAG is:

- **Tested:** 950+ automated unit and integration tests run on every change.
- **Continuously integrated:** four GitHub Actions pipelines — build & deploy, tests, lint/code-quality, and security scanning — gate every merge; production deploys are tag-gated with automated database backups.
- **Documented:** every feature ships with a written design spec and implementation plan (see `docs/superpowers/specs/` and `docs/superpowers/plans/`), including threat models for the safety-critical subsystems.
- **Boring, proven technology:** Node.js/Express, PostgreSQL, and a dependency-light vanilla-JavaScript frontend — no framework churn, low hosting cost, easy for future maintainers.

## Getting started (development)

### Prerequisites
- Node.js 18+
- PostgreSQL
- npm

### Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file based on `.env.example` (database, JWT secrets, SMTP, payment gateway keys).
3. Initialize the database with `schema.sql` (the server also applies idempotent migrations on startup).
4. Run it:
   ```bash
   npm run dev
   ```

### Scripts
- `npm start` — production mode
- `npm run dev` — development mode with reload
- `npm test` — full test suite (`test:unit` / `test:integration` for subsets)
- `npm run lint` — ESLint with the security ruleset (`lint:fix` to auto-fix)

### Project structure
```
src/
├── controllers/     - Request handlers
├── middleware/      - Auth, access guards, validation
├── models/          - Database access
├── routes/          - API routes (mounted under /api)
├── services/        - Business logic (auctions, bidding, payments, scheduler, notifications)
└── utils/           - Shared utilities

public/              - Frontend (static HTML/CSS/JS, no build step)
tests/               - Unit + integration suites (Jest & supertest)
docs/superpowers/    - Design specs and implementation plans
```

## Contributing

Follow the existing patterns, keep the test suite green (`npm test`), and keep lint at zero errors (`npm run lint`). Every change is expected to arrive with tests.

## License

MIT License
