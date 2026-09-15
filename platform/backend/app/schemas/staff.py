from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StaffProfileCreate(BaseModel):
    institution_id: UUID
    full_name: str = Field(min_length=1, max_length=255)
    staff_type: str = Field(min_length=1, max_length=30)
    employee_code: str | None = Field(default=None, max_length=80)
    user_id: UUID | None = None
    academic_division_ids: list[UUID] = Field(default_factory=list)


class StaffProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    staff_type: str | None = Field(default=None, min_length=1, max_length=30)
    employee_code: str | None = Field(default=None, max_length=80)
    user_id: UUID | None = None
    academic_division_ids: list[UUID] | None = None
    is_active: bool | None = None


class StaffProfileRead(BaseModel):
    id: UUID
    institution_id: UUID
    user_id: UUID | None
    employee_code: str | None
    full_name: str
    staff_type: str
    is_active: bool
    academic_division_ids: list[UUID]
    created_at: datetime
    updated_at: datetime
