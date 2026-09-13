from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access
from ..database import get_db
from ..models.access import UserAccount
from ..schemas.auth import AccessAssignmentRead, CurrentUserRead, LoginRequest, TokenResponse
from ..security import create_access_token, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.strip().lower()
    user = db.scalar(select(UserAccount).where(func.lower(UserAccount.email) == email))
    if user is None or user.status != "active" or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token, expires_in = create_access_token(user.id)
    return TokenResponse(access_token=access_token, expires_in=expires_in)


@router.get("/me", response_model=CurrentUserRead)
def current_user(access: AccessContext = Depends(get_current_access)) -> CurrentUserRead:
    return CurrentUserRead(
        id=access.user.id,
        email=access.user.email,
        display_name=access.user.display_name,
        is_platform_admin=access.is_platform_admin,
        assignments=[
            AccessAssignmentRead(
                role_code=assignment.role_code,
                role_name=assignment.role_name,
                scope_type=assignment.scope_type,
                organization_id=assignment.organization_id,
                institution_id=assignment.institution_id,
            )
            for assignment in access.assignments
        ],
    )
