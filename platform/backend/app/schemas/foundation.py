from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class InstitutionCreate(BaseModel):
    institution_code: str = Field(min_length=1, max_length=50)
    official_name: str = Field(min_length=1, max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    timezone: str = Field(default="Asia/Kolkata", min_length=1, max_length=100)
    status: str = Field(default="active", min_length=1, max_length=30)


class InstitutionUpdate(BaseModel):
    official_name: str | None = Field(default=None, min_length=1, max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    timezone: str | None = Field(default=None, min_length=1, max_length=100)
    status: str | None = Field(default=None, min_length=1, max_length=30)


class InstitutionRead(ORMModel):
    id: UUID
    institution_code: str
    official_name: str
    display_name: str | None
    timezone: str
    status: str
    created_at: datetime
    updated_at: datetime


class AcademicYearCreate(BaseModel):
    institution_id: UUID
    name: str = Field(min_length=1, max_length=50)
    start_date: date
    end_date: date
    status: str = Field(default="draft", max_length=30)
    is_current: bool = False

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class AcademicYearUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = Field(default=None, max_length=30)
    is_current: bool | None = None


class AcademicYearRead(ORMModel):
    id: UUID
    institution_id: UUID
    name: str
    start_date: date
    end_date: date
    status: str
    is_current: bool
    created_at: datetime
    updated_at: datetime


class AcademicDivisionCreate(BaseModel):
    institution_id: UUID
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=120)
    display_order: int = Field(ge=1)
    is_active: bool = True


class AcademicDivisionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    display_order: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class AcademicDivisionRead(ORMModel):
    id: UUID
    institution_id: UUID
    code: str
    name: str
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class GradeLevelCreate(BaseModel):
    institution_id: UUID
    code: str = Field(min_length=1, max_length=50)
    display_name: str = Field(min_length=1, max_length=120)
    level_order: int = Field(ge=1)
    is_active: bool = True


class GradeLevelUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    level_order: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class GradeLevelRead(ORMModel):
    id: UUID
    institution_id: UUID
    code: str
    display_name: str
    level_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AcademicDivisionGradeLevelCreate(BaseModel):
    institution_id: UUID
    academic_year_id: UUID
    academic_division_id: UUID
    grade_level_id: UUID
    sequence_no: int | None = Field(default=None, ge=1)


class AcademicDivisionGradeLevelRead(ORMModel):
    id: UUID
    institution_id: UUID
    academic_year_id: UUID
    academic_division_id: UUID
    grade_level_id: UUID
    sequence_no: int | None
    created_at: datetime
    updated_at: datetime


class ClassGroupCreate(BaseModel):
    institution_id: UUID
    academic_year_id: UUID
    grade_level_id: UUID
    section_code: str = Field(min_length=1, max_length=50)
    display_name: str = Field(min_length=1, max_length=120)
    capacity: int | None = Field(default=None, ge=1)
    status: str = Field(default="active", max_length=30)


class ClassGroupUpdate(BaseModel):
    section_code: str | None = Field(default=None, min_length=1, max_length=50)
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    capacity: int | None = Field(default=None, ge=1)
    status: str | None = Field(default=None, max_length=30)


class ClassGroupRead(ORMModel):
    id: UUID
    institution_id: UUID
    academic_year_id: UUID
    grade_level_id: UUID
    section_code: str
    display_name: str
    capacity: int | None
    status: str
    created_at: datetime
    updated_at: datetime
