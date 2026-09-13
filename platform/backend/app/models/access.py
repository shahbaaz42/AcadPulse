from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class AccessTimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class UserAccount(AccessTimestampMixin, Base):
    __tablename__ = "user_accounts"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Role(AccessTimestampMixin, Base):
    __tablename__ = "roles"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    default_scope_type: Mapped[str] = mapped_column(String(30), nullable=False)
    is_system_role: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class UserRoleAssignment(AccessTimestampMixin, Base):
    __tablename__ = "user_role_assignments"
    __table_args__ = (
        CheckConstraint(
            "scope_type IN ('platform', 'organization', 'institution')",
            name="ck_user_role_scope_type",
        ),
        CheckConstraint(
            "(scope_type = 'platform' AND organization_id IS NULL AND institution_id IS NULL) OR "
            "(scope_type = 'organization' AND organization_id IS NOT NULL AND institution_id IS NULL) OR "
            "(scope_type = 'institution' AND organization_id IS NULL AND institution_id IS NOT NULL)",
            name="ck_user_role_scope_target",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id: Mapped[UUID] = mapped_column(ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False, index=True)
    scope_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    organization_id: Mapped[UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), index=True)
    institution_id: Mapped[UUID | None] = mapped_column(ForeignKey("institutions.id", ondelete="RESTRICT"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
