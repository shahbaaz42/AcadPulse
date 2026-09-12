from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Institution(TimestampMixin, Base):
    __tablename__ = "institutions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    institution_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    official_name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(100), default="Asia/Kolkata", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)


class AcademicYear(TimestampMixin, Base):
    __tablename__ = "academic_years"
    __table_args__ = (UniqueConstraint("institution_id", "name", name="uq_academic_year_institution_name"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    institution_id: Mapped[UUID] = mapped_column(ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AcademicDivision(TimestampMixin, Base):
    __tablename__ = "academic_divisions"
    __table_args__ = (UniqueConstraint("institution_id", "code", name="uq_academic_division_institution_code"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    institution_id: Mapped[UUID] = mapped_column(ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class GradeLevel(TimestampMixin, Base):
    __tablename__ = "grade_levels"
    __table_args__ = (UniqueConstraint("institution_id", "code", name="uq_grade_level_institution_code"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    institution_id: Mapped[UUID] = mapped_column(ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    level_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class AcademicDivisionGradeLevel(TimestampMixin, Base):
    __tablename__ = "academic_division_grade_levels"
    __table_args__ = (
        UniqueConstraint("academic_year_id", "grade_level_id", name="uq_year_grade_division_mapping"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    institution_id: Mapped[UUID] = mapped_column(ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False, index=True)
    academic_year_id: Mapped[UUID] = mapped_column(ForeignKey("academic_years.id", ondelete="RESTRICT"), nullable=False, index=True)
    academic_division_id: Mapped[UUID] = mapped_column(ForeignKey("academic_divisions.id", ondelete="RESTRICT"), nullable=False, index=True)
    grade_level_id: Mapped[UUID] = mapped_column(ForeignKey("grade_levels.id", ondelete="RESTRICT"), nullable=False, index=True)
    sequence_no: Mapped[int | None] = mapped_column(Integer)


class ClassGroup(TimestampMixin, Base):
    __tablename__ = "class_groups"
    __table_args__ = (
        UniqueConstraint(
            "institution_id",
            "academic_year_id",
            "grade_level_id",
            "section_code",
            name="uq_class_group_year_grade_section",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    institution_id: Mapped[UUID] = mapped_column(ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False, index=True)
    academic_year_id: Mapped[UUID] = mapped_column(ForeignKey("academic_years.id", ondelete="RESTRICT"), nullable=False, index=True)
    grade_level_id: Mapped[UUID] = mapped_column(ForeignKey("grade_levels.id", ondelete="RESTRICT"), nullable=False, index=True)
    section_code: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
