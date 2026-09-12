# AcadPulse PostgreSQL Setup

AcadPulse Platform uses PostgreSQL as the primary relational database.

## Recommended shared development setup

During active development, use a managed PostgreSQL database so the same development database can be reached from different computers and from a hosted API. Supabase PostgreSQL is a suitable development host, but AcadPulse is not tied to Supabase; any standard PostgreSQL provider can be used.

The browser must **not** connect directly to PostgreSQL. The intended flow is:

**Browser → AcadPulse FastAPI → PostgreSQL**

Database credentials belong only in backend environment variables and must never be committed to GitHub or exposed in frontend JavaScript.

### Supabase / managed PostgreSQL

1. Create a development PostgreSQL project with the provider.
2. Copy the PostgreSQL connection string from the provider dashboard.
3. In `platform/backend`, copy `.env.example` to `.env`.
4. Set `DATABASE_URL` to the managed connection string. For psycopg/SQLAlchemy, the URL should use the `postgresql+psycopg://` scheme.
5. Keep SSL enabled for remote connections. A typical URL shape is:

   ```text
   postgresql+psycopg://USER:PASSWORD@HOST:5432/postgres?sslmode=require
   ```

   Use the exact host, port, database, username and password supplied by the provider. Some providers also offer a connection pooler; that can be used later when we deploy the API.

6. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

7. Apply the existing AcadPulse migrations:

   ```bash
   alembic upgrade head
   ```

8. Start the API:

   ```bash
   uvicorn app.main:app --reload
   ```

9. Verify both health endpoints:

   ```text
   GET /health
   GET /health/db
   ```

   `/health/db` performs a simple `SELECT 1` and confirms that the API can reach PostgreSQL.

## Local development alternative

A local PostgreSQL instance is still supported. The default development connection is:

```text
postgresql+psycopg://acadpulse:acadpulse@localhost:5432/acadpulse
```

Do not use the example password for a shared or production database.

## Secret handling

- Never commit `.env`.
- Never put the PostgreSQL password in GitHub Pages, frontend JavaScript, screenshots, issues, pull requests or chat messages.
- Store the real `DATABASE_URL` only in the local backend environment and, later, in the secret/environment settings of the backend hosting service.
- If a database password is accidentally exposed, rotate it immediately in the database provider dashboard.

## Migration policy

- Schema changes must be made through Alembic migrations.
- Existing migrations should not be edited after they have been applied to shared environments.
- New schema changes should create a new migration.
- Shared development and production must use separate databases.
- Production credentials must be supplied through environment variables and never committed to GitHub.

## Release 1 foundation tables

The first migration creates:

- `institutions`
- `academic_years`
- `academic_divisions`
- `grade_levels`
- `academic_division_grade_levels`
- `class_groups`

These support the first setup flow:

**Institution → Academic Year → Division → Grade → Class**
