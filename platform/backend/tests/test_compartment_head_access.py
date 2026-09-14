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


def _create_institution(headers: dict[str, str], label: str) -> dict:
    suffix = uuid4().hex[:8].upper()
    response = client.post(
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
    assert response.status_code == 201, response.text
    return response.json()


def _create_compartment(
    headers: dict[str, str],
    institution_id: str,
    code: str,
    display_order: int,
) -> dict:
    response = client.post(
        "/api/v1/academic-divisions",
        headers=headers,
        json={
            "institution_id": institution_id,
            "code": f"{code}-{uuid4().hex[:6].upper()}",
            "name": f"{code} Compartment",
            "display_order": display_order,
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_principal_can_assign_multiple_compartments_and_scope_is_exposed() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "CHMULTI")
    senior = _create_compartment(platform_headers, institution["id"], "Senior", 1)
    junior = _create_compartment(platform_headers, institution["id"], "Junior", 2)

    principal_email, principal_password = _create_user(
        "PRINCIPAL",
        institution_id=UUID(institution["id"]),
    )
    principal_headers = _login(principal_email, principal_password)

    head_email = f"compartment-head-{uuid4().hex[:8]}@example.com"
    head_password = "Compartment-Head-Test-2026!"
    response = client.post(
        "/api/v1/principal/compartment-heads",
        headers=principal_headers,
        json={
            "email": head_email,
            "display_name": "Senior and Junior Head",
            "password": head_password,
            "role_code": "COMPARTMENT_HEAD",
            "organization_id": None,
            "institution_id": institution["id"],
            "academic_division_ids": [senior["id"], junior["id"]],
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["role_code"] == "COMPARTMENT_HEAD"
    assert response.json()["scope_type"] == "academic_compartment"
    assert set(response.json()["academic_division_ids"]) == {senior["id"], junior["id"]}

    head_headers = _login(head_email, head_password)
    me = client.get("/api/v1/auth/me", headers=head_headers)
    assert me.status_code == 200, me.text
    assignments = me.json()["assignments"]
    assert len(assignments) == 2
    assert {item["academic_division_id"] for item in assignments} == {senior["id"], junior["id"]}
    assert {item["scope_type"] for item in assignments} == {"academic_compartment"}

    institutions = client.get("/api/v1/institutions", headers=head_headers)
    assert institutions.status_code == 200, institutions.text
    assert [item["id"] for item in institutions.json()] == [institution["id"]]


def test_principal_cannot_assign_compartment_from_another_institution() -> None:
    platform_headers = _platform_headers()
    institution_a = _create_institution(platform_headers, "CHOWN")
    institution_b = _create_institution(platform_headers, "CHOTHER")
    own_compartment = _create_compartment(platform_headers, institution_a["id"], "Senior", 1)
    other_compartment = _create_compartment(platform_headers, institution_b["id"], "Senior", 1)

    principal_email, principal_password = _create_user(
        "PRINCIPAL",
        institution_id=UUID(institution_a["id"]),
    )
    principal_headers = _login(principal_email, principal_password)

    response = client.post(
        "/api/v1/principal/compartment-heads",
        headers=principal_headers,
        json={
            "email": f"blocked-head-{uuid4().hex[:8]}@example.com",
            "display_name": "Blocked Compartment Head",
            "password": "Compartment-Head-Test-2026!",
            "role_code": "COMPARTMENT_HEAD",
            "organization_id": None,
            "institution_id": institution_a["id"],
            "academic_division_ids": [own_compartment["id"], other_compartment["id"]],
        },
    )
    assert response.status_code == 403
    assert "selected institution" in response.json()["detail"]


def test_non_principal_cannot_provision_compartment_head() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "CHBLOCK")
    compartment = _create_compartment(platform_headers, institution["id"], "Senior", 1)

    school_admin_email, school_admin_password = _create_user(
        "SCHOOL_ADMIN",
        institution_id=UUID(institution["id"]),
    )
    school_admin_headers = _login(school_admin_email, school_admin_password)

    response = client.post(
        "/api/v1/principal/compartment-heads",
        headers=school_admin_headers,
        json={
            "email": f"blocked-head-{uuid4().hex[:8]}@example.com",
            "display_name": "Blocked Compartment Head",
            "password": "Compartment-Head-Test-2026!",
            "role_code": "COMPARTMENT_HEAD",
            "organization_id": None,
            "institution_id": institution["id"],
            "academic_division_ids": [compartment["id"]],
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Principal institution access required"


def test_compartment_head_cannot_write_institution_foundation() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "CHREAD")
    senior = _create_compartment(platform_headers, institution["id"], "Senior", 1)

    principal_email, principal_password = _create_user(
        "PRINCIPAL",
        institution_id=UUID(institution["id"]),
    )
    principal_headers = _login(principal_email, principal_password)

    head_email = f"readonly-head-{uuid4().hex[:8]}@example.com"
    head_password = "Compartment-Head-Test-2026!"
    provision = client.post(
        "/api/v1/principal/compartment-heads",
        headers=principal_headers,
        json={
            "email": head_email,
            "display_name": "Read Only Compartment Head",
            "password": head_password,
            "role_code": "COMPARTMENT_HEAD",
            "organization_id": None,
            "institution_id": institution["id"],
            "academic_division_ids": [senior["id"]],
        },
    )
    assert provision.status_code == 201, provision.text

    head_headers = _login(head_email, head_password)
    write_attempt = client.post(
        "/api/v1/academic-divisions",
        headers=head_headers,
        json={
            "institution_id": institution["id"],
            "code": f"BLOCKED-{uuid4().hex[:6].upper()}",
            "name": "Blocked Compartment",
            "display_order": 9,
            "is_active": True,
        },
    )
    assert write_attempt.status_code == 403
    assert write_attempt.json()["detail"] == "This role has view-only access to school academic setup"
