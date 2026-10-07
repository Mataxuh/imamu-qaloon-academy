# Imamu Qaloon Academy (IQA)

## Project Bible · Portfolio and Technical Showcase

> A faith-centered education platform that combines a polished public website with a protected, operational lead-management workflow.

**Document status:** Living project reference  
**Audience:** Portfolio reviewers, hiring managers, collaborators, maintainers, and future contributors  
**Primary repository:** Imamu Qaloon Academy  
**Last reviewed:** October 2026

---

## 1. Executive summary

Imamu Qaloon Academy (IQA) is a responsive education website and lightweight admissions CRM for an Islamic and digital-learning academy. The product gives visitors a clear path from discovery to inquiry, while giving academy staff a protected dashboard for reviewing, updating, and exporting prospective-student leads.

The project demonstrates more than visual frontend work. It brings together product thinking, responsive interface design, form UX, backend validation, database persistence, authentication, operational workflows, exports, notification integrations, SEO, security hardening, and deployment awareness in one cohesive application.

### The one-sentence story

I designed and built a full-stack academy platform that converts public website inquiries into a secure, searchable, exportable lead workflow for staff follow-up.

### Portfolio positioning

Present IQA as a **full-stack product build**, not only a website:

- Public acquisition and trust-building experience
- Structured inquiry capture
- Protected internal operations dashboard
- Persistent lead data and reporting exports
- Practical security and production considerations

---

## 2. Product context

### The problem

An education academy needs to communicate its programs and values clearly, support learners from different backgrounds, and respond to inquiries consistently. A static brochure site does not solve the operational problem: submissions can become fragmented across email, chat, spreadsheets, and memory.

### The solution

IQA creates one connected journey:

```text
Visitor discovers academy
        ↓
Explores programs and admissions information
        ↓
Submits a validated inquiry
        ↓
Lead is saved with timestamp, state, program, and status
        ↓
Staff reviews the lead in a protected dashboard
        ↓
Staff updates status, follows up, and exports reports
```

### Product goals

1. Make the academy credible, welcoming, and easy to understand.
2. Reduce friction between interest and inquiry.
3. Capture consistent lead data instead of unstructured messages.
4. Give staff a simple operational workflow without requiring a large CRM.
5. Keep the codebase lightweight enough for a small organization to maintain.

### Non-goals

- IQA is not intended to replace a full enterprise CRM.
- The current lead refresh model is near-real-time polling, not a WebSocket event system.
- SQLite is appropriate for a small operational deployment, but not the final scaling strategy for high-volume traffic.

---

## 3. Core user journeys

### Prospective learner journey

1. Arrives on the homepage through search, a shared link, or direct navigation.
2. Understands the academy’s learning philosophy and pathways.
3. Reviews programs, admissions information, and contact options.
4. Selects a program, learner type, and applicant state.
5. Submits an inquiry with consent.
6. Receives confirmation and an optional WhatsApp continuation link.

### Academy staff journey

1. Opens the protected admin login.
2. Authenticates with the configured admin password.
3. Reviews new leads in the dashboard.
4. Searches by readable applicant ID, name, email, program, or state.
5. Updates status: `new`, `contacted`, `follow-up`, or `enrolled`.
6. Edits missing or incorrect details.
7. Exports CSV or Excel data for reporting and follow-up.

### Lead lifecycle

```text
new → contacted → follow-up → enrolled
```

The workflow intentionally stays small and understandable. A future version could add `lost`, `paused`, owner assignment, notes, reminders, and audit history.

---

## 4. Feature inventory

### Public experience

- Responsive homepage with clear conversion paths
- About, programs, admissions, contact, cookies, and 404 pages
- Light/dark customer theme support
- Mobile navigation and responsive layouts
- Faith-centered brand language and visual hierarchy
- Floating contact/WhatsApp actions
- Discreet three-click admin entry point on the homepage
- Accessible labels, required fields, status messaging, and native form validation

### Lead capture

- Name, email, phone, learner type, program, applicant state, message, and consent
- Client-side and server-side validation
- Applicant state selection covering Nigerian states, FCT, and outside Nigeria
- Server-generated UTC creation timestamp
- Readable applicant IDs such as `IQA-26-0001`
- WhatsApp handoff URL generation
- Optional email notification through Nodemailer

### Admin operations

- Protected `/admin` route and `/api/leads` API
- Expiring HttpOnly admin session cookies backed by random server-side tokens
- Search by ID, name, email, phone, program, learner type, state, and message
- Status filtering and inline status changes
- Edit modal for lead details
- Delete confirmation flow
- Exact local timestamp tooltip plus relative time display
- Automatic dashboard refresh every 15 seconds
- Immediate refresh when the browser tab becomes active
- CSV export
- Raw Excel export
- Formatted Excel report export

### SEO and discoverability

- Page-specific titles and descriptions
- Canonical URLs
- Open Graph homepage metadata
- Structured data on the homepage
- Sitemap and robots file
- Web manifest
- Custom 404 page

---

## 5. Technical architecture

### Stack

| Layer | Implementation | Why it fits the project |
| --- | --- | --- |
| UI | HTML, CSS, vanilla JavaScript | Low dependency overhead and easy maintenance |
| Server | Node.js + Express | Small, direct HTTP and API layer |
| Database | SQLite3 | Reliable local persistence for a small operational CRM |
| Email | Nodemailer | SMTP-based notifications without vendor lock-in |
| Reporting | ExcelJS | Formatted workbook generation for staff |
| Configuration | dotenv | Environment-based secrets and deployment settings |

### Request and data flow

```mermaid
flowchart LR
    A[Public visitor] --> B[Contact form]
    B --> C[POST /api/contact]
    C --> D[Validation and consent check]
    D --> E[SQLite leads table]
    E --> F[CSV mirror]
    C --> G[Email notification]
    C --> H[WhatsApp handoff]

    I[Admin user] --> J[/admin-login]
    J --> K[Expiring HttpOnly session]
    K --> L[/admin dashboard]
    L --> M[GET /api/leads]
    L --> N[PATCH /api/leads/:id]
    L --> O[DELETE /api/leads/:id]
    L --> P[CSV / Excel exports]
    M --> E
    N --> E
    O --> E
    P --> E
```

### Runtime structure

```text
Imamu Qaloon Academy/
├── public/                 Public pages, styles, browser scripts, and SEO files
├── server.js               Express server, auth, APIs, migrations, email, exports
├── data/                   SQLite database and CSV mirror
├── docs/                   Product, technical, schema, architecture, and showcase docs
├── deploy/                 Render, Vercel, and Nginx examples
├── .env.example            Safe environment template
├── package.json            Scripts and dependency manifest
└── README.md               Repository onboarding guide
```

---

## 6. Data model

### `leads` table

| Field | Meaning |
| --- | --- |
| `id` | Readable identifier in the format `IQA-YY-0001` |
| `name` | Applicant or contact name |
| `email` | Contact email |
| `phone` | Optional phone number |
| `learner` | Who the program is for |
| `program` | Program of interest |
| `state` | Applicant state or location |
| `message` | Additional inquiry context |
| `source` | Origin, currently `website` |
| `status` | Operational stage |
| `created_at` | ISO 8601 UTC creation timestamp |

### Timestamp policy

Timestamps are created on the server in UTC. The dashboard calculates relative age in the browser and shows the operator’s local exact date/time on hover. This avoids server-local timezone ambiguity and keeps exports consistent.

### Migration behavior

The server performs lightweight startup migration for the existing SQLite database:

- Adds the `state` column when an older database does not have it.
- Converts legacy long IDs into readable IDs.
- Keeps existing records intact.
- Synchronizes the CSV mirror when filesystem access permits.

Existing records created before state capture may have an empty state and can be completed in the admin edit form.

---

## 7. API contract

| Method | Route | Access | Responsibility |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Returns service status and timestamp |
| `POST` | `/api/contact` | Public | Validates and stores a new inquiry |
| `GET` | `/api/leads` | Admin | Returns leads ordered newest first |
| `PATCH` | `/api/leads/:id` | Admin | Updates lead details or status |
| `DELETE` | `/api/leads/:id` | Admin | Deletes a lead after confirmation |
| `GET` | `/api/leads.csv` | Admin | Streams current CSV export |
| `GET` | `/api/leads.raw.xlsx` | Admin | Downloads a raw workbook |
| `GET` | `/api/leads.xlsx` | Admin | Downloads a formatted report workbook |

### Error-handling principles

- Validation errors return a user-readable `400` response.
- Unauthenticated admin API access returns `401`.
- Missing records return `404`.
- Temporary database readiness problems return `503`.
- Unexpected failures are logged server-side without exposing secrets.

---

## 8. Security and reliability

### Implemented controls

- Admin password comes from environment configuration; there is no source-code fallback.
- Admin sessions use random tokens rather than a predictable cookie value.
- Session cookies are HttpOnly, SameSite Lax, and secure in production.
- Login attempts are throttled in memory.
- Public contact submissions are throttled in memory.
- JSON and URL-encoded request bodies have a 25 KB limit.
- Server-side validation enforces required fields, consent, email format, and message length.
- User-provided values are escaped before HTML rendering.
- Security response headers include `X-Content-Type-Options`, `X-Frame-Options`, Referrer Policy, and Permissions Policy.
- Admin static-page access is routed through protected authentication.
- API responses use `Cache-Control: no-store` where lead freshness matters.

### Important production caveats

- In-memory sessions and rate limits reset when the process restarts and do not coordinate across multiple instances.
- SQLite requires a persistent disk. Ephemeral/serverless filesystems are not suitable for durable lead storage.
- CSV and Excel exports contain confidential lead information and should be access-controlled.
- A production scale-up should move sessions, rate limits, and lead storage to managed infrastructure.

---

## 9. Deployment model

### Local

```bash
npm install
copy .env.example .env
npm run check
npm run dev
```

### Production checklist

1. Set `NODE_ENV=production`.
2. Configure a strong `ADMIN_PASSWORD` through the host secret manager.
3. Configure SMTP credentials and the academy inbox.
4. Configure WhatsApp number and production domain metadata.
5. Use HTTPS.
6. Attach persistent storage for SQLite or use a managed database.
7. Verify `/api/health`.
8. Test inquiry submission, admin login, status updates, and exports.
9. Confirm backups for the SQLite database and CSV mirror.

### Hosting decision note

The included Render and Vercel examples are deployment references, not a guarantee that their default filesystem behavior is appropriate for production lead storage. For durable operations, use a persistent volume or external database.

---

## 10. Quality and verification

### Current automated check

```bash
npm run check
```

This validates the server and public browser script syntax.

### Manual acceptance checklist

- Homepage loads on desktop and mobile.
- Customer dark mode changes public pages only.
- Contact form rejects missing required fields and consent.
- Applicant state is saved and visible in the admin dashboard.
- New IDs follow `IQA-YY-0001`.
- A new lead appears in the dashboard within the polling interval.
- Relative time and exact timestamp are correct.
- Admin route redirects unauthenticated users to login.
- Direct `/admin.html` access cannot bypass protection.
- Status updates persist after refresh.
- Edit and delete flows behave correctly.
- CSV and Excel exports include state and readable IDs.
- SMTP failure does not prevent lead persistence.
- Health endpoint returns a successful response.

### Recommended next test layer

Add automated integration tests for:

- Contact validation and consent
- Lead creation and ID generation
- Schema migration from legacy IDs
- Admin authentication and route protection
- Status updates and deletion
- Export column integrity

---

## 11. Product decisions worth showcasing

### Why a lightweight CRM instead of a large platform?

The academy’s operational volume is small enough that a focused workflow creates more value than introducing the cost and complexity of a full CRM. The design keeps the important actions visible: review, search, update, follow up, export.

### Why readable IDs?

`IQA-26-0005` is easier to communicate in a phone call, email, spreadsheet, or follow-up note than a long timestamp-random identifier. The year prefix provides context, while the sequence provides operational simplicity.

### Why polling instead of WebSockets?

The dashboard needs freshness, not continuous bidirectional collaboration. Fifteen-second polling provides a simple, resilient near-real-time experience without adding a message broker or connection lifecycle complexity.

### Why store UTC timestamps?

UTC storage creates a stable source of truth. Each admin operator sees a correctly localized display while exports remain portable across servers and regions.

### Why vanilla JavaScript?

The project benefits from a small runtime footprint and a low-maintenance frontend. The product does not require a heavy component framework to deliver its current interactions.

---

## 12. Portfolio case study

### Case-study headline

**From academy website to operational admissions workflow: building IQA as a full-stack product.**

### Case-study structure

**Challenge**  
The academy needed a credible digital presence and a dependable way to turn inquiries into follow-up work.

**Approach**  
I designed a responsive public experience, modeled the inquiry lifecycle, built a protected admin workflow, and connected persistence, notifications, WhatsApp handoff, and reporting exports.

**Technical execution**  
Implemented the platform with Node.js, Express, SQLite, vanilla JavaScript, Nodemailer, and ExcelJS. Added server-side validation, environment-based secrets, expiring sessions, rate limiting, security headers, schema migration, readable IDs, and near-real-time dashboard refresh.

**Outcome**  
The academy now has one connected workflow from public discovery to structured lead review, with a maintainable foundation for future CRM and admissions features.

### Suggested portfolio metrics

Only add measured numbers you can verify. Useful metrics include:

- Number of public pages shipped
- Number of lead fields captured
- Average dashboard refresh interval
- Number of export formats supported
- Number of API routes
- Lighthouse or accessibility scores
- Time saved compared with manual spreadsheet collection
- Inquiry completion rate, if analytics are later added

Do not invent conversion, traffic, revenue, or response-time claims.

---

## 13. LinkedIn-ready copy

### Short project post

I built Imamu Qaloon Academy (IQA), a full-stack education platform that combines a responsive public website with a protected admissions lead dashboard.

The project covers the complete journey from program discovery to operational follow-up: validated inquiry forms, applicant state capture, readable lead IDs, SQLite persistence, email and WhatsApp handoff, search and status management, CSV/Excel exports, and near-real-time dashboard refresh.

The most valuable part was treating the website as a product workflow—not just a collection of pages. I worked through the data model, authentication, migration of legacy records, security controls, deployment constraints, and staff usability.

Built with Node.js, Express, SQLite, vanilla JavaScript, Nodemailer, and ExcelJS.

### Longer case-study caption

**Project: Imamu Qaloon Academy (IQA)**

I designed and built a faith-centered education platform for Quran, Arabic, Islamic studies, and digital learning.

The platform includes:

- Responsive public marketing and admissions pages
- Customer light/dark theme support
- Structured inquiry capture with consent and applicant state
- Protected admin sessions and lead operations
- Search, filtering, status updates, editing, and deletion
- Readable IDs such as `IQA-26-0001`
- CSV and formatted Excel reporting
- Email notifications and WhatsApp follow-up
- SEO metadata, sitemap, manifest, and 404 handling
- Validation, throttling, security headers, and database migration

This project strengthened my ability to connect interface design, backend engineering, data modeling, security, and real operational needs into one maintainable product.

### Suggested hashtags

`#FullStackDevelopment #NodeJS #ExpressJS #SQLite #JavaScript #WebDevelopment #ProductDesign #CRM #PortfolioProject`

---

## 14. Resume-ready bullet points

Choose only the bullets that accurately represent your contribution:

- Built a full-stack education and admissions platform with a responsive public website and protected lead-management dashboard.
- Designed a SQLite-backed lead workflow with readable applicant IDs, applicant state capture, status transitions, editing, deletion, and CSV/Excel exports.
- Implemented server-side validation, consent enforcement, request limits, rate limiting, security headers, expiring HttpOnly sessions, and static admin-route protection.
- Integrated Nodemailer email notifications and WhatsApp handoff into the inquiry pipeline.
- Implemented near-real-time dashboard updates through visibility-aware 15-second polling and localized UTC timestamp presentation.
- Added startup schema migration to evolve legacy lead records without losing existing data.

---

## 15. Demo script

Use this sequence when presenting the project:

1. Open the homepage and explain the academy’s audience and learning pathways.
2. Toggle customer dark mode and show that the public experience adapts.
3. Open the contact flow and submit a sample inquiry with state and consent.
4. Show the confirmation and WhatsApp continuation option.
5. Enter the admin dashboard through the protected login.
6. Point out the readable applicant ID, state, status, and timestamp.
7. Search for the new lead by ID or state.
8. Change its status and show the update persisting.
9. Edit a field, then export CSV or Excel.
10. Explain the security, migration, and persistence decisions.

### What to avoid during a demo

- Showing real applicant personal data
- Showing `.env` or passwords
- Claiming WebSocket-level real-time behavior
- Claiming production durability on an ephemeral filesystem
- Presenting mock screenshot data as measured business results

---

## 16. Roadmap

### Near-term

- Add automated integration tests
- Add a visible “last refreshed” indicator
- Add dashboard pagination for larger lead volumes
- Add CSV/Excel export tests
- Add backup and restore instructions

### Medium-term

- Add admin roles and permissions
- Add lead notes, owner assignment, and follow-up reminders
- Add audit history for status changes
- Add analytics for inquiry sources and conversion stages
- Add a managed relational database option

### Long-term

- Replace polling with server-sent events or WebSockets if multi-admin collaboration requires it
- Add a proper session store and distributed rate limiter
- Add a headless CMS or admin content editing for public program pages
- Add applicant communication history and enrollment onboarding

---

## 17. Project vocabulary

| Term | Meaning |
| --- | --- |
| IQA | Imamu Qaloon Academy |
| Lead | A prospective learner inquiry captured by the system |
| Applicant state | State or location selected on the inquiry form |
| Status | Follow-up stage for a lead |
| Admin | Authenticated academy staff user |
| Public pages | Visitor-facing website pages served from `public/` |
| Near-real-time | Dashboard freshness achieved through periodic polling |
| CSV mirror | Human-readable lead export maintained alongside SQLite |

---

## 18. Final showcase checklist

Before publishing IQA on a portfolio or LinkedIn:

- [ ] Replace repository-local screenshot previews with approved real screenshots, if available.
- [ ] Remove or anonymize all sample/personal lead records.
- [ ] Confirm no secrets appear in screenshots, commits, or documentation.
- [ ] Add the final deployment URL if the project is publicly hosted.
- [ ] Add verified performance/accessibility metrics only.
- [ ] Link this bible from the repository README.
- [ ] Prepare a two-minute demo using the sequence above.
- [ ] Keep the limitations section visible; honest engineering judgment strengthens the case study.

This document is the project’s narrative, technical, and portfolio source of truth. Update it when the product’s architecture, data model, security posture, or user workflow changes.
