from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models.access import Role, UserAccount, UserRoleAssignment
from app.security import hash_password

client = TestClient(app)


def _create_user(
    role_code: str | None = None,
    *,
    institution_id: UUID | None = None,
    academic_division_id: UUID | None = None,
    platform_admin: bool = False,
) -> tuple[str, str]:
    email = f"scope-{uuid4().hex[:10]}@example.com"
    password = "AcadPulse-Test-Password-2026!"
    with SessionLocal() as db:
        user = UserAccount(
            email=email,
            display_name=f"Scope User {uuid4().hex[:6]}",
            password_hash=hash_password(password),
            status="active",
            is_platform_admin=platform_admin,
        )
        db.add(user)
        db.flush()
        if role_code is not None:
            role = db.scalar(select(Role).where(Role.code == role_code))
            assert role is not None
            db.add(
                UserRoleAssignment(
                    user_id=user.id,
                    role_id=role.id,
                    scope_type=role.default_scope_type,
                    institution_id=institution_id,
                    academic_division_id=academic_division_id,
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


def _institution(headers: dict[str, str]) -> dict:
    suffix = uuid4().hex[:8].upper()
    response = client.post(
        "/api/v1/institutions",
        headers=headers,
        json={
            "institution_code": f"CH-{suffix}",
            "official_name": f"Compartment Scope School {suffix}",
            "display_name": f"Scope School {suffix}",
            "timezone": "Asia/Kolkata",
            "status": "active",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _principal_headers(institution_id: str) -> dict[str, str]:
    email, password = _create_user("PRINCIPAL", institution_id=UUID(institution_id))
    return _login(email, password)


def _year(headers: dict[str, str], institution_id: str) -> dict:
    response = client.post(
        "/api/v1/academic-years",
        headers=headers,
        json={
            "institution_id": institution_id,
            "name": f"2026-{uuid4().hex[:4]}",
            "start_date": "2026-06-01",
            "end_date": "2027-05-31",
            "status": "active",
            "is_current": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _division(headers: dict[str, str], institution_id: str, code: str, order: int) -> dict:
    response = client.post(
        "/api/v1/academic-divisions",
        headers=headers,
        json={
            "institution_id": institution_id,
            "code": f"{code}-{uuid4().hex[:4].upper()}",
            "name": f"{code} Compartment",
            "display_order": order,
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _grade_and_section(
    headers: dict[str, str],
    institution_id: str,
    year_id: str,
    division_id: str,
    code: str,
    order: int,
) -> tuple[dict, dict]:
    grade_response = client.post(
        "/api/v1/grade-levels",
        headers=headers,
        json={
            "institution_id": institution_id,
            "code": f"{code}-{uuid4().hex[:4].upper()}",
            "display_name": f"Class {code}",
            "level_order": order,
            "is_active": True,
        },
    )
    assert grade_response.status_code == 201, grade_response.text
    grade = grade_response.json()

    mapping_response = client.post(
        "/api/v1/academic-division-grade-levels",
        headers=headers,
        json={
            "institution_id": institution_id,
            "academic_year_id": year_id,
            "academic_division_id": division_id,
            "grade_level_id": grade["id"],
            "sequence_no": order,
        },
    )
    assert mapping_response.status_code == 201, mapping_response.text

    section_response = client.post(
        "/api/v1/class-groups",
        headers=headers,
        json={
            "institution_id": institution_id,
            "academic_year_id": year_id,
            "grade_level_id": grade["id"],
            "section_code": "A",
            "display_name": f"{code} A",
            "status": "active",
        },
    )
    assert section_response.status_code == 201, section_response.text
    return grade, section_response.json()


def _staff_profile(headers: dict[str, str], institution_id: str, division_id: str) -> dict:
    response = client.post(
        "/api/v1/staff-profiles",
        headers=headers,
        json={
            "institution_id": institution_id,
            "full_name": "Senior Scoped Teacher",
            "staff_type": "TEACHING",
            "employee_code": None,
            "user_id": None,
            "academic_division_ids": [division_id],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_compartment_head_can_manage_only_its_compartment_responsibilities() -> None:
    platform_headers = _platform_headers()
    institution = _institution(platform_headers)
    principal_headers = _principal_headers(institution["id"])
    year = _year(principal_headers, institution["id"])
    senior = _division(principal_headers, institution["id"], "SENIOR", 1)
    junior = _division(principal_headers, institution["id"], "JUNIOR", 2)
    _, senior_section = _grade_and_section(
        principal_headers, institution["id"], year["id"], senior["id"], "X", 10
    )
    _, junior_section = _grade_and_section(
        principal_headers, institution["id"], year["id"], junior["id"], "VII", 7
    )

    subject_response = client.post(
        "/api/v1/subjects",
        headers=principal_headers,
        json={"institution_id": institution["id"], "code": "MATH", "name": "Mathematics"},
    )
    assert subject_response.status_code == 201, subject_response.text
    maths = subject_response.json()
    teacher = _staff_profile(principal_headers, institution["id"], senior["id"])

    head_email, head_password = _create_user(
        "COMPARTMENT_HEAD",
        institution_id=UUID(institution["id"]),
        academic_division_id=UUID(senior["id"]),
    )
    head_headers = _login(head_email, head_password)

    created = client.post(
        "/api/v1/staff-responsibilities",
        headers=head_headers,
        json={
            "staff_profile_id": teacher["id"],
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "academic_division_id": senior["id"],
            "responsibility_type": "SUBJECT_TEACHER",
            "subject_ids": [maths["id"]],
            "grade_level_ids": [],
            "class_group_ids": [senior_section["id"]],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["academic_division_id"] == senior["id"]

    listed = client.get(
        f"/api/v1/staff-responsibilities?institution_id={institution['id']}&academic_year_id={year['id']}",
        headers=head_headers,
    )
    assert listed.status_code == 200, listed.text
    assert [item["id"] for item in listed.json()] == [created.json()["id"]]

    outside_scope = client.post(
        "/api/v1/staff-responsibilities",
        headers=head_headers,
        json={
            "staff_profile_id": teacher["id"],
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "academic_division_id": junior["id"],
            "responsibility_type": "SUBJECT_TEACHER",
            "subject_ids": [maths["id"]],
            "grade_level_ids": [],
            "class_group_ids": [junior_section["id"]],
        },
    )
    assert outside_scope.status_code == 403
    assert "outside your assigned access scope" in outside_scope.json()["detail"]

    wrong_section = client.post(
        "/api/v1/staff-responsibilities",
        headers=head_headers,
        json={
            "staff_profile_id": teacher["id"],
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "academic_division_id": senior["id"],
            "responsibility_type": "SUBJECT_TEACHER",
            "subject_ids": [maths["id"]],
            "grade_level_ids": [],
            "class_group_ids": [junior_section["id"]],
        },
    )
    assert wrong_section.status_code == 422
    assert "selected Academic Compartment" in wrong_section.json()["detail"]

    subject_denied = client.post(
        "/api/v1/subjects",
        headers=head_headers,
        json={"institution_id": institution["id"], "code": "IP", "name": "Informatics Practices"},
    )
    assert subject_denied.status_code == 403
    assert "Subject management" in subject_denied.json()["detail"]

    deleted = client.delete(
        f"/api/v1/staff-responsibilities/{created.json()['id']}",
        headers=head_headers,
    )
    assert deleted.status_code == 204, deleted.text
