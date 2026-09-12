from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_foundation_setup_flow() -> None:
    suffix = uuid4().hex[:8].upper()

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    institution_response = client.post(
        "/api/v1/institutions",
        json={
            "institution_code": f"APS{suffix}",
            "official_name": "AcadPulse Test School",
            "display_name": "APS Test",
            "timezone": "Asia/Kolkata",
            "status": "active",
        },
    )
    assert institution_response.status_code == 201, institution_response.text
    institution = institution_response.json()
    institution_id = institution["id"]

    year_response = client.post(
        "/api/v1/academic-years",
        json={
            "institution_id": institution_id,
            "name": "2026-2027",
            "start_date": "2026-06-01",
            "end_date": "2027-04-30",
            "status": "active",
            "is_current": True,
        },
    )
    assert year_response.status_code == 201, year_response.text
    academic_year_id = year_response.json()["id"]

    division_response = client.post(
        "/api/v1/academic-divisions",
        json={
            "institution_id": institution_id,
            "code": f"SEC{suffix}",
            "name": "Secondary",
            "display_order": 1,
            "is_active": True,
        },
    )
    assert division_response.status_code == 201, division_response.text
    division_id = division_response.json()["id"]

    grade_response = client.post(
        "/api/v1/grade-levels",
        json={
            "institution_id": institution_id,
            "code": f"X{suffix}",
            "display_name": "Grade 10",
            "level_order": 10,
            "is_active": True,
        },
    )
    assert grade_response.status_code == 201, grade_response.text
    grade_id = grade_response.json()["id"]

    mapping_response = client.post(
        "/api/v1/academic-division-grade-levels",
        json={
            "institution_id": institution_id,
            "academic_year_id": academic_year_id,
            "academic_division_id": division_id,
            "grade_level_id": grade_id,
            "sequence_no": 1,
        },
    )
    assert mapping_response.status_code == 201, mapping_response.text

    class_response = client.post(
        "/api/v1/class-groups",
        json={
            "institution_id": institution_id,
            "academic_year_id": academic_year_id,
            "grade_level_id": grade_id,
            "section_code": "BA",
            "display_name": "Grade 10 BA",
            "capacity": 40,
            "status": "active",
        },
    )
    assert class_response.status_code == 201, class_response.text
    class_group = class_response.json()
    assert class_group["display_name"] == "Grade 10 BA"

    classes_response = client.get(
        "/api/v1/class-groups",
        params={"institution_id": institution_id, "academic_year_id": academic_year_id},
    )
    assert classes_response.status_code == 200
    classes = classes_response.json()
    assert any(item["id"] == class_group["id"] for item in classes)


def test_class_requires_grade_mapping() -> None:
    suffix = uuid4().hex[:8].upper()

    institution = client.post(
        "/api/v1/institutions",
        json={
            "institution_code": f"NOMAP{suffix}",
            "official_name": "No Mapping Test School",
            "timezone": "Asia/Kolkata",
            "status": "active",
        },
    ).json()

    year = client.post(
        "/api/v1/academic-years",
        json={
            "institution_id": institution["id"],
            "name": f"2026-2027-{suffix}",
            "start_date": "2026-06-01",
            "end_date": "2027-04-30",
            "status": "active",
            "is_current": False,
        },
    ).json()

    grade = client.post(
        "/api/v1/grade-levels",
        json={
            "institution_id": institution["id"],
            "code": f"IX{suffix}",
            "display_name": "Grade 9",
            "level_order": 9,
            "is_active": True,
        },
    ).json()

    response = client.post(
        "/api/v1/class-groups",
        json={
            "institution_id": institution["id"],
            "academic_year_id": year["id"],
            "grade_level_id": grade["id"],
            "section_code": "A",
            "display_name": "Grade 9 A",
            "capacity": 40,
            "status": "active",
        },
    )

    assert response.status_code == 400
    assert "mapped to an academic division" in response.json()["detail"]
