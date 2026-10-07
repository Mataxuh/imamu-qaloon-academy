# Project Architecture Diagram

```mermaid
flowchart LR
    A[Visitor Browser] --> B[Public Pages\nindex.html / about.html / contact.html / programs.html]
    B --> C[Express Server\nserver.js]
    C --> D[Static Assets\npublic folder]
    C --> E[SQLite Database\ndata/noor_academy.db]
    C --> F[Lead API Routes\n/api/contact\n/api/leads\n/api/leads.xlsx]
    C --> G[Email Service\nNodemailer]
    C --> H[WhatsApp Link Builder]

    F --> E
    F --> G
    F --> H

    I[Admin User] --> J[Protected Admin Login\n/admin-login]
    J --> K[Admin Dashboard\n/admin]
    K --> F
    K --> E
    K --> L[Excel Export / Lead Updates / Delete Actions]

    M[Hosting Platform / Domain] --> A
```

## Architecture summary

The system is organized as a lightweight full-stack app:

- The front-end is served as static content from the `public` directory.
- Express handles routing, admin session protection, and lead APIs.
- SQLite stores all lead records used by the dashboard and exports.
- Nodemailer sends new inquiry alerts to the configured academy inbox.
- ExcelJS generates downloadable lead workbooks for staff follow-up.
- The admin dashboard is only accessible through a protected login flow.

## Key design principles

- Public pages remain lightweight and accessible.
- Admin functionality is isolated behind a secure session.
- Data persistence is local and reliable for a small operational CRM workflow.
- Lead export supports reporting and operational follow-up.
