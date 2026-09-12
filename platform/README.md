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
- Migrations: Alembic (to be added once the first schema is finalized)

## UX rule

Daily users should see workflows rather than database structure. Context such as academic year, class, subject and teacher assignment should be inferred wherever possible.

## Current milestone

Milestone 1 begins with:

`Login -> Institution -> Academic Year -> Academic Division -> Grade -> Class Group`
