from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access
from ..database import get_db
from ..models.access import Role, UserAccount, UserRoleAssignment
from ..models.foundation import AcademicDivision, Institution
from ..schemas.auth import (
    AdminUserCreate,
    AdminUserRead,
    PrincipalManagedUserRead,
    PrincipalManagedUserUpdate,
)
from ..security import hash_password

router = APIRouter(prefix="/api/v1/principal", tags=["principal-users"])

PRINCIPAL_MANAGED_ROLES = {"SCHOOL_ADMIN", "COMPARTMENT_HEAD"}


def _principal_institutions(access: AccessContext) -> set[UUID]:
    return {
        assignment.institution_id
        for assignment in access.assignments
        if assignment.role_code == "PRINCIPAL"
        and assignment.scope_type == "institution"
        and assignment.institution_id is not None
    }


def _prepare_user(
    payload: AdminUserCreate,
    db: Session,
    allowed_institutions: set[UUID],
    allowed_roles: set[str],
) -> UserAccount:
    email = payload.email.strip().lower()
    user = db.scalar(select(UserAccount).where(func.lower(UserAccount.email) == email))

    if user is not None and user.is_platform_admin:
        raise HTTPException(
            status_code=403,
            detail="Platform administrator accounts cannot be managed here",
        )

    if user is not None:
        rows = db.execute(
            select(UserRoleAssignment, Role)
            .join(Role, Role.id == UserRoleAssignment.role_id)
            .where(
                UserRoleAssignment.user_id == user.id,
                UserRoleAssignment.is_active.is_(True),
                Role.is_active.is_(True),
            )
        ).all()
        for assignment, role in rows:
            if role.code not in allowed_roles or assignment.institution_id not in allowed_institutions:
                raise HTTPException(
                    status_code=403,
                    detail="Principal cannot manage an account outside delegated school scope",
                )

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

    for assignment in db.scalars(
        select(UserRoleAssignment).where(UserRoleAssignment.user_id == user.id)
    ).all():
        assignment.is_active = False

    return user


def _managed_assignments(db: Session, user_id: UUID) -> list[tuple[UserRoleAssignment, Role]]:
    return db.execute(
        select(UserRoleAssignment, Role)
        .join(Role, Role.id == UserRoleAssignment.role_id)
        .where(
            UserRoleAssignment.user_id == user_id,
            UserRoleAssignment.is_active.is_(True),
            Role.is_active.is_(True),
        )
    ).all()


def _assert_principal_manages_user(
    db: Session,
    user: UserAccount,
    allowed_institutions: set[UUID],
) -> list[tuple[UserRoleAssignment, Role]]:
    if user.is_platform_admin:
        raise HTTPException(status_code=403, detail="Principal cannot manage this account")

    rows = _managed_assignments(db, user.id)
    if not rows:
        raise HTTPException(status_code=404, detail="Managed user access assignment not found")

    if any(
        role.code not in PRINCIPAL_MANAGED_ROLES
        or assignment.institution_id not in allowed_institutions
        for assignment, role in rows
    ):
        raise HTTPException(
            status_code=403,
            detail="Principal cannot manage an account outside delegated school scope",
        )
    return rows


def _managed_user_read(
    db: Session,
    user: UserAccount,
    rows: list[tuple[UserRoleAssignment, Role]] | None = None,
) -> PrincipalManagedUserRead:
    rows = rows or _managed_assignments(db, user.id)
    if not rows:
        raise HTTPException(status_code=404, detail="Managed user access assignment not found")

    role = rows[0][1]
    institution_id = rows[0][0].institution_id
    if institution_id is None:
        raise HTTPException(status_code=422, detail="Managed user is missing institution scope")

    compartment_ids = list(dict.fromkeys(
        assignment.academic_division_id
        for assignment, row_role in rows
        if row_role.code == "COMPARTMENT_HEAD" and assignment.academic_division_id is not None
    ))
    return PrincipalManagedUserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        role_code=role.code,
        role_name=role.name,
        institution_id=institution_id,
        academic_division_ids=compartment_ids,
    )


def _validate_compartments(
    db: Session,
    institution_id: UUID,
    academic_division_ids: list[UUID],
) -> list[UUID]:
    compartment_ids = list(dict.fromkeys(academic_division_ids))
    if not compartment_ids:
        raise HTTPException(status_code=422, detail="Select at least one Academic Compartment")

    compartments = db.scalars(
        select(AcademicDivision).where(AcademicDivision.id.in_(compartment_ids))
    ).all()
    if len(compartments) != len(compartment_ids) or any(
        compartment.institution_id != institution_id for compartment in compartments
    ):
        raise HTTPException(
            status_code=403,
            detail="All Academic Compartments must belong to the selected institution",
        )
    return compartment_ids


def _activate_assignment(
    db: Session,
    user_id: UUID,
    role: Role,
    institution_id: UUID,
    *,
    academic_division_id: UUID | None = None,
) -> None:
    scope_type = "academic_compartment" if academic_division_id is not None else "institution"
    existing = db.scalar(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_id == user_id,
            UserRoleAssignment.role_id == role.id,
            UserRoleAssignment.scope_type == scope_type,
            UserRoleAssignment.institution_id == institution_id,
            UserRoleAssignment.academic_division_id == academic_division_id,
        )
    )
    if existing is not None:
        existing.is_active = True
        return

    db.add(
        UserRoleAssignment(
            user_id=user_id,
            role_id=role.id,
            scope_type=scope_type,
            institution_id=institution_id,
            academic_division_id=academic_division_id,
            is_active=True,
        )
    )


@router.get("/users", response_model=list[PrincipalManagedUserRead])
def list_principal_managed_users(
    institution_id: UUID | None = None,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> list[PrincipalManagedUserRead]:
    allowed = _principal_institutions(access)
    if not allowed:
        raise HTTPException(status_code=403, detail="Principal institution access required")

    if institution_id is not None and institution_id not in allowed:
        raise HTTPException(status_code=403, detail="Institution is outside your Principal access scope")
    target_institutions = {institution_id} if institution_id is not None else allowed

    rows = db.execute(
        select(UserAccount, UserRoleAssignment, Role)
        .join(UserRoleAssignment, UserRoleAssignment.user_id == UserAccount.id)
        .join(Role, Role.id == UserRoleAssignment.role_id)
        .where(
            UserRoleAssignment.is_active.is_(True),
            Role.is_active.is_(True),
            Role.code.in_(PRINCIPAL_MANAGED_ROLES),
            UserRoleAssignment.institution_id.in_(target_institutions),
        )
        .order_by(UserAccount.display_name, UserAccount.email)
    ).all()

    users: dict[UUID, UserAccount] = {}
    grouped: dict[UUID, list[tuple[UserRoleAssignment, Role]]] = {}
    for user, assignment, role in rows:
        users[user.id] = user
        grouped.setdefault(user.id, []).append((assignment, role))

    return [
        _managed_user_read(db, users[user_id], grouped[user_id])
        for user_id in users
    ]


@router.patch("/users/{user_id}/access", response_model=PrincipalManagedUserRead)
def edit_principal_managed_user_access(
    user_id: UUID,
    payload: PrincipalManagedUserUpdate,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> PrincipalManagedUserRead:
    allowed = _principal_institutions(access)
    if not allowed:
        raise HTTPException(status_code=403, detail="Principal institution access required")
    if payload.institution_id not in allowed:
        raise HTTPException(status_code=403, detail="Institution is outside your Principal access scope")

    institution = db.get(Institution, payload.institution_id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")

    user = db.get(UserAccount, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User account not found")
    _assert_principal_manages_user(db, user, allowed)

    role_code = payload.role_code.strip().upper()
    if role_code not in PRINCIPAL_MANAGED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Principal may edit School Admin or Compartment Head access only",
        )

    role = db.scalar(select(Role).where(Role.code == role_code, Role.is_active.is_(True)))
    if role is None:
        raise HTTPException(status_code=422, detail="Requested role is not available")

    compartment_ids: list[UUID] = []
    if role_code == "COMPARTMENT_HEAD":
        compartment_ids = _validate_compartments(
            db,
            payload.institution_id,
            payload.academic_division_ids,
        )
    elif payload.academic_division_ids:
        raise HTTPException(status_code=422, detail="School Admin uses institution-wide access")

    email = payload.email.strip().lower()
    conflict = db.scalar(
        select(UserAccount).where(
            func.lower(UserAccount.email) == email,
            UserAccount.id != user.id,
        )
    )
    if conflict is not None:
        raise HTTPException(status_code=409, detail="Login email is already in use")

    user.email = email
    user.display_name = payload.display_name.strip()
    user.status = payload.status
    if payload.password:
        user.password_hash = hash_password(payload.password)

    for assignment in db.scalars(
        select(UserRoleAssignment).where(UserRoleAssignment.user_id == user.id)
    ).all():
        assignment.is_active = False

    if role_code == "SCHOOL_ADMIN":
        _activate_assignment(db, user.id, role, payload.institution_id)
    else:
        for compartment_id in compartment_ids:
            _activate_assignment(
                db,
                user.id,
                role,
                payload.institution_id,
                academic_division_id=compartment_id,
            )

    db.commit()
    db.refresh(user)
    return _managed_user_read(db, user)


@router.post("/school-admins", response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
def create_or_reset_school_admin(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> AdminUserRead:
    allowed = _principal_institutions(access)
    if not allowed:
        raise HTTPException(status_code=403, detail="Principal institution access required")

    if payload.role_code.strip().upper() != "SCHOOL_ADMIN":
        raise HTTPException(
            status_code=403,
            detail="Principal may provision School Admin accounts only",
        )

    institution_id = payload.institution_id or (next(iter(allowed)) if len(allowed) == 1 else None)
    if institution_id is None:
        raise HTTPException(status_code=422, detail="Select an institution")

    institution = db.get(Institution, institution_id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    if institution_id not in allowed:
        raise HTTPException(
            status_code=403,
            detail="School Admin can only be assigned to your institution",
        )

    role = db.scalar(select(Role).where(Role.code == "SCHOOL_ADMIN", Role.is_active.is_(True)))
    if role is None:
        raise HTTPException(status_code=422, detail="School Admin role is not available")

    user = _prepare_user(payload, db, allowed, {"SCHOOL_ADMIN"})
    _activate_assignment(db, user.id, role, institution_id)
    db.commit()
    db.refresh(user)

    return AdminUserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role_code=role.code,
        role_name=role.name,
        scope_type="institution",
        institution_id=institution_id,
    )


@router.post("/compartment-heads", response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
def create_or_reset_compartment_head(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> AdminUserRead:
    allowed = _principal_institutions(access)
    if not allowed:
        raise HTTPException(status_code=403, detail="Principal institution access required")

    if payload.role_code.strip().upper() != "COMPARTMENT_HEAD":
        raise HTTPException(
            status_code=403,
            detail="This endpoint provisions Compartment Head accounts only",
        )

    institution_id = payload.institution_id or (next(iter(allowed)) if len(allowed) == 1 else None)
    if institution_id is None or institution_id not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Compartment Head can only be assigned within your institution",
        )

    compartment_ids = _validate_compartments(db, institution_id, payload.academic_division_ids)

    role = db.scalar(
        select(Role).where(Role.code == "COMPARTMENT_HEAD", Role.is_active.is_(True))
    )
    if role is None:
        raise HTTPException(status_code=422, detail="Compartment Head role is not available")

    user = _prepare_user(payload, db, allowed, {"COMPARTMENT_HEAD"})
    for compartment_id in compartment_ids:
        _activate_assignment(
            db,
            user.id,
            role,
            institution_id,
            academic_division_id=compartment_id,
        )

    db.commit()
    db.refresh(user)

    return AdminUserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role_code=role.code,
        role_name=role.name,
        scope_type="academic_compartment",
        institution_id=institution_id,
        academic_division_ids=compartment_ids,
    )
