from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..access_control import AccessContext, get_current_access, require_institution_access
from ..database import get_db
from ..models.access import UserAccount
from ..models.academic_responsibility import (
    StaffAcademicResponsibility,
    StaffResponsibilityClassGroup,
    StaffResponsibilityGrade,
    StaffResponsibilitySubject,
    Subject,
    SubjectAcademicDivision,
)
from ..models.foundation import AcademicDivision, AcademicDivisionGradeLevel, AcademicYear, ClassGroup, GradeLevel, Institution
from ..models.staff import StaffProfile, StaffProfileAcademicDivision
from ..schemas.academic_responsibility import StaffAcademicResponsibilityCreate, StaffAcademicResponsibilityRead, SubjectCreate, SubjectRead, SubjectUpdate

router = APIRouter(prefix="/api/v1", tags=["academic-responsibilities"])
RESPONSIBILITY_TYPES = {"SUBJECT_TEACHER", "CLASS_TEACHER", "HOD", "OVERALL_CLASS_INCHARGE"}


def _is_institution_responsibility_admin(institution_id: UUID, access: AccessContext) -> bool:
    return access.is_platform_admin or any(a.role_code in {"PRINCIPAL", "SCHOOL_ADMIN"} and a.scope_type == "institution" and a.institution_id == institution_id for a in access.assignments)


def _compartment_head_scope(institution_id: UUID, access: AccessContext) -> set[UUID]:
    return {a.academic_division_id for a in access.assignments if a.role_code == "COMPARTMENT_HEAD" and a.scope_type == "academic_compartment" and a.institution_id == institution_id and a.academic_division_id is not None}


def _subject_manager_scope(institution_id: UUID, access: AccessContext, db: Session) -> set[UUID] | None:
    require_institution_access(institution_id, access, db)
    if _is_institution_responsibility_admin(institution_id, access): return None
    scoped = _compartment_head_scope(institution_id, access)
    if scoped: return scoped
    raise HTTPException(status_code=403, detail="Subject management requires Principal or School Admin access, or scoped Compartment Head access")


def _responsibility_manager_scope(institution_id: UUID, access: AccessContext, db: Session) -> set[UUID] | None:
    require_institution_access(institution_id, access, db)
    if _is_institution_responsibility_admin(institution_id, access): return None
    scoped = _compartment_head_scope(institution_id, access)
    if scoped: return scoped
    raise HTTPException(status_code=403, detail="Academic responsibility management requires Principal or School Admin access, or scoped Compartment Head access")


def _unique_ids(values: list[UUID]) -> list[UUID]: return list(dict.fromkeys(values))


def _validate_shape(t: str, s: list[UUID], g: list[UUID], c: list[UUID]) -> None:
    if t not in RESPONSIBILITY_TYPES: raise HTTPException(status_code=422, detail="Unsupported academic responsibility type")
    if t == "HOD":
        if not s or g or c: raise HTTPException(status_code=422, detail="HOD requires one or more subjects only")
        return
    if t == "OVERALL_CLASS_INCHARGE":
        if not g or s or c: raise HTTPException(status_code=422, detail="Overall Class Incharge requires one or more grades only")
        return
    if t == "CLASS_TEACHER":
        if len(c) != 1 or s or g: raise HTTPException(status_code=422, detail="Class Teacher requires exactly one section")
        return
    if len(s) != 1 or not c or g: raise HTTPException(status_code=422, detail="Subject Teacher requires exactly one subject and one or more teaching sections")


def _load_targets(db: Session, institution_id: UUID, academic_year_id: UUID, subject_ids: list[UUID], grade_level_ids: list[UUID], class_group_ids: list[UUID]) -> None:
    if db.get(Institution, institution_id) is None: raise HTTPException(status_code=404, detail="Institution not found")
    year=db.get(AcademicYear,academic_year_id)
    if year is None or year.institution_id != institution_id: raise HTTPException(status_code=422, detail="Academic year must belong to the selected institution")
    if subject_ids:
        items=db.scalars(select(Subject).where(Subject.id.in_(subject_ids))).all()
        if len(items)!=len(subject_ids) or any(x.institution_id!=institution_id for x in items): raise HTTPException(status_code=422, detail="All subjects must belong to the selected institution")
    if grade_level_ids:
        items=db.scalars(select(GradeLevel).where(GradeLevel.id.in_(grade_level_ids))).all()
        if len(items)!=len(grade_level_ids) or any(x.institution_id!=institution_id for x in items): raise HTTPException(status_code=422, detail="All grades must belong to the selected institution")
    if class_group_ids:
        items=db.scalars(select(ClassGroup).where(ClassGroup.id.in_(class_group_ids))).all()
        if len(items)!=len(class_group_ids) or any(x.institution_id!=institution_id or x.academic_year_id!=academic_year_id for x in items): raise HTTPException(status_code=422, detail="All teaching sections must belong to the selected institution and academic year")


def _validate_division_target(db: Session, *, institution_id: UUID, academic_division_id: UUID, manager_scope: set[UUID] | None) -> AcademicDivision:
    d=db.get(AcademicDivision,academic_division_id)
    if d is None or d.institution_id!=institution_id or not d.is_active: raise HTTPException(status_code=422, detail="Academic Compartment must belong to the selected institution")
    if manager_scope is not None and academic_division_id not in manager_scope: raise HTTPException(status_code=403, detail="Academic Compartment is outside your assigned access scope")
    return d


def _validate_compartment_scope(db: Session, *, institution_id: UUID, academic_year_id: UUID, academic_division_id: UUID | None, profile: StaffProfile, subject_ids: list[UUID], grade_level_ids: list[UUID], class_group_ids: list[UUID], manager_scope: set[UUID] | None) -> None:
    if academic_division_id is None:
        if manager_scope is not None: raise HTTPException(status_code=403, detail="Academic responsibility management requires Principal or School Admin access when no Academic Compartment is supplied")
        return
    _validate_division_target(db,institution_id=institution_id,academic_division_id=academic_division_id,manager_scope=manager_scope)
    if db.scalar(select(StaffProfileAcademicDivision.id).where(StaffProfileAcademicDivision.staff_profile_id==profile.id,StaffProfileAcademicDivision.academic_division_id==academic_division_id)) is None: raise HTTPException(status_code=422, detail="Staff Profile must be placed in the selected Academic Compartment")
    if subject_ids:
        mapped=set(db.scalars(select(SubjectAcademicDivision.subject_id).where(SubjectAcademicDivision.academic_division_id==academic_division_id,SubjectAcademicDivision.subject_id.in_(subject_ids))).all())
        if mapped!=set(subject_ids): raise HTTPException(status_code=422, detail="All selected subjects must be available in the selected Academic Compartment")
    targets=set(grade_level_ids)
    if class_group_ids: targets.update(x.grade_level_id for x in db.scalars(select(ClassGroup).where(ClassGroup.id.in_(class_group_ids))).all())
    if targets:
        mapped=set(db.scalars(select(AcademicDivisionGradeLevel.grade_level_id).where(AcademicDivisionGradeLevel.institution_id==institution_id,AcademicDivisionGradeLevel.academic_year_id==academic_year_id,AcademicDivisionGradeLevel.academic_division_id==academic_division_id,AcademicDivisionGradeLevel.grade_level_id.in_(targets))).all())
        if mapped!=targets: raise HTTPException(status_code=422, detail="All selected grades and sections must belong to the selected Academic Compartment for this academic year")


def _subject_read(db: Session,item: Subject)->SubjectRead:
    ids=db.scalars(select(SubjectAcademicDivision.academic_division_id).where(SubjectAcademicDivision.subject_id==item.id)).all()
    return SubjectRead(id=item.id,institution_id=item.institution_id,code=item.code,name=item.name,is_active=item.is_active,academic_division_ids=list(ids),created_at=item.created_at,updated_at=item.updated_at)


def _responsibility_read(db: Session,item: StaffAcademicResponsibility)->StaffAcademicResponsibilityRead:
    p=db.get(StaffProfile,item.staff_profile_id) if item.staff_profile_id else None; u=db.get(UserAccount,item.user_id) if p is None and item.user_id else None
    s=db.scalars(select(StaffResponsibilitySubject.subject_id).where(StaffResponsibilitySubject.responsibility_id==item.id)).all(); g=db.scalars(select(StaffResponsibilityGrade.grade_level_id).where(StaffResponsibilityGrade.responsibility_id==item.id)).all(); c=db.scalars(select(StaffResponsibilityClassGroup.class_group_id).where(StaffResponsibilityClassGroup.responsibility_id==item.id)).all()
    return StaffAcademicResponsibilityRead(id=item.id,staff_profile_id=item.staff_profile_id,staff_display_name=p.full_name if p else u.display_name if u else "Legacy staff record",linked_user_id=p.user_id if p else item.user_id,institution_id=item.institution_id,academic_year_id=item.academic_year_id,academic_division_id=item.academic_division_id,responsibility_type=item.responsibility_type,display_title=item.display_title,is_active=item.is_active,subject_ids=list(s),grade_level_ids=list(g),class_group_ids=list(c),created_at=item.created_at,updated_at=item.updated_at)


@router.post("/subjects",response_model=SubjectRead,status_code=status.HTTP_201_CREATED)
def create_subject(payload:SubjectCreate,db:Session=Depends(get_db),access:AccessContext=Depends(get_current_access))->SubjectRead:
    scope=_subject_manager_scope(payload.institution_id,access,db)
    if db.get(Institution,payload.institution_id) is None: raise HTTPException(status_code=404,detail="Institution not found")
    if payload.academic_division_id: _validate_division_target(db,institution_id=payload.institution_id,academic_division_id=payload.academic_division_id,manager_scope=scope)
    elif scope is not None: raise HTTPException(status_code=422,detail="Compartment Head Subject management requires an Academic Compartment")
    code=payload.code.strip().upper(); name=payload.name.strip(); item=db.scalar(select(Subject).where(Subject.institution_id==payload.institution_id,Subject.code==code))
    if item is not None and item.name.casefold()!=name.casefold(): raise HTTPException(status_code=409,detail=f"Subject code {code} already exists as {item.name}")
    if item is None: item=Subject(id=uuid4(),institution_id=payload.institution_id,code=code,name=name,is_active=True); db.add(item); db.flush()
    targets=[payload.academic_division_id] if payload.academic_division_id else db.scalars(select(AcademicDivision.id).where(AcademicDivision.institution_id==payload.institution_id,AcademicDivision.is_active.is_(True))).all()
    existing=set(db.scalars(select(SubjectAcademicDivision.academic_division_id).where(SubjectAcademicDivision.subject_id==item.id)).all())
    for d in targets:
        if d not in existing: db.add(SubjectAcademicDivision(subject_id=item.id,academic_division_id=d))
    try: db.commit()
    except IntegrityError as exc: db.rollback(); raise HTTPException(status_code=409,detail="Subject code already exists for this institution") from exc
    db.refresh(item); return _subject_read(db,item)


@router.patch("/subjects/{subject_id}",response_model=SubjectRead)
def update_subject(subject_id:UUID,payload:SubjectUpdate,db:Session=Depends(get_db),access:AccessContext=Depends(get_current_access))->SubjectRead:
    item=db.get(Subject,subject_id)
    if item is None or not item.is_active: raise HTTPException(status_code=404,detail="Subject not found")
    scope=_subject_manager_scope(item.institution_id,access,db)
    mapped=set(db.scalars(select(SubjectAcademicDivision.academic_division_id).where(SubjectAcademicDivision.subject_id==item.id)).all())
    if scope is not None and not mapped.intersection(scope): raise HTTPException(status_code=403,detail="Subject is outside your assigned Academic Compartment")
    code=payload.code.strip().upper(); name=payload.name.strip()
    duplicate=db.scalar(select(Subject).where(Subject.institution_id==item.institution_id,Subject.code==code,Subject.id!=item.id))
    if duplicate is not None: raise HTTPException(status_code=409,detail=f"Subject code {code} already exists as {duplicate.name}")
    item.code=code; item.name=name
    db.commit(); db.refresh(item); return _subject_read(db,item)


@router.delete("/subjects/{subject_id}/academic-compartments/{academic_division_id}",status_code=status.HTTP_204_NO_CONTENT)
def remove_subject_from_compartment(subject_id:UUID,academic_division_id:UUID,db:Session=Depends(get_db),access:AccessContext=Depends(get_current_access))->Response:
    item=db.get(Subject,subject_id)
    if item is None or not item.is_active: raise HTTPException(status_code=404,detail="Subject not found")
    scope=_subject_manager_scope(item.institution_id,access,db); _validate_division_target(db,institution_id=item.institution_id,academic_division_id=academic_division_id,manager_scope=scope)
    link=db.scalar(select(SubjectAcademicDivision).where(SubjectAcademicDivision.subject_id==subject_id,SubjectAcademicDivision.academic_division_id==academic_division_id))
    if link is None: return Response(status_code=status.HTTP_204_NO_CONTENT)
    active=db.scalar(select(StaffAcademicResponsibility.id).join(StaffResponsibilitySubject,StaffResponsibilitySubject.responsibility_id==StaffAcademicResponsibility.id).where(StaffResponsibilitySubject.subject_id==subject_id,StaffAcademicResponsibility.academic_division_id==academic_division_id,StaffAcademicResponsibility.is_active.is_(True)))
    if active is not None: raise HTTPException(status_code=409,detail="Remove active academic responsibilities for this subject in the Academic Compartment first")
    db.delete(link); db.commit(); return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/subjects/{subject_id}",status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(subject_id:UUID,db:Session=Depends(get_db),access:AccessContext=Depends(get_current_access))->Response:
    item=db.get(Subject,subject_id)
    if item is None or not item.is_active: raise HTTPException(status_code=404,detail="Subject not found")
    scope=_subject_manager_scope(item.institution_id,access,db)
    mapped=set(db.scalars(select(SubjectAcademicDivision.academic_division_id).where(SubjectAcademicDivision.subject_id==subject_id)).all())
    if scope is not None and not mapped.issubset(scope): raise HTTPException(status_code=403,detail="Complete deletion is unavailable because this subject is also used outside your assigned Academic Compartment")
    if db.scalar(select(StaffResponsibilitySubject.subject_id).where(StaffResponsibilitySubject.subject_id==subject_id)) is not None: raise HTTPException(status_code=409,detail="This canonical subject has academic responsibility history and cannot be permanently deleted")
    for link in db.scalars(select(SubjectAcademicDivision).where(SubjectAcademicDivision.subject_id==subject_id)).all(): db.delete(link)
    db.delete(item); db.commit(); return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/subjects",response_model=list[SubjectRead])
def list_subjects(institution_id:UUID,academic_division_id:UUID|None=None,db:Session=Depends(get_db),access:AccessContext=Depends(get_current_access))->list[SubjectRead]:
    require_institution_access(institution_id,access,db); wide=_is_institution_responsibility_admin(institution_id,access); scoped=_compartment_head_scope(institution_id,access)
    stmt=select(Subject).where(Subject.institution_id==institution_id,Subject.is_active.is_(True))
    if academic_division_id:
        _validate_division_target(db,institution_id=institution_id,academic_division_id=academic_division_id,manager_scope=None if wide else scoped or None); stmt=stmt.join(SubjectAcademicDivision,SubjectAcademicDivision.subject_id==Subject.id).where(SubjectAcademicDivision.academic_division_id==academic_division_id)
    elif scoped and not wide: stmt=stmt.join(SubjectAcademicDivision,SubjectAcademicDivision.subject_id==Subject.id).where(SubjectAcademicDivision.academic_division_id.in_(scoped)).distinct()
    return [_subject_read(db,x) for x in db.scalars(stmt.order_by(Subject.name)).all()]


@router.post("/staff-responsibilities",response_model=StaffAcademicResponsibilityRead,status_code=status.HTTP_201_CREATED)
def create_staff_responsibility(payload:StaffAcademicResponsibilityCreate,db:Session=Depends(get_db),access:AccessContext=Depends(get_current_access))->StaffAcademicResponsibilityRead:
    scope=_responsibility_manager_scope(payload.institution_id,access,db); t=payload.responsibility_type.strip().upper(); s=_unique_ids(payload.subject_ids); g=_unique_ids(payload.grade_level_ids); c=_unique_ids(payload.class_group_ids); _validate_shape(t,s,g,c); _load_targets(db,payload.institution_id,payload.academic_year_id,s,g,c)
    p=db.get(StaffProfile,payload.staff_profile_id)
    if p is None: raise HTTPException(status_code=422,detail="Academic responsibility requires a Staff Profile")
    if p.institution_id!=payload.institution_id: raise HTTPException(status_code=422,detail="Staff Profile must belong to the selected institution")
    if not p.is_active: raise HTTPException(status_code=422,detail="Academic responsibility requires an active Staff Profile")
    if p.staff_type!="TEACHING": raise HTTPException(status_code=422,detail="Academic responsibility requires Teaching Staff")
    _validate_compartment_scope(db,institution_id=payload.institution_id,academic_year_id=payload.academic_year_id,academic_division_id=payload.academic_division_id,profile=p,subject_ids=s,grade_level_ids=g,class_group_ids=c,manager_scope=scope)
    item=StaffAcademicResponsibility(id=uuid4(),staff_profile_id=p.id,user_id=None,institution_id=payload.institution_id,academic_year_id=payload.academic_year_id,academic_division_id=payload.academic_division_id,responsibility_type=t,display_title=payload.display_title.strip() if payload.display_title else None,is_active=True); db.add(item); db.flush()
    for x in s: db.add(StaffResponsibilitySubject(id=uuid4(),responsibility_id=item.id,subject_id=x))
    for x in g: db.add(StaffResponsibilityGrade(id=uuid4(),responsibility_id=item.id,grade_level_id=x))
    for x in c: db.add(StaffResponsibilityClassGroup(id=uuid4(),responsibility_id=item.id,class_group_id=x))
    db.commit(); db.refresh(item); return _responsibility_read(db,item)


@router.get("/staff-responsibilities",response_model=list[StaffAcademicResponsibilityRead])
def list_staff_responsibilities(institution_id:UUID,academic_year_id:UUID|None=None,academic_division_id:UUID|None=None,db:Session=Depends(get_db),access:AccessContext=Depends(get_current_access))->list[StaffAcademicResponsibilityRead]:
    require_institution_access(institution_id,access,db); stmt=select(StaffAcademicResponsibility).where(StaffAcademicResponsibility.institution_id==institution_id,StaffAcademicResponsibility.is_active.is_(True)); wide=_is_institution_responsibility_admin(institution_id,access); scoped=_compartment_head_scope(institution_id,access)
    if academic_year_id: stmt=stmt.where(StaffAcademicResponsibility.academic_year_id==academic_year_id)
    if academic_division_id:
        _validate_division_target(db,institution_id=institution_id,academic_division_id=academic_division_id,manager_scope=None if wide else scoped or None); stmt=stmt.where(StaffAcademicResponsibility.academic_division_id==academic_division_id)
    elif scoped and not wide: stmt=stmt.where(StaffAcademicResponsibility.academic_division_id.in_(scoped))
    return [_responsibility_read(db,x) for x in db.scalars(stmt.order_by(StaffAcademicResponsibility.created_at)).all()]


@router.delete("/staff-responsibilities/{responsibility_id}",status_code=status.HTTP_204_NO_CONTENT)
def delete_staff_responsibility(responsibility_id:UUID,db:Session=Depends(get_db),access:AccessContext=Depends(get_current_access))->Response:
    item=db.get(StaffAcademicResponsibility,responsibility_id)
    if item is None or not item.is_active: raise HTTPException(status_code=404,detail="Academic responsibility not found")
    scope=_responsibility_manager_scope(item.institution_id,access,db)
    if scope is not None and (item.academic_division_id is None or item.academic_division_id not in scope): raise HTTPException(status_code=403,detail="Academic responsibility is outside your assigned Academic Compartment")
    item.is_active=False; db.commit(); return Response(status_code=status.HTTP_204_NO_CONTENT)
