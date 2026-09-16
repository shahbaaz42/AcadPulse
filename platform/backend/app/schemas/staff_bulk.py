from uuid import UUID

from pydantic import BaseModel, Field

from .staff import StaffProfileRead


class StaffProfileBulkItem(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    staff_type: str = Field(min_length=1, max_length=30)
    employee_code: str | None = Field(default=None, max_length=80)
    academic_division_ids: list[UUID] = Field(default_factory=list)


class StaffProfileBulkCreate(BaseModel):
    institution_id: UUID
    items: list[StaffProfileBulkItem] = Field(min_length=1, max_length=500)


class StaffProfileBulkSkipped(BaseModel):
    row_number: int
    full_name: str
    reason: str


class StaffProfileBulkResult(BaseModel):
    created_count: int
    skipped_count: int
    profiles: list[StaffProfileRead]
    skipped: list[StaffProfileBulkSkipped]
