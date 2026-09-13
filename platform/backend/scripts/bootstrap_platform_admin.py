"""Bootstrap the first AcadPulse platform administrator during deployment.

This is intended for hosting environments without shell access. The script is a
no-op unless all required BOOTSTRAP_PLATFORM_ADMIN_* variables are present.
After the first successful deployment, remove those variables from the hosting
service. Existing platform admins are not reset on later deployments.
"""

import os
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models.access import Role, UserAccount, UserRoleAssignment
from app.security import hash_password

EMAIL_KEY = "BOOTSTRAP_PLATFORM_ADMIN_EMAIL"
NAME_KEY = "BOOTSTRAP_PLATFORM_ADMIN_NAME"
PASSWORD_KEY = "BOOTSTRAP_PLATFORM_ADMIN_PASSWORD"


def main() -> None:
    email_raw = os.getenv(EMAIL_KEY)
    password = os.getenv(PASSWORD_KEY)
    display_name = os.getenv(NAME_KEY, "AcadPulse Platform Admin").strip() or "AcadPulse Platform Admin"

    # Normal deployments should continue without provisioning when no bootstrap
    # variables are configured.
    if not email_raw and not password:
        print("Platform admin bootstrap skipped: no bootstrap credentials configured.")
        return

    if not email_raw or not password:
        raise SystemExit(
            f"Both {EMAIL_KEY} and {PASSWORD_KEY} are required when bootstrap provisioning is enabled."
        )

    email = email_raw.strip().lower()
    if len(password) < 12:
        raise SystemExit("Bootstrap platform admin password must contain at least 12 characters.")

    with SessionLocal() as db:
        role = db.scalar(
            select(Role).where(Role.code == "PLATFORM_ADMIN", Role.is_active.is_(True))
        )
        if role is None:
            raise SystemExit("PLATFORM_ADMIN role is missing. Run Alembic migrations first.")

        user = db.scalar(select(UserAccount).where(func.lower(UserAccount.email) == email))
        if user is None:
            user = UserAccount(
                id=uuid4(),
                email=email,
                display_name=display_name,
                status="active",
                is_platform_admin=True,
                password_hash=hash_password(password),
            )
            db.add(user)
            db.flush()
        else:
            user.display_name = display_name
            user.status = "active"
            user.is_platform_admin = True
            # Do not silently reset an already-provisioned password on every
            # deployment. Only fill it if the account has never had one.
            if not user.password_hash:
                user.password_hash = hash_password(password)

        assignment = db.scalar(
            select(UserRoleAssignment).where(
                UserRoleAssignment.user_id == user.id,
                UserRoleAssignment.role_id == role.id,
                UserRoleAssignment.scope_type == "platform",
                UserRoleAssignment.organization_id.is_(None),
                UserRoleAssignment.institution_id.is_(None),
            )
        )
        if assignment is None:
            assignment = UserRoleAssignment(
                user_id=user.id,
                role_id=role.id,
                scope_type="platform",
                organization_id=None,
                institution_id=None,
                is_active=True,
            )
            db.add(assignment)
        else:
            assignment.is_active = True

        db.commit()
        print(f"Platform administrator bootstrap ready: {email}")


if __name__ == "__main__":
    main()
