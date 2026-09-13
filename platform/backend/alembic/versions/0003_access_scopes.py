"""Add user accounts, roles, and scoped role assignments.

Revision ID: 0003_access_scopes
Revises: 0002_organizations
"""

from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision = "0003_access_scopes"
down_revision = "0002_organizations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
        sa.Column("is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_user_accounts_email"),
    )
    op.create_index("ix_user_accounts_email", "user_accounts", ["email"], unique=False)

    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("default_scope_type", sa.String(length=30), nullable=False),
        sa.Column("is_system_role", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_roles_code"),
    )

    op.create_table(
        "user_role_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("scope_type", sa.String(length=30), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=True),
        sa.Column("institution_id", sa.Uuid(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("scope_type IN ('platform', 'organization', 'institution')", name="ck_user_role_scope_type"),
        sa.CheckConstraint(
            "(scope_type = 'platform' AND organization_id IS NULL AND institution_id IS NULL) OR "
            "(scope_type = 'organization' AND organization_id IS NOT NULL AND institution_id IS NULL) OR "
            "(scope_type = 'institution' AND organization_id IS NULL AND institution_id IS NOT NULL)",
            name="ck_user_role_scope_target",
        ),
        sa.ForeignKeyConstraint(["institution_id"], ["institutions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["user_accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_role_assignments_user_id", "user_role_assignments", ["user_id"], unique=False)
    op.create_index("ix_user_role_assignments_role_id", "user_role_assignments", ["role_id"], unique=False)
    op.create_index("ix_user_role_assignments_scope_type", "user_role_assignments", ["scope_type"], unique=False)
    op.create_index("ix_user_role_assignments_organization_id", "user_role_assignments", ["organization_id"], unique=False)
    op.create_index("ix_user_role_assignments_institution_id", "user_role_assignments", ["institution_id"], unique=False)

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
        [
            {"id": uuid4(), "code": "PLATFORM_ADMIN", "name": "AcadPulse Platform Admin", "default_scope_type": "platform", "is_system_role": True, "is_active": True},
            {"id": uuid4(), "code": "MANAGEMENT_ADMIN", "name": "Management / Group Admin", "default_scope_type": "organization", "is_system_role": True, "is_active": True},
            {"id": uuid4(), "code": "PRINCIPAL", "name": "Principal", "default_scope_type": "institution", "is_system_role": True, "is_active": True},
            {"id": uuid4(), "code": "SCHOOL_ADMIN", "name": "School Admin", "default_scope_type": "institution", "is_system_role": True, "is_active": True},
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_user_role_assignments_institution_id", table_name="user_role_assignments")
    op.drop_index("ix_user_role_assignments_organization_id", table_name="user_role_assignments")
    op.drop_index("ix_user_role_assignments_scope_type", table_name="user_role_assignments")
    op.drop_index("ix_user_role_assignments_role_id", table_name="user_role_assignments")
    op.drop_index("ix_user_role_assignments_user_id", table_name="user_role_assignments")
    op.drop_table("user_role_assignments")
    op.drop_table("roles")
    op.drop_index("ix_user_accounts_email", table_name="user_accounts")
    op.drop_table("user_accounts")
