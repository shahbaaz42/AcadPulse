"""Create or reset an AcadPulse user with one role/scope assignment.

Intended for controlled administration and test environments. Passwords may be
provided interactively (recommended) or with --password for temporary test users.
"""

import argparse
import sys
from getpass import getpass
from pathlib import Path
from uuid import UUID, uuid4

# Allow `python scripts/create_scoped_user.py ...` from platform/backend.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models.access import Role, UserAccount, UserRoleAssignment
from app.models.foundation import Institution
from app.models.organization import Organization
from app.security import hash_password
from app.settings import settings

ROLE_CODES = {"PLATFORM_ADMIN", "MANAGEMENT_ADMIN", "PRINCIPAL", "SCHOOL_ADMIN"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or reset an AcadPulse scoped user")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--role", required=True, choices=sorted(ROLE_CODES))
    parser.add_argument("--organization-id")
    parser.add_argument("--institution-id")
    parser.add_argument(
        "--password",
        help="Temporary testing convenience. Omit this option to enter the password securely.",
    )
    return parser.parse_args()


def resolve_scope(args: argparse.Namespace) -> tuple[str, UUID | None, UUID | None]:
    if args.role == "PLATFORM_ADMIN":
        if args.organization_id or args.institution_id:
            raise SystemExit("PLATFORM_ADMIN must not include organization or institution scope.")
        return "platform", None, None

    if args.role == "MANAGEMENT_ADMIN":
        if not args.organization_id or args.institution_id:
            raise SystemExit("MANAGEMENT_ADMIN requires --organization-id only.")
        return "organization", UUID(args.organization_id), None

    if not args.institution_id or args.organization_id:
        raise SystemExit(f"{args.role} requires --institution-id only.")
    return "institution", None, UUID(args.institution_id)


def main() -> None:
    args = parse_args()
    email = args.email.strip().lower()
    scope_type, organization_id, institution_id = resolve_scope(args)

    password = args.password
    if password is None:
        password = getpass("Password: ")
        confirm = getpass("Confirm password: ")
        if password != confirm:
            raise SystemExit("Passwords do not match.")

    # Keep deployed production credentials reasonably strong. Test/development
    # environments may deliberately use simpler credentials for role testing.
    min_length = 12 if settings.environment.lower() == "production" else 6
    if len(password) < min_length:
        raise SystemExit(f"Password must contain at least {min_length} characters in this environment.")

    with SessionLocal() as db:
        role = db.scalar(select(Role).where(Role.code == args.role, Role.is_active.is_(True)))
        if role is None:
            raise SystemExit(f"Role {args.role} is missing. Run Alembic migrations first.")

        if organization_id is not None and db.get(Organization, organization_id) is None:
            raise SystemExit("Organization not found.")
        if institution_id is not None and db.get(Institution, institution_id) is None:
            raise SystemExit("Institution not found.")

        user = db.scalar(select(UserAccount).where(func.lower(UserAccount.email) == email))
        if user is None:
            user = UserAccount(
                id=uuid4(),
                email=email,
                display_name=args.name,
                status="active",
                is_platform_admin=args.role == "PLATFORM_ADMIN",
            )
            db.add(user)
            db.flush()

        user.display_name = args.name
        user.password_hash = hash_password(password)
        user.status = "active"
        user.is_platform_admin = args.role == "PLATFORM_ADMIN"

        # This utility intentionally gives the test/admin user one active assignment.
        existing_assignments = db.scalars(
            select(UserRoleAssignment).where(UserRoleAssignment.user_id == user.id)
        ).all()
        for assignment in existing_assignments:
            assignment.is_active = False

        assignment = db.scalar(
            select(UserRoleAssignment).where(
                UserRoleAssignment.user_id == user.id,
                UserRoleAssignment.role_id == role.id,
                UserRoleAssignment.scope_type == scope_type,
                UserRoleAssignment.organization_id == organization_id,
                UserRoleAssignment.institution_id == institution_id,
            )
        )
        if assignment is None:
            assignment = UserRoleAssignment(
                user_id=user.id,
                role_id=role.id,
                scope_type=scope_type,
                organization_id=organization_id,
                institution_id=institution_id,
                is_active=True,
            )
            db.add(assignment)
        else:
            assignment.is_active = True

        db.commit()
        print(f"User ready: {email} | role={args.role} | scope={scope_type}")


if __name__ == "__main__":
    main()
