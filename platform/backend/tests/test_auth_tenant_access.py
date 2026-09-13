from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models.access import Role, UserAccount, UserRoleAssignment
from app.security import hash_password

client = TestClient(app)


def _create_user_with_scope(
    role_code: str,
    *,
    organization_id: UUID | None = None,
    institution_id: UUID | None = None,
    platform_admin: bool = False,
) -> tuple[str, str]:
    suffix = uuid4().hex[:10]
    email = f"{role_code.lower()}-{suffix}@example.com"
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
        if role.default_scope_type == "platform":
            scope_type = "platform"
        elif role.default_scope_type == "organization":
            scope_type = "organization"
        else:
            scope_type = "institution"
        db.add(
            UserRoleAssignment(
                user_id=user.id,
                role_id=role.id,
                scope_type=scope_type,
                organization_id=organization_id,
                institution_id=institution_id,
                is_active=True,
            )
        )
        db.commit()

    return email, password


def _login_headers(email: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _platform_admin_headers() -> dict[str, str]:
    email, password = _create_user_with_scope("PLATFORM_ADMIN", platform_admin=True)
    return _login_headers(email, password)


def _create_organization_and_institution(headers: dict[str, str], label: str) -> tuple[dict, dict]:
    suffix = uuid4().hex[:8].upper()
    organization_response = client.post(
        "/api/v1/organizations",
        headers=headers,
        json={
            "organization_code": f"{label}-{suffix}",
            "name": f"{label} Group of Schools",
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
            "official_name": f"{label} Public School",
            "display_name": f"{label} Public School",
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


def test_authentication_required_for_tenant_data() -> None:
    response = client.get("/api/v1/institutions")
    assert response.status_code == 401


def test_login_and_me_return_role_scope() -> None:
    email, password = _create_user_with_scope("PLATFORM_ADMIN", platform_admin=True)
    headers = _login_headers(email, password)

    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == email
    assert body["is_platform_admin"] is True
    assert any(item["role_code"] == "PLATFORM_ADMIN" for item in body["assignments"])


def test_management_and_principal_are_tenant_scoped() -> None:
    admin_headers = _platform_admin_headers()
    organization_a, institution_a = _create_organization_and_institution(admin_headers, "ALPHA")
    organization_b, institution_b = _create_organization_and_institution(admin_headers, "BETA")

    management_email, management_password = _create_user_with_scope(
        "MANAGEMENT_ADMIN",
        organization_id=UUID(organization_a["id"]),
    )
    management_headers = _login_headers(management_email, management_password)

    organizations_response = client.get("/api/v1/organizations", headers=management_headers)
    assert organizations_response.status_code == 200
    organization_ids = {item["id"] for item in organizations_response.json()}
    assert organization_a["id"] in organization_ids
    assert organization_b["id"] not in organization_ids

    institutions_response = client.get("/api/v1/institutions", headers=management_headers)
    assert institutions_response.status_code == 200
    institution_ids = {item["id"] for item in institutions_response.json()}
    assert institution_a["id"] in institution_ids
    assert institution_b["id"] not in institution_ids

    principal_email, principal_password = _create_user_with_scope(
        "PRINCIPAL",
        institution_id=UUID(institution_a["id"]),
    )
    principal_headers = _login_headers(principal_email, principal_password)

    principal_institutions = client.get("/api/v1/institutions", headers=principal_headers)
    assert principal_institutions.status_code == 200
    principal_ids = {item["id"] for item in principal_institutions.json()}
    assert principal_ids == {institution_a["id"]}

    forbidden = client.get(f"/api/v1/institutions/{institution_b['id']}", headers=principal_headers)
    assert forbidden.status_code == 403

    principal_organizations = client.get("/api/v1/organizations", headers=principal_headers)
    assert principal_organizations.status_code == 200
    assert principal_organizations.json() == []
