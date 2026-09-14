from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access
from ..database import get_db
from ..models.access import Role, UserAccount, UserRoleAssignment
from ..models.foundation import Institution
from ..schemas.auth import AdminUserCreate, AdminUserRead
from ..security import hash_password

router = APIRouter(prefix="/api/v1/principal", tags=["principal-users"])


def _principal_institutions(access: AccessContext) -> set:
    return {
        assignment.institution_id
        for assignment in access.assignments
        if assignment.role_code == "PRINCIPAL"
        and assignment.scope_type == "institution"
        and assignment.institution_id is not None
    }


@router.post("/school-admins", response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
def create_or_reset_school_admin(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> AdminUserRead:
    allowed_institutions = _principal_institutions(access)
    if not allowed_institutions:
        raise HTTPException(status_code=403, detail="Principal institution access required")
    if payload.role_code.strip().upper() != "SCHOOL_ADMIN":
        raise HTTPException(status_code=403, detail="Principal may provision School Admin accounts only")
    if payload.organization_id is not None:
        raise HTTPException(status_code=422, detail="School Admin requires an institution only")

    if payload.institution_id is None:
        if len(allowed_institutions) != 1:
            raise HTTPException(status_code=422, detail="Select an institution when Principal has multiple assignments")
        institution_id = next(iter(allowed_institutions))
    else:
        institution_id = payload.institution_id

    institution = db.get(Institution, institution_id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    if institution.id not in allowed_institutions:
        raise HTTPException(status_code=403, detail="School Admin can only be assigned to your institution")

    role = db.scalar(select(Role).where(Role.code == "SCHOOL_ADMIN", Role.is_active.is_(True)))
    if role is None:
        raise HTTPException(status_code=422, detail="School Admin role is not available")

    email = payload.email.strip().lower()
    user = db.scalar(select(UserAccount).where(func.lower(UserAccount.email) == email))
    if user is not None and user.is_platform_admin:
        raise HTTPException(status_code=403, detail="Platform administrator accounts cannot be managed here")

    if user is not None:
        active_assignments = db.execute(
            select(UserRoleAssignment, Role)
            .join(Role, Role.id == UserRoleAssignment.role_id)
            .where(
                UserRoleAssignment.user_id == user.id,
                UserRoleAssignment.is_active.is_(True),
                Role.is_active.is_(True),
            )
        ).all()
        for assignment, existing_role in active_assignments:
            if existing_role.code != "SCHOOL_ADMIN" or assignment.institution_id not in allowed_institutions:
                raise HTTPException(status_code=403, detail="Principal cannot manage an account outside School Admin scope")

    if user is None:
        user = UserAccount(
            id=uuid4(),
            email=email,
            display_name=payload.display_name.strip(),
            status="active",
            is_platform_admin=False,
            password_hash=hash_password(payload.password),
        )
        db.add(user)
        db.flush()
    else:
        user.display_name = payload.display_name.strip()
        user.status = "active"
        user.password_hash = hash_password(payload.password)

    for assignment in db.scalars(select(UserRoleAssignment).where(UserRoleAssignment.user_id == user.id)).all():
        assignment.is_active = False

    assignment = db.scalar(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_id == user.id,
            UserRoleAssignment.role_id == role.id,
            UserRoleAssignment.scope_type == "institution",
            UserRoleAssignment.organization_id.is_(None),
            UserRoleAssignment.institution_id == institution.id,
        )
    )
    if assignment is None:
        db.add(
            UserRoleAssignment(
                user_id=user.id,
                role_id=role.id,
                scope_type="institution",
                organization_id=None,
                institution_id=institution.id,
                is_active=True,
            )
        )
    else:
        assignment.is_active = True

    db.commit()
    db.refresh(user)
    return AdminUserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role_code=role.code,
        role_name=role.name,
        scope_type="institution",
        organization_id=None,
        institution_id=institution.id,
    )
