"""Attach academic responsibilities to staff profiles.

Revision ID: 0008_staff_profile_resp
Revises: 0007_staff_profiles
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_staff_profile_resp"
down_revision = "0007_staff_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "staff_academic_responsibilities",
        sa.Column(
            "staff_profile_id",
            sa.Uuid(),
            sa.ForeignKey("staff_profiles.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_staff_academic_responsibilities_staff_profile_id",
        "staff_academic_responsibilities",
        ["staff_profile_id"],
    )

    # Preserve any pre-Staff-Profile responsibility rows when the linked login
    # account has since been attached to a Staff Profile in the same institution.
    op.execute(
        """
        UPDATE staff_academic_responsibilities AS responsibility
        SET staff_profile_id = profile.id
        FROM staff_profiles AS profile
        WHERE responsibility.staff_profile_id IS NULL
          AND responsibility.user_id IS NOT NULL
          AND profile.user_id = responsibility.user_id
          AND profile.institution_id = responsibility.institution_id
        """
    )

    # New responsibilities are Staff-Profile owned and therefore no longer
    # require the teacher to have a login account. Keep user_id temporarily as
    # nullable legacy provenance for any older rows that could not be backfilled.
    op.alter_column(
        "staff_academic_responsibilities",
        "user_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.create_check_constraint(
        "ck_staff_academic_responsibility_owner",
        "staff_academic_responsibilities",
        "staff_profile_id IS NOT NULL OR user_id IS NOT NULL",
    )


def downgrade() -> None:
    # Restore a legacy user link wherever the Staff Profile has one. Rows created
    # for staff without login accounts cannot exist in the pre-0008 schema.
    op.execute(
        """
        UPDATE staff_academic_responsibilities AS responsibility
        SET user_id = profile.user_id
        FROM staff_profiles AS profile
        WHERE responsibility.user_id IS NULL
          AND responsibility.staff_profile_id = profile.id
          AND profile.user_id IS NOT NULL
        """
    )
    op.execute(
        "DELETE FROM staff_academic_responsibilities WHERE user_id IS NULL"
    )
    op.drop_constraint(
        "ck_staff_academic_responsibility_owner",
        "staff_academic_responsibilities",
        type_="check",
    )
    op.alter_column(
        "staff_academic_responsibilities",
        "user_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.drop_index(
        "ix_staff_academic_responsibilities_staff_profile_id",
        table_name="staff_academic_responsibilities",
    )
    op.drop_column("staff_academic_responsibilities", "staff_profile_id")
