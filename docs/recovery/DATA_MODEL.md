# AcadPulse Data Model Recovery Notes

## Core tenant/foundation entities

Current foundation entities include:

- Organization
- Institution
- Academic Year
- Academic Division / Academic Compartment
- Grade Level
- Academic Division–Grade Level mapping
- Class Group / Section

The user-facing terminology is:

`Institution -> Academic Year -> Academic Compartment -> Grade -> Section`

Internal code may still use `academic_division` in model/API names. Do not rename internal database identifiers casually; user-facing terminology is **Academic Compartment**.

## Access-control entities

Current access entities include:

- `user_accounts`
- `roles`
- `user_role_assignments`

`user_role_assignments` supports scope types:

- platform
- organization
- institution
- academic_compartment

Academic-compartment assignments include both institution and academic-compartment IDs.

## Academic responsibility entities

Introduced in PR #47:

### Subject

Institution-level Subject master.

Important current rule: Subject is institution-level master data. Future curriculum mapping may link subjects to grades/sections/academic years as separate entities rather than duplicating the Subject master.

### StaffAcademicResponsibility

Represents one academic duty record for one user in one Institution and Academic Year.

Supported types at the PR #47 recovery point:

- `SUBJECT_TEACHER`
- `CLASS_TEACHER`
- `HOD`
- `OVERALL_CLASS_INCHARGE`

### Responsibility target tables

Separate join tables associate responsibilities with:

- subjects;
- grades;
- class groups/sections.

This allows many-to-many responsibility targeting where needed.

## Responsibility shape rules

### HOD

- One or multiple subjects.
- Example: HOD Languages -> English + Tamil + Hindi + Arabic.

### Overall Class Incharge

- One or multiple grades.
- Example: Overall Class Incharge -> VIII + IX.

### Class Teacher

- Current backend rule: exactly one section per responsibility record.
- Multi-section Class Teacher has not been confirmed as a business requirement.

### Subject Teacher

- Exactly one subject per responsibility record.
- One or multiple teaching sections.
- If a teacher teaches different subjects, create separate Subject Teacher responsibility records.

This prevents ambiguous subject/section cross-products.

## Important missing core model — next feature

A dedicated **Staff Profile** model has not yet been added at this recovery point.

The next schema should introduce a core staff identity/profile separate from login role assignment. It should be institution-level and support teaching/non-teaching staff.

Recommended conceptual fields include:

- staff profile ID;
- institution ID;
- optional linked user account ID;
- employee/staff code;
- display/full name;
- staff type (teaching/non-teaching or future extensible classification);
- active/inactive employment/profile status;
- timestamps.

A separate many-to-many placement table should assign teaching staff to one or multiple Academic Compartments.

Do not embed a single `academic_division_id` directly on Staff Profile because one teacher may belong to multiple Academic Compartments.

## Optional modules

Do not add fixed Finance/Transport/Library columns to Staff Profile.

Future optional module membership should use separate module/module-membership structures so:

- institutions enable only modules they use;
- a module can contain multiple staff;
- manager/lead designations can evolve independently;
- core staff profiles remain valid without any optional module.

## Historical integrity

Prefer deactivation/status changes over destructive deletion for staff/account/assignment records where future reporting or audit history may depend on them.

Academic responsibilities already include `is_active`; future Staff Profile and placement models should follow a similar recoverable lifecycle.

## Migration state

At PR #48 the latest schema migration is:

`0006_academic_responsibilities`

New schema work should use a new migration after `0006`; do not modify production-applied migration files to retrofit new concepts.
