"""Add institution staff profiles and Academic Compartment placement.

Revision ID: 0007_staff_profiles
Revises: 0006_academic_responsibilities
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_staff_profiles"
down_revision = "0006_academic_responsibilities"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "staff_profiles",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("institution_id", sa.Uuid(), sa.ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("employee_code", sa.String(length=80), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("staff_type", sa.String(length=30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.CheckConstraint(
            "staff_type IN ('TEACHING', 'NON_TEACHING')",
            name="ck_staff_profile_type",
        ),
        sa.UniqueConstraint(
            "institution_id",
            "employee_code",
            name="uq_staff_profile_institution_employee_code",
        ),
        sa.UniqueConstraint(
            "institution_id",
            "user_id",
            name="uq_staff_profile_institution_user",
        ),
    )
    op.create_index("ix_staff_profiles_institution_id", "staff_profiles", ["institution_id"])
    op.create_index("ix_staff_profiles_user_id", "staff_profiles", ["user_id"])
    op.create_index("ix_staff_profiles_staff_type", "staff_profiles", ["staff_type"])
    op.create_index("ix_staff_profiles_is_active", "staff_profiles", ["is_active"])

    op.create_table(
        "staff_profile_academic_divisions",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "staff_profile_id",
            sa.Uuid(),
            sa.ForeignKey("staff_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "academic_division_id",
            sa.Uuid(),
            sa.ForeignKey("academic_divisions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        *_timestamps(),
        sa.UniqueConstraint(
            "staff_profile_id",
            "academic_division_id",
            name="uq_staff_profile_academic_division",
        ),
    )
    op.create_index(
        "ix_staff_profile_academic_divisions_staff_profile_id",
        "staff_profile_academic_divisions",
        ["staff_profile_id"],
    )
    op.create_index(
        "ix_staff_profile_academic_divisions_academic_division_id",
        "staff_profile_academic_divisions",
        ["academic_division_id"],
    )


def downgrade() -> None:
    op.drop_table("staff_profile_academic_divisions")
    op.drop_table("staff_profiles")
