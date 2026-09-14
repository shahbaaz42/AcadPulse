# AcadPulse Live Test State

## Purpose

This file records the non-secret live test configuration that was verified before the PR #48 recovery snapshot. It exists so a future developer can distinguish code problems from missing test data or incorrect expectations.

## Organization and institutions

Test organization:

- `UNITY GROUP OF SCHOOLS (UNITY-GROUP)`

Configured institutions include:

- Unity Kids School (`UKS-CBSE`)
- Unity Public School (`UPS-CBSE`)

## Unity Public School academic year

Current live test academic year:

- Name: `2026-2027`
- Start: `2026-06-01`
- End: `2027-05-31`
- Current: Yes

## Academic Compartments

Unity Public School currently has:

1. `PRE` — PRE PRIMARY COMPARTMENT
2. `PRI` — PRIMARY COMPARTMENT
3. `JUNIOR` — JUNIOR COMPARTMENT
4. `SENIOR` — SENIOR COMPARTMENT

## Grade mapping

Current grade structure:

- Pre KG -> PRE PRIMARY
- LKG -> PRE PRIMARY
- UKG -> PRE PRIMARY
- Class I -> PRE PRIMARY
- Class II -> PRIMARY
- Class III -> PRIMARY
- Class IV -> PRIMARY
- Class V -> JUNIOR
- Class VI -> JUNIOR
- Class VII -> JUNIOR
- Class VIII -> SENIOR
- Class IX -> SENIOR
- Class X -> SENIOR
- Class XI -> SENIOR
- Class XII -> SENIOR

## Sections

The live test data currently contains 30 Senior sections:

- VIII: BA, BB, BC, GA, GB, GC
- IX: BA, BB, BC, GA, GB, GC
- X: BA, BB, BC, GA, GB, GC
- XI: BA, BB, BC, GA, GB, GC
- XII: BA, BB, BC, GA, GB, GC

Sections are displayed by Grade institution order, with section codes ascending within a grade. The UI offers Ascending/Descending grade order.

## Verified role behavior

### Platform Admin

Expected:

- platform-wide visibility;
- access to both test institutions.

### Management / Group Admin

Expected:

- organization-scoped visibility;
- exactly the institutions belonging to the organization;
- school academic foundation view-only;
- ability to manage Principal accounts in organization institutions.

### Principal

Expected:

- one assigned institution;
- institution-wide foundation write/edit access;
- Manage Users access;
- create/manage School Admin and Compartment Head accounts;
- PR #48 Edit Access for managed accounts.

### School Admin

Expected:

- institution-scoped access;
- institution-wide school-foundation write/edit access.

The next planned expansion is Staff & Teacher Profile administration.

### Compartment Head / Senior Vice Principal

A live Senior Compartment Head test was successfully verified.

Expected and observed behavior:

- header shows `Compartment Head · Academic Compartment-scoped access`;
- only Unity Public School is available;
- institution name is displayed directly when it is the only accessible institution;
- only SENIOR COMPARTMENT is visible;
- only Grades VIII-XII are visible;
- only the corresponding Senior sections are visible;
- school-foundation create/edit controls are unavailable;
- institution-level Academic Year remains visible as context.

## Important test rule

Do not store test passwords in this file or elsewhere in Git. If a test account password must be reset, use the authorized user-management flow.

## Next live test after Staff Profile implementation

Once Staff Profiles are added, create at least:

- one teacher assigned only to Senior;
- one teacher assigned only to Junior;
- one teacher assigned to multiple Academic Compartments.

Then verify that the Senior Compartment Head can see only teachers whose placement includes Senior, and cannot manage responsibilities against Junior-only targets.
