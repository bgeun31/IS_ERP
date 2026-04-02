import io
import json
import re
import zipfile
from copy import copy
from typing import List
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

import minio_client
from auth import get_current_user
from database import get_db
from models import DocumentRecord, DocumentTemplate, TemplateBundle, TemplateBundleItem, User
from purchase_order_parser import parse_purchase_order_pdf
from schemas import (
    BundlePurchaseOrderExtractResponse,
    TemplateBundleItemResponse,
    TemplateBundleResponse,
)
from template_package_utils import replace_text_in_office_package

router = APIRouter(prefix="/api/documents/bundles", tags=["bundles"])

DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
XLSX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def _content_type(file_type: str) -> str:
    return DOCX_CONTENT_TYPE if file_type == "docx" else XLSX_CONTENT_TYPE


def _bundle_to_response(b: TemplateBundle) -> TemplateBundleResponse:
    return TemplateBundleResponse(
        id=b.id,
        name=b.name,
        description=b.description,
        variables=b.variables or [],
        items=[
            TemplateBundleItemResponse(
                id=item.id,
                template_id=item.template_id,
                display_name=item.display_name,
                output_name_pattern=item.output_name_pattern,
                file_type=item.template.file_type if item.template else None,
                order=item.order,
            )
            for item in b.items
        ],
        created_at=b.created_at,
        created_by_username=b.creator.username if b.creator else None,
    )


@router.get("", response_model=List[TemplateBundleResponse])
def list_bundles(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    bundles = db.query(TemplateBundle).order_by(TemplateBundle.created_at.desc()).all()
    return [_bundle_to_response(b) for b in bundles]


@router.get("/{bundle_id}", response_model=TemplateBundleResponse)
def get_bundle(
    bundle_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    b = db.query(TemplateBundle).filter(TemplateBundle.id == bundle_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="번들을 찾을 수 없습니다")
    return _bundle_to_response(b)


def _render_docx(template_data: bytes, field_values: dict) -> bytes:
    replacements = {f"{{{{{key}}}}}": value for key, value in field_values.items()}
    return replace_text_in_office_package(
        template_data,
        replacements,
        xml_prefixes=("word/",),
        escape_xml=True,
    )


def _render_xlsx(template_data: bytes, field_values: dict) -> bytes:
    replacements = {
        f"{{{{{key}}}}}": value
        for key, value in field_values.items()
        if isinstance(value, (str, int, float)) or value is None
    }
    return replace_text_in_office_package(
        template_data,
        replacements,
        xml_prefixes=("xl/",),
        escape_xml=True,
    )


def _extract_idc_access_people(field_values: dict) -> list[dict[str, str]]:
    people = field_values.get("__idc_access_people")
    if isinstance(people, list):
        normalized = []
        for person in people:
            if not isinstance(person, dict):
                continue
            normalized.append(
                {
                    "company": str(person.get("company", "") or ""),
                    "name": str(person.get("name", "") or ""),
                    "position": str(person.get("position", "") or ""),
                    "contact": str(person.get("contact", "") or ""),
                }
            )
        if normalized:
            return normalized

    fallback = []
    for idx in range(1, 100):
        company = str(field_values.get(f"출입자{idx}_회사명", "") or "")
        name = str(field_values.get(f"출입자{idx}_이름", "") or "")
        position = str(field_values.get(f"출입자{idx}_직책", "") or "")
        contact = str(field_values.get(f"출입자{idx}_연락처", "") or "")
        if not any([company, name, position, contact]):
            if idx > 2:
                break
            continue
        fallback.append(
            {
                "company": company,
                "name": name,
                "position": position,
                "contact": contact,
            }
        )

    return fallback or [{"company": "", "name": "", "position": "", "contact": ""}]


def _copy_row_style(ws, source_row: int, target_row: int, max_col: int = 5):
    ws.row_dimensions[target_row].height = ws.row_dimensions[source_row].height
    for col in range(1, max_col + 1):
        source = ws.cell(source_row, col)
        target = ws.cell(target_row, col)
        target._style = copy(source._style)
        target.font = copy(source.font)
        target.fill = copy(source.fill)
        target.border = copy(source.border)
        target.alignment = copy(source.alignment)
        target.number_format = source.number_format
        target.protection = copy(source.protection)


def _render_idc_access_xlsx(template_data: bytes, field_values: dict) -> bytes:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(template_data))
    ws = wb.active
    people = _extract_idc_access_people(field_values)
    start_row = 7
    end_row = max(18, start_row + len(people) - 1)

    for row in range(start_row, end_row + 1):
        _copy_row_style(ws, 7 if row == 7 else 8, row)
        for col in range(1, 6):
            ws.cell(row, col).value = ""

    for idx, person in enumerate(people):
        row = start_row + idx
        ws.cell(row, 1).value = ""
        ws.cell(row, 2).value = person["company"]
        ws.cell(row, 3).value = person["name"]
        ws.cell(row, 4).value = person["position"]
        ws.cell(row, 5).value = person["contact"]

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()


def _is_dynamic_idc_key(key: str) -> bool:
    return bool(re.fullmatch(r"출입자\d+_(회사명|이름|직책|연락처)", key))


@router.post("/{bundle_id}/purchase-order/extract", response_model=BundlePurchaseOrderExtractResponse)
async def extract_purchase_order(
    bundle_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    bundle = db.query(TemplateBundle).filter(TemplateBundle.id == bundle_id).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="번들을 찾을 수 없습니다")

    filename = file.filename or "purchase-order.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="업로드된 파일이 비어 있습니다")

    try:
        parsed = parse_purchase_order_pdf(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"발주서 파싱 오류: {e}")

    bundle_keys = {
        variable.get("key")
        for variable in (bundle.variables or [])
        if isinstance(variable, dict) and variable.get("key")
    }
    field_values = {
        key: value
        for key, value in parsed["field_values"].items()
        if not bundle_keys or key in bundle_keys
    }

    extracted_keys = [key for key in parsed["extracted_keys"] if not bundle_keys or key in bundle_keys]
    inferred_keys = [key for key in parsed["inferred_keys"] if not bundle_keys or key in bundle_keys]
    missing_keys = (
        sorted(key for key in (bundle_keys - set(field_values.keys())) if not _is_dynamic_idc_key(key))
        if bundle_keys
        else []
    )

    return BundlePurchaseOrderExtractResponse(
        filename=filename,
        field_values=field_values,
        extracted_keys=extracted_keys,
        inferred_keys=inferred_keys,
        missing_keys=missing_keys,
        warnings=parsed["warnings"],
    )


@router.post("/{bundle_id}/generate")
async def generate_bundle(
    bundle_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    b = db.query(TemplateBundle).filter(TemplateBundle.id == bundle_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="번들을 찾을 수 없습니다")

    form = await request.form()
    try:
        field_values = json.loads(str(form.get("field_values", "{}")))
        selected_items = json.loads(str(form.get("selected_items", "[]")))
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=422, detail=f"잘못된 요청: {e}")

    if not selected_items:
        selected_items = [item.id for item in b.items]

    items = [item for item in b.items if item.id in selected_items]
    if not items:
        raise HTTPException(status_code=400, detail="생성할 문서가 선택되지 않았습니다")

    zip_buffer = io.BytesIO()
    records_created = []

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in items:
            tpl = item.template
            if not tpl:
                continue

            template_data = minio_client.download_file(tpl.minio_object_key)
            if template_data is None:
                continue

            try:
                if item.display_name == "IDC 출입명단" and tpl.file_type == "xlsx":
                    rendered = _render_idc_access_xlsx(template_data, field_values)
                elif tpl.file_type == "docx":
                    rendered = _render_docx(template_data, field_values)
                else:
                    rendered = _render_xlsx(template_data, field_values)
            except Exception as e:
                print(f"[Bundle] 렌더링 오류 ({item.display_name}): {e}")
                continue

            # Build output filename from pattern
            output_name = item.output_name_pattern or item.display_name
            for key, value in field_values.items():
                output_name = output_name.replace(f"{{{{{key}}}}}", str(value))
            safe_name = re.sub(r'[\\/*?:"<>|]', "_", output_name)
            filename = f"{safe_name}.{tpl.file_type}"

            zf.writestr(filename, rendered)

            # Save as record
            object_key = f"documents/records/{current_user.id}/{filename}"
            minio_client.upload_file(object_key, rendered, _content_type(tpl.file_type))

            record = DocumentRecord(
                template_id=tpl.id,
                title=f"{output_name}",
                field_values=field_values,
                original_filename=filename,
                minio_object_key=object_key,
                file_size=len(rendered),
                created_by=current_user.id,
            )
            db.add(record)
            records_created.append(record)

    db.commit()

    zip_data = zip_buffer.getvalue()
    bundle_title = field_values.get("발주명", b.name)
    safe_title = re.sub(r'[\\/*?:"<>|]', "_", bundle_title)
    zip_filename = f"{safe_title}_문서일괄.zip"

    return Response(
        content=zip_data,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(zip_filename)}",
        },
    )
