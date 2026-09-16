from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access
from ..database import get_db
from ..models.staff import StaffProfile
from ..schemas.staff_bulk import (
    StaffProfileBulkCreate,
    StaffProfileBulkResult,
    StaffProfileBulkSkipped,
)
from .staff import (
    _get_institution,
    _normalise_employee_code,
    _normalise_staff_type,
    _replace_divisions,
    _require_staff_mutation,
    _staff_read,
    _validate_divisions,
)

router = APIRouter(prefix="/api/v1/staff-profiles", tags=["staff-profiles"])


def _identity_key(full_name: str, staff_type: str, employee_code: str | None) -> tuple[str, ...]:
    if employee_code:
        return ("employee_code", employee_code)
    return ("name", full_name.casefold(), staff_type)


@router.post("/bulk", response_model=StaffProfileBulkResult, status_code=status.HTTP_201_CREATED)
def bulk_create_staff_profiles(
    payload: StaffProfileBulkCreate,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> StaffProfileBulkResult:
    """Create many Staff Profiles in one transaction, safely skipping exact import duplicates."""
    _require_staff_mutation(payload.institution_id, access, db)
    _get_institution(db, payload.institution_id)

    prepared: list[dict] = []
    for index, source in enumerate(payload.items, start=1):
        full_name = source.full_name.strip()
        if not full_name:
            raise HTTPException(status_code=422, detail=f"Row {index}: Full name cannot be empty")
        staff_type = _normalise_staff_type(source.staff_type)
        employee_code = _normalise_employee_code(source.employee_code)
        division_ids = _validate_divisions(
            db,
            payload.institution_id,
            staff_type,
            source.academic_division_ids,
        )
        prepared.append(
            {
                "row_number": index,
                "full_name": full_name,
                "staff_type": staff_type,
                "employee_code": employee_code,
                "division_ids": division_ids,
            }
        )

    existing = db.scalars(
        select(StaffProfile).where(StaffProfile.institution_id == payload.institution_id)
    ).all()
    seen_keys = {
        _identity_key(item.full_name.strip(), item.staff_type, _normalise_employee_code(item.employee_code))
        for item in existing
    }

    created_items: list[StaffProfile] = []
    skipped: list[StaffProfileBulkSkipped] = []

    try:
        for item in prepared:
            identity = _identity_key(
                item["full_name"],
                item["staff_type"],
                item["employee_code"],
            )
            if identity in seen_keys:
                skipped.append(
                    StaffProfileBulkSkipped(
                        row_number=item["row_number"],
                        full_name=item["full_name"],
                        reason=(
                            "Employee code already exists in this institution"
                            if identity[0] == "employee_code"
                            else "A Staff Profile with the same name and classification already exists"
                        ),
                    )
                )
                continue

            profile = StaffProfile(
                id=uuid4(),
                institution_id=payload.institution_id,
                user_id=None,
                employee_code=item["employee_code"],
                full_name=item["full_name"],
                staff_type=item["staff_type"],
                is_active=True,
            )
            db.add(profile)
            db.flush()
            _replace_divisions(db, profile.id, item["division_ids"])
            created_items.append(profile)
            seen_keys.add(identity)

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Bulk import conflicted with an existing employee code or linked account",
        ) from exc

    for item in created_items:
        db.refresh(item)

    return StaffProfileBulkResult(
        created_count=len(created_items),
        skipped_count=len(skipped),
        profiles=[_staff_read(db, item) for item in created_items],
        skipped=skipped,
    )
