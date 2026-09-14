# AcadPulse Project Recovery Status

**Product:** AcadPulse — Academic Intelligence & Management Platform  
**Recovery snapshot date:** 2026-09-14  
**Recovery code point:** PR #48 merged on `main`  
**Recovery commit:** `adde547ce5e151947b7cbcac1031f967426876ca`  
**Permanent recovery branch:** `backup/access-responsibility-foundation-pr48-2026-09-14`

## Purpose of this document

This file is the primary hand-off/recovery document for AcadPulse. It records the current product direction, completed technical milestones, important architectural decisions, known limitations, and the exact next development step so the project can continue even if prior chat history is unavailable.

## Product direction

AcadPulse began as a browser-first academic result/scoreboard workflow and is evolving into a secure multi-tenant academic intelligence and school-management platform.

The current tenant/resource hierarchy is:

`Platform -> Organization / Management -> Institution -> Academic Year -> Academic Compartment -> Grade -> Section`

The current academic staffing model is intentionally separate from authentication roles:

- **System role/scope** answers: what may this account access and where?
- **Academic responsibility** answers: what academic responsibility does this staff member perform?

This separation is a core design decision and must be preserved.

## Completed milestones

### Access, authentication, and tenancy

- PR #27 — role/scope access foundation.
- PR #28 — authentication and backend tenant enforcement.
- PR #29 — frontend login/session integration.
- PR #30 — provisioning command fix.
- PR #32 — scoped user provisioning utility.
- PR #33 — free-hosting Platform Admin bootstrap.
- PR #34 — scoped user management and Management read-only academic foundation access.
- PR #35 — Management Admin may create Principal accounts within its organization.
- PR #36 — provisioning password/wording cleanup.
- PR #37 — Academic Compartment terminology and contextual guidance.
- PR #38 — list/edit school-foundation records.
- PR #39 — section ordering by grade order.
- PR #40 — Principal may create School Admin accounts.
- PR #41/#42 — Principal Manage Users shortcut placed in the session header.
- PR #43 — Compartment Head role and academic-compartment scope foundation.
- PR #44 — Principal UI for creating Compartment Head accounts with one or multiple compartments.
- PR #45 — backend filtering so Compartment Head reads are limited to assigned compartments/grades/sections.
- PR #46 — Compartment Head scope wording and single-institution UX cleanup.

### Academic responsibility foundation

- PR #47 — academic staff responsibility backend/data foundation.
  - Institution-level Subject master.
  - `SUBJECT_TEACHER` responsibility.
  - `CLASS_TEACHER` responsibility.
  - `HOD` responsibility with one or multiple subjects.
  - `OVERALL_CLASS_INCHARGE` responsibility with one or multiple grades.
  - Responsibilities tied to Institution + Academic Year.
  - Responsibilities kept separate from `user_role_assignments`.

### Principal edit access

- PR #48 — Principal managed-user listing and Edit Access workflow.
  - Principal can edit School Admin / Compartment Head accounts within the Principal's institution.
  - Existing login can be switched between School Admin and Compartment Head.
  - Principal can change Compartment Head scope, display name, login email, active/inactive status, and optionally reset password.
  - Backend prevents Principal from editing platform accounts, Principal accounts, or users outside delegated institution scope.

## Current authorization model

### Platform Admin

Platform-wide administrative access.

### Management / Group Admin

Organization-scoped access. Can create/manage Principal accounts for institutions in that organization. Academic school-foundation data is view-only.

### Principal

Institution-scoped authority. Can manage school foundation, School Admin, Compartment Head, and has institution-wide oversight/override authority.

### School Admin / Admin Manager

Institution-wide operational/admin role. The planned next responsibility is core Staff & Teacher Profile administration and assigning teaching staff to Academic Compartments.

### Compartment Head / Vice Principal

Scoped to one or multiple Academic Compartments. Current school-foundation access is read-only. Academic read access is filtered to assigned compartments, grades, and sections.

The intended future operational authority is:

- See staff assigned to the Compartment Head's own compartment(s).
- Manage HOD, Overall Class Incharge, Class Teacher, and Subject Teacher responsibilities inside those compartments only.
- Never manage academic staff/assignments belonging exclusively to other compartments.

## Academic staffing workflow agreed after PR #47

The intended operational flow is:

`Principal -> School Admin / Admin Manager -> Staff & Teacher Profiles -> Academic Compartment assignment -> Compartment Head -> Academic responsibilities`

Meaning:

1. Principal appoints/manages School Admin and Compartment Heads.
2. School Admin creates/maintains staff profiles.
3. Teaching staff are assigned to one or more Academic Compartments by School Admin, according to Principal direction.
4. A Compartment Head sees only teaching staff assigned into that Compartment Head's scope.
5. The Compartment Head assigns academic responsibilities such as HOD, Overall Class Incharge, Class Teacher, and Subject Teacher.
6. Principal retains institution-wide oversight and edit/override authority.

## Optional non-academic modules

Finance, Transport, Library, Student & Staff Records / PRO, and similar areas are **optional institution modules**, not mandatory core departments.

Do not hard-code these as required for every school. A future module system should allow an institution to enable only the modules it uses, with multiple staff and optional designated managers per module.

## Current test institution structure

A live test institution has been configured with Academic Year `2026-2027` and four Academic Compartments:

1. PRE PRIMARY
2. PRIMARY
3. JUNIOR
4. SENIOR

The Senior Compartment contains Grades VIII-XII and its sections. A Senior Vice Principal test account has been verified to see only the Senior scope.

## Current live deployment

- Backend: Render web service.
- Frontend: Render web service.
- Database: PostgreSQL used by the deployed backend.
- Authentication: JWT bearer token, session stored in browser `sessionStorage` on the frontend.
- Startup applies Alembic migrations.

Deployment details and required environment-variable names are documented in `DEPLOYMENT.md`. Never store secret values in Git.

## Current CI expectations

GitHub Actions workflow: **AcadPulse Platform Foundation**.

Before merge, both must pass:

- `backend-postgres`
- `frontend-build`

Backend CI applies Alembic migrations to PostgreSQL and runs integration tests.

## Exact next development step

Do **not** start Finance/Transport/Library modules yet.

The next core feature is:

### Staff & Teacher Profile Foundation

Build the data model/API/UI so School Admin can:

- create and maintain Staff Profiles;
- distinguish teaching and non-teaching staff;
- assign teaching staff to one or multiple Academic Compartments;
- activate/deactivate staff records without losing history.

Then build compartment-aware staff visibility so a Compartment Head sees only staff assigned to their compartment(s). After that, delegate academic responsibility management to the Compartment Head with strict backend scope enforcement.

## Important recovery warning

GitHub protects source code and migration history, but it does **not** back up the live PostgreSQL records. A database dump must be maintained separately. See `RECOVERY_RUNBOOK.md`.
