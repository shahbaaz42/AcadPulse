"""add organizations and institution grouping

Revision ID: 0002_organizations
Revises: 0001_foundation
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_organizations"
down_revision = "0001_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_code"),
    )
    op.add_column("institutions", sa.Column("organization_id", sa.Uuid(), nullable=True))
    op.create_index("ix_institutions_organization_id", "institutions", ["organization_id"], unique=False)
    op.create_foreign_key(
        "fk_institutions_organization_id_organizations",
        "institutions",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_institutions_organization_id_organizations", "institutions", type_="foreignkey")
    op.drop_index("ix_institutions_organization_id", table_name="institutions")
    op.drop_column("institutions", "organization_id")
    op.drop_table("organizations")
