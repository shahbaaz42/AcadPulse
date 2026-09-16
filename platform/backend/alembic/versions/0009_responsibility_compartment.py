"""Scope academic responsibilities to an Academic Compartment.

Revision ID: 0009_resp_compartment
Revises: 0008_staff_profile_resp
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_resp_compartment"
down_revision = "0008_staff_profile_resp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "staff_academic_responsibilities",
        sa.Column(
            "academic_division_id",
            sa.Uuid(),
            sa.ForeignKey("academic_divisions.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_staff_academic_responsibilities_academic_division_id",
        "staff_academic_responsibilities",
        ["academic_division_id"],
    )

    # Safe backfill for existing Staff-Profile-owned rows when the teacher has
    # exactly one Academic Compartment placement. Ambiguous legacy rows remain
    # nullable and continue to be manageable only by institution-wide admins.
    op.execute(
        """
        UPDATE staff_academic_responsibilities AS responsibility
        SET academic_division_id = placement.academic_division_id
        FROM (
            SELECT staff_profile_id, MIN(academic_division_id) AS academic_division_id
            FROM staff_profile_academic_divisions
            GROUP BY staff_profile_id
            HAVING COUNT(*) = 1
        ) AS placement
        WHERE responsibility.academic_division_id IS NULL
          AND responsibility.staff_profile_id = placement.staff_profile_id
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_staff_academic_responsibilities_academic_division_id",
        table_name="staff_academic_responsibilities",
    )
    op.drop_column("staff_academic_responsibilities", "academic_division_id")
