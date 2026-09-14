"""Add subjects and staff academic responsibility assignments.

Revision ID: 0006_academic_responsibilities
Revises: 0005_compartment_head_scope
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_academic_responsibilities"
down_revision = "0005_compartment_head_scope"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "subjects",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("institution_id", sa.Uuid(), sa.ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.UniqueConstraint("institution_id", "code", name="uq_subject_institution_code"),
    )
    op.create_index("ix_subjects_institution_id", "subjects", ["institution_id"])

    op.create_table(
        "staff_academic_responsibilities",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("institution_id", sa.Uuid(), sa.ForeignKey("institutions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("academic_year_id", sa.Uuid(), sa.ForeignKey("academic_years.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("responsibility_type", sa.String(length=40), nullable=False),
        sa.Column("display_title", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.CheckConstraint(
            "responsibility_type IN ('SUBJECT_TEACHER', 'CLASS_TEACHER', 'HOD', 'OVERALL_CLASS_INCHARGE')",
            name="ck_staff_academic_responsibility_type",
        ),
    )
    op.create_index("ix_staff_academic_responsibilities_user_id", "staff_academic_responsibilities", ["user_id"])
    op.create_index("ix_staff_academic_responsibilities_institution_id", "staff_academic_responsibilities", ["institution_id"])
    op.create_index("ix_staff_academic_responsibilities_academic_year_id", "staff_academic_responsibilities", ["academic_year_id"])
    op.create_index("ix_staff_academic_responsibilities_type", "staff_academic_responsibilities", ["responsibility_type"])

    op.create_table(
        "staff_responsibility_subjects",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("responsibility_id", sa.Uuid(), sa.ForeignKey("staff_academic_responsibilities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Uuid(), sa.ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("responsibility_id", "subject_id", name="uq_staff_responsibility_subject"),
    )
    op.create_index("ix_staff_responsibility_subjects_responsibility_id", "staff_responsibility_subjects", ["responsibility_id"])
    op.create_index("ix_staff_responsibility_subjects_subject_id", "staff_responsibility_subjects", ["subject_id"])

    op.create_table(
        "staff_responsibility_grades",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("responsibility_id", sa.Uuid(), sa.ForeignKey("staff_academic_responsibilities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("grade_level_id", sa.Uuid(), sa.ForeignKey("grade_levels.id", ondelete="RESTRICT"), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("responsibility_id", "grade_level_id", name="uq_staff_responsibility_grade"),
    )
    op.create_index("ix_staff_responsibility_grades_responsibility_id", "staff_responsibility_grades", ["responsibility_id"])
    op.create_index("ix_staff_responsibility_grades_grade_level_id", "staff_responsibility_grades", ["grade_level_id"])

    op.create_table(
        "staff_responsibility_class_groups",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("responsibility_id", sa.Uuid(), sa.ForeignKey("staff_academic_responsibilities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_group_id", sa.Uuid(), sa.ForeignKey("class_groups.id", ondelete="RESTRICT"), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("responsibility_id", "class_group_id", name="uq_staff_responsibility_class_group"),
    )
    op.create_index("ix_staff_responsibility_class_groups_responsibility_id", "staff_responsibility_class_groups", ["responsibility_id"])
    op.create_index("ix_staff_responsibility_class_groups_class_group_id", "staff_responsibility_class_groups", ["class_group_id"])


def downgrade() -> None:
    op.drop_table("staff_responsibility_class_groups")
    op.drop_table("staff_responsibility_grades")
    op.drop_table("staff_responsibility_subjects")
    op.drop_table("staff_academic_responsibilities")
    op.drop_table("subjects")
