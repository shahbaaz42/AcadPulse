from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..access_control import (
    AccessContext,
    get_current_access,
    require_organization_access,
    require_platform_admin,
)
from ..database import get_db
from ..models.foundation import Institution
from ..models.organization import Organization
from ..schemas.organization import OrganizationCreate, OrganizationRead, InstitutionOrganizationAssign

router = APIRouter(prefix="/api/v1", tags=["organizations"])


def _commit(db: Session, message: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=message) from exc


@router.post("/organizations", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreate,
    db: Session = Depends(get_db),
    _: AccessContext = Depends(require_platform_admin),
):
    item = Organization(**payload.model_dump())
    db.add(item)
    _commit(db, "Organization code already exists")
    db.refresh(item)
    return item


@router.get("/organizations", response_model=list[OrganizationRead])
def list_organizations(
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
):
    stmt = select(Organization)
    if not access.is_platform_admin:
        if not access.organization_ids:
            return []
        stmt = stmt.where(Organization.id.in_(access.organization_ids))
    return db.scalars(stmt.order_by(Organization.name)).all()


@router.get("/organizations/{organization_id}/institutions")
def list_organization_institutions(
    organization_id: UUID,
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
):
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    require_organization_access(organization_id, access)
    items = db.scalars(
        select(Institution)
        .where(Institution.organization_id == organization_id)
        .order_by(Institution.official_name)
    ).all()
    return [
        {
            "id": item.id,
            "organization_id": item.organization_id,
            "institution_code": item.institution_code,
            "official_name": item.official_name,
            "display_name": item.display_name,
            "status": item.status,
        }
        for item in items
    ]


@router.patch("/institutions/{institution_id}/organization")
def assign_institution_to_organization(
    institution_id: UUID,
    payload: InstitutionOrganizationAssign,
    db: Session = Depends(get_db),
    _: AccessContext = Depends(require_platform_admin),
):
    institution = db.get(Institution, institution_id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    organization = db.get(Organization, payload.organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    institution.organization_id = organization.id
    _commit(db, "Could not assign institution to organization")
    db.refresh(institution)
    return {
        "id": institution.id,
        "organization_id": institution.organization_id,
        "institution_code": institution.institution_code,
        "official_name": institution.official_name,
        "display_name": institution.display_name,
        "status": institution.status,
    }
