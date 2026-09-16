"""Scope canonical subjects to Academic Compartments.

Revision ID: 0010_subject_comp_scope
Revises: 0009_resp_compartment
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_subject_comp_scope"
down_revision = "0009_resp_compartment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "subject_academic_divisions",
        sa.Column(
            "subject_id",
            sa.Uuid(),
            sa.ForeignKey("subjects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "academic_division_id",
            sa.Uuid(),
            sa.ForeignKey("academic_divisions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint(
            "subject_id",
            "academic_division_id",
            name="pk_subject_academic_divisions",
        ),
    )
    op.create_index(
        "ix_subject_academic_divisions_division_id",
        "subject_academic_divisions",
        ["academic_division_id"],
    )

    # Preserve the previous institution-wide availability of any subjects that
    # already exist when this migration runs. Future subjects may be attached
    # only to the Academic Compartment(s) that actually use them.
    op.execute(
        """
        INSERT INTO subject_academic_divisions (subject_id, academic_division_id)
        SELECT subject.id, division.id
        FROM subjects AS subject
        JOIN academic_divisions AS division
          ON division.institution_id = subject.institution_id
        WHERE subject.is_active IS TRUE
          AND division.is_active IS TRUE
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_subject_academic_divisions_division_id",
        table_name="subject_academic_divisions",
    )
    op.drop_table("subject_academic_divisions")
