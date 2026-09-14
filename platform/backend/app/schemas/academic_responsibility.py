from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SubjectCreate(BaseModel):
    institution_id: UUID
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=120)


class SubjectRead(ORMModel):
    id: UUID
    institution_id: UUID
    code: str
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StaffAcademicResponsibilityCreate(BaseModel):
    user_id: UUID
    institution_id: UUID
    academic_year_id: UUID
    responsibility_type: str = Field(min_length=1, max_length=40)
    display_title: str | None = Field(default=None, max_length=120)
    subject_ids: list[UUID] = Field(default_factory=list)
    grade_level_ids: list[UUID] = Field(default_factory=list)
    class_group_ids: list[UUID] = Field(default_factory=list)


class StaffAcademicResponsibilityRead(BaseModel):
    id: UUID
    user_id: UUID
    user_display_name: str
    institution_id: UUID
    academic_year_id: UUID
    responsibility_type: str
    display_title: str | None
    is_active: bool
    subject_ids: list[UUID]
    grade_level_ids: list[UUID]
    class_group_ids: list[UUID]
    created_at: datetime
    updated_at: datetime
