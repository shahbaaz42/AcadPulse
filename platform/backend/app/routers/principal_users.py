from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access
from ..database import get_db
from ..models.access import Role, UserAccount, UserRoleAssignment
from ..models.foundation import AcademicDivision, Institution
from ..schemas.auth import AdminUserCreate, AdminUserRead
from ..security import hash_password

router = APIRouter(prefix="/api/v1/principal", tags=["principal-users"])


def _principal_institutions(access: AccessContext) -> set:
    return {a.institution_id for a in access.assignments if a.role_code == "PRINCIPAL" and a.scope_type == "institution" and a.institution_id is not None}


def _prepare_user(payload: AdminUserCreate, db: Session, allowed_institutions: set, allowed_roles: set[str]) -> UserAccount:
    email = payload.email.strip().lower()
    user = db.scalar(select(UserAccount).where(func.lower(UserAccount.email) == email))
    if user is not None and user.is_platform_admin:
        raise HTTPException(status_code=403, detail="Platform administrator accounts cannot be managed here")
    if user is not None:
        rows = db.execute(select(UserRoleAssignment, Role).join(Role, Role.id == UserRoleAssignment.role_id).where(UserRoleAssignment.user_id == user.id, UserRoleAssignment.is_active.is_(True), Role.is_active.is_(True))).all()
        for assignment, role in rows:
            if role.code not in allowed_roles or assignment.institution_id not in allowed_institutions:
                raise HTTPException(status_code=403, detail="Principal cannot manage an account outside delegated school scope")
    if user is None:
        user = UserAccount(id=uuid4(), email=email, display_name=payload.display_name.strip(), status="active", is_platform_admin=False, password_hash=hash_password(payload.password))
        db.add(user); db.flush()
    else:
        user.display_name = payload.display_name.strip(); user.status = "active"; user.password_hash = hash_password(payload.password)
    for assignment in db.scalars(select(UserRoleAssignment).where(UserRoleAssignment.user_id == user.id)).all():
        assignment.is_active = False
    return user


@router.post("/school-admins", response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
def create_or_reset_school_admin(payload: AdminUserCreate, db: Session = Depends(get_db), access: AccessContext = Depends(get_current_access)) -> AdminUserRead:
    allowed = _principal_institutions(access)
    if not allowed: raise HTTPException(status_code=403, detail="Principal institution access required")
    if payload.role_code.strip().upper() != "SCHOOL_ADMIN": raise HTTPException(status_code=403, detail="This endpoint provisions School Admin accounts only")
    institution_id = payload.institution_id or (next(iter(allowed)) if len(allowed) == 1 else None)
    if institution_id is None: raise HTTPException(status_code=422, detail="Select an institution")
    if institution_id not in allowed or db.get(Institution, institution_id) is None: raise HTTPException(status_code=403, detail="School Admin can only be assigned to your institution")
    role = db.scalar(select(Role).where(Role.code == "SCHOOL_ADMIN", Role.is_active.is_(True)))
    if role is None: raise HTTPException(status_code=422, detail="School Admin role is not available")
    user = _prepare_user(payload, db, allowed, {"SCHOOL_ADMIN"})
    db.add(UserRoleAssignment(user_id=user.id, role_id=role.id, scope_type="institution", institution_id=institution_id, is_active=True))
    db.commit(); db.refresh(user)
    return AdminUserRead(id=user.id, email=user.email, display_name=user.display_name, role_code=role.code, role_name=role.name, scope_type="institution", institution_id=institution_id)


@router.post("/compartment-heads", response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
def create_or_reset_compartment_head(payload: AdminUserCreate, db: Session = Depends(get_db), access: AccessContext = Depends(get_current_access)) -> AdminUserRead:
    allowed = _principal_institutions(access)
    if not allowed: raise HTTPException(status_code=403, detail="Principal institution access required")
    if payload.role_code.strip().upper() != "COMPARTMENT_HEAD": raise HTTPException(status_code=403, detail="This endpoint provisions Compartment Head accounts only")
    institution_id = payload.institution_id or (next(iter(allowed)) if len(allowed) == 1 else None)
    if institution_id is None or institution_id not in allowed: raise HTTPException(status_code=403, detail="Compartment Head can only be assigned within your institution")
    if not payload.academic_division_ids: raise HTTPException(status_code=422, detail="Select at least one Academic Compartment")
    compartments = db.scalars(select(AcademicDivision).where(AcademicDivision.id.in_(payload.academic_division_ids))).all()
    if len(compartments) != len(set(payload.academic_division_ids)) or any(c.institution_id != institution_id for c in compartments):
        raise HTTPException(status_code=403, detail="All Academic Compartments must belong to the selected institution")
    role = db.scalar(select(Role).where(Role.code == "COMPARTMENT_HEAD", Role.is_active.is_(True)))
    if role is None: raise HTTPException(status_code=422, detail="Compartment Head role is not available")
    user = _prepare_user(payload, db, allowed, {"COMPARTMENT_HEAD"})
    for compartment_id in dict.fromkeys(payload.academic_division_ids):
        db.add(UserRoleAssignment(user_id=user.id, role_id=role.id, scope_type="academic_compartment", institution_id=institution_id, academic_division_id=compartment_id, is_active=True))
    db.commit(); db.refresh(user)
    return AdminUserRead(id=user.id, email=user.email, display_name=user.display_name, role_code=role.code, role_name=role.name, scope_type="academic_compartment", institution_id=institution_id, academic_division_ids=list(dict.fromkeys(payload.academic_division_ids)))
