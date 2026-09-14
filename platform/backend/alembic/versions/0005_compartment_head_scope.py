"""Add compartment-scoped Compartment Head role assignments.

Revision ID: 0005_compartment_head_scope
Revises: 0004_authentication
"""

from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision = "0005_compartment_head_scope"
down_revision = "0004_authentication"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_role_assignments",
        sa.Column("academic_division_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_user_role_assignments_academic_division_id",
        "user_role_assignments",
        "academic_divisions",
        ["academic_division_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_user_role_assignments_academic_division_id",
        "user_role_assignments",
        ["academic_division_id"],
        unique=False,
    )

    op.drop_constraint("ck_user_role_scope_type", "user_role_assignments", type_="check")
    op.drop_constraint("ck_user_role_scope_target", "user_role_assignments", type_="check")
    op.create_check_constraint(
        "ck_user_role_scope_type",
        "user_role_assignments",
        "scope_type IN ('platform', 'organization', 'institution', 'academic_compartment')",
    )
    op.create_check_constraint(
        "ck_user_role_scope_target",
        "user_role_assignments",
        "(scope_type = 'platform' AND organization_id IS NULL AND institution_id IS NULL AND academic_division_id IS NULL) OR "
        "(scope_type = 'organization' AND organization_id IS NOT NULL AND institution_id IS NULL AND academic_division_id IS NULL) OR "
        "(scope_type = 'institution' AND organization_id IS NULL AND institution_id IS NOT NULL AND academic_division_id IS NULL) OR "
        "(scope_type = 'academic_compartment' AND organization_id IS NULL AND institution_id IS NOT NULL AND academic_division_id IS NOT NULL)",
    )

    roles = sa.table(
        "roles",
        sa.column("id", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("default_scope_type", sa.String()),
        sa.column("is_system_role", sa.Boolean()),
        sa.column("is_active", sa.Boolean()),
    )
    op.bulk_insert(
        roles,
        [{
            "id": uuid4(),
            "code": "COMPARTMENT_HEAD",
            "name": "Compartment Head",
            "default_scope_type": "academic_compartment",
            "is_system_role": True,
            "is_active": True,
        }],
    )


def downgrade() -> None:
    op.execute("DELETE FROM roles WHERE code = 'COMPARTMENT_HEAD'")
    op.drop_constraint("ck_user_role_scope_type", "user_role_assignments", type_="check")
    op.drop_constraint("ck_user_role_scope_target", "user_role_assignments", type_="check")
    op.create_check_constraint(
        "ck_user_role_scope_type",
        "user_role_assignments",
        "scope_type IN ('platform', 'organization', 'institution')",
    )
    op.create_check_constraint(
        "ck_user_role_scope_target",
        "user_role_assignments",
        "(scope_type = 'platform' AND organization_id IS NULL AND institution_id IS NULL) OR "
        "(scope_type = 'organization' AND organization_id IS NOT NULL AND institution_id IS NULL) OR "
        "(scope_type = 'institution' AND organization_id IS NULL AND institution_id IS NOT NULL)",
    )
    op.drop_index("ix_user_role_assignments_academic_division_id", table_name="user_role_assignments")
    op.drop_constraint("fk_user_role_assignments_academic_division_id", "user_role_assignments", type_="foreignkey")
    op.drop_column("user_role_assignments", "academic_division_id")
