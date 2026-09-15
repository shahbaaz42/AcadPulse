from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class StaffTimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class StaffProfile(StaffTimestampMixin, Base):
    __tablename__ = "staff_profiles"
    __table_args__ = (
        CheckConstraint(
            "staff_type IN ('TEACHING', 'NON_TEACHING')",
            name="ck_staff_profile_type",
        ),
        UniqueConstraint("institution_id", "employee_code", name="uq_staff_profile_institution_employee_code"),
        UniqueConstraint("institution_id", "user_id", name="uq_staff_profile_institution_user"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    institution_id: Mapped[UUID] = mapped_column(
        ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("user_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    employee_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    staff_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)


class StaffProfileAcademicDivision(StaffTimestampMixin, Base):
    __tablename__ = "staff_profile_academic_divisions"
    __table_args__ = (
        UniqueConstraint(
            "staff_profile_id",
            "academic_division_id",
            name="uq_staff_profile_academic_division",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    staff_profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    academic_division_id: Mapped[UUID] = mapped_column(
        ForeignKey("academic_divisions.id", ondelete="RESTRICT"), nullable=False, index=True
    )
