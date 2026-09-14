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


def _post(headers: dict[str, str], path: str, payload: dict) -> dict:
    response = client.post(path, headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_compartment_head_foundation_reads_are_filtered_to_assigned_compartment() -> None:
    platform_headers = _platform_headers()
    suffix = uuid4().hex[:8].upper()

    institution = _post(
        platform_headers,
        "/api/v1/institutions",
        {
            "institution_code": f"CHF-{suffix}",
            "official_name": "Compartment Filter School",
            "display_name": "Compartment Filter School",
            "timezone": "Asia/Kolkata",
            "status": "active",
        },
    )
    institution_id = institution["id"]

    academic_year = _post(
        platform_headers,
        "/api/v1/academic-years",
        {
            "institution_id": institution_id,
            "name": f"2026-{suffix[:4]}",
            "start_date": "2026-06-01",
            "end_date": "2027-05-31",
            "status": "active",
            "is_current": True,
        },
    )

    senior = _post(
        platform_headers,
        "/api/v1/academic-divisions",
        {
            "institution_id": institution_id,
            "code": f"SEN-{suffix}",
            "name": "Senior Compartment",
            "display_order": 1,
            "is_active": True,
        },
    )
    junior = _post(
        platform_headers,
        "/api/v1/academic-divisions",
        {
            "institution_id": institution_id,
            "code": f"JUN-{suffix}",
            "name": "Junior Compartment",
            "display_order": 2,
            "is_active": True,
        },
    )

    grade_x = _post(
        platform_headers,
        "/api/v1/grade-levels",
        {
            "institution_id": institution_id,
            "code": f"X-{suffix}",
            "display_name": "Class X",
            "level_order": 10,
            "is_active": True,
        },
    )
    grade_vi = _post(
        platform_headers,
        "/api/v1/grade-levels",
        {
            "institution_id": institution_id,
            "code": f"VI-{suffix}",
            "display_name": "Class VI",
            "level_order": 6,
            "is_active": True,
        },
    )

    senior_mapping = _post(
        platform_headers,
        "/api/v1/academic-division-grade-levels",
        {
            "institution_id": institution_id,
            "academic_year_id": academic_year["id"],
            "academic_division_id": senior["id"],
            "grade_level_id": grade_x["id"],
            "sequence_no": 1,
        },
    )
    _post(
        platform_headers,
        "/api/v1/academic-division-grade-levels",
        {
            "institution_id": institution_id,
            "academic_year_id": academic_year["id"],
            "academic_division_id": junior["id"],
            "grade_level_id": grade_vi["id"],
            "sequence_no": 1,
        },
    )

    senior_section = _post(
        platform_headers,
        "/api/v1/class-groups",
        {
            "institution_id": institution_id,
            "academic_year_id": academic_year["id"],
            "grade_level_id": grade_x["id"],
            "section_code": "BA",
            "display_name": "X BA",
            "capacity": None,
            "status": "active",
        },
    )
    junior_section = _post(
        platform_headers,
        "/api/v1/class-groups",
        {
            "institution_id": institution_id,
            "academic_year_id": academic_year["id"],
            "grade_level_id": grade_vi["id"],
            "section_code": "BA",
            "display_name": "VI BA",
            "capacity": None,
            "status": "active",
        },
    )

    principal_email, principal_password = _create_user(
        "PRINCIPAL",
        institution_id=UUID(institution_id),
    )
    principal_headers = _login(principal_email, principal_password)

    head_email = f"senior-head-{uuid4().hex[:8]}@example.com"
    head_password = "Compartment-Head-Test-2026!"
    provision = client.post(
        "/api/v1/principal/compartment-heads",
        headers=principal_headers,
        json={
            "email": head_email,
            "display_name": "Senior Compartment Head",
            "password": head_password,
            "role_code": "COMPARTMENT_HEAD",
            "organization_id": None,
            "institution_id": institution_id,
            "academic_division_ids": [senior["id"]],
        },
    )
    assert provision.status_code == 201, provision.text
    head_headers = _login(head_email, head_password)

    years = client.get(
        f"/api/v1/academic-years?institution_id={institution_id}",
        headers=head_headers,
    )
    assert years.status_code == 200, years.text
    assert [item["id"] for item in years.json()] == [academic_year["id"]]

    divisions = client.get(
        f"/api/v1/academic-divisions?institution_id={institution_id}",
        headers=head_headers,
    )
    assert divisions.status_code == 200, divisions.text
    assert [item["id"] for item in divisions.json()] == [senior["id"]]

    grades = client.get(
        f"/api/v1/grade-levels?institution_id={institution_id}",
        headers=head_headers,
    )
    assert grades.status_code == 200, grades.text
    assert [item["id"] for item in grades.json()] == [grade_x["id"]]

    mappings = client.get(
        f"/api/v1/academic-division-grade-levels?institution_id={institution_id}&academic_year_id={academic_year['id']}",
        headers=head_headers,
    )
    assert mappings.status_code == 200, mappings.text
    assert [item["id"] for item in mappings.json()] == [senior_mapping["id"]]

    sections = client.get(
        f"/api/v1/class-groups?institution_id={institution_id}&academic_year_id={academic_year['id']}",
        headers=head_headers,
    )
    assert sections.status_code == 200, sections.text
    assert [item["id"] for item in sections.json()] == [senior_section["id"]]

    assert client.get(f"/api/v1/academic-divisions/{junior['id']}", headers=head_headers).status_code == 403
    assert client.get(f"/api/v1/grade-levels/{grade_vi['id']}", headers=head_headers).status_code == 403
    assert client.get(f"/api/v1/class-groups/{junior_section['id']}", headers=head_headers).status_code == 403


def test_principal_keeps_full_institution_foundation_visibility() -> None:
    platform_headers = _platform_headers()
    suffix = uuid4().hex[:8].upper()
    institution = _post(
        platform_headers,
        "/api/v1/institutions",
        {
            "institution_code": f"CHF-PR-{suffix}",
            "official_name": "Principal Visibility School",
            "display_name": "Principal Visibility School",
            "timezone": "Asia/Kolkata",
            "status": "active",
        },
    )
    first = _post(
        platform_headers,
        "/api/v1/academic-divisions",
        {
            "institution_id": institution["id"],
            "code": f"A-{suffix}",
            "name": "First Compartment",
            "display_order": 1,
            "is_active": True,
        },
    )
    second = _post(
        platform_headers,
        "/api/v1/academic-divisions",
        {
            "institution_id": institution["id"],
            "code": f"B-{suffix}",
            "name": "Second Compartment",
            "display_order": 2,
            "is_active": True,
        },
    )

    principal_email, principal_password = _create_user(
        "PRINCIPAL",
        institution_id=UUID(institution["id"]),
    )
    principal_headers = _login(principal_email, principal_password)
    response = client.get(
        f"/api/v1/academic-divisions?institution_id={institution['id']}",
        headers=principal_headers,
    )
    assert response.status_code == 200, response.text
    assert {item["id"] for item in response.json()} == {first["id"], second["id"]}
