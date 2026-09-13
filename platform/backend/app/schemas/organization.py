from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class OrganizationCreate(BaseModel):
    organization_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    status: str = Field(default="active", min_length=1, max_length=30)


class OrganizationRead(ORMModel):
    id: UUID
    organization_code: str
    name: str
    display_name: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class InstitutionOrganizationAssign(BaseModel):
    organization_id: UUID
