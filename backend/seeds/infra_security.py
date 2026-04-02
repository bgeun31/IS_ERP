"""
인프라보안 전용 템플릿 시드 스크립트
- sample/ 디렉토리의 문서를 기반으로 템플릿 생성
- {{변수}} 치환을 통한 자동화 지원
"""

import io
import re
from pathlib import Path

import minio_client
from models import DocumentTemplate, TemplateBundle, TemplateBundleItem, User
from template_package_utils import (
    extract_placeholders_from_office_package,
    replace_text_in_office_package,
)

SAMPLE_DIR = Path(__file__).resolve().parent.parent.parent / "sample"
BUNDLE_NAME = "인프라보안 전용 템플릿"

# 발주서에서 추출한 실제 값 → 변수 매핑 (치환 대상)
REPLACEMENTS = {
    "PO-20260319-0043": "{{발주번호}}",
    "[베트남 하노이 센터] Extreme 7520 스위치 1대 구매 건": "{{발주명}}",
    "2026/03/19": "{{발주일자}}",
    "2026/03/30": "{{입고일자}}",
    "2026/03/31": "{{검수일자}}",
    "2026-03-19": "{{발주일자}}",
    "2026-03-30": "{{입고일자}}",
    "2026-03-31": "{{검수일자}}",
    "SM022609Q-40056": "{{시리얼번호}}",
    "아이클라우드 주식회사": "{{공급사}}",
    "아이클라우드": "{{공급사_약칭}}",
    "전진호": "{{공급사담당자}}",
    "7520-48Y-8C-AC-F": "{{모델명}}",
    "2027-03-31": "{{유지보수종료일}}",
}

BUNDLE_VARIABLES = [
    {"key": "발주번호", "label": "발주번호 (PO#)", "type": "text", "section": "발주정보"},
    {"key": "발주명", "label": "발주명", "type": "text", "section": "발주정보"},
    {"key": "발주일자", "label": "발주일자", "type": "text", "section": "발주정보"},
    {"key": "납품기한", "label": "납품기한", "type": "text", "section": "발주정보"},
    {"key": "제조사", "label": "제조사", "type": "text", "section": "장비정보"},
    {"key": "모델명", "label": "모델명", "type": "text", "section": "장비정보"},
    {"key": "수량", "label": "수량 (EA)", "type": "text", "section": "장비정보"},
    {"key": "시리얼번호", "label": "시리얼번호 (S/N)", "type": "text", "section": "장비정보"},
    {"key": "OS버전", "label": "OS 버전", "type": "text", "section": "장비정보"},
    {"key": "입고일자", "label": "입고일자", "type": "text", "section": "납품검수"},
    {"key": "검수일자", "label": "검수일자", "type": "text", "section": "납품검수"},
    {"key": "납품장소", "label": "납품장소 (IDC)", "type": "text", "section": "납품검수"},
    {"key": "공급사", "label": "공급사 (정식명칭)", "type": "text", "section": "납품검수"},
    {"key": "공급사_약칭", "label": "공급사 (약칭)", "type": "text", "section": "납품검수"},
    {"key": "공급사담당자", "label": "공급사 담당자", "type": "text", "section": "납품검수"},
    {"key": "유지보수종료일", "label": "유지보수 종료일", "type": "text", "section": "유지보수"},
    {"key": "출입자1_회사명", "label": "출입자1 회사명", "type": "text", "section": "IDC출입"},
    {"key": "출입자1_이름", "label": "출입자1 이름", "type": "text", "section": "IDC출입"},
    {"key": "출입자1_직책", "label": "출입자1 직책", "type": "text", "section": "IDC출입"},
    {"key": "출입자1_연락처", "label": "출입자1 연락처", "type": "text", "section": "IDC출입"},
    {"key": "출입자2_회사명", "label": "출입자2 회사명", "type": "text", "section": "IDC출입"},
    {"key": "출입자2_이름", "label": "출입자2 이름", "type": "text", "section": "IDC출입"},
    {"key": "출입자2_직책", "label": "출입자2 직책", "type": "text", "section": "IDC출입"},
    {"key": "출입자2_연락처", "label": "출입자2 연락처", "type": "text", "section": "IDC출입"},
]

# 각 템플릿 문서 정의
TEMPLATE_DEFS = [
    {
        "sample_file": "7520-48Y-8C-AC-F_검수확인서_PO-20260319-0043_1EA.docx",
        "name": "검수확인서",
        "display_name": "검수확인서",
        "output_pattern": "{{모델명}}_검수확인서_{{발주번호}}",
        "description": "장비 입고 후 검수 결과를 기록하는 확인서",
    },
    {
        "sample_file": "7520-48Y-8C-AC-F_현장검수확인서_PO-20260319-0043_1EA.docx",
        "name": "현장검수확인서",
        "display_name": "현장검수확인서",
        "output_pattern": "{{모델명}}_현장검수확인서_{{발주번호}}",
        "description": "현장 검수 시험 절차 및 결과 리포트",
    },
    {
        "sample_file": "20260331_보안장비_무결성체크_점검.docx",
        "name": "보안장비 무결성체크 점검",
        "display_name": "보안장비 무결성체크",
        "output_pattern": "{{검수일자}}_보안장비_무결성체크_점검",
        "description": "어플라이언스 장비 무결성 점검 체크리스트",
    },
    {
        "sample_file": "NBP 입고일정공유파일.xlsx",
        "name": "NBP 입고일정공유파일",
        "display_name": "NBP 입고일정",
        "output_pattern": "NBP 입고일정공유파일",
        "description": "NBP 입고 일정 공유 파일",
    },
    {
        "sample_file": "CMDB_PO-20260319-0043.xlsm",
        "name": "CMDB",
        "display_name": "CMDB",
        "output_pattern": "CMDB_{{발주번호}}",
        "description": "네트워크 H/W 정보 입력 양식 (CMDB)",
    },
]

# XLS -> XLSX 변환이 필요한 파일 (openpyxl로 새로 생성)
XLSX_FROM_SCRATCH = [
    {
        "name": "납품확인서",
        "display_name": "납품확인서",
        "output_pattern": "납품확인서",
        "description": "납품/검수 확인서",
    },
    {
        "name": "IDC 출입명단",
        "display_name": "IDC 출입명단",
        "output_pattern": "IDC 출입명단",
        "description": "IDC 출입 및 권한 신청서",
    },
]


def _replace_in_paragraph(paragraph, replacements: dict) -> bool:
    """단락 내 텍스트를 치환. 서식은 첫 번째 run의 것을 유지."""
    full_text = "".join(run.text for run in paragraph.runs)
    changed = False
    for old, new in replacements.items():
        if old in full_text:
            full_text = full_text.replace(old, new)
            changed = True
    if changed and paragraph.runs:
        paragraph.runs[0].text = full_text
        for run in paragraph.runs[1:]:
            run.text = ""
    return changed


def _create_docx_template(sample_path: str, replacements: dict) -> bytes:
    """DOCX 샘플 파일을 열어 특정 값을 {{변수}}로 치환한 뒤 bytes 반환."""
    data = Path(sample_path).read_bytes()
    return replace_text_in_office_package(
        data,
        replacements,
        xml_prefixes=("word/",),
        escape_xml=False,
    )


def _create_xlsx_template_from_sample(sample_path: str, replacements: dict) -> bytes:
    """XLSX/XLSM 샘플 파일을 열어 셀 값을 치환한 뒤 XLSX bytes 반환."""
    import openpyxl

    wb = openpyxl.load_workbook(sample_path)
    for sheet in wb.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value and isinstance(cell.value, str):
                    val = cell.value
                    for old, new in replacements.items():
                        val = val.replace(old, new)
                    cell.value = val
    buf = io.BytesIO()
    wb.save(buf)
    return replace_text_in_office_package(
        buf.getvalue(),
        replacements,
        xml_prefixes=("xl/",),
        escape_xml=False,
    )


def _create_delivery_confirmation_xlsx() -> bytes:
    """납품확인서 XLSX 템플릿을 처음부터 생성."""
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "인수증"

    thin = Side(style="thin")
    border = Border(top=thin, left=thin, right=thin, bottom=thin)
    header_font = Font(bold=True, size=14)
    label_font = Font(bold=True, size=10)
    center = Alignment(horizontal="center", vertical="center")
    left = Alignment(horizontal="left", vertical="center")
    header_fill = PatternFill(start_color="D9E2F3", end_color="D9E2F3", fill_type="solid")

    # 제목
    ws.merge_cells("A1:G1")
    ws["A1"] = "납품 / 검수 확인서"
    ws["A1"].font = header_font
    ws["A1"].alignment = center

    ws.merge_cells("A3:B3")
    ws["A3"] = "수 신:"
    ws["A3"].font = label_font
    ws["C3"] = "네이버클라우드 귀하"

    ws.merge_cells("A4:B4")
    ws["A4"] = "일 자:"
    ws["A4"].font = label_font
    ws["C4"] = "{{입고일자}}"

    ws.merge_cells("A6:B6")
    ws["A6"] = "건 명:"
    ws["A6"].font = label_font
    ws.merge_cells("C6:G6")
    ws["C6"] = "{{발주명}}"

    # 테이블 헤더
    headers = ["번호", "품명", "제품번호(S/N)", "수량", "비고"]
    col_widths = [8, 30, 25, 10, 15]
    for i, (h, w) in enumerate(zip(headers, col_widths), 1):
        cell = ws.cell(row=8, column=i, value=h)
        cell.font = label_font
        cell.alignment = center
        cell.border = border
        cell.fill = header_fill
        ws.column_dimensions[chr(64 + i)].width = w

    # 데이터 행
    items = [
        ("1", "{{모델명}}", "{{시리얼번호}}", "{{수량}}", ""),
    ]
    for r, (no, name, sn, qty, note) in enumerate(items, 9):
        for c, val in enumerate([no, name, sn, qty, note], 1):
            cell = ws.cell(row=r, column=c, value=val)
            cell.border = border
            cell.alignment = center if c != 2 else left

    # 빈 행
    for r in range(10, 19):
        for c in range(1, 6):
            ws.cell(row=r, column=c).border = border

    # 하단 문구
    ws.merge_cells("A20:G20")
    ws["A20"] = "상기 물품을 정히 납품/인수함"
    ws["A20"].alignment = center
    ws["A20"].font = label_font

    ws.merge_cells("A22:B22")
    ws["A22"] = "납품/인수일:"
    ws["A22"].font = label_font
    ws["C22"] = "{{입고일자}}"

    ws.merge_cells("A23:B23")
    ws["A23"] = "납품확인/인수자:"
    ws["A23"].font = label_font
    ws["C23"] = "(인)"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _create_idc_access_xlsx() -> bytes:
    """IDC 출입명단 XLSX 템플릿을 처음부터 생성."""
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "IDC출입 및 권한 신청"

    thin = Side(style="thin")
    border = Border(top=thin, left=thin, right=thin, bottom=thin)
    header_font = Font(bold=True, size=14)
    label_font = Font(bold=True, size=10)
    center = Alignment(horizontal="center", vertical="center")
    header_fill = PatternFill(start_color="D9E2F3", end_color="D9E2F3", fill_type="solid")

    ws.merge_cells("A1:E1")
    ws["A1"] = "IDC 출입 및 권한 신청"
    ws["A1"].font = header_font
    ws["A1"].alignment = center

    ws.merge_cells("A3:E3")
    ws["A3"] = "※ 복수 인원의 경우 아래 행에 추가 작성, * 표시 항목은 필수"
    ws["A3"].font = Font(size=9, color="FF0000")

    headers = ["사번", "*회사명", "*이름", "*직책", "*연락처"]
    col_widths = [12, 20, 15, 12, 20]
    for i, (h, w) in enumerate(zip(headers, col_widths), 1):
        cell = ws.cell(row=5, column=i, value=h)
        cell.font = label_font
        cell.alignment = center
        cell.border = border
        cell.fill = header_fill
        ws.column_dimensions[chr(64 + i)].width = w

    # 안내 행
    guide = ["내부직원은 사번만 입력", "", "", "", ""]
    for i, val in enumerate(guide, 1):
        cell = ws.cell(row=6, column=i, value=val)
        cell.border = border
        cell.font = Font(size=9, italic=True, color="808080")

    # 출입자 1
    data1 = ["", "{{출입자1_회사명}}", "{{출입자1_이름}}", "{{출입자1_직책}}", "{{출입자1_연락처}}"]
    for i, val in enumerate(data1, 1):
        cell = ws.cell(row=7, column=i, value=val)
        cell.border = border
        cell.alignment = center

    # 출입자 2
    data2 = ["", "{{출입자2_회사명}}", "{{출입자2_이름}}", "{{출입자2_직책}}", "{{출입자2_연락처}}"]
    for i, val in enumerate(data2, 1):
        cell = ws.cell(row=8, column=i, value=val)
        cell.border = border
        cell.alignment = center

    # 추가 빈 행
    for r in range(9, 19):
        for c in range(1, 6):
            ws.cell(row=r, column=c).border = border

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _upsert_template(
    db_session,
    admin: User,
    template_name: str,
    description: str,
    file_type: str,
    template_filename: str,
    data: bytes,
):
    object_key = f"documents/templates/{admin.id}/bundles/{template_filename}"
    content_type = (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if file_type == "docx"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    if not minio_client.upload_file(object_key, data, content_type):
        print(f"[Seed] MinIO 업로드 실패: {template_filename}")
        return None

    variables = _extract_variables(data, file_type)
    tpl = (
        db_session.query(DocumentTemplate)
        .filter(DocumentTemplate.name == template_name)
        .first()
    )
    if not tpl:
        tpl = DocumentTemplate(name=template_name, created_by=admin.id)
        db_session.add(tpl)

    tpl.description = description or None
    tpl.file_type = file_type
    tpl.original_filename = template_filename
    tpl.minio_object_key = object_key
    tpl.file_size = len(data)
    tpl.variables = variables

    db_session.flush()
    return tpl


def seed_infra_security_bundle(db_session):
    """인프라보안 전용 템플릿 번들 시드."""

    admin = db_session.query(User).filter(User.is_admin.is_(True)).first()
    if not admin:
        print("[Seed] 관리자 계정을 찾을 수 없습니다. 번들 시드 스킵.")
        return

    bundle = (
        db_session.query(TemplateBundle)
        .filter(TemplateBundle.name == BUNDLE_NAME)
        .first()
    )
    is_new_bundle = bundle is None
    if not bundle:
        bundle = TemplateBundle(name=BUNDLE_NAME, created_by=admin.id)
        db_session.add(bundle)
        db_session.flush()

    bundle.description = "발주서 기반으로 인프라보안 장비 관련 문서를 일괄 생성하는 전용 템플릿입니다."
    bundle.variables = BUNDLE_VARIABLES

    print(f"[Seed] '{BUNDLE_NAME}' 번들 {'생성' if is_new_bundle else '동기화'} 중...")

    templates_created = []
    order = 0

    existing_items = {item.display_name: item for item in bundle.items}
    desired_display_names = {tdef["display_name"] for tdef in TEMPLATE_DEFS} | {
        sdef["display_name"] for sdef in XLSX_FROM_SCRATCH
    }

    for display_name, item in list(existing_items.items()):
        if display_name not in desired_display_names:
            db_session.delete(item)

    # 1) 기존 샘플 파일 기반 템플릿 생성/업데이트
    for tdef in TEMPLATE_DEFS:
        sample_path = SAMPLE_DIR / tdef["sample_file"]
        if not sample_path.exists():
            print(f"[Seed] 샘플 파일 없음: {sample_path}, 스킵")
            continue

        ext = sample_path.suffix.lower().lstrip(".")
        file_type = "docx" if ext == "docx" else "xlsx"

        if ext == "docx":
            data = _create_docx_template(str(sample_path), REPLACEMENTS)
        else:
            data = _create_xlsx_template_from_sample(str(sample_path), REPLACEMENTS)

        template_filename = f"tpl_{tdef['name']}.{file_type}"
        tpl = _upsert_template(
            db_session,
            admin,
            f"[인프라보안] {tdef['name']}",
            tdef.get("description", ""),
            file_type,
            template_filename,
            data,
        )
        if not tpl:
            continue

        templates_created.append((tpl, tdef, order))
        order += 1
        print(f"[Seed]   템플릿 반영: {tdef['name']} ({file_type})")

    # 2) XLS → XLSX 변환이 필요한 파일 (새로 생성/업데이트)
    for sdef in XLSX_FROM_SCRATCH:
        if sdef["name"] == "납품확인서":
            data = _create_delivery_confirmation_xlsx()
        elif sdef["name"] == "IDC 출입명단":
            data = _create_idc_access_xlsx()
        else:
            continue

        template_filename = f"tpl_{sdef['name']}.xlsx"
        tpl = _upsert_template(
            db_session,
            admin,
            f"[인프라보안] {sdef['name']}",
            sdef.get("description", ""),
            "xlsx",
            template_filename,
            data,
        )
        if not tpl:
            continue

        templates_created.append((tpl, sdef, order))
        order += 1
        print(f"[Seed]   템플릿 반영: {sdef['name']} (xlsx, 새로 생성)")

    for tpl, tdef, idx in templates_created:
        item = existing_items.get(tdef["display_name"])
        if not item:
            item = TemplateBundleItem(bundle_id=bundle.id, display_name=tdef["display_name"])
            db_session.add(item)
        item.template_id = tpl.id
        item.output_name_pattern = tdef.get("output_pattern", tdef["display_name"])
        item.order = idx

    db_session.commit()
    print(f"[Seed] '{BUNDLE_NAME}' 번들 반영 완료 ({len(templates_created)}개 템플릿)")


def _extract_variables(data: bytes, file_type: str) -> list:
    """파일에서 {{변수}} 패턴을 추출."""
    prefixes = ("word/",) if file_type == "docx" else ("xl/",)
    keys = extract_placeholders_from_office_package(data, prefixes)
    return [{"key": key, "label": key, "type": "text"} for key in keys]
