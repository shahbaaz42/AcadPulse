# AcadPulse Platform Foundation

This directory contains the new database-backed AcadPulse platform. The existing root-level Scoreboard Generator and Result Analytics remain untouched.

## Release 1 development sequence

1. Institution and academic structure
2. Students, staff and enrollments
3. Subjects, curriculum and teaching assignments
4. Timetable and teacher My Day
5. Daily attendance and teaching sessions
6. Homework
7. Assessments and marks
8. Topic intelligence, intervention and reassessment

## Architecture

- Frontend: Next.js / React
- Backend: FastAPI
- ORM: SQLAlchemy
- Database: PostgreSQL
- Migrations: Alembic

## UX rule

Daily users should see workflows rather than database structure. Context such as academic year, class, subject and teacher assignment should be inferred wherever possible.

## Current milestone

Milestone 1 flow:

`Login -> Institution -> Academic Year -> Academic Division -> Grade -> Class Group`

### Completed foundation work

- PostgreSQL connection foundation
- SQLAlchemy foundation models
- Alembic configuration and initial migration
- Pydantic request/response schemas
- CRUD APIs for Institution, Academic Year, Academic Division, Grade Level and Class Group
- Division-to-grade mapping API
- tenant-consistency validation for related Milestone 1 records
- conflict handling for duplicate/dependent records

### API prefix

`/api/v1`

Main resources:

- `/api/v1/institutions`
- `/api/v1/academic-years`
- `/api/v1/academic-divisions`
- `/api/v1/grade-levels`
- `/api/v1/academic-division-grade-levels`
- `/api/v1/class-groups`

FastAPI automatically exposes interactive API documentation at `/docs` when the backend is running.

## Next

1. Connect the guided frontend setup to these APIs.
2. Add authentication and institution context.
3. Add browser-visible Academic Management preview without changing the existing Scoreboard Generator or Result Analytics.
