"""Add password hashes for authenticated user accounts.

Revision ID: 0004_authentication
Revises: 0003_access_scopes
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_authentication"
down_revision = "0003_access_scopes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_accounts", sa.Column("password_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("user_accounts", "password_hash")
