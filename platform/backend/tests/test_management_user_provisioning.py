from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models.access import Role, UserAccount, UserRoleAssignment
from app.security import hash_password

client = TestClient(app)


def _create_user(
    role_code: str,
    *,
    organization_id: UUID | None = None,
    institution_id: UUID | None = None,
    platform_admin: bool = False,
) -> tuple[str, str]:
    email = f"{role_code.lower()}-{uuid4().hex[:10]}@example.com"
    password = "AcadPulse-Test-Password-2026!"
    with SessionLocal() as db:
        role = db.scalar(select(Role).where(Role.code == role_code))
        assert role is not None
        user = UserAccount(
            email=email,
            display_name=f"{role_code} Test User",
            password_hash=hash_password(password),
            status="active",
            is_platform_admin=platform_admin,
        )
        db.add(user)
        db.flush()
        db.add(
            UserRoleAssignment(
                user_id=user.id,
                role_id=role.id,
                scope_type=role.default_scope_type,
                organization_id=organization_id,
                institution_id=institution_id,
                is_active=True,
            )
        )
        db.commit()
    return email, password


def _login(email: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _platform_headers() -> dict[str, str]:
    email, password = _create_user("PLATFORM_ADMIN", platform_admin=True)
    return _login(email, password)


def _organization_with_school(headers: dict[str, str], label: str) -> tuple[dict, dict]:
    suffix = uuid4().hex[:8].upper()
    organization_response = client.post(
        "/api/v1/organizations",
        headers=headers,
        json={
            "organization_code": f"{label}-{suffix}",
            "name": f"{label} Group",
            "display_name": f"{label} Group",
            "status": "active",
        },
    )
    assert organization_response.status_code == 201, organization_response.text
    organization = organization_response.json()

    institution_response = client.post(
        "/api/v1/institutions",
        headers=headers,
        json={
            "institution_code": f"{label}-{suffix}",
            "official_name": f"{label} School",
            "display_name": f"{label} School",
            "timezone": "Asia/Kolkata",
            "status": "active",
        },
    )
    assert institution_response.status_code == 201, institution_response.text
    institution = institution_response.json()

    assign_response = client.patch(
        f"/api/v1/institutions/{institution['id']}/organization",
        headers=headers,
        json={"organization_id": organization["id"]},
    )
    assert assign_response.status_code == 200, assign_response.text
    return organization, institution


def test_management_can_provision_principal_only_inside_its_organization() -> None:
    platform_headers = _platform_headers()
    organization_a, institution_a = _organization_with_school(platform_headers, "MGTA")
    _, institution_b = _organization_with_school(platform_headers, "MGTB")

    management_email, management_password = _create_user(
        "MANAGEMENT_ADMIN",
        organization_id=UUID(organization_a["id"]),
    )
    management_headers = _login(management_email, management_password)

    principal_email = f"principal-{uuid4().hex[:8]}@example.com"
    create_principal = client.post(
        "/api/v1/auth/admin/users",
        headers=management_headers,
        json={
            "email": principal_email,
            "display_name": "School Principal",
            "password": "Principal-Test-2026!",
            "role_code": "PRINCIPAL",
            "organization_id": None,
            "institution_id": institution_a["id"],
        },
    )
    assert create_principal.status_code == 201, create_principal.text
    assert create_principal.json()["institution_id"] == institution_a["id"]

    outside_scope = client.post(
        "/api/v1/auth/admin/users",
        headers=management_headers,
        json={
            "email": f"outside-{uuid4().hex[:8]}@example.com",
            "display_name": "Outside Principal",
            "password": "Principal-Test-2026!",
            "role_code": "PRINCIPAL",
            "organization_id": None,
            "institution_id": institution_b["id"],
        },
    )
    assert outside_scope.status_code == 403
    assert "within your organization" in outside_scope.json()["detail"]


def test_management_cannot_provision_other_roles() -> None:
    platform_headers = _platform_headers()
    organization, institution = _organization_with_school(platform_headers, "MGTROLE")
    management_email, management_password = _create_user(
        "MANAGEMENT_ADMIN",
        organization_id=UUID(organization["id"]),
    )
    management_headers = _login(management_email, management_password)

    for role_code in ("MANAGEMENT_ADMIN", "SCHOOL_ADMIN"):
        response = client.post(
            "/api/v1/auth/admin/users",
            headers=management_headers,
            json={
                "email": f"blocked-{role_code.lower()}-{uuid4().hex[:6]}@example.com",
                "display_name": "Blocked User",
                "password": "Blocked-Test-2026!",
                "role_code": role_code,
                "organization_id": organization["id"] if role_code == "MANAGEMENT_ADMIN" else None,
                "institution_id": institution["id"] if role_code == "SCHOOL_ADMIN" else None,
            },
        )
        assert response.status_code == 403
        assert response.json()["detail"] == "Management / Group Admin may provision Principal accounts only"


def test_principal_cannot_use_user_provisioning_endpoint() -> None:
    platform_headers = _platform_headers()
    _, institution = _organization_with_school(platform_headers, "PRNOADMIN")
    principal_email, principal_password = _create_user(
        "PRINCIPAL",
        institution_id=UUID(institution["id"]),
    )
    principal_headers = _login(principal_email, principal_password)

    response = client.post(
        "/api/v1/auth/admin/users",
        headers=principal_headers,
        json={
            "email": f"schooladmin-{uuid4().hex[:8]}@example.com",
            "display_name": "School Admin",
            "password": "SchoolAdmin-Test-2026!",
            "role_code": "SCHOOL_ADMIN",
            "organization_id": None,
            "institution_id": institution["id"],
        },
    )
    assert response.status_code == 403
