# AcadPulse Architecture

## Platform hierarchy

AcadPulse uses a multi-tenant hierarchy:

`Platform -> Organization -> Institution -> Academic Year -> Academic Compartment -> Grade -> Section`

This hierarchy is both a product model and an authorization boundary.

## Authentication and authorization principle

**Frontend displays permissions; backend enforces permissions.**

Never rely on hidden buttons, routes, or client-side filtering as the security boundary. Every protected read/write operation must validate the current user's database-backed role/scope on the backend.

JWTs identify the user only. Role/scope assignments are re-read from the database on authenticated requests so changes to access do not depend on stale role claims embedded in the token.

## System access vs academic responsibility

AcadPulse intentionally keeps these separate.

### System access

Stored through roles and `user_role_assignments`.

Examples:

- Platform Admin — platform scope
- Management / Group Admin — organization scope
- Principal — institution scope
- School Admin — institution scope
- Compartment Head — academic-compartment scope

### Academic responsibilities

Stored through the academic-responsibility tables introduced in PR #47.

Examples:

- Subject Teacher
- Class Teacher
- HOD
- Overall Class Incharge

A staff member may have multiple overlapping academic responsibilities. These are not mutually exclusive login roles.

## Intended academic staffing architecture

### Principal

Institution-wide authority and oversight. Principal may appoint/manage School Admin and Compartment Heads and must retain an institutional override/edit path.

### School Admin / Admin Manager

Institution-wide administrative operator. Planned core ownership:

- Staff/Teacher profile creation and maintenance.
- Assign teaching staff to one or more Academic Compartments.
- Maintain non-academic staff records.

School Admin should not be the normal owner of day-to-day academic role assignment such as HOD/Class Teacher/Subject Teacher; that belongs to the appropriate Compartment Head once staff are placed into a compartment.

### Compartment Head / Vice Principal

Scoped to one or multiple Academic Compartments.

Within assigned scope, the Compartment Head should eventually:

- see teaching staff assigned to those compartments;
- assign HOD responsibility to one/multiple subjects;
- assign Overall Class Incharge responsibility to one/multiple grades;
- assign Class Teacher responsibility to a section;
- assign Subject Teacher responsibility to subject + teaching section(s);
- monitor academic operations inside the assigned compartments.

A Compartment Head must never be able to affect another compartment's exclusive staff, grades, sections, or academic responsibilities.

## Optional module architecture

Finance, Transport, Library, Student & Staff Records / PRO, and similar administrative areas are future optional modules.

Requirements:

- Not every institution must enable every module.
- Each module may contain multiple staff members.
- One or more staff may later be marked as managers/leads.
- These modules sit under institution-level administration, not under Academic Compartments.
- Core Staff Profile must work even when none of these optional modules are enabled.

## Frontend

Current frontend is Next.js and communicates with the backend through a shared API helper. Access tokens are held in browser `sessionStorage`.

Current main screens include:

- Login/session UI.
- School foundation setup/overview.
- Principal/Management/Platform Manage Users flow.
- Principal Edit Access for managed School Admin and Compartment Head accounts.

## Backend

Current backend is FastAPI with SQLAlchemy and Alembic migrations.

Key backend areas include:

- authentication;
- access control;
- organization/institution foundation;
- Principal-managed users;
- academic responsibility foundation.

PostgreSQL is the target database used by CI and live deployment.

## Migration discipline

Never rewrite already-applied production migrations. Add a new numbered Alembic migration for schema changes.

At this recovery point migrations exist through:

`0006_academic_responsibilities`

The next schema feature should therefore use a later migration identifier.

## Safe development sequence

For major features:

1. Create a feature branch from current `main`.
2. Add backend/data model and migration.
3. Add backend authorization and integration tests.
4. Add frontend UI only after backend rules are correct.
5. Open PR.
6. Require both backend PostgreSQL and frontend build CI to pass.
7. Merge only after review of tenant/scope behavior.
