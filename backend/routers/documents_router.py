import io
import re
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

import minio_client
from auth import get_current_user
from database import get_db
from models import DocumentRecord, DocumentTemplate, User
from schemas import (
    DocumentRecordCreate,
    DocumentRecordResponse,
    DocumentTemplateResponse,
    DocumentTemplateUpdate,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])

_PLACEHOLDER_RE = re.compile(r"\{\{([^{}]+)\}\}")

DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
XLSX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def _content_type(file_type: str) -> str:
    return DOCX_CONTENT_TYPE if file_type == "docx" else XLSX_CONTENT_TYPE


# ── 변수 추출 ────────────────────────────────────────────────────────────────

def _extract_variables_docx(data: bytes) -> list[str]:
    from docx import Document

    doc = Document(io.BytesIO(data))
    variables: set[str] = set()

    for para in doc.paragraphs:
        for m in _PLACEHOLDER_RE.finditer(para.text):
            variables.add(m.group(1).strip())

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    for m in _PLACEHOLDER_RE.finditer(para.text):
                        variables.add(m.group(1).strip())

    return sorted(variables)


def _extract_variables_xlsx(data: bytes) -> list[str]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(data))
    variables: set[str] = set()

    for sheet in wb.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value and isinstance(cell.value, str):
                    for m in _PLACEHOLDER_RE.finditer(cell.value):
                        variables.add(m.group(1).strip())

    return sorted(variables)


# ── 렌더링 ──────────────────────────────────────────────────────────────────

def _render_docx(template_data: bytes, field_values: dict) -> bytes:
    from docxtpl import DocxTemplate

    tpl = DocxTemplate(io.BytesIO(template_data))
    tpl.render(field_values)
    output = io.BytesIO()
    tpl.save(output)
    return output.getvalue()


def _render_xlsx(template_data: bytes, field_values: dict) -> bytes:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(template_data))

    for sheet in wb.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value and isinstance(cell.value, str):
                    val = cell.value
                    for key, value in field_values.items():
                        val = val.replace(f"{{{{{key}}}}}", str(value))
                    cell.value = val

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _template_to_response(t: DocumentTemplate) -> DocumentTemplateResponse:
    return DocumentTemplateResponse(
        id=t.id,
        name=t.name,
        description=t.description,
        file_type=t.file_type,
        original_filename=t.original_filename,
        file_size=t.file_size,
        variables=t.variables or [],
        created_at=t.created_at,
        created_by_username=t.creator.username if t.creator else None,
    )


# ── 템플릿 엔드포인트 ─────────────────────────────────────────────────────────

@router.get("/templates", response_model=List[DocumentTemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    templates = (
        db.query(DocumentTemplate)
        .order_by(DocumentTemplate.created_at.desc())
        .all()
    )
    return [_template_to_response(t) for t in templates]


@router.post("/templates", response_model=DocumentTemplateResponse)
async def create_template(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filename = file.filename or "template"
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ("docx", "xlsx"):
        raise HTTPException(status_code=400, detail="docx 또는 xlsx 파일만 지원합니다")

    data = await file.read()

    try:
        var_keys = (
            _extract_variables_docx(data)
            if ext == "docx"
            else _extract_variables_xlsx(data)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"파일 파싱 오류: {e}")

    object_key = f"documents/templates/{current_user.id}/{filename}"
    if not minio_client.upload_file(object_key, data, _content_type(ext)):
        raise HTTPException(status_code=500, detail="파일 업로드 실패")

    template = DocumentTemplate(
        name=name,
        description=description or None,
        file_type=ext,
        original_filename=filename,
        minio_object_key=object_key,
        file_size=len(data),
        variables=[{"key": k, "label": k} for k in var_keys],
        created_by=current_user.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _template_to_response(template)


@router.get("/templates/{template_id}", response_model=DocumentTemplateResponse)
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    return _template_to_response(t)


@router.put("/templates/{template_id}", response_model=DocumentTemplateResponse)
def update_template(
    template_id: int,
    body: DocumentTemplateUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    if body.name is not None:
        t.name = body.name
    if body.description is not None:
        t.description = body.description
    if body.variables is not None:
        t.variables = [{"key": v.key, "label": v.label} for v in body.variables]
    db.commit()
    db.refresh(t)
    return _template_to_response(t)


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    minio_client.delete_file(t.minio_object_key)
    db.delete(t)
    db.commit()


@router.get("/templates/{template_id}/file")
def download_template_file(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")
    data = minio_client.download_file(t.minio_object_key)
    if data is None:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    return Response(
        content=data,
        media_type=_content_type(t.file_type),
        headers={"Content-Disposition": f'attachment; filename="{t.original_filename}"'},
    )


# ── 작업 기록 엔드포인트 ──────────────────────────────────────────────────────

@router.get("/records", response_model=List[DocumentRecordResponse])
def list_records(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    records = (
        db.query(DocumentRecord)
        .order_by(DocumentRecord.created_at.desc())
        .all()
    )
    return [
        DocumentRecordResponse(
            id=r.id,
            template_id=r.template_id,
            template_name=r.template.name if r.template else None,
            file_type=r.template.file_type if r.template else None,
            title=r.title,
            field_values=r.field_values or {},
            original_filename=r.original_filename,
            file_size=r.file_size,
            created_at=r.created_at,
            created_by_username=r.creator.username if r.creator else None,
        )
        for r in records
    ]


@router.post("/records", response_model=DocumentRecordResponse)
def create_record(
    body: DocumentRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == body.template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다")

    template_data = minio_client.download_file(t.minio_object_key)
    if template_data is None:
        raise HTTPException(status_code=404, detail="템플릿 파일을 찾을 수 없습니다")

    try:
        rendered = (
            _render_docx(template_data, body.field_values)
            if t.file_type == "docx"
            else _render_xlsx(template_data, body.field_values)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"문서 렌더링 오류: {e}")

    safe_title = re.sub(r'[\\/*?:"<>|]', "_", body.title)
    output_filename = f"{safe_title}.{t.file_type}"
    object_key = f"documents/records/{current_user.id}/{output_filename}"

    if not minio_client.upload_file(object_key, rendered, _content_type(t.file_type)):
        raise HTTPException(status_code=500, detail="파일 저장 실패")

    record = DocumentRecord(
        template_id=t.id,
        title=body.title,
        field_values=body.field_values,
        original_filename=output_filename,
        minio_object_key=object_key,
        file_size=len(rendered),
        created_by=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return DocumentRecordResponse(
        id=record.id,
        template_id=record.template_id,
        template_name=t.name,
        file_type=t.file_type,
        title=record.title,
        field_values=record.field_values or {},
        original_filename=record.original_filename,
        file_size=record.file_size,
        created_at=record.created_at,
        created_by_username=current_user.username,
    )


@router.delete("/records/{record_id}", status_code=204)
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    r = db.query(DocumentRecord).filter(DocumentRecord.id == record_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="작업 기록을 찾을 수 없습니다")
    minio_client.delete_file(r.minio_object_key)
    db.delete(r)
    db.commit()


@router.get("/records/{record_id}/file")
def download_record_file(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    r = db.query(DocumentRecord).filter(DocumentRecord.id == record_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="작업 기록을 찾을 수 없습니다")
    data = minio_client.download_file(r.minio_object_key)
    if data is None:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    file_type = r.template.file_type if r.template else (r.original_filename or "").rsplit(".", 1)[-1]
    return Response(
        content=data,
        media_type=_content_type(file_type),
        headers={"Content-Disposition": f'attachment; filename="{r.original_filename}"'},
    )
