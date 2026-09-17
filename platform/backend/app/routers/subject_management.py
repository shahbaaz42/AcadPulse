from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access, require_institution_access
from ..database import get_db
from ..models.academic_responsibility import (
    StaffAcademicResponsibility,
    StaffResponsibilitySubject,
    Subject,
    SubjectAcademicDivision,
)
from ..models.foundation import AcademicDivision

router = APIRouter(prefix="/api/v1", tags=["subject-management"])


def _can_manage_subject_in_division(
    institution_id: UUID,
    academic_division_id: UUID,
    access: AccessContext,
    db: Session,
) -> None:
    require_institution_access(institution_id, access, db)
    if access.is_platform_admin:
        return

    for assignment in access.assignments:
        if assignment.institution_id != institution_id:
            continue
        if assignment.scope_type == "institution" and assignment.role_code in {"PRINCIPAL", "SCHOOL_ADMIN"}:
            return
        if (
            assignment.role_code == "COMPARTMENT_HEAD"
            and assignment.scope_type == "academic_compartment"
            and assignment.academic_division_id == academic_division_id
        ):
            return

    raise HTTPException(
        status_code=403,
        detail="Subject management is outside your assigned Academic Compartment",
    )


@router.delete("/subjects/{subject_id}/academic-divisions/{academic_division_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_subject_from_academic_division(
    subject_id: UUID,
    academic_division_id: UUID,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> Response:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    division = db.get(AcademicDivision, academic_division_id)
    if division is None or division.institution_id != subject.institution_id:
        raise HTTPException(status_code=404, detail="Academic Compartment not found")

    _can_manage_subject_in_division(subject.institution_id, academic_division_id, access, db)

    mapping = db.scalar(
        select(SubjectAcademicDivision).where(
            SubjectAcademicDivision.subject_id == subject_id,
            SubjectAcademicDivision.academic_division_id == academic_division_id,
        )
    )
    if mapping is None:
        raise HTTPException(status_code=404, detail="Subject is not available in this Academic Compartment")

    active_use = db.scalar(
        select(StaffAcademicResponsibility.id)
        .join(
            StaffResponsibilitySubject,
            StaffResponsibilitySubject.responsibility_id == StaffAcademicResponsibility.id,
        )
        .where(
            StaffResponsibilitySubject.subject_id == subject_id,
            StaffAcademicResponsibility.academic_division_id == academic_division_id,
            StaffAcademicResponsibility.is_active.is_(True),
        )
        .limit(1)
    )
    if active_use is not None:
        raise HTTPException(
            status_code=409,
            detail="Remove this subject's active academic responsibilities before removing it from the Academic Compartment",
        )

    db.delete(mapping)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
