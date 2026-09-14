# AcadPulse Roadmap from PR #48 Recovery Point

## Recovery point

- Date: 2026-09-14
- Main commit: `adde547ce5e151947b7cbcac1031f967426876ca`
- Backup branch: `backup/access-responsibility-foundation-pr48-2026-09-14`

## Phase 1 — Staff & Teacher Profile Foundation

Build this next.

### Backend/data

- Add core Staff Profile entity.
- Support teaching and non-teaching staff classification.
- Link Staff Profile to Institution.
- Allow optional link to a login/user account.
- Add active/inactive lifecycle.
- Add many-to-many Staff Profile -> Academic Compartment placement.
- Add migration after `0006_academic_responsibilities`.

### Authorization

- Principal: institution-wide oversight/override.
- School Admin: create/edit Staff Profiles and academic-compartment placement.
- Compartment Head: read only staff whose placement intersects the Compartment Head's assigned compartments.
- Management Admin: no school-level Staff Profile mutation.

### Tests

At minimum:

- School Admin can create teaching staff in own institution.
- School Admin can assign one teacher to one/multiple Academic Compartments.
- School Admin cannot assign a compartment belonging to another institution.
- Compartment Head sees only staff placed in own compartment(s).
- Senior Compartment Head cannot see a Junior-only teacher.
- Principal can view/override institution staff data.

## Phase 2 — Staff & Teacher Management UI

Build UI on top of the backend rules from Phase 1.

School Admin UI should support:

- Staff directory.
- Create/Edit Staff Profile.
- Teaching/non-teaching classification.
- Academic Compartment assignment for teaching staff.
- Activate/deactivate status.

Principal should have institution-wide oversight/edit capability.

Compartment Head should get a scoped teacher/staff list, not institution-wide admin controls.

## Phase 3 — Compartment-aware Academic Responsibility Delegation

Adjust the PR #47 responsibility-management authority to the clarified workflow.

### Compartment Head should manage within assigned scope

- HOD -> one/multiple subjects.
- Overall Class Incharge -> one/multiple grades.
- Class Teacher -> section.
- Subject Teacher -> subject + teaching section(s).

### Backend must validate

- target staff member belongs to Compartment Head's eligible staff pool;
- target grade/section belongs to assigned compartment(s);
- responsibility Academic Year belongs to same institution;
- no cross-compartment unauthorized mutation.

Principal keeps institution-wide override.

## Phase 4 — Academic Structure Beyond Foundation

After staff/responsibility delegation is stable, continue academic modules such as:

- curriculum/subject structure;
- chapter/topic planning;
- yearly/weekly teaching plans;
- attendance linked to taught topics;
- homework tracking;
- internal assessments/class tests;
- student/class/topic/chapter analytics;
- weak-topic detection and reteaching/action plans.

## Phase 5 — Compartment Head Academic Operations Dashboard

The Vice Principal / Compartment Head should eventually monitor within assigned scope:

- syllabus progress;
- attendance patterns;
- missed topics due to absence;
- homework completion;
- assessments and weak topics;
- HOD/Class Incharge/Class Teacher/Subject Teacher activity;
- academic interventions and action plans.

School-foundation structural editing remains outside normal Compartment Head authority.

## Phase 6 — Optional Institution Modules

Only after core academic/staff architecture is stable.

Potential optional modules:

- Finance
- Transport
- Library
- Student & Staff Records / PRO
- other institution-specific modules

Requirements:

- enable/disable by institution;
- multiple staff per module;
- optional manager/lead designation;
- no requirement that every school uses every module.

## Backup/operations roadmap

In parallel with development:

1. Keep permanent milestone branches for meaningful recovery points.
2. Maintain recovery documentation in this folder.
3. Clone repository locally with full `.git` history.
4. Copy local clone to a second physical/cloud location.
5. Later mirror repository to a second Git provider.
6. Establish recurring PostgreSQL dump/restore testing.
7. Keep secret values outside Git.

## What not to do next

Do not:

- start Finance/Transport/Library before Staff Profile foundation;
- hard-code optional modules into core Staff Profile;
- give Compartment Head institution-wide responsibility mutation;
- represent HOD with only one subject;
- represent teacher academic responsibilities as exclusive login roles;
- rely on frontend filtering as authorization.
