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
    academic_division_ids: list[UUID] | None = None,
    platform_admin: bool = False,
) -> tuple[str, str]:
    email = f"{role_code.lower()}-{uuid4().hex[:10]}@example.com"
    password = "AcadPulse-Test-Password-2026!"
    with SessionLocal() as db:
        role = db.scalar(select(Role).where(Role.code == role_code))
        assert role is not None
        user = UserAccount(
            email=email,
            display_name=f"{role_code} Staff Test User",
            password_hash=hash_password(password),
            status="active",
            is_platform_admin=platform_admin,
        )
        db.add(user)
        db.flush()

        if role_code == "COMPARTMENT_HEAD":
            assert institution_id is not None
            assert academic_division_ids
            for division_id in academic_division_ids:
                db.add(
                    UserRoleAssignment(
                        user_id=user.id,
                        role_id=role.id,
                        scope_type="academic_compartment",
                        institution_id=institution_id,
                        academic_division_id=division_id,
                        is_active=True,
                    )
                )
        else:
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
    headers: dict[str, str], institution_id: str, code: str, display_order: int
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


def _school_admin_headers(institution_id: str) -> dict[str, str]:
    email, password = _create_user("SCHOOL_ADMIN", institution_id=UUID(institution_id))
    return _login(email, password)


def _principal_headers(institution_id: str) -> dict[str, str]:
    email, password = _create_user("PRINCIPAL", institution_id=UUID(institution_id))
    return _login(email, password)


def _create_staff(
    headers: dict[str, str],
    institution_id: str,
    full_name: str,
    division_ids: list[str],
) -> dict:
    response = client.post(
        "/api/v1/staff-profiles",
        headers=headers,
        json={
            "institution_id": institution_id,
            "employee_code": f"EMP-{uuid4().hex[:8].upper()}",
            "full_name": full_name,
            "staff_type": "TEACHING",
            "academic_division_ids": division_ids,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_school_admin_can_create_teacher_with_multiple_compartments() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "STAFFMULTI")
    senior = _create_compartment(platform_headers, institution["id"], "Senior", 1)
    junior = _create_compartment(platform_headers, institution["id"], "Junior", 2)
    admin_headers = _school_admin_headers(institution["id"])

    profile = _create_staff(
        admin_headers,
        institution["id"],
        "Amina Teacher",
        [senior["id"], junior["id"]],
    )
    assert profile["staff_type"] == "TEACHING"
    assert set(profile["academic_division_ids"]) == {senior["id"], junior["id"]}
    assert profile["is_active"] is True

    listing = client.get(
        "/api/v1/staff-profiles",
        headers=admin_headers,
        params={"institution_id": institution["id"]},
    )
    assert listing.status_code == 200, listing.text
    assert profile["id"] in {item["id"] for item in listing.json()}


def test_school_admin_cannot_assign_compartment_from_another_institution() -> None:
    platform_headers = _platform_headers()
    own = _create_institution(platform_headers, "STAFFOWN")
    other = _create_institution(platform_headers, "STAFFOTHER")
    _create_compartment(platform_headers, own["id"], "Senior", 1)
    other_senior = _create_compartment(platform_headers, other["id"], "Senior", 1)
    admin_headers = _school_admin_headers(own["id"])

    response = client.post(
        "/api/v1/staff-profiles",
        headers=admin_headers,
        json={
            "institution_id": own["id"],
            "employee_code": f"EMP-{uuid4().hex[:8].upper()}",
            "full_name": "Cross Tenant Teacher",
            "staff_type": "TEACHING",
            "academic_division_ids": [other_senior["id"]],
        },
    )
    assert response.status_code == 422
    assert "selected institution" in response.json()["detail"]


def test_compartment_head_sees_only_staff_placed_in_assigned_compartment() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "STAFFSCOPE")
    senior = _create_compartment(platform_headers, institution["id"], "Senior", 1)
    junior = _create_compartment(platform_headers, institution["id"], "Junior", 2)
    admin_headers = _school_admin_headers(institution["id"])

    senior_teacher = _create_staff(
        admin_headers, institution["id"], "Senior Teacher", [senior["id"]]
    )
    junior_teacher = _create_staff(
        admin_headers, institution["id"], "Junior Teacher", [junior["id"]]
    )
    both_teacher = _create_staff(
        admin_headers,
        institution["id"],
        "Cross Compartment Teacher",
        [senior["id"], junior["id"]],
    )

    head_email, head_password = _create_user(
        "COMPARTMENT_HEAD",
        institution_id=UUID(institution["id"]),
        academic_division_ids=[UUID(senior["id"])],
    )
    head_headers = _login(head_email, head_password)

    listing = client.get(
        "/api/v1/staff-profiles",
        headers=head_headers,
        params={"institution_id": institution["id"]},
    )
    assert listing.status_code == 200, listing.text
    visible_ids = {item["id"] for item in listing.json()}
    assert senior_teacher["id"] in visible_ids
    assert both_teacher["id"] in visible_ids
    assert junior_teacher["id"] not in visible_ids

    hidden_direct = client.get(
        f"/api/v1/staff-profiles/{junior_teacher['id']}", headers=head_headers
    )
    assert hidden_direct.status_code == 404


def test_principal_can_view_and_override_staff_profile() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "STAFFPRINCIPAL")
    senior = _create_compartment(platform_headers, institution["id"], "Senior", 1)
    junior = _create_compartment(platform_headers, institution["id"], "Junior", 2)
    admin_headers = _school_admin_headers(institution["id"])
    profile = _create_staff(
        admin_headers, institution["id"], "Teacher Before Override", [junior["id"]]
    )
    principal_headers = _principal_headers(institution["id"])

    listing = client.get(
        "/api/v1/staff-profiles",
        headers=principal_headers,
        params={"institution_id": institution["id"]},
    )
    assert listing.status_code == 200, listing.text
    assert profile["id"] in {item["id"] for item in listing.json()}

    update = client.patch(
        f"/api/v1/staff-profiles/{profile['id']}",
        headers=principal_headers,
        json={
            "full_name": "Teacher After Principal Override",
            "academic_division_ids": [senior["id"]],
        },
    )
    assert update.status_code == 200, update.text
    assert update.json()["full_name"] == "Teacher After Principal Override"
    assert update.json()["academic_division_ids"] == [senior["id"]]


def test_non_teaching_staff_cannot_receive_academic_compartment_placement() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "STAFFNONTEACH")
    senior = _create_compartment(platform_headers, institution["id"], "Senior", 1)
    admin_headers = _school_admin_headers(institution["id"])

    response = client.post(
        "/api/v1/staff-profiles",
        headers=admin_headers,
        json={
            "institution_id": institution["id"],
            "employee_code": f"EMP-{uuid4().hex[:8].upper()}",
            "full_name": "Office Staff",
            "staff_type": "NON_TEACHING",
            "academic_division_ids": [senior["id"]],
        },
    )
    assert response.status_code == 422
    assert "teaching staff" in response.json()["detail"]
