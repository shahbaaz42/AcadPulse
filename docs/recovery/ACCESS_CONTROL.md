# AcadPulse Access-Control Model

## Core rule

**Frontend displays permissions; backend enforces permissions.**

Every protected action must validate access on the backend. UI visibility is a convenience, not a security boundary.

## Current system roles

### Platform Admin

- Scope: platform.
- Broad platform administration.
- Can access all institutions.

### Management / Group Admin

- Scope: organization.
- Can see institutions in the assigned organization.
- Can create/manage Principal accounts for institutions in that organization.
- School foundation is currently view-only.

### Principal

- Scope: institution.
- Institution-wide school-foundation write access.
- Can create/manage School Admin and Compartment Head accounts in own institution.
- PR #48 adds Principal **Edit Access** for those managed roles.
- Principal remains the highest institution-level authority and should retain oversight/override capability as new staff features are added.

### School Admin / Admin Manager

- Scope: institution.
- Institution-wide school-foundation write access.
- Planned next authority: core Staff & Teacher Profile management and placement of teaching staff into Academic Compartments.

### Compartment Head / Vice Principal

- Scope: `academic_compartment`.
- Can be assigned to one or multiple Academic Compartments.
- Institution is visible as context, but academic reads are filtered to assigned compartments, grades, mappings, and sections.
- School-foundation writes remain blocked.
- Future academic responsibility administration must be limited to the Compartment Head's assigned academic scope.

## Current access hierarchy

`Platform -> Organization -> Institution -> Academic Compartment`

Resource hierarchy continues deeper:

`Institution -> Academic Year -> Academic Compartment -> Grade -> Section`

Do not automatically turn Grade/Section/Subject into new authentication scope types. The agreed direction is to represent teacher duties through overlapping academic responsibility assignments instead.

## Role vs scope vs assignment

These concepts must remain distinct:

- **Role**: what authority the user has.
- **Scope**: where that authority applies.
- **Academic responsibility/assignment**: the exact academic duties assigned to a staff member.

Examples:

- `COMPARTMENT_HEAD` + Senior compartment scope.
- HOD responsibility + English/Tamil/Hindi subjects.
- Overall Class Incharge responsibility + Grades VIII/IX.
- Class Teacher responsibility + IX BA section.
- Subject Teacher responsibility + Mathematics + VIII BA/VIII BB/IX BA.

## Current Principal Edit Access rules

At recovery point PR #48:

- Principal can list managed School Admin and Compartment Head accounts in own institution.
- Principal can convert an existing managed account between School Admin and Compartment Head.
- Principal can change Compartment Head compartment assignment(s).
- Principal can change display name and login email.
- Principal can activate/deactivate managed accounts.
- Principal can optionally reset the password.
- Principal cannot edit Platform Admin accounts.
- Principal cannot edit Principal accounts through the delegated managed-user endpoint.
- Principal cannot edit users outside delegated institution scope.
- Principal cannot assign compartments belonging to another institution.

## Planned Staff/Teacher access flow

### Step 1 — School Admin creates Staff Profile

The account/profile exists at institution level.

### Step 2 — School Admin places teaching staff into Academic Compartment(s)

Example: Teacher A -> Senior.

### Step 3 — Compartment Head sees only eligible staff

Senior Compartment Head should see Teacher A only if Teacher A is assigned to Senior.

### Step 4 — Compartment Head assigns academic responsibilities

Allowed targets must be validated against the Compartment Head's scope.

For Senior, this means only Senior-linked grades/sections and relevant teacher pool. The Compartment Head must not be able to use Primary/Junior targets.

## Academic responsibility authority after PR #47

PR #47 currently gives Principal/School Admin/Platform Admin the responsibility-management endpoint and blocks Compartment Head administration.

This is a temporary backend foundation state. Before exposing the final academic-responsibility UI, change authorization to the clarified workflow:

- Principal: institution-wide oversight/override.
- School Admin: staff profile and compartment placement.
- Compartment Head: academic responsibility management inside assigned compartment(s).

Do this with backend enforcement first, then UI.

## Security invariants

- No public signup.
- Passwords are stored hashed; never store plaintext passwords in Git or docs.
- Do not store JWT signing secret or database connection string in repository documentation.
- Accounts without a valid password hash cannot log in.
- Role/scope is re-read from the database on authenticated requests.
- Tenant/scope checks must exist on backend reads and writes.
