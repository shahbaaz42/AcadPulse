from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access, require_institution_access
from ..database import get_db
from ..models.access import UserAccount
from ..models.foundation import AcademicDivision, Institution
from ..models.staff import StaffProfile, StaffProfileAcademicDivision
from ..schemas.staff import StaffProfileCreate, StaffProfileRead, StaffProfileUpdate

router = APIRouter(prefix="/api/v1/staff-profiles", tags=["staff-profiles"])

STAFF_TYPES = {"TEACHING", "NON_TEACHING"}


def _normalise_staff_type(value: str) -> str:
    staff_type = value.strip().upper().replace("-", "_").replace(" ", "_")
    if staff_type not in STAFF_TYPES:
        raise HTTPException(status_code=422, detail="Staff type must be TEACHING or NON_TEACHING")
    return staff_type


def _normalise_employee_code(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().upper()
    return cleaned or None


def _require_staff_mutation(institution_id: UUID, access: AccessContext, db: Session) -> None:
    require_institution_access(institution_id, access, db)
    if access.is_platform_admin:
        return
    if any(
        assignment.role_code in {"PRINCIPAL", "SCHOOL_ADMIN"}
        and assignment.scope_type == "institution"
        and assignment.institution_id == institution_id
        for assignment in access.assignments
    ):
        return
    raise HTTPException(
        status_code=403,
        detail="Staff Profile management requires Principal or School Admin access",
    )


def _read_compartment_scope(
    institution: Institution,
    access: AccessContext,
) -> set[UUID] | None:
    """Return None for institution-wide readers, otherwise the allowed compartment IDs."""
    if access.is_platform_admin:
        return None
    if institution.organization_id is not None and institution.organization_id in access.organization_ids:
        return None
    if any(
        assignment.role_code in {"PRINCIPAL", "SCHOOL_ADMIN"}
        and assignment.scope_type == "institution"
        and assignment.institution_id == institution.id
        for assignment in access.assignments
    ):
        return None

    compartment_ids = {
        assignment.academic_division_id
        for assignment in access.assignments
        if assignment.role_code == "COMPARTMENT_HEAD"
        and assignment.scope_type == "academic_compartment"
        and assignment.institution_id == institution.id
        and assignment.academic_division_id is not None
    }
    if compartment_ids:
        return compartment_ids

    raise HTTPException(status_code=403, detail="Staff directory access is not available for this role")


def _unique_ids(values: list[UUID]) -> list[UUID]:
    return list(dict.fromkeys(values))


def _validate_divisions(
    db: Session,
    institution_id: UUID,
    staff_type: str,
    academic_division_ids: list[UUID],
) -> list[UUID]:
    division_ids = _unique_ids(academic_division_ids)
    if staff_type == "NON_TEACHING":
        if division_ids:
            raise HTTPException(
                status_code=422,
                detail="Academic Compartment placement is available only for teaching staff",
            )
        return []

    if not division_ids:
        return []

    divisions = db.scalars(select(AcademicDivision).where(AcademicDivision.id.in_(division_ids))).all()
    if len(divisions) != len(division_ids) or any(
        item.institution_id != institution_id or not item.is_active for item in divisions
    ):
        raise HTTPException(
            status_code=422,
            detail="All Academic Compartments must be active and belong to the selected institution",
        )
    return division_ids


def _validate_user_link(db: Session, user_id: UUID | None) -> None:
    if user_id is None:
        return
    user = db.get(UserAccount, user_id)
    if user is None or user.status != "active":
        raise HTTPException(status_code=422, detail="Linked user account must be active")


def _division_ids(db: Session, staff_profile_id: UUID) -> list[UUID]:
    return list(
        db.scalars(
            select(StaffProfileAcademicDivision.academic_division_id)
            .where(StaffProfileAcademicDivision.staff_profile_id == staff_profile_id)
            .order_by(StaffProfileAcademicDivision.academic_division_id)
        ).all()
    )


def _replace_divisions(db: Session, staff_profile_id: UUID, division_ids: list[UUID]) -> None:
    db.execute(
        delete(StaffProfileAcademicDivision).where(
            StaffProfileAcademicDivision.staff_profile_id == staff_profile_id
        )
    )
    for division_id in division_ids:
        db.add(
            StaffProfileAcademicDivision(
                id=uuid4(),
                staff_profile_id=staff_profile_id,
                academic_division_id=division_id,
            )
        )


def _staff_read(db: Session, item: StaffProfile) -> StaffProfileRead:
    return StaffProfileRead(
        id=item.id,
        institution_id=item.institution_id,
        user_id=item.user_id,
        employee_code=item.employee_code,
        full_name=item.full_name,
        staff_type=item.staff_type,
        is_active=item.is_active,
        academic_division_ids=_division_ids(db, item.id),
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _get_institution(db: Session, institution_id: UUID) -> Institution:
    institution = db.get(Institution, institution_id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    return institution


def _ensure_profile_visible(
    db: Session,
    item: StaffProfile,
    access: AccessContext,
) -> None:
    require_institution_access(item.institution_id, access, db)
    institution = _get_institution(db, item.institution_id)
    compartment_scope = _read_compartment_scope(institution, access)
    if compartment_scope is None:
        return
    placements = set(_division_ids(db, item.id))
    if not placements.intersection(compartment_scope):
        raise HTTPException(status_code=404, detail="Staff Profile not found")


@router.post("", response_model=StaffProfileRead, status_code=status.HTTP_201_CREATED)
def create_staff_profile(
    payload: StaffProfileCreate,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> StaffProfileRead:
    _require_staff_mutation(payload.institution_id, access, db)
    _get_institution(db, payload.institution_id)

    staff_type = _normalise_staff_type(payload.staff_type)
    division_ids = _validate_divisions(
        db,
        payload.institution_id,
        staff_type,
        payload.academic_division_ids,
    )
    _validate_user_link(db, payload.user_id)

    item = StaffProfile(
        id=uuid4(),
        institution_id=payload.institution_id,
        user_id=payload.user_id,
        employee_code=_normalise_employee_code(payload.employee_code),
        full_name=payload.full_name.strip(),
        staff_type=staff_type,
        is_active=True,
    )
    db.add(item)
    db.flush()
    _replace_divisions(db, item.id, division_ids)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Employee code or linked user account already belongs to a Staff Profile in this institution",
        ) from exc
    db.refresh(item)
    return _staff_read(db, item)


@router.get("", response_model=list[StaffProfileRead])
def list_staff_profiles(
    institution_id: UUID,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> list[StaffProfileRead]:
    require_institution_access(institution_id, access, db)
    institution = _get_institution(db, institution_id)
    compartment_scope = _read_compartment_scope(institution, access)

    stmt = select(StaffProfile).where(StaffProfile.institution_id == institution_id)
    if not include_inactive:
        stmt = stmt.where(StaffProfile.is_active.is_(True))
    if compartment_scope is not None:
        stmt = (
            stmt.join(
                StaffProfileAcademicDivision,
                StaffProfileAcademicDivision.staff_profile_id == StaffProfile.id,
            )
            .where(StaffProfileAcademicDivision.academic_division_id.in_(compartment_scope))
            .distinct()
        )

    items = db.scalars(stmt.order_by(StaffProfile.full_name, StaffProfile.id)).all()
    return [_staff_read(db, item) for item in items]


@router.get("/{staff_profile_id}", response_model=StaffProfileRead)
def get_staff_profile(
    staff_profile_id: UUID,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> StaffProfileRead:
    item = db.get(StaffProfile, staff_profile_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Staff Profile not found")
    _ensure_profile_visible(db, item, access)
    return _staff_read(db, item)


@router.patch("/{staff_profile_id}", response_model=StaffProfileRead)
def update_staff_profile(
    staff_profile_id: UUID,
    payload: StaffProfileUpdate,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> StaffProfileRead:
    item = db.get(StaffProfile, staff_profile_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Staff Profile not found")
    _require_staff_mutation(item.institution_id, access, db)

    fields_set = payload.model_fields_set
    staff_type = item.staff_type
    if "staff_type" in fields_set:
        if payload.staff_type is None:
            raise HTTPException(status_code=422, detail="Staff type cannot be null")
        staff_type = _normalise_staff_type(payload.staff_type)

    if "full_name" in fields_set:
        if payload.full_name is None or not payload.full_name.strip():
            raise HTTPException(status_code=422, detail="Full name cannot be empty")
        item.full_name = payload.full_name.strip()

    if "employee_code" in fields_set:
        item.employee_code = _normalise_employee_code(payload.employee_code)

    if "user_id" in fields_set:
        _validate_user_link(db, payload.user_id)
        item.user_id = payload.user_id

    if "is_active" in fields_set:
        if payload.is_active is None:
            raise HTTPException(status_code=422, detail="Active status cannot be null")
        item.is_active = payload.is_active

    current_divisions = _division_ids(db, item.id)
    requested_divisions = (
        payload.academic_division_ids
        if "academic_division_ids" in fields_set and payload.academic_division_ids is not None
        else current_divisions
    )
    if "academic_division_ids" in fields_set and payload.academic_division_ids is None:
        raise HTTPException(status_code=422, detail="Academic Compartment list cannot be null")

    if staff_type == "NON_TEACHING" and "academic_division_ids" not in fields_set:
        requested_divisions = []
    division_ids = _validate_divisions(db, item.institution_id, staff_type, requested_divisions)
    item.staff_type = staff_type
    _replace_divisions(db, item.id, division_ids)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Employee code or linked user account already belongs to a Staff Profile in this institution",
        ) from exc
    db.refresh(item)
    return _staff_read(db, item)
