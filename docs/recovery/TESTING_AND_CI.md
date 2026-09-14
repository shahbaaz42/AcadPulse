# AcadPulse Testing and CI Recovery Notes

## CI workflow

Primary GitHub Actions workflow:

**AcadPulse Platform Foundation**

At the PR #48 recovery point, feature PRs are expected to pass both jobs before merge:

- `backend-postgres`
- `frontend-build`

## Backend PostgreSQL job

The backend job is important because production uses PostgreSQL semantics.

Expected flow:

1. Start PostgreSQL service/container.
2. Check out repository.
3. Set up Python.
4. Install backend dependencies.
5. Apply all Alembic migrations from a fresh database state.
6. Run backend integration tests.

A green migration step proves only that migrations apply in CI; it does not replace a real production database backup.

## Frontend build job

Expected flow:

1. Check out repository.
2. Set up Node.
3. Install frontend dependencies.
4. Run the Next.js production build.

This catches TypeScript/build integration regressions but does not prove live authorization behavior by itself.

## Critical access-control test areas

### Organization/institution tenancy

- Management sees only institutions in assigned organization.
- Principal/School Admin see only assigned institution(s).
- Cross-institution writes are rejected.

### Compartment Head

- One/multiple Academic Compartment assignment works.
- `/auth/me` exposes compartment assignment IDs.
- Compartment Head sees only assigned compartments.
- Grade/mapping/section reads are restricted to assigned compartment scope.
- Direct attempts against another compartment/grade/section are rejected.
- School-foundation write attempts are rejected.

### Principal delegated user management

- Principal can manage School Admin and Compartment Head only in own institution.
- Principal can convert a managed account between School Admin and Compartment Head.
- Multi-compartment assignment is validated.
- Account deactivation works.
- Principal cannot edit Principal/platform/out-of-scope accounts.

### Academic responsibility foundation

- HOD accepts multiple subjects.
- Overall Class Incharge accepts multiple grades.
- Subject Teacher preserves subject-to-section pairing.
- Class Teacher currently validates exactly one section.
- Cross-institution responsibility targets are rejected.

## Live verification checklist after access-control changes

Automated tests must be followed by a small live role matrix on Render:

1. Platform Admin — broad visibility.
2. Management Admin — organization-only, school setup view-only.
3. Principal — own institution, write/admin controls.
4. School Admin — institution-wide operational/foundation access.
5. Compartment Head — assigned compartment data only, school-foundation read-only.

For Compartment Head, explicitly verify counts/data rather than only checking that the page loads.

## Regression principle

When changing authorization, add a positive test **and** a negative/out-of-scope test.

Examples:

- allowed: Senior Compartment Head sees Grade X;
- denied: Senior Compartment Head cannot access Grade IV.

- allowed: Principal edits own Compartment Head;
- denied: Principal cannot edit another Principal or another institution's account.

## Before merge

Do not merge a functional PR merely because it is marked mergeable. Verify:

- CI workflow completed;
- backend-postgres succeeded;
- frontend-build succeeded;
- authorization behavior matches product decisions;
- migrations are additive and correctly chained;
- no secret values were committed.
