from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access, require_academic_setup_write
from ..database import get_db
from ..models.foundation import AcademicDivision, AcademicDivisionGradeLevel
from ..schemas.foundation import AcademicDivisionGradeLevelRead

router = APIRouter(prefix="/api/v1", tags=["foundation"])


class AcademicDivisionGradeLevelUpdate(BaseModel):
    academic_division_id: UUID | None = None
    sequence_no: int | None = Field(default=None, ge=1)


@router.patch(
    "/academic-division-grade-levels/{item_id}",
    response_model=AcademicDivisionGradeLevelRead,
)
def update_division_grade_mapping(
    item_id: UUID,
    payload: AcademicDivisionGradeLevelUpdate,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
):
    item = db.get(AcademicDivisionGradeLevel, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Division-grade mapping not found")

    require_academic_setup_write(item.institution_id, access, db)
    values = payload.model_dump(exclude_unset=True)

    if "academic_division_id" in values and values["academic_division_id"] is not None:
        division = db.get(AcademicDivision, values["academic_division_id"])
        if division is None:
            raise HTTPException(status_code=404, detail="Academic division not found")
        if division.institution_id != item.institution_id:
            raise HTTPException(status_code=400, detail="Academic division does not belong to this institution")

    for field, value in values.items():
        setattr(item, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Grade mapping update conflicts with existing data") from exc

    db.refresh(item)
    return item
