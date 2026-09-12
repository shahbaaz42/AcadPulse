# AcadPulse PostgreSQL Setup

AcadPulse Platform uses PostgreSQL as the primary relational database.

## Local development

1. Install PostgreSQL locally, or use any managed PostgreSQL provider.
2. Create a database and user for AcadPulse.
3. Copy `.env.example` to `.env`.
4. Update `DATABASE_URL` if your username, password, host, port, or database name differs.
5. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

6. Apply database migrations from `platform/backend`:

   ```bash
   alembic upgrade head
   ```

7. Start the API:

   ```bash
   uvicorn app.main:app --reload
   ```

## Default development connection

```text
postgresql+psycopg://acadpulse:acadpulse@localhost:5432/acadpulse
```

Do not use the example password for production.

## Migration policy

- Schema changes must be made through Alembic migrations.
- Existing migrations should not be edited after they have been applied to shared environments.
- New schema changes should create a new migration.
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
