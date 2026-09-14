from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models.access import Role, UserAccount, UserRoleAssignment
from app.security import hash_password

client = TestClient(app)


def _create_user(role_code: str, institution_id: UUID | None = None, *, platform_admin: bool = False):
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
        user_id = user.id
    return user_id, email, password


def _login(email: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _platform_headers() -> dict[str, str]:
    _, email, password = _create_user("PLATFORM_ADMIN", platform_admin=True)
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


def _create_compartment(headers: dict[str, str], institution_id: str, code: str, order: int) -> dict:
    response = client.post(
        "/api/v1/academic-divisions",
        headers=headers,
        json={
            "institution_id": institution_id,
            "code": f"{code}-{uuid4().hex[:6].upper()}",
            "name": f"{code} Compartment",
            "display_order": order,
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_principal_can_list_and_change_school_admin_to_compartment_head() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "EDITACCESS")
    senior = _create_compartment(platform_headers, institution["id"], "Senior", 1)
    junior = _create_compartment(platform_headers, institution["id"], "Junior", 2)

    _, principal_email, principal_password = _create_user(
        "PRINCIPAL",
        UUID(institution["id"]),
    )
    principal_headers = _login(principal_email, principal_password)

    admin_email = f"schooladmin-{uuid4().hex[:8]}@example.com"
    admin_password = "School-Admin-Test-2026!"
    provision = client.post(
        "/api/v1/principal/school-admins",
        headers=principal_headers,
        json={
            "email": admin_email,
            "display_name": "Admin Manager",
            "password": admin_password,
            "role_code": "SCHOOL_ADMIN",
            "institution_id": institution["id"],
            "academic_division_ids": [],
        },
    )
    assert provision.status_code == 201, provision.text
    user_id = provision.json()["id"]

    listed = client.get(
        f"/api/v1/principal/users?institution_id={institution['id']}",
        headers=principal_headers,
    )
    assert listed.status_code == 200, listed.text
    row = next(item for item in listed.json() if item["id"] == user_id)
    assert row["role_code"] == "SCHOOL_ADMIN"
    assert row["academic_division_ids"] == []

    edited = client.patch(
        f"/api/v1/principal/users/{user_id}/access",
        headers=principal_headers,
        json={
            "email": admin_email,
            "display_name": "Senior Vice Principal",
            "role_code": "COMPARTMENT_HEAD",
            "institution_id": institution["id"],
            "academic_division_ids": [senior["id"], junior["id"]],
            "status": "active",
            "password": None,
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["role_code"] == "COMPARTMENT_HEAD"
    assert set(edited.json()["academic_division_ids"]) == {senior["id"], junior["id"]}

    user_headers = _login(admin_email, admin_password)
    me = client.get("/api/v1/auth/me", headers=user_headers)
    assert me.status_code == 200, me.text
    assert {item["role_code"] for item in me.json()["assignments"]} == {"COMPARTMENT_HEAD"}
    assert {item["academic_division_id"] for item in me.json()["assignments"]} == {
        senior["id"], junior["id"]
    }


def test_principal_can_deactivate_managed_user_without_resetting_password() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "DEACTIVATE")
    _, principal_email, principal_password = _create_user("PRINCIPAL", UUID(institution["id"]))
    principal_headers = _login(principal_email, principal_password)

    admin_email = f"deactivate-{uuid4().hex[:8]}@example.com"
    admin_password = "School-Admin-Test-2026!"
    provision = client.post(
        "/api/v1/principal/school-admins",
        headers=principal_headers,
        json={
            "email": admin_email,
            "display_name": "Admin Manager",
            "password": admin_password,
            "role_code": "SCHOOL_ADMIN",
            "institution_id": institution["id"],
            "academic_division_ids": [],
        },
    )
    assert provision.status_code == 201, provision.text

    edited = client.patch(
        f"/api/v1/principal/users/{provision.json()['id']}/access",
        headers=principal_headers,
        json={
            "email": admin_email,
            "display_name": "Admin Manager",
            "role_code": "SCHOOL_ADMIN",
            "institution_id": institution["id"],
            "academic_division_ids": [],
            "status": "inactive",
            "password": None,
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["status"] == "inactive"

    login = client.post("/api/v1/auth/login", json={"email": admin_email, "password": admin_password})
    assert login.status_code == 401


def test_principal_cannot_edit_managed_user_into_another_institution_compartment() -> None:
    platform_headers = _platform_headers()
    institution_a = _create_institution(platform_headers, "EDITSCOPEA")
    institution_b = _create_institution(platform_headers, "EDITSCOPEB")
    other_compartment = _create_compartment(platform_headers, institution_b["id"], "Senior", 1)

    _, principal_email, principal_password = _create_user("PRINCIPAL", UUID(institution_a["id"]))
    principal_headers = _login(principal_email, principal_password)

    admin_email = f"scoped-{uuid4().hex[:8]}@example.com"
    provision = client.post(
        "/api/v1/principal/school-admins",
        headers=principal_headers,
        json={
            "email": admin_email,
            "display_name": "Scoped Admin",
            "password": "School-Admin-Test-2026!",
            "role_code": "SCHOOL_ADMIN",
            "institution_id": institution_a["id"],
            "academic_division_ids": [],
        },
    )
    assert provision.status_code == 201, provision.text

    edited = client.patch(
        f"/api/v1/principal/users/{provision.json()['id']}/access",
        headers=principal_headers,
        json={
            "email": admin_email,
            "display_name": "Scoped Admin",
            "role_code": "COMPARTMENT_HEAD",
            "institution_id": institution_a["id"],
            "academic_division_ids": [other_compartment["id"]],
            "status": "active",
            "password": None,
        },
    )
    assert edited.status_code == 403
    assert "selected institution" in edited.json()["detail"]


def test_principal_cannot_edit_another_principal_account() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "EDITBLOCK")
    _, principal_email, principal_password = _create_user("PRINCIPAL", UUID(institution["id"]))
    other_principal_id, other_email, _ = _create_user("PRINCIPAL", UUID(institution["id"]))
    principal_headers = _login(principal_email, principal_password)

    edited = client.patch(
        f"/api/v1/principal/users/{other_principal_id}/access",
        headers=principal_headers,
        json={
            "email": other_email,
            "display_name": "Other Principal",
            "role_code": "SCHOOL_ADMIN",
            "institution_id": institution["id"],
            "academic_division_ids": [],
            "status": "active",
            "password": None,
        },
    )
    assert edited.status_code == 403
    assert "outside delegated school scope" in edited.json()["detail"]
