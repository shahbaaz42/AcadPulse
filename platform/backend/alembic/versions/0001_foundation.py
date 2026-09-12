"""Create AcadPulse foundation tables.

Revision ID: 0001_foundation
Revises:
Create Date: 2026-09-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_foundation"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "institutions",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("institution_code", sa.String(length=50), nullable=False),
        sa.Column("official_name", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("timezone", sa.String(length=100), nullable=False, server_default="Asia/Kolkata"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
        *_timestamps(),
        sa.UniqueConstraint("institution_code", name="uq_institutions_institution_code"),
    )

    op.create_table(
        "academic_years",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("institution_id", sa.Uuid(), sa.ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="draft"),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        *_timestamps(),
        sa.UniqueConstraint("institution_id", "name", name="uq_academic_year_institution_name"),
        sa.CheckConstraint("start_date < end_date", name="ck_academic_year_date_order"),
    )
    op.create_index("ix_academic_years_institution_id", "academic_years", ["institution_id"])

    op.create_table(
        "academic_divisions",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("institution_id", sa.Uuid(), sa.ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.UniqueConstraint("institution_id", "code", name="uq_academic_division_institution_code"),
    )
    op.create_index("ix_academic_divisions_institution_id", "academic_divisions", ["institution_id"])

    op.create_table(
        "grade_levels",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("institution_id", sa.Uuid(), sa.ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("level_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.UniqueConstraint("institution_id", "code", name="uq_grade_level_institution_code"),
    )
    op.create_index("ix_grade_levels_institution_id", "grade_levels", ["institution_id"])

    op.create_table(
        "academic_division_grade_levels",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("institution_id", sa.Uuid(), sa.ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), sa.ForeignKey("academic_years.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("academic_division_id", sa.Uuid(), sa.ForeignKey("academic_divisions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("grade_level_id", sa.Uuid(), sa.ForeignKey("grade_levels.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("sequence_no", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("academic_year_id", "grade_level_id", name="uq_year_grade_division_mapping"),
    )
    op.create_index("ix_adgl_institution_id", "academic_division_grade_levels", ["institution_id"])
    op.create_index("ix_adgl_academic_year_id", "academic_division_grade_levels", ["academic_year_id"])
    op.create_index("ix_adgl_division_id", "academic_division_grade_levels", ["academic_division_id"])
    op.create_index("ix_adgl_grade_level_id", "academic_division_grade_levels", ["grade_level_id"])

    op.create_table(
        "class_groups",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("institution_id", sa.Uuid(), sa.ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), sa.ForeignKey("academic_years.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("grade_level_id", sa.Uuid(), sa.ForeignKey("grade_levels.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("section_code", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
        *_timestamps(),
        sa.UniqueConstraint(
            "institution_id",
            "academic_year_id",
            "grade_level_id",
            "section_code",
            name="uq_class_group_year_grade_section",
        ),
    )
    op.create_index("ix_class_groups_institution_id", "class_groups", ["institution_id"])
    op.create_index("ix_class_groups_academic_year_id", "class_groups", ["academic_year_id"])
    op.create_index("ix_class_groups_grade_level_id", "class_groups", ["grade_level_id"])


def downgrade() -> None:
    op.drop_table("class_groups")
    op.drop_table("academic_division_grade_levels")
    op.drop_table("grade_levels")
    op.drop_table("academic_divisions")
    op.drop_table("academic_years")
    op.drop_table("institutions")
