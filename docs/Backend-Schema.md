# Backend Data Schema

## Overview

The backend stores lead records in SQLite and exposes them through API routes for the admin dashboard and export workflow.

## Database file

- Path: `data/noor_academy.db`

## Table: `leads`

| Column | Type | Required | Description |
| --- | --- | --- | --- |
| id | TEXT | Yes | Unique lead identifier |
| name | TEXT | Yes | Full name of the lead |
| email | TEXT | Yes | Lead email address |
| phone | TEXT | No | Contact phone number |
| learner | TEXT | Yes | Who the course is for (student, child, adult, etc.) |
| program | TEXT | Yes | Selected program or interest |
| state | TEXT | No | Applicant state or location; required for new website inquiries |
| message | TEXT | No | Additional enquiry message |
| source | TEXT | No | Lead origin, usually `website` |
| status | TEXT | No | Current stage such as `new`, `contacted`, `converted` |
| created_at | TEXT | Yes | ISO timestamp of submission |

## Schema definition

```sql
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  learner TEXT,
  program TEXT NOT NULL,
  state TEXT,
  message TEXT,
  source TEXT,
  status TEXT,
  created_at TEXT NOT NULL
);
```

## Expected lead lifecycle

1. A user submits a contact/admissions form
2. The backend validates and sanitizes input
3. A lead record is generated with a unique ID and timestamp
4. The record is saved to SQLite
5. Admin can view, filter, update, or delete the lead
6. The record can be exported to Excel

## Notes

- `status` is a workflow field used for admin management
- `id` uses the readable format `IQA-YY-0001` for new and migrated records
- `state` captures the applicant's selected state from the public form
- `source` is used to track where the lead came from
- `created_at` is useful for sorting by recency and lead age
- The lead CSV and workbook exports are generated from this same table

## Operational usage

This schema supports:
- admissions tracking
- follow-up management
- reporting and export
- conversion monitoring
- future CRM integration
