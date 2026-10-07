# IQA Project Documentation

This folder contains the core design, product, technical, and data documentation for Imamu Qaloon Academy (IQA).

## Documents

- [PRD.md](PRD.md) — Product Requirements Document
- [TRD.md](TRD.md) — Technical Requirements Document
- [Backend-Schema.md](Backend-Schema.md) — Database structure and system data model
- [Architecture.md](Architecture.md) — System architecture and project flow diagram

## Project summary

Imamu Qaloon Academy is a modern educational brand website and admin portal for Islamic learning, Quran studies, Arabic education, and digital skills. The project combines a public-facing marketing site with a protected administrative dashboard to manage student inquiries and leads.

## Core modules

- Public marketing pages
- Admissions and contact form
- WhatsApp lead handoff
- Admin authentication and dashboard
- Lead management workflow
- Automatic lead refresh and precise local-time display in the dashboard
- Applicant state capture and readable lead identifiers (`IQA-YY-0001`)
- Export to Excel workbook
- Email notification to the academy inbox

## Operational notes

- Lead creation timestamps are stored as ISO 8601 UTC values and formatted in the admin operator's local timezone.
- The dashboard polls for new leads every 15 seconds and refreshes when the tab becomes active again.
- Admin sessions use expiring, HttpOnly cookies backed by server-side random session tokens.
- Production deployments should provide a persistent SQLite volume or move lead storage to a managed database.

## Repository purpose

This documentation supports planning, onboarding, implementation reviews, and future product expansion.
