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
) -> tuple[UUID, str, str]:
    email = f"staff-{uuid4().hex[:10]}@example.com"
    password = "AcadPulse-Test-Password-2026!"
    with SessionLocal() as db:
        user = UserAccount(
            email=email,
            display_name=f"Staff {uuid4().hex[:6]}",
            password_hash=hash_password(password),
            status="active",
            is_platform_admin=platform_admin,
        )
        db.add(user)
        db.flush()
        user_id = user.id
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
    return user_id, email, password


def _login(email: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _platform_headers() -> dict[str, str]:
    _, email, password = _create_user("PLATFORM_ADMIN", platform_admin=True)
    return _login(email, password)


def _institution(headers: dict[str, str]) -> dict:
    suffix = uuid4().hex[:8].upper()
    response = client.post(
        "/api/v1/institutions",
        headers=headers,
        json={
            "institution_code": f"AR-{suffix}",
            "official_name": f"Academic Responsibility {suffix}",
            "display_name": f"AR {suffix}",
            "timezone": "Asia/Kolkata",
            "status": "active",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _principal_headers(institution_id: str) -> dict[str, str]:
    _, email, password = _create_user("PRINCIPAL", institution_id=UUID(institution_id))
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


def _compartment(headers: dict[str, str], institution_id: str) -> dict:
    response = client.post(
        "/api/v1/academic-divisions",
        headers=headers,
        json={
            "institution_id": institution_id,
            "code": f"SEN-{uuid4().hex[:5].upper()}",
            "name": "Senior Compartment",
            "display_order": 1,
            "is_active": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _grade_and_section(
    headers: dict[str, str],
    institution_id: str,
    year_id: str,
    compartment_id: str,
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
            "academic_division_id": compartment_id,
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


def _subject(headers: dict[str, str], institution_id: str, code: str, name: str) -> dict:
    response = client.post(
        "/api/v1/subjects",
        headers=headers,
        json={"institution_id": institution_id, "code": code, "name": name},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_hod_supports_multiple_subjects_and_overall_incharge_multiple_grades() -> None:
    platform_headers = _platform_headers()
    institution = _institution(platform_headers)
    principal_headers = _principal_headers(institution["id"])
    year = _year(principal_headers, institution["id"])
    compartment = _compartment(principal_headers, institution["id"])
    grade_viii, _ = _grade_and_section(principal_headers, institution["id"], year["id"], compartment["id"], "VIII", 1)
    grade_ix, _ = _grade_and_section(principal_headers, institution["id"], year["id"], compartment["id"], "IX", 2)
    english = _subject(principal_headers, institution["id"], "ENG", "English")
    tamil = _subject(principal_headers, institution["id"], "TAM", "Tamil")
    staff_user_id, _, _ = _create_user()

    hod = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "user_id": str(staff_user_id),
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "HOD",
            "display_title": "HOD of Languages",
            "subject_ids": [english["id"], tamil["id"]],
            "grade_level_ids": [],
            "class_group_ids": [],
        },
    )
    assert hod.status_code == 201, hod.text
    assert hod.json()["display_title"] == "HOD of Languages"
    assert set(hod.json()["subject_ids"]) == {english["id"], tamil["id"]}

    overall = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "user_id": str(staff_user_id),
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "OVERALL_CLASS_INCHARGE",
            "display_title": "Senior Grades Incharge",
            "subject_ids": [],
            "grade_level_ids": [grade_viii["id"], grade_ix["id"]],
            "class_group_ids": [],
        },
    )
    assert overall.status_code == 201, overall.text
    assert set(overall.json()["grade_level_ids"]) == {grade_viii["id"], grade_ix["id"]}

    listed = client.get(
        f"/api/v1/staff-responsibilities?institution_id={institution['id']}&user_id={staff_user_id}",
        headers=principal_headers,
    )
    assert listed.status_code == 200, listed.text
    assert {item["responsibility_type"] for item in listed.json()} == {"HOD", "OVERALL_CLASS_INCHARGE"}


def test_subject_teacher_keeps_exact_subject_to_sections_and_class_teacher_is_one_section() -> None:
    platform_headers = _platform_headers()
    institution = _institution(platform_headers)
    principal_headers = _principal_headers(institution["id"])
    year = _year(principal_headers, institution["id"])
    compartment = _compartment(principal_headers, institution["id"])
    _, section_viii = _grade_and_section(principal_headers, institution["id"], year["id"], compartment["id"], "VIII", 1)
    _, section_ix = _grade_and_section(principal_headers, institution["id"], year["id"], compartment["id"], "IX", 2)
    science = _subject(principal_headers, institution["id"], "SCI", "Science")
    maths = _subject(principal_headers, institution["id"], "MAT", "Mathematics")
    staff_user_id, _, _ = _create_user()

    subject_teacher = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "user_id": str(staff_user_id),
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "SUBJECT_TEACHER",
            "subject_ids": [science["id"]],
            "grade_level_ids": [],
            "class_group_ids": [section_viii["id"], section_ix["id"]],
        },
    )
    assert subject_teacher.status_code == 201, subject_teacher.text
    assert subject_teacher.json()["subject_ids"] == [science["id"]]
    assert set(subject_teacher.json()["class_group_ids"]) == {section_viii["id"], section_ix["id"]}

    invalid_two_subjects = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "user_id": str(staff_user_id),
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "SUBJECT_TEACHER",
            "subject_ids": [science["id"], maths["id"]],
            "grade_level_ids": [],
            "class_group_ids": [section_viii["id"]],
        },
    )
    assert invalid_two_subjects.status_code == 422
    assert "exactly one subject" in invalid_two_subjects.json()["detail"]

    class_teacher = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "user_id": str(staff_user_id),
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "CLASS_TEACHER",
            "subject_ids": [],
            "grade_level_ids": [],
            "class_group_ids": [section_viii["id"]],
        },
    )
    assert class_teacher.status_code == 201, class_teacher.text

    invalid_two_sections = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "user_id": str(staff_user_id),
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "CLASS_TEACHER",
            "subject_ids": [],
            "grade_level_ids": [],
            "class_group_ids": [section_viii["id"], section_ix["id"]],
        },
    )
    assert invalid_two_sections.status_code == 422
    assert "exactly one section" in invalid_two_sections.json()["detail"]


def test_compartment_head_cannot_manage_responsibility_assignments() -> None:
    platform_headers = _platform_headers()
    institution = _institution(platform_headers)
    principal_headers = _principal_headers(institution["id"])
    year = _year(principal_headers, institution["id"])
    compartment = _compartment(principal_headers, institution["id"])
    subject = _subject(principal_headers, institution["id"], "ENG", "English")
    target_user_id, _, _ = _create_user()
    _, head_email, head_password = _create_user(
        "COMPARTMENT_HEAD",
        institution_id=UUID(institution["id"]),
        academic_division_id=UUID(compartment["id"]),
    )
    head_headers = _login(head_email, head_password)

    response = client.post(
        "/api/v1/staff-responsibilities",
        headers=head_headers,
        json={
            "user_id": str(target_user_id),
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "HOD",
            "subject_ids": [subject["id"]],
            "grade_level_ids": [],
            "class_group_ids": [],
        },
    )
    assert response.status_code == 403
    assert "Principal or School Admin" in response.json()["detail"]
