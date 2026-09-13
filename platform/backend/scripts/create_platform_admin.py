"""Create or reset an AcadPulse platform administrator from the command line."""

import argparse
from getpass import getpass
from uuid import uuid4

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models.access import Role, UserAccount, UserRoleAssignment
from app.security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an AcadPulse platform administrator")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="AcadPulse Platform Admin")
    args = parser.parse_args()

    email = args.email.strip().lower()
    password = getpass("Password: ")
    confirm = getpass("Confirm password: ")
    if password != confirm:
        raise SystemExit("Passwords do not match.")
    if len(password) < 12:
        raise SystemExit("Password must contain at least 12 characters.")

    with SessionLocal() as db:
        role = db.scalar(select(Role).where(Role.code == "PLATFORM_ADMIN"))
        if role is None:
            raise SystemExit("PLATFORM_ADMIN role is missing. Run Alembic migrations first.")

        user = db.scalar(select(UserAccount).where(func.lower(UserAccount.email) == email))
        if user is None:
            user = UserAccount(
                id=uuid4(),
                email=email,
                display_name=args.name,
                status="active",
                is_platform_admin=True,
            )
            db.add(user)
            db.flush()

        user.display_name = args.name
        user.password_hash = hash_password(password)
        user.status = "active"
        user.is_platform_admin = True

        assignment = db.scalar(
            select(UserRoleAssignment).where(
                UserRoleAssignment.user_id == user.id,
                UserRoleAssignment.role_id == role.id,
                UserRoleAssignment.scope_type == "platform",
            )
        )
        if assignment is None:
            db.add(
                UserRoleAssignment(
                    user_id=user.id,
                    role_id=role.id,
                    scope_type="platform",
                    organization_id=None,
                    institution_id=None,
                    is_active=True,
                )
            )
        else:
            assignment.is_active = True

        db.commit()
        print(f"Platform administrator ready: {email}")


if __name__ == "__main__":
    main()
