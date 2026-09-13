from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access, require_platform_admin
from ..database import get_db
from ..models.access import Role, UserAccount, UserRoleAssignment
from ..models.foundation import Institution
from ..models.organization import Organization
from ..schemas.auth import (
    AccessAssignmentRead,
    AdminUserCreate,
    AdminUserRead,
    CurrentUserRead,
    LoginRequest,
    TokenResponse,
)
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])

SCOPED_ADMIN_ROLES = {"MANAGEMENT_ADMIN", "PRINCIPAL", "SCHOOL_ADMIN"}


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.strip().lower()
    user = db.scalar(select(UserAccount).where(func.lower(UserAccount.email) == email))
    if user is None or user.status != "active" or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token, expires_in = create_access_token(user.id)
    return TokenResponse(access_token=access_token, expires_in=expires_in)


@router.get("/me", response_model=CurrentUserRead)
def current_user(access: AccessContext = Depends(get_current_access)) -> CurrentUserRead:
    return CurrentUserRead(
        id=access.user.id,
        email=access.user.email,
        display_name=access.user.display_name,
        is_platform_admin=access.is_platform_admin,
        assignments=[
            AccessAssignmentRead(
                role_code=assignment.role_code,
                role_name=assignment.role_name,
                scope_type=assignment.scope_type,
                organization_id=assignment.organization_id,
                institution_id=assignment.institution_id,
            )
            for assignment in access.assignments
        ],
    )


@router.post("/admin/users", response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
def create_or_reset_scoped_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    _: AccessContext = Depends(require_platform_admin),
) -> AdminUserRead:
    role_code = payload.role_code.strip().upper()
    if role_code not in SCOPED_ADMIN_ROLES:
        raise HTTPException(status_code=422, detail="Unsupported role for scoped user provisioning")

    role = db.scalar(select(Role).where(Role.code == role_code, Role.is_active.is_(True)))
    if role is None:
        raise HTTPException(status_code=422, detail="Requested role is not available")

    if role_code == "MANAGEMENT_ADMIN":
        if payload.organization_id is None or payload.institution_id is not None:
            raise HTTPException(status_code=422, detail="Management Admin requires an organization only")
        if db.get(Organization, payload.organization_id) is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        scope_type = "organization"
        organization_id = payload.organization_id
        institution_id = None
    else:
        if payload.institution_id is None or payload.organization_id is not None:
            raise HTTPException(status_code=422, detail=f"{role_code} requires an institution only")
        if db.get(Institution, payload.institution_id) is None:
            raise HTTPException(status_code=404, detail="Institution not found")
        scope_type = "institution"
        organization_id = None
        institution_id = payload.institution_id

    email = payload.email.strip().lower()
    user = db.scalar(select(UserAccount).where(func.lower(UserAccount.email) == email))
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
        user.is_platform_admin = False
        user.password_hash = hash_password(payload.password)

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
    db.refresh(user)

    return AdminUserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role_code=role.code,
        role_name=role.name,
        scope_type=scope_type,
        organization_id=organization_id,
        institution_id=institution_id,
    )
