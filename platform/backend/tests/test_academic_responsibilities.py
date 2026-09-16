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


def _staff_profile(
    headers: dict[str, str],
    institution_id: str,
    compartment_id: str,
    *,
    full_name: str = "Teacher Without Login",
    staff_type: str = "TEACHING",
) -> dict:
    response = client.post(
        "/api/v1/staff-profiles",
        headers=headers,
        json={
            "institution_id": institution_id,
            "full_name": full_name,
            "staff_type": staff_type,
            "employee_code": None,
            "user_id": None,
            "academic_division_ids": [compartment_id] if staff_type == "TEACHING" else [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_subject_teacher_is_owned_by_staff_profile_without_login_account() -> None:
    platform_headers = _platform_headers()
    institution = _institution(platform_headers)
    principal_headers = _principal_headers(institution["id"])
    year = _year(principal_headers, institution["id"])
    compartment = _compartment(principal_headers, institution["id"])
    _, section_viii = _grade_and_section(principal_headers, institution["id"], year["id"], compartment["id"], "VIII", 1)
    _, section_ix = _grade_and_section(principal_headers, institution["id"], year["id"], compartment["id"], "IX", 2)
    maths = _subject(principal_headers, institution["id"], "MATH", "Mathematics")
    teacher = _staff_profile(
        principal_headers,
        institution["id"],
        compartment["id"],
        full_name="Ummal Ansha",
    )
    assert teacher["user_id"] is None

    response = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "staff_profile_id": teacher["id"],
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "SUBJECT_TEACHER",
            "subject_ids": [maths["id"]],
            "grade_level_ids": [],
            "class_group_ids": [section_viii["id"], section_ix["id"]],
        },
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["staff_profile_id"] == teacher["id"]
    assert created["staff_display_name"] == "Ummal Ansha"
    assert created["linked_user_id"] is None
    assert created["subject_ids"] == [maths["id"]]
    assert set(created["class_group_ids"]) == {section_viii["id"], section_ix["id"]}

    listed = client.get(
        f"/api/v1/staff-responsibilities?institution_id={institution['id']}&staff_profile_id={teacher['id']}",
        headers=principal_headers,
    )
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1
    assert listed.json()[0]["staff_profile_id"] == teacher["id"]


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
    teacher = _staff_profile(principal_headers, institution["id"], compartment["id"], full_name="Languages HOD")

    hod = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "staff_profile_id": teacher["id"],
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
    assert set(hod.json()["subject_ids"]) == {english["id"], tamil["id"]}

    overall = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "staff_profile_id": teacher["id"],
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


def test_non_teaching_and_cross_institution_profiles_cannot_receive_academic_responsibilities() -> None:
    platform_headers = _platform_headers()
    institution = _institution(platform_headers)
    principal_headers = _principal_headers(institution["id"])
    year = _year(principal_headers, institution["id"])
    compartment = _compartment(principal_headers, institution["id"])
    english = _subject(principal_headers, institution["id"], "ENG", "English")
    non_teaching = _staff_profile(
        principal_headers,
        institution["id"],
        compartment["id"],
        full_name="Office Staff",
        staff_type="NON_TEACHING",
    )

    rejected = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "staff_profile_id": non_teaching["id"],
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "HOD",
            "subject_ids": [english["id"]],
            "grade_level_ids": [],
            "class_group_ids": [],
        },
    )
    assert rejected.status_code == 422
    assert "Teaching Staff" in rejected.json()["detail"]

    other_institution = _institution(platform_headers)
    other_principal_headers = _principal_headers(other_institution["id"])
    other_compartment = _compartment(other_principal_headers, other_institution["id"])
    other_teacher = _staff_profile(
        other_principal_headers,
        other_institution["id"],
        other_compartment["id"],
        full_name="Other School Teacher",
    )
    cross = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "staff_profile_id": other_teacher["id"],
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "HOD",
            "subject_ids": [english["id"]],
            "grade_level_ids": [],
            "class_group_ids": [],
        },
    )
    assert cross.status_code == 422
    assert "selected institution" in cross.json()["detail"]


def test_shape_rules_and_compartment_head_authority_remain_protected() -> None:
    platform_headers = _platform_headers()
    institution = _institution(platform_headers)
    principal_headers = _principal_headers(institution["id"])
    year = _year(principal_headers, institution["id"])
    compartment = _compartment(principal_headers, institution["id"])
    _, section = _grade_and_section(principal_headers, institution["id"], year["id"], compartment["id"], "X", 1)
    english = _subject(principal_headers, institution["id"], "ENG", "English")
    maths = _subject(principal_headers, institution["id"], "MATH", "Mathematics")
    teacher = _staff_profile(principal_headers, institution["id"], compartment["id"])

    invalid = client.post(
        "/api/v1/staff-responsibilities",
        headers=principal_headers,
        json={
            "staff_profile_id": teacher["id"],
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "SUBJECT_TEACHER",
            "subject_ids": [english["id"], maths["id"]],
            "grade_level_ids": [],
            "class_group_ids": [section["id"]],
        },
    )
    assert invalid.status_code == 422
    assert "exactly one subject" in invalid.json()["detail"]

    _, head_email, head_password = _create_user(
        "COMPARTMENT_HEAD",
        institution_id=UUID(institution["id"]),
        academic_division_id=UUID(compartment["id"]),
    )
    head_headers = _login(head_email, head_password)
    denied = client.post(
        "/api/v1/staff-responsibilities",
        headers=head_headers,
        json={
            "staff_profile_id": teacher["id"],
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "responsibility_type": "HOD",
            "subject_ids": [english["id"]],
            "grade_level_ids": [],
            "class_group_ids": [],
        },
    )
    assert denied.status_code == 403
    assert "Principal or School Admin" in denied.json()["detail"]
