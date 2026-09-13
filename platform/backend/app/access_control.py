from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models.access import Role, UserAccount, UserRoleAssignment
from .models.foundation import Institution
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AccessAssignment:
    role_code: str
    role_name: str
    scope_type: str
    organization_id: UUID | None
    institution_id: UUID | None


@dataclass(frozen=True)
class AccessContext:
    user: UserAccount
    assignments: tuple[AccessAssignment, ...]

    @property
    def is_platform_admin(self) -> bool:
        return self.user.is_platform_admin or any(
            assignment.role_code == "PLATFORM_ADMIN" and assignment.scope_type == "platform"
            for assignment in self.assignments
        )

    @property
    def organization_ids(self) -> set[UUID]:
        return {
            assignment.organization_id
            for assignment in self.assignments
            if assignment.scope_type == "organization" and assignment.organization_id is not None
        }

    @property
    def institution_ids(self) -> set[UUID]:
        return {
            assignment.institution_id
            for assignment in self.assignments
            if assignment.scope_type == "institution" and assignment.institution_id is not None
        }


def _unauthorized(detail: str = "Authentication required") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_access(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AccessContext:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    try:
        user_id = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise _unauthorized("Invalid or expired access token") from exc

    user = db.get(UserAccount, user_id)
    if user is None or user.status != "active":
        raise _unauthorized("User account is not active")

    rows = db.execute(
        select(UserRoleAssignment, Role)
        .join(Role, Role.id == UserRoleAssignment.role_id)
        .where(
            UserRoleAssignment.user_id == user.id,
            UserRoleAssignment.is_active.is_(True),
            Role.is_active.is_(True),
        )
    ).all()

    assignments = tuple(
        AccessAssignment(
            role_code=role.code,
            role_name=role.name,
            scope_type=assignment.scope_type,
            organization_id=assignment.organization_id,
            institution_id=assignment.institution_id,
        )
        for assignment, role in rows
    )
    return AccessContext(user=user, assignments=assignments)


def require_platform_admin(access: AccessContext = Depends(get_current_access)) -> AccessContext:
    if not access.is_platform_admin:
        raise HTTPException(status_code=403, detail="Platform administrator access required")
    return access


def accessible_institution_ids(access: AccessContext, db: Session) -> set[UUID] | None:
    """Return None for unrestricted platform access, otherwise the allowed institution IDs."""
    if access.is_platform_admin:
        return None

    allowed = set(access.institution_ids)
    if access.organization_ids:
        allowed.update(
            db.scalars(
                select(Institution.id).where(Institution.organization_id.in_(access.organization_ids))
            ).all()
        )
    return allowed


def require_institution_access(institution_id: UUID, access: AccessContext, db: Session) -> None:
    allowed = accessible_institution_ids(access, db)
    if allowed is not None and institution_id not in allowed:
        raise HTTPException(status_code=403, detail="Institution is outside your assigned access scope")


def require_academic_setup_write(institution_id: UUID, access: AccessContext, db: Session) -> None:
    """Allow school-foundation writes only to platform, Principal, or School Admin users."""
    require_institution_access(institution_id, access, db)
    if access.is_platform_admin:
        return

    can_write = any(
        assignment.role_code in {"PRINCIPAL", "SCHOOL_ADMIN"}
        and assignment.scope_type == "institution"
        and assignment.institution_id == institution_id
        for assignment in access.assignments
    )
    if not can_write:
        raise HTTPException(
            status_code=403,
            detail="This role has view-only access to school academic setup",
        )


def require_organization_access(organization_id: UUID, access: AccessContext) -> None:
    if access.is_platform_admin:
        return
    if organization_id not in access.organization_ids:
        raise HTTPException(status_code=403, detail="Organization is outside your assigned access scope")
