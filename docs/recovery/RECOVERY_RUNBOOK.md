# AcadPulse Recovery Runbook

## Recovery assets at this milestone

- Repository: `shahbaaz42/AcadPulse`
- Recovery snapshot date: `2026-09-14`
- PR #48 recovery commit: `adde547ce5e151947b7cbcac1031f967426876ca`
- Permanent backup branch: `backup/access-responsibility-foundation-pr48-2026-09-14`
- Recovery documentation: `docs/recovery/`

## Layer 1 — GitHub source recovery

If `main` is accidentally changed or broken, the permanent backup branch is an exact pointer to the post-PR48 code state.

Do not force-move or reuse that backup branch for normal development.

To inspect the recovery point:

```bash
git fetch origin
git checkout backup/access-responsibility-foundation-pr48-2026-09-14
```

To restore development from it safely, create a new branch from the recovery branch rather than committing directly to the backup branch.

## Layer 2 — Local clone backup

A full Git clone is preferred over GitHub Download ZIP because it contains `.git` history.

Recommended process on the owner's laptop:

1. Use GitHub Desktop: **File -> Clone repository**.
2. Clone `shahbaaz42/AcadPulse` to a clearly named folder.
3. Confirm the hidden `.git` folder exists.
4. Periodically Fetch/Pull so the local copy follows GitHub.
5. Copy the complete cloned folder, including `.git`, to a second location such as Google Drive/OneDrive or an external drive.

Suggested snapshot folder naming:

`AcadPulse-PR48-2026-09-14/`

## Layer 3 — Second Git provider

Later, create a private mirror on another Git host such as GitLab.

A true mirror protects against a GitHub-account/repository-level problem. Keep the second remote private unless the project is intentionally public.

## Layer 4 — PostgreSQL database backup

This is essential for AcadPulse.

Git contains schema migrations and code, **not live rows** such as organizations, institutions, user accounts, Academic Years, compartments, grades, sections, subjects, staff records, or future results/attendance data.

### Recommended backup format

Use PostgreSQL `pg_dump` to produce a portable database dump. Keep dated copies outside Render.

Example concept only:

```bash
pg_dump --format=custom --file=acadpulse-YYYY-MM-DD.dump "$DATABASE_URL"
```

Do not paste the real production `DATABASE_URL` into Git, chat screenshots, or documentation.

### Restore testing

A backup is not fully trusted until restoration has been tested in a separate database.

A restore drill should confirm:

1. database can be recreated from dump;
2. Alembic revision matches the expected application state;
3. representative organization/institution/role data exists;
4. login and scoped reads work against the restored database.

## Suggested database backup cadence

While the project is still in active test/development:

- before a significant schema migration;
- after major live test-data setup;
- before deleting/restructuring tenant or staff data;
- at meaningful milestones.

When AcadPulse contains real operational school data, move to a regular automated backup/retention policy appropriate to the deployment provider and data sensitivity.

## Secret recovery

Do not store secret values in Git.

Maintain secure recovery access for deployment secrets such as:

- database connection credentials;
- `AUTH_SECRET_KEY`;
- deployment-provider credentials;
- any future third-party service secrets.

Recovery docs list required variable names but intentionally omit values.

## Render recovery

If a Render service is lost:

1. restore Git repository/source;
2. restore PostgreSQL from the latest trusted dump;
3. recreate backend service and secret environment values;
4. deploy backend and confirm Alembic migrations;
5. confirm health/database connectivity;
6. recreate frontend service with `platform/frontend` root;
7. configure frontend API base URL;
8. verify CORS;
9. perform role-based login tests.

See `DEPLOYMENT.md` for the current non-secret deployment configuration.

## Conversation/context recovery

If prior ChatGPT conversations are unavailable, read these files in order:

1. `PROJECT_STATUS.md`
2. `DECISION_LOG.md`
3. `ARCHITECTURE.md`
4. `ACCESS_CONTROL.md`
5. `DATA_MODEL.md`
6. `LIVE_TEST_STATE.md`
7. `ROADMAP.md`
8. `TESTING_AND_CI.md`
9. `DEPLOYMENT.md`

The immediate continuation point after this recovery snapshot is documented in `ROADMAP.md` as **Staff & Teacher Profile Foundation**.

## Recovery branch policy

Create future permanent recovery branches only at meaningful milestones, for example:

`backup/staff-profile-foundation-prXX-YYYY-MM-DD`

Do not create a permanent backup branch for every small UI PR; Git history already preserves those commits.

## Repository protection recommendation

Use a GitHub ruleset/branch protection for `main` when available to reduce accidental force-push/deletion risk. At minimum, normal development should continue through feature branches + PRs + CI rather than direct writes to `main`.
