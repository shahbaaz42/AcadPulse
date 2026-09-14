# AcadPulse Decision Log

This file captures product/architecture decisions that are easy to lose if only source code is preserved.

## D-001 — Product branding

Use:

**AcadPulse — Academic Intelligence & Management Platform**

Do not replace this agreed branding without an explicit product decision.

## D-002 — Tenant hierarchy

Use:

`Platform -> Organization -> Institution`

Academic resources continue:

`Institution -> Academic Year -> Academic Compartment -> Grade -> Section`

## D-003 — Academic Compartment terminology

User-facing terminology is **Academic Compartment**, not Academic Division.

Internal database/API identifiers may still use `academic_division` for compatibility.

## D-004 — Frontend is not the security boundary

Backend must enforce all tenant and role/scope restrictions. Client-side filtering or hiding controls is insufficient.

## D-005 — JWT contains identity, not durable role claims

Authenticated requests reload role/scope assignments from the database. This allows access changes to take effect without trusting stale role claims in JWTs.

## D-006 — Principal and School Admin are institution-wide

Principal is the highest institution authority. School Admin / Admin Manager is an institution-wide operational role.

School Admin is **not below Compartment Head**.

## D-007 — Compartment Head is the technical role for Vice Principal / wing head

Compartment Head may be assigned to one or multiple Academic Compartments.

A Senior Vice Principal can therefore be represented as:

`COMPARTMENT_HEAD -> SENIOR`

The display name/title may still be `Senior Vice Principal`.

## D-008 — Compartment Head school-foundation access is read-only

Compartment Head may view the relevant Academic Year, compartment, grades, mappings, and sections, but should not change the institution's structural foundation.

Operational academic-management permissions are a separate future layer.

## D-009 — Responsibilities are not mutually exclusive roles

A teacher can simultaneously be:

- Subject Teacher;
- Class Teacher;
- HOD;
- Overall Class Incharge.

Therefore these are stored as overlapping academic responsibilities, not as mutually exclusive authentication roles.

## D-010 — HOD supports multiple subjects

Do not model HOD with one `subject_id` on the staff record.

Example:

`HOD of Languages -> English + Tamil + Hindi + Arabic`

`HOD of Languages` may be a display title while permissions derive from the selected subjects.

## D-011 — Overall Class Incharge supports multiple grades

Do not model Overall Class Incharge with one fixed grade.

A smaller school may have one Overall Class Incharge responsible for multiple Grades.

## D-012 — Subject Teacher preserves exact subject/section pairing

One Subject Teacher responsibility record represents:

- exactly one subject;
- one or multiple teaching sections.

If the teacher teaches another subject, create another responsibility record. This prevents ambiguous combinations.

## D-013 — Class Teacher is one section for now

PR #47 currently validates exactly one section per Class Teacher responsibility record.

Do not assume multi-section Class Teacher is required unless product requirements explicitly change.

## D-014 — Staff Profile is core; optional departments/modules are not

Every relevant employee can have a core Staff Profile regardless of optional modules.

Finance, Transport, Library, Student & Staff Records / PRO, and other administrative modules are optional by institution.

Do not make those modules mandatory fields on Staff Profile.

## D-015 — Optional modules support multiple staff

If/when optional modules are implemented, each enabled module can have multiple members and potentially one or more designated managers/leads.

Not every institution will enable every module.

## D-016 — Clarified teaching-staff delegation workflow

The agreed operating flow is:

`Principal -> School Admin -> Staff/Teacher Profile -> Academic Compartment placement -> Compartment Head -> academic responsibility assignment`

School Admin creates/maintains the staff profile and places teaching staff into appropriate Academic Compartments according to Principal direction.

Compartment Head then assigns academic responsibilities inside that compartment.

## D-017 — Compartment-aware delegation is mandatory

Example: Senior Compartment Head can manage HODs, Overall Class Incharges, Class Teachers, and Subject Teachers for Senior scope (VIII-XII in current Unity test data), but must never modify Primary/Junior-only staff or targets.

This must be enforced on the backend, not merely filtered in the UI.

## D-018 — Principal retains oversight/override

Delegation does not remove Principal authority. Principal should have institution-wide visibility and a safe edit/override path for managed access and later staff/responsibility data.

## D-019 — Single-institution UX

When Principal, School Admin, or Compartment Head has exactly one accessible institution, do not show an institution dropdown or `1 accessible` wording. Display the institution name directly.

Platform/Management accounts may retain selectors when multiple institutions are available.

## D-020 — Database history matters independently of Git

GitHub backs up code and migrations, not live PostgreSQL rows. Production/test database backups must be managed separately.
