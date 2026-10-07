# Technical Requirements Document (TRD)

## 1. Purpose

This document defines the technical framework and implementation requirements for Imamu Qaloon Academy’s website and lead management system.

## 2. Stack

### Frontend
- HTML
- CSS
- JavaScript
- Responsive layout design
- Theme switch support for light and dark modes

### Backend
- Node.js
- Express.js

### Data layer
- SQLite3 for local persistence

### Supporting libraries
- ExcelJS for workbook generation
- Nodemailer for email notifications
- dotenv for environment configuration

## 3. Architecture

The project follows a lightweight full-stack architecture:

- Public marketing pages are served from the `public` directory
- Protected admin routes are handled by Express middleware
- SQLite stores lead records and status information
- Email service sends alerts to the configured inbox
- Export endpoints generate .xlsx workbooks for download

## 4. Core modules

### Public site module
- Landing page
- About page
- Programs page
- Admissions page
- Contact page
- Legal or support pages as needed

### Lead capture module
- Form validation
- Data sanitization
- Record creation
- Email notification
- WhatsApp handoff link generation

### Admin module
- Session-based authentication
- Lead dashboard
- Search and filter controls
- Inline status updates
- Delete actions
- Workbook export

## 5. API requirements

### POST /api/contact
Creates a new lead from website intake form.

Required fields:
- name
- email
- program
- learner
- message (optional)
- phone (optional)

### GET /api/leads
Returns all stored leads for admin use.

### PATCH /api/leads/:id
Updates a lead record, especially status.

### DELETE /api/leads/:id
Removes an incorrect or duplicate lead.

### GET /api/leads.xlsx
Generates an Excel workbook summary for branded export.

### GET /api/leads.raw.xlsx
Exports raw data workbook without branding.

## 6. Security requirements

- Admin routes protected by a cookie-based session
- Environment variables for credentials and API keys
- Validation for all inbound data
- HTML escaping for email rendering
- Avoid exposing admin credentials in source files or public assets

## 7. Performance requirements

- Static pages should be served quickly
- Database queries should remain lightweight
- Excel export should remain efficient for moderate lead volumes
- UI should remain responsive with average website traffic

## 8. Deployment requirements

- Run behind a production web server or platform
- Use HTTPS in production
- Configure environment variables securely
- Ensure SMTP credentials remain protected
- Maintain a backup process for SQLite data

## 9. Reliability requirements

- Database file should be created automatically when missing
- Data should persist across session restarts
- Admin and contact flows should fail gracefully with user feedback
- Server should log operational exceptions clearly

## 10. Acceptance criteria

- Public pages render correctly
- Forms validate and store data properly
- Emails and exports are generated successfully
- Admin can log in and manage leads
- Data can be exported for operational use
- The app remains deployable on a standard Node hosting environment
