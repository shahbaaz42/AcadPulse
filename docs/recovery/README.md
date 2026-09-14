# AcadPulse Recovery Documentation

This folder preserves the product, architecture, access-control, data-model, deployment, testing, and roadmap context required to continue AcadPulse without relying on prior chat history.

## Recovery snapshot

- Date: **2026-09-14**
- Product: **AcadPulse — Academic Intelligence & Management Platform**
- Code recovery point: **PR #48**
- Commit: `adde547ce5e151947b7cbcac1031f967426876ca`
- Permanent snapshot branch: `backup/access-responsibility-foundation-pr48-2026-09-14`

## Read in this order

1. [PROJECT_STATUS.md](PROJECT_STATUS.md) — where the project currently stands and the exact next step.
2. [DECISION_LOG.md](DECISION_LOG.md) — product/architecture decisions that must not be inferred from code alone.
3. [ARCHITECTURE.md](ARCHITECTURE.md) — platform and staffing architecture.
4. [ACCESS_CONTROL.md](ACCESS_CONTROL.md) — roles, scopes, delegation, and authorization rules.
5. [DATA_MODEL.md](DATA_MODEL.md) — current models and next Staff Profile model direction.
6. [LIVE_TEST_STATE.md](LIVE_TEST_STATE.md) — non-secret Unity live-test structure and verified role behavior.
7. [ROADMAP.md](ROADMAP.md) — ordered implementation plan from this recovery point.
8. [TESTING_AND_CI.md](TESTING_AND_CI.md) — CI and regression-testing expectations.
9. [DEPLOYMENT.md](DEPLOYMENT.md) — non-secret Render/backend/frontend deployment notes.
10. [RECOVERY_RUNBOOK.md](RECOVERY_RUNBOOK.md) — Git/local/database/disaster-recovery procedure.

## Immediate continuation point

The next core development item is **Staff & Teacher Profile Foundation**:

`Principal -> School Admin / Admin Manager -> Staff & Teacher Profiles -> Academic Compartment placement -> Compartment Head -> Academic responsibilities`

Do not start optional Finance/Transport/Library/PRO modules before this core flow is stable.

## Security

These documents intentionally omit passwords, JWT signing keys, database URLs, and other secret values. Keep secrets outside Git.
