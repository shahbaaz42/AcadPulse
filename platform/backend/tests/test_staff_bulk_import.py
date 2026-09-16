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
    email = f"bulk-{role_code.lower()}-{uuid4().hex[:10]}@example.com"
    password = "AcadPulse-Test-Password-2026!"
    with SessionLocal() as db:
        role = db.scalar(select(Role).where(Role.code == role_code))
        assert role is not None
        user = UserAccount(
            email=email,
            display_name=f"{role_code} Bulk Test User",
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


def _create_compartment(headers: dict[str, str], institution_id: str, code: str) -> dict:
    response = client.post(
        "/api/v1/academic-divisions",
        headers=headers,
        json={
            "institution_id": institution_id,
            "code": f"{code}-{uuid4().hex[:6].upper()}",
            "name": f"{code} Compartment",
            "display_order": 1,
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _role_headers(role_code: str, institution_id: str, division_id: str | None = None) -> dict[str, str]:
    kwargs = {"institution_id": UUID(institution_id)}
    if division_id:
        kwargs["academic_division_ids"] = [UUID(division_id)]
    email, password = _create_user(role_code, **kwargs)
    return _login(email, password)


def test_school_admin_can_bulk_import_and_retry_safely() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "BULKSTAFF")
    senior = _create_compartment(platform_headers, institution["id"], "SENIOR")
    admin_headers = _role_headers("SCHOOL_ADMIN", institution["id"])

    payload = {
        "institution_id": institution["id"],
        "items": [
            {
                "full_name": "Teacher One",
                "employee_code": None,
                "staff_type": "TEACHING",
                "academic_division_ids": [senior["id"]],
            },
            {
                "full_name": "Teacher Two",
                "employee_code": "UPS-T002",
                "staff_type": "TEACHING",
                "academic_division_ids": [senior["id"]],
            },
        ],
    }
    first = client.post("/api/v1/staff-profiles/bulk", headers=admin_headers, json=payload)
    assert first.status_code == 201, first.text
    assert first.json()["created_count"] == 2
    assert first.json()["skipped_count"] == 0

    retry = client.post("/api/v1/staff-profiles/bulk", headers=admin_headers, json=payload)
    assert retry.status_code == 201, retry.text
    assert retry.json()["created_count"] == 0
    assert retry.json()["skipped_count"] == 2

    listing = client.get(
        "/api/v1/staff-profiles",
        headers=admin_headers,
        params={"institution_id": institution["id"], "include_inactive": True},
    )
    assert listing.status_code == 200, listing.text
    names = [item["full_name"] for item in listing.json()]
    assert names.count("Teacher One") == 1
    assert names.count("Teacher Two") == 1


def test_bulk_import_rejects_cross_institution_compartment_without_partial_commit() -> None:
    platform_headers = _platform_headers()
    own = _create_institution(platform_headers, "BULKOWN")
    other = _create_institution(platform_headers, "BULKOTHER")
    own_senior = _create_compartment(platform_headers, own["id"], "SENIOR")
    other_senior = _create_compartment(platform_headers, other["id"], "SENIOR")
    admin_headers = _role_headers("SCHOOL_ADMIN", own["id"])

    response = client.post(
        "/api/v1/staff-profiles/bulk",
        headers=admin_headers,
        json={
            "institution_id": own["id"],
            "items": [
                {
                    "full_name": "Valid Teacher",
                    "staff_type": "TEACHING",
                    "academic_division_ids": [own_senior["id"]],
                },
                {
                    "full_name": "Cross Tenant Teacher",
                    "staff_type": "TEACHING",
                    "academic_division_ids": [other_senior["id"]],
                },
            ],
        },
    )
    assert response.status_code == 422

    listing = client.get(
        "/api/v1/staff-profiles",
        headers=admin_headers,
        params={"institution_id": own["id"], "include_inactive": True},
    )
    assert listing.status_code == 200, listing.text
    assert "Valid Teacher" not in {item["full_name"] for item in listing.json()}


def test_compartment_head_cannot_bulk_import_staff() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "BULKHEAD")
    senior = _create_compartment(platform_headers, institution["id"], "SENIOR")
    head_headers = _role_headers("COMPARTMENT_HEAD", institution["id"], senior["id"])

    response = client.post(
        "/api/v1/staff-profiles/bulk",
        headers=head_headers,
        json={
            "institution_id": institution["id"],
            "items": [
                {
                    "full_name": "Unauthorized Teacher",
                    "staff_type": "TEACHING",
                    "academic_division_ids": [senior["id"]],
                }
            ],
        },
    )
    assert response.status_code == 403


def test_bulk_import_rejects_non_teaching_compartment_placement() -> None:
    platform_headers = _platform_headers()
    institution = _create_institution(platform_headers, "BULKNONTEACH")
    senior = _create_compartment(platform_headers, institution["id"], "SENIOR")
    principal_headers = _role_headers("PRINCIPAL", institution["id"])

    response = client.post(
        "/api/v1/staff-profiles/bulk",
        headers=principal_headers,
        json={
            "institution_id": institution["id"],
            "items": [
                {
                    "full_name": "Office Staff",
                    "staff_type": "NON_TEACHING",
                    "academic_division_ids": [senior["id"]],
                }
            ],
        },
    )
    assert response.status_code == 422
    assert "teaching staff" in response.json()["detail"]
