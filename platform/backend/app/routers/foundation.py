from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.foundation import (
    AcademicDivision,
    AcademicDivisionGradeLevel,
    AcademicYear,
    ClassGroup,
    GradeLevel,
    Institution,
)
from ..schemas.foundation import (
    AcademicDivisionCreate,
    AcademicDivisionGradeLevelCreate,
    AcademicDivisionGradeLevelRead,
    AcademicDivisionRead,
    AcademicDivisionUpdate,
    AcademicYearCreate,
    AcademicYearRead,
    AcademicYearUpdate,
    ClassGroupCreate,
    ClassGroupRead,
    ClassGroupUpdate,
    GradeLevelCreate,
    GradeLevelRead,
    GradeLevelUpdate,
    InstitutionCreate,
    InstitutionRead,
    InstitutionUpdate,
)

router = APIRouter(prefix="/api/v1", tags=["foundation"])


def _get_or_404(db: Session, model, object_id: UUID, label: str):
    obj = db.get(model, object_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return obj


def _commit(db: Session, *, conflict_message: str):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=conflict_message) from exc


def _apply_updates(obj, payload):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)


def _ensure_institution(record, institution_id: UUID, label: str) -> None:
    if record.institution_id != institution_id:
        raise HTTPException(status_code=400, detail=f"{label} does not belong to this institution")


# Institutions
@router.post("/institutions", response_model=InstitutionRead, status_code=status.HTTP_201_CREATED)
def create_institution(payload: InstitutionCreate, db: Session = Depends(get_db)):
    item = Institution(**payload.model_dump())
    db.add(item)
    _commit(db, conflict_message="Institution code already exists")
    db.refresh(item)
    return item


@router.get("/institutions", response_model=list[InstitutionRead])
def list_institutions(db: Session = Depends(get_db)):
    return db.scalars(select(Institution).order_by(Institution.official_name)).all()


@router.get("/institutions/{institution_id}", response_model=InstitutionRead)
def get_institution(institution_id: UUID, db: Session = Depends(get_db)):
    return _get_or_404(db, Institution, institution_id, "Institution")


@router.patch("/institutions/{institution_id}", response_model=InstitutionRead)
def update_institution(institution_id: UUID, payload: InstitutionUpdate, db: Session = Depends(get_db)):
    item = _get_or_404(db, Institution, institution_id, "Institution")
    _apply_updates(item, payload)
    _commit(db, conflict_message="Institution update conflicts with existing data")
    db.refresh(item)
    return item


@router.delete("/institutions/{institution_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_institution(institution_id: UUID, db: Session = Depends(get_db)):
    item = _get_or_404(db, Institution, institution_id, "Institution")
    db.delete(item)
    _commit(db, conflict_message="Institution has dependent records and cannot be deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Academic years
@router.post("/academic-years", response_model=AcademicYearRead, status_code=status.HTTP_201_CREATED)
def create_academic_year(payload: AcademicYearCreate, db: Session = Depends(get_db)):
    _get_or_404(db, Institution, payload.institution_id, "Institution")
    item = AcademicYear(**payload.model_dump())
    db.add(item)
    _commit(db, conflict_message="Academic year already exists for this institution")
    db.refresh(item)
    return item


@router.get("/academic-years", response_model=list[AcademicYearRead])
def list_academic_years(institution_id: UUID | None = None, db: Session = Depends(get_db)):
    stmt = select(AcademicYear)
    if institution_id:
        stmt = stmt.where(AcademicYear.institution_id == institution_id)
    return db.scalars(stmt.order_by(AcademicYear.start_date.desc())).all()


@router.get("/academic-years/{item_id}", response_model=AcademicYearRead)
def get_academic_year(item_id: UUID, db: Session = Depends(get_db)):
    return _get_or_404(db, AcademicYear, item_id, "Academic year")


@router.patch("/academic-years/{item_id}", response_model=AcademicYearRead)
def update_academic_year(item_id: UUID, payload: AcademicYearUpdate, db: Session = Depends(get_db)):
    item = _get_or_404(db, AcademicYear, item_id, "Academic year")
    values = payload.model_dump(exclude_unset=True)
    start_date = values.get("start_date", item.start_date)
    end_date = values.get("end_date", item.end_date)
    if end_date <= start_date:
        raise HTTPException(status_code=422, detail="end_date must be after start_date")
    _apply_updates(item, payload)
    _commit(db, conflict_message="Academic year update conflicts with existing data")
    db.refresh(item)
    return item


@router.delete("/academic-years/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_academic_year(item_id: UUID, db: Session = Depends(get_db)):
    item = _get_or_404(db, AcademicYear, item_id, "Academic year")
    db.delete(item)
    _commit(db, conflict_message="Academic year has dependent records and cannot be deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Academic divisions
@router.post("/academic-divisions", response_model=AcademicDivisionRead, status_code=status.HTTP_201_CREATED)
def create_academic_division(payload: AcademicDivisionCreate, db: Session = Depends(get_db)):
    _get_or_404(db, Institution, payload.institution_id, "Institution")
    item = AcademicDivision(**payload.model_dump())
    db.add(item)
    _commit(db, conflict_message="Academic division code already exists for this institution")
    db.refresh(item)
    return item


@router.get("/academic-divisions", response_model=list[AcademicDivisionRead])
def list_academic_divisions(institution_id: UUID | None = None, db: Session = Depends(get_db)):
    stmt = select(AcademicDivision)
    if institution_id:
        stmt = stmt.where(AcademicDivision.institution_id == institution_id)
    return db.scalars(stmt.order_by(AcademicDivision.display_order, AcademicDivision.name)).all()


@router.get("/academic-divisions/{item_id}", response_model=AcademicDivisionRead)
def get_academic_division(item_id: UUID, db: Session = Depends(get_db)):
    return _get_or_404(db, AcademicDivision, item_id, "Academic division")


@router.patch("/academic-divisions/{item_id}", response_model=AcademicDivisionRead)
def update_academic_division(item_id: UUID, payload: AcademicDivisionUpdate, db: Session = Depends(get_db)):
    item = _get_or_404(db, AcademicDivision, item_id, "Academic division")
    _apply_updates(item, payload)
    _commit(db, conflict_message="Academic division update conflicts with existing data")
    db.refresh(item)
    return item


@router.delete("/academic-divisions/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_academic_division(item_id: UUID, db: Session = Depends(get_db)):
    item = _get_or_404(db, AcademicDivision, item_id, "Academic division")
    db.delete(item)
    _commit(db, conflict_message="Academic division has dependent records and cannot be deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Grade levels
@router.post("/grade-levels", response_model=GradeLevelRead, status_code=status.HTTP_201_CREATED)
def create_grade_level(payload: GradeLevelCreate, db: Session = Depends(get_db)):
    _get_or_404(db, Institution, payload.institution_id, "Institution")
    item = GradeLevel(**payload.model_dump())
    db.add(item)
    _commit(db, conflict_message="Grade level code already exists for this institution")
    db.refresh(item)
    return item


@router.get("/grade-levels", response_model=list[GradeLevelRead])
def list_grade_levels(institution_id: UUID | None = None, db: Session = Depends(get_db)):
    stmt = select(GradeLevel)
    if institution_id:
        stmt = stmt.where(GradeLevel.institution_id == institution_id)
    return db.scalars(stmt.order_by(GradeLevel.level_order, GradeLevel.display_name)).all()


@router.get("/grade-levels/{item_id}", response_model=GradeLevelRead)
def get_grade_level(item_id: UUID, db: Session = Depends(get_db)):
    return _get_or_404(db, GradeLevel, item_id, "Grade level")


@router.patch("/grade-levels/{item_id}", response_model=GradeLevelRead)
def update_grade_level(item_id: UUID, payload: GradeLevelUpdate, db: Session = Depends(get_db)):
    item = _get_or_404(db, GradeLevel, item_id, "Grade level")
    _apply_updates(item, payload)
    _commit(db, conflict_message="Grade level update conflicts with existing data")
    db.refresh(item)
    return item


@router.delete("/grade-levels/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grade_level(item_id: UUID, db: Session = Depends(get_db)):
    item = _get_or_404(db, GradeLevel, item_id, "Grade level")
    db.delete(item)
    _commit(db, conflict_message="Grade level has dependent records and cannot be deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Division-to-grade mapping
@router.post(
    "/academic-division-grade-levels",
    response_model=AcademicDivisionGradeLevelRead,
    status_code=status.HTTP_201_CREATED,
)
def create_division_grade_mapping(payload: AcademicDivisionGradeLevelCreate, db: Session = Depends(get_db)):
    _get_or_404(db, Institution, payload.institution_id, "Institution")
    year = _get_or_404(db, AcademicYear, payload.academic_year_id, "Academic year")
    division = _get_or_404(db, AcademicDivision, payload.academic_division_id, "Academic division")
    grade = _get_or_404(db, GradeLevel, payload.grade_level_id, "Grade level")
    _ensure_institution(year, payload.institution_id, "Academic year")
    _ensure_institution(division, payload.institution_id, "Academic division")
    _ensure_institution(grade, payload.institution_id, "Grade level")
    item = AcademicDivisionGradeLevel(**payload.model_dump())
    db.add(item)
    _commit(db, conflict_message="Grade level is already mapped for this academic year")
    db.refresh(item)
    return item


@router.get("/academic-division-grade-levels", response_model=list[AcademicDivisionGradeLevelRead])
def list_division_grade_mappings(
    institution_id: UUID | None = None,
    academic_year_id: UUID | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(AcademicDivisionGradeLevel)
    if institution_id:
        stmt = stmt.where(AcademicDivisionGradeLevel.institution_id == institution_id)
    if academic_year_id:
        stmt = stmt.where(AcademicDivisionGradeLevel.academic_year_id == academic_year_id)
    return db.scalars(stmt.order_by(AcademicDivisionGradeLevel.sequence_no)).all()


@router.delete("/academic-division-grade-levels/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_division_grade_mapping(item_id: UUID, db: Session = Depends(get_db)):
    item = _get_or_404(db, AcademicDivisionGradeLevel, item_id, "Division-grade mapping")
    db.delete(item)
    _commit(db, conflict_message="Division-grade mapping cannot be deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Class groups
@router.post("/class-groups", response_model=ClassGroupRead, status_code=status.HTTP_201_CREATED)
def create_class_group(payload: ClassGroupCreate, db: Session = Depends(get_db)):
    _get_or_404(db, Institution, payload.institution_id, "Institution")
    year = _get_or_404(db, AcademicYear, payload.academic_year_id, "Academic year")
    grade = _get_or_404(db, GradeLevel, payload.grade_level_id, "Grade level")
    _ensure_institution(year, payload.institution_id, "Academic year")
    _ensure_institution(grade, payload.institution_id, "Grade level")
    mapping = db.scalar(
        select(AcademicDivisionGradeLevel).where(
            AcademicDivisionGradeLevel.academic_year_id == payload.academic_year_id,
            AcademicDivisionGradeLevel.grade_level_id == payload.grade_level_id,
        )
    )
    if mapping is None:
        raise HTTPException(status_code=400, detail="Grade level must be mapped to an academic division for this year")
    item = ClassGroup(**payload.model_dump())
    db.add(item)
    _commit(db, conflict_message="Class group already exists for this academic year and grade")
    db.refresh(item)
    return item


@router.get("/class-groups", response_model=list[ClassGroupRead])
def list_class_groups(
    institution_id: UUID | None = None,
    academic_year_id: UUID | None = None,
    grade_level_id: UUID | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(ClassGroup)
    if institution_id:
        stmt = stmt.where(ClassGroup.institution_id == institution_id)
    if academic_year_id:
        stmt = stmt.where(ClassGroup.academic_year_id == academic_year_id)
    if grade_level_id:
        stmt = stmt.where(ClassGroup.grade_level_id == grade_level_id)
    return db.scalars(stmt.order_by(ClassGroup.display_name)).all()


@router.get("/class-groups/{item_id}", response_model=ClassGroupRead)
def get_class_group(item_id: UUID, db: Session = Depends(get_db)):
    return _get_or_404(db, ClassGroup, item_id, "Class group")


@router.patch("/class-groups/{item_id}", response_model=ClassGroupRead)
def update_class_group(item_id: UUID, payload: ClassGroupUpdate, db: Session = Depends(get_db)):
    item = _get_or_404(db, ClassGroup, item_id, "Class group")
    _apply_updates(item, payload)
    _commit(db, conflict_message="Class group update conflicts with existing data")
    db.refresh(item)
    return item


@router.delete("/class-groups/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class_group(item_id: UUID, db: Session = Depends(get_db)):
    item = _get_or_404(db, ClassGroup, item_id, "Class group")
    db.delete(item)
    _commit(db, conflict_message="Class group has dependent records and cannot be deleted")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
