# AcadPulse Deployment Recovery Notes

## Live services

### Backend

- Service: `acadpulse-api`
- Host: Render
- URL: `https://acadpulse-api.onrender.com`
- Runtime: Python / FastAPI
- Region used during current setup: Singapore
- Startup includes Alembic migrations before serving the API.

### Frontend

- Service: `acadpulse-web`
- Host: Render
- URL: `https://acadpulse-web.onrender.com`
- Root directory: `platform/frontend`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Region used during current setup: Singapore

### Database

- PostgreSQL backing the deployed backend.
- Database data is **not stored in GitHub** and requires a separate backup process.

## Environment-variable names

The deployed backend currently depends on authentication/database/CORS configuration.

Known authentication-related variable names include:

- `AUTH_SECRET_KEY`
- `AUTH_ALGORITHM`
- `AUTH_ACCESS_TOKEN_MINUTES`
- `AUTH_TOKEN_ISSUER`
- `AUTH_TOKEN_AUDIENCE`

The frontend uses:

- `NEXT_PUBLIC_API_BASE_URL`

The backend also requires its configured PostgreSQL database connection variable used by application settings.

### Security rule

**Never put real secret values, passwords, JWT signing keys, or the production database URL in this repository.**

Recovery documentation should contain only variable names and configuration intent. Secret values must remain in the deployment provider's secret/environment management system or another secure password/secret manager.

## Current non-secret configuration notes

- JWT algorithm: HS256.
- Access-token lifetime used during setup: 60 minutes.
- Token issuer: `acadpulse`.
- Token audience: `acadpulse-web`.
- Frontend API base URL points to the Render backend.
- CORS includes the deployed frontend origin and previously supported GitHub Pages origin.

## Database migration behavior

Alembic is the schema migration mechanism.

At the PR #48 recovery point, migrations exist through:

`0006_academic_responsibilities`

Deployment should apply migrations before the app receives normal traffic.

Never skip a production migration unless a deliberate recovery plan explains why.

## CI

GitHub Actions workflow name:

**AcadPulse Platform Foundation**

Expected jobs:

- `backend-postgres`
- `frontend-build`

`backend-postgres` validates PostgreSQL migrations and backend integration tests. `frontend-build` verifies that the Next.js app compiles.

## Free-hosting note

Render free services may cold-start after inactivity. A slow first request does not automatically mean the deployment is broken.

## Recovery deployment checklist

If Render services must be recreated:

1. Restore/clone the GitHub repository.
2. Create or restore PostgreSQL database.
3. Configure backend environment variables securely.
4. Deploy backend from the repository.
5. Confirm migrations apply successfully.
6. Verify `/health` and database-health endpoints.
7. Configure frontend `NEXT_PUBLIC_API_BASE_URL` to the backend URL.
8. Deploy frontend from `platform/frontend`.
9. Confirm CORS permits the frontend origin.
10. Test login and tenant scope with at least Principal and Compartment Head roles.

## What GitHub does not recover

A Git clone/repository backup does not restore:

- live PostgreSQL rows;
- Render environment secret values;
- Render service settings that exist only in the provider UI;
- browser sessions.

Those must be documented/backed up separately.
