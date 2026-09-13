from uuid import UUID

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class AccessAssignmentRead(BaseModel):
    role_code: str
    role_name: str
    scope_type: str
    organization_id: UUID | None = None
    institution_id: UUID | None = None


class CurrentUserRead(BaseModel):
    id: UUID
    email: str
    display_name: str
    is_platform_admin: bool
    assignments: list[AccessAssignmentRead]
