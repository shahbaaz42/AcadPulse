from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access, require_institution_access
from ..database import get_db
from ..models.access import UserAccount
from ..models.academic_responsibility import (
    StaffAcademicResponsibility,
    StaffResponsibilityClassGroup,
    StaffResponsibilityGrade,
    StaffResponsibilitySubject,
    Subject,
)
from ..models.foundation import (
    AcademicDivision,
    AcademicDivisionGradeLevel,
    AcademicYear,
    ClassGroup,
    GradeLevel,
    Institution,
)
from ..models.staff import StaffProfile, StaffProfileAcademicDivision
from ..schemas.academic_responsibility import (
    StaffAcademicResponsibilityCreate,
    StaffAcademicResponsibilityRead,
    SubjectCreate,
    SubjectRead,
)

router = APIRouter(prefix="/api/v1", tags=["academic-responsibilities"])

RESPONSIBILITY_TYPES = {
    "SUBJECT_TEACHER",
    "CLASS_TEACHER",
    "HOD",
    "OVERALL_CLASS_INCHARGE",
}


def _is_institution_responsibility_admin(institution_id: UUID, access: AccessContext) -> bool:
    return access.is_platform_admin or any(
        assignment.role_code in {"PRINCIPAL", "SCHOOL_ADMIN"}
        and assignment.scope_type == "institution"
        and assignment.institution_id == institution_id
        for assignment in access.assignments
    )


def _require_subject_admin(institution_id: UUID, access: AccessContext, db: Session) -> None:
    require_institution_access(institution_id, access, db)
    if _is_institution_responsibility_admin(institution_id, access):
        return
    raise HTTPException(
        status_code=403,
        detail="Canonical Subject management requires Principal or School Admin access",
    )


def _responsibility_manager_scope(
    institution_id: UUID,
    access: AccessContext,
    db: Session,
) -> set[UUID] | None:
    """Return None for institution-wide responsibility management, else allowed compartments."""
    require_institution_access(institution_id, access, db)
    if _is_institution_responsibility_admin(institution_id, access):
        return None

    scoped = {
        assignment.academic_division_id
        for assignment in access.assignments
        if assignment.role_code == "COMPARTMENT_HEAD"
        and assignment.scope_type == "academic_compartment"
        and assignment.institution_id == institution_id
        and assignment.academic_division_id is not None
    }
    if scoped:
        return scoped

    raise HTTPException(
        status_code=403,
        detail="Academic responsibility management requires Principal or School Admin access, or scoped Compartment Head access",
    )


def _unique_ids(values: list[UUID]) -> list[UUID]:
    return list(dict.fromkeys(values))


def _validate_shape(
    responsibility_type: str,
    subject_ids: list[UUID],
    grade_level_ids: list[UUID],
    class_group_ids: list[UUID],
) -> None:
    if responsibility_type not in RESPONSIBILITY_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported academic responsibility type")

    if responsibility_type == "HOD":
        if not subject_ids or grade_level_ids or class_group_ids:
            raise HTTPException(status_code=422, detail="HOD requires one or more subjects only")
        return

    if responsibility_type == "OVERALL_CLASS_INCHARGE":
        if not grade_level_ids or subject_ids or class_group_ids:
            raise HTTPException(status_code=422, detail="Overall Class Incharge requires one or more grades only")
        return

    if responsibility_type == "CLASS_TEACHER":
        if len(class_group_ids) != 1 or subject_ids or grade_level_ids:
            raise HTTPException(status_code=422, detail="Class Teacher requires exactly one section")
        return

    if len(subject_ids) != 1 or not class_group_ids or grade_level_ids:
        raise HTTPException(
            status_code=422,
            detail="Subject Teacher requires exactly one subject and one or more teaching sections",
        )


def _load_targets(
    db: Session,
    institution_id: UUID,
    academic_year_id: UUID,
    subject_ids: list[UUID],
    grade_level_ids: list[UUID],
    class_group_ids: list[UUID],
) -> None:
    institution = db.get(Institution, institution_id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")

    year = db.get(AcademicYear, academic_year_id)
    if year is None or year.institution_id != institution_id:
        raise HTTPException(status_code=422, detail="Academic year must belong to the selected institution")

    if subject_ids:
        subjects = db.scalars(select(Subject).where(Subject.id.in_(subject_ids))).all()
        if len(subjects) != len(subject_ids) or any(item.institution_id != institution_id for item in subjects):
            raise HTTPException(status_code=422, detail="All subjects must belong to the selected institution")

    if grade_level_ids:
        grades = db.scalars(select(GradeLevel).where(GradeLevel.id.in_(grade_level_ids))).all()
        if len(grades) != len(grade_level_ids) or any(item.institution_id != institution_id for item in grades):
            raise HTTPException(status_code=422, detail="All grades must belong to the selected institution")

    if class_group_ids:
        groups = db.scalars(select(ClassGroup).where(ClassGroup.id.in_(class_group_ids))).all()
        if len(groups) != len(class_group_ids) or any(
            item.institution_id != institution_id or item.academic_year_id != academic_year_id
            for item in groups
        ):
            raise HTTPException(
                status_code=422,
                detail="All teaching sections must belong to the selected institution and academic year",
            )


def _validate_compartment_scope(
    db: Session,
    *,
    institution_id: UUID,
    academic_year_id: UUID,
    academic_division_id: UUID | None,
    profile: StaffProfile,
    grade_level_ids: list[UUID],
    class_group_ids: list[UUID],
    manager_scope: set[UUID] | None,
) -> None:
    if academic_division_id is None:
        if manager_scope is not None:
            raise HTTPException(
                status_code=403,
                detail="Academic responsibility management requires Principal or School Admin access when no Academic Compartment is supplied",
            )
        return

    division = db.get(AcademicDivision, academic_division_id)
    if division is None or division.institution_id != institution_id or not division.is_active:
        raise HTTPException(status_code=422, detail="Academic Compartment must belong to the selected institution")

    if manager_scope is not None and academic_division_id not in manager_scope:
        raise HTTPException(status_code=403, detail="Academic Compartment is outside your assigned access scope")

    placement = db.scalar(
        select(StaffProfileAcademicDivision.id).where(
            StaffProfileAcademicDivision.staff_profile_id == profile.id,
            StaffProfileAcademicDivision.academic_division_id == academic_division_id,
        )
    )
    if placement is None:
        raise HTTPException(
            status_code=422,
            detail="Staff Profile must be placed in the selected Academic Compartment",
        )

    target_grade_ids = set(grade_level_ids)
    if class_group_ids:
        groups = db.scalars(select(ClassGroup).where(ClassGroup.id.in_(class_group_ids))).all()
        target_grade_ids.update(item.grade_level_id for item in groups)

    if target_grade_ids:
        mapped_grade_ids = set(
            db.scalars(
                select(AcademicDivisionGradeLevel.grade_level_id).where(
                    AcademicDivisionGradeLevel.institution_id == institution_id,
                    AcademicDivisionGradeLevel.academic_year_id == academic_year_id,
                    AcademicDivisionGradeLevel.academic_division_id == academic_division_id,
                    AcademicDivisionGradeLevel.grade_level_id.in_(target_grade_ids),
                )
            ).all()
        )
        if mapped_grade_ids != target_grade_ids:
            raise HTTPException(
                status_code=422,
                detail="All selected grades and sections must belong to the selected Academic Compartment for this academic year",
            )


def _responsibility_read(db: Session, item: StaffAcademicResponsibility) -> StaffAcademicResponsibilityRead:
    profile = db.get(StaffProfile, item.staff_profile_id) if item.staff_profile_id is not None else None
    legacy_user = db.get(UserAccount, item.user_id) if profile is None and item.user_id is not None else None
    subject_ids = db.scalars(
        select(StaffResponsibilitySubject.subject_id).where(
            StaffResponsibilitySubject.responsibility_id == item.id
        )
    ).all()
    grade_ids = db.scalars(
        select(StaffResponsibilityGrade.grade_level_id).where(
            StaffResponsibilityGrade.responsibility_id == item.id
        )
    ).all()
    class_ids = db.scalars(
        select(StaffResponsibilityClassGroup.class_group_id).where(
            StaffResponsibilityClassGroup.responsibility_id == item.id
        )
    ).all()
    return StaffAcademicResponsibilityRead(
        id=item.id,
        staff_profile_id=item.staff_profile_id,
        staff_display_name=(
            profile.full_name
            if profile is not None
            else legacy_user.display_name if legacy_user is not None else "Legacy staff record"
        ),
        linked_user_id=profile.user_id if profile is not None else item.user_id,
        institution_id=item.institution_id,
        academic_year_id=item.academic_year_id,
        academic_division_id=item.academic_division_id,
        responsibility_type=item.responsibility_type,
        display_title=item.display_title,
        is_active=item.is_active,
        subject_ids=list(subject_ids),
        grade_level_ids=list(grade_ids),
        class_group_ids=list(class_ids),
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.post("/subjects", response_model=SubjectRead, status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectCreate,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> Subject:
    _require_subject_admin(payload.institution_id, access, db)
    if db.get(Institution, payload.institution_id) is None:
        raise HTTPException(status_code=404, detail="Institution not found")

    item = Subject(
        id=uuid4(),
        institution_id=payload.institution_id,
        code=payload.code.strip().upper(),
        name=payload.name.strip(),
        is_active=True,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Subject code already exists for this institution") from exc
    db.refresh(item)
    return item


@router.get("/subjects", response_model=list[SubjectRead])
def list_subjects(
    institution_id: UUID,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> list[Subject]:
    require_institution_access(institution_id, access, db)
    return db.scalars(
        select(Subject)
        .where(Subject.institution_id == institution_id, Subject.is_active.is_(True))
        .order_by(Subject.name)
    ).all()


@router.post(
    "/staff-responsibilities",
    response_model=StaffAcademicResponsibilityRead,
    status_code=status.HTTP_201_CREATED,
)
def create_staff_responsibility(
    payload: StaffAcademicResponsibilityCreate,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> StaffAcademicResponsibilityRead:
    manager_scope = _responsibility_manager_scope(payload.institution_id, access, db)

    responsibility_type = payload.responsibility_type.strip().upper()
    subject_ids = _unique_ids(payload.subject_ids)
    grade_level_ids = _unique_ids(payload.grade_level_ids)
    class_group_ids = _unique_ids(payload.class_group_ids)
    _validate_shape(responsibility_type, subject_ids, grade_level_ids, class_group_ids)
    _load_targets(
        db,
        payload.institution_id,
        payload.academic_year_id,
        subject_ids,
        grade_level_ids,
        class_group_ids,
    )

    profile = db.get(StaffProfile, payload.staff_profile_id)
    if profile is None:
        raise HTTPException(status_code=422, detail="Academic responsibility requires a Staff Profile")
    if profile.institution_id != payload.institution_id:
        raise HTTPException(status_code=422, detail="Staff Profile must belong to the selected institution")
    if not profile.is_active:
        raise HTTPException(status_code=422, detail="Academic responsibility requires an active Staff Profile")
    if profile.staff_type != "TEACHING":
        raise HTTPException(status_code=422, detail="Academic responsibility requires Teaching Staff")

    _validate_compartment_scope(
        db,
        institution_id=payload.institution_id,
        academic_year_id=payload.academic_year_id,
        academic_division_id=payload.academic_division_id,
        profile=profile,
        grade_level_ids=grade_level_ids,
        class_group_ids=class_group_ids,
        manager_scope=manager_scope,
    )

    item = StaffAcademicResponsibility(
        id=uuid4(),
        staff_profile_id=profile.id,
        user_id=None,
        institution_id=payload.institution_id,
        academic_year_id=payload.academic_year_id,
        academic_division_id=payload.academic_division_id,
        responsibility_type=responsibility_type,
        display_title=payload.display_title.strip() if payload.display_title else None,
        is_active=True,
    )
    db.add(item)
    db.flush()

    for subject_id in subject_ids:
        db.add(StaffResponsibilitySubject(id=uuid4(), responsibility_id=item.id, subject_id=subject_id))
    for grade_level_id in grade_level_ids:
        db.add(StaffResponsibilityGrade(id=uuid4(), responsibility_id=item.id, grade_level_id=grade_level_id))
    for class_group_id in class_group_ids:
        db.add(StaffResponsibilityClassGroup(id=uuid4(), responsibility_id=item.id, class_group_id=class_group_id))

    db.commit()
    db.refresh(item)
    return _responsibility_read(db, item)


@router.get("/staff-responsibilities", response_model=list[StaffAcademicResponsibilityRead])
def list_staff_responsibilities(
    institution_id: UUID,
    academic_year_id: UUID | None = None,
    academic_division_id: UUID | None = None,
    staff_profile_id: UUID | None = None,
    user_id: UUID | None = None,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> list[StaffAcademicResponsibilityRead]:
    manager_scope = _responsibility_manager_scope(institution_id, access, db)
    stmt = select(StaffAcademicResponsibility).where(
        StaffAcademicResponsibility.institution_id == institution_id,
        StaffAcademicResponsibility.is_active.is_(True),
    )
    if academic_year_id is not None:
        stmt = stmt.where(StaffAcademicResponsibility.academic_year_id == academic_year_id)

    if academic_division_id is not None:
        if manager_scope is not None and academic_division_id not in manager_scope:
            raise HTTPException(status_code=403, detail="Academic Compartment is outside your assigned access scope")
        stmt = stmt.where(StaffAcademicResponsibility.academic_division_id == academic_division_id)
    elif manager_scope is not None:
        stmt = stmt.where(StaffAcademicResponsibility.academic_division_id.in_(manager_scope))

    if staff_profile_id is not None:
        stmt = stmt.where(StaffAcademicResponsibility.staff_profile_id == staff_profile_id)
    if user_id is not None:
        stmt = stmt.where(StaffAcademicResponsibility.user_id == user_id)

    items = db.scalars(
        stmt.order_by(StaffAcademicResponsibility.responsibility_type, StaffAcademicResponsibility.created_at)
    ).all()
    return [_responsibility_read(db, item) for item in items]


@router.delete("/staff-responsibilities/{responsibility_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_staff_responsibility(
    responsibility_id: UUID,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> Response:
    item = db.get(StaffAcademicResponsibility, responsibility_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Academic responsibility not found")

    manager_scope = _responsibility_manager_scope(item.institution_id, access, db)
    if manager_scope is not None and (
        item.academic_division_id is None or item.academic_division_id not in manager_scope
    ):
        raise HTTPException(status_code=403, detail="Academic responsibility is outside your assigned access scope")

    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
