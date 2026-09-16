from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class AcademicResponsibilityTimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Subject(AcademicResponsibilityTimestampMixin, Base):
    __tablename__ = "subjects"
    __table_args__ = (
        UniqueConstraint("institution_id", "code", name="uq_subject_institution_code"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    institution_id: Mapped[UUID] = mapped_column(ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class StaffAcademicResponsibility(AcademicResponsibilityTimestampMixin, Base):
    __tablename__ = "staff_academic_responsibilities"
    __table_args__ = (
        CheckConstraint(
            "responsibility_type IN ('SUBJECT_TEACHER', 'CLASS_TEACHER', 'HOD', 'OVERALL_CLASS_INCHARGE')",
            name="ck_staff_academic_responsibility_type",
        ),
        CheckConstraint(
            "staff_profile_id IS NOT NULL OR user_id IS NOT NULL",
            name="ck_staff_academic_responsibility_owner",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    staff_profile_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Legacy provenance only. New responsibilities are owned by StaffProfile so
    # teachers do not need an AcadPulse login account.
    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    institution_id: Mapped[UUID] = mapped_column(ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False, index=True)
    academic_year_id: Mapped[UUID] = mapped_column(ForeignKey("academic_years.id", ondelete="RESTRICT"), nullable=False, index=True)
    # Nullable only for pre-compartment legacy rows. New UI-created assignments
    # always carry the Academic Compartment in which the responsibility applies.
    academic_division_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("academic_divisions.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    responsibility_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    display_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class StaffResponsibilitySubject(AcademicResponsibilityTimestampMixin, Base):
    __tablename__ = "staff_responsibility_subjects"
    __table_args__ = (
        UniqueConstraint("responsibility_id", "subject_id", name="uq_staff_responsibility_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    responsibility_id: Mapped[UUID] = mapped_column(ForeignKey("staff_academic_responsibilities.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[UUID] = mapped_column(ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)


class StaffResponsibilityGrade(AcademicResponsibilityTimestampMixin, Base):
    __tablename__ = "staff_responsibility_grades"
    __table_args__ = (
        UniqueConstraint("responsibility_id", "grade_level_id", name="uq_staff_responsibility_grade"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    responsibility_id: Mapped[UUID] = mapped_column(ForeignKey("staff_academic_responsibilities.id", ondelete="CASCADE"), nullable=False, index=True)
    grade_level_id: Mapped[UUID] = mapped_column(ForeignKey("grade_levels.id", ondelete="RESTRICT"), nullable=False, index=True)


class StaffResponsibilityClassGroup(AcademicResponsibilityTimestampMixin, Base):
    __tablename__ = "staff_responsibility_class_groups"
    __table_args__ = (
        UniqueConstraint("responsibility_id", "class_group_id", name="uq_staff_responsibility_class_group"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    responsibility_id: Mapped[UUID] = mapped_column(ForeignKey("staff_academic_responsibilities.id", ondelete="CASCADE"), nullable=False, index=True)
    class_group_id: Mapped[UUID] = mapped_column(ForeignKey("class_groups.id", ondelete="RESTRICT"), nullable=False, index=True)
