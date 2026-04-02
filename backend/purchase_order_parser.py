import calendar
import re
from datetime import date


def _normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def _normalize_date(value: str) -> str:
    slash_match = re.search(r"(20\d{2})/(\d{2})/(\d{2})", value)
    if slash_match:
        return f"{slash_match.group(1)}/{slash_match.group(2)}/{slash_match.group(3)}"

    korean_match = re.search(r"(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일", value)
    if korean_match:
        return (
            f"{korean_match.group(1)}/"
            f"{int(korean_match.group(2)):02d}/"
            f"{int(korean_match.group(3)):02d}"
        )

    return _normalize_space(value)


def _first_match(text: str, pattern: str, *, flags: int = 0) -> str | None:
    match = re.search(pattern, text, flags)
    if not match:
        return None
    value = match.group(1) if match.lastindex else match.group(0)
    return _normalize_space(value)


def _compact_company_name(name: str) -> str:
    short = re.sub(r"\s*주식회사\s*", "", name).strip()
    return short or name.strip()


def _extract_item_names(lines: list[str]) -> list[str]:
    item_names: list[str] = []
    for idx, line in enumerate(lines[:-1]):
        if line != "품목명":
            continue
        candidate = lines[idx + 1].strip()
        if not candidate or candidate in {"납품기한", "납품희망일"}:
            continue
        item_names.append(candidate)
    return item_names


def _extract_purchase_order_name(lines: list[str]) -> str | None:
    for idx, line in enumerate(lines):
        if re.fullmatch(r"PO-\d{8}-\d{4}", line):
            for candidate in reversed(lines[max(0, idx - 3):idx]):
                if candidate and not re.fullmatch(r"\d{4}/\d{2}/\d{2}", candidate):
                    return candidate
    for line in lines:
        if line.endswith("구매 건"):
            return line
    return None


def _extract_maintenance_years(item_names: list[str]) -> int | None:
    for item_name in item_names:
        if "유지보수" not in item_name:
            continue
        match = re.search(r"(?:유지보수\s*(\d+)년|(\d+)년\s*유지보수)", item_name)
        if not match:
            continue
        value = match.group(1) or match.group(2)
        if value:
            return int(value)
    return None


def _calc_maintenance_end_date(base_years: int, additional_years: int) -> str:
    today = date.today()
    target_year = today.year + base_years + additional_years
    last_day = calendar.monthrange(today.year, today.month)[1]
    return f"{target_year}-{today.month:02d}-{last_day:02d}"


def _extract_first_item_values(lines: list[str]) -> dict[str, str]:
    headers = ["수량", "단위", "공급금액", "제조사", "모델명", "납품장소", "검수조건", "하자보증기간"]

    for idx in range(len(lines) - len(headers)):
        if lines[idx:idx + len(headers)] != headers:
            continue

        values: list[str] = []
        cursor = idx + len(headers)
        while cursor < len(lines) and lines[cursor] != "단가":
            values.append(lines[cursor])
            cursor += 1

        if len(values) < 9:
            continue

        delivery_place = values[8]
        if len(values) > 9 and values[9].startswith("("):
            delivery_place = f"{delivery_place} {values[9]}"

        return {
            "수량": values[1],
            "제조사": values[4],
            "납품장소": delivery_place,
        }

    return {}


def parse_purchase_order_pdf(data: bytes) -> dict:
    try:
        import fitz
    except ImportError as e:
        raise RuntimeError("PyMuPDF가 설치되어 있지 않습니다") from e

    with fitz.open(stream=data, filetype="pdf") as doc:
        pages = [page.get_text("text") for page in doc]

    text = "\n".join(page for page in pages if page)
    if not text.strip():
        raise ValueError("PDF에서 텍스트를 추출하지 못했습니다")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    first_item_values = _extract_first_item_values(lines)
    item_names = _extract_item_names(lines)
    maintenance_years = _extract_maintenance_years(item_names)
    purchase_order_name = _extract_purchase_order_name(lines)

    field_values: dict[str, str] = {}
    extracted_keys: list[str] = []
    inferred_keys: list[str] = []
    warnings: list[str] = []

    def assign(key: str, value: str | None, *, inferred: bool = False):
        if not value:
            return
        field_values[key] = value
        if inferred:
            inferred_keys.append(key)
        else:
            extracted_keys.append(key)

    assign("발주번호", _first_match(text, r"(PO-\d{8}-\d{4})"))
    assign("발주명", purchase_order_name)

    order_date = _first_match(text, r"발주일자\s*(20\d{2}/\d{2}/\d{2})")
    if not order_date:
        order_date = _first_match(text, r"((?:20\d{2})년\s*\d{1,2}월\s*\d{1,2}일)")
    assign("발주일자", _normalize_date(order_date) if order_date else None)

    assign("납품기한", _first_match(text, r"납품기한\s*(20\d{2}/\d{2}/\d{2})"))
    assign("모델명", _first_match(text, r"품목명\s*([^\n]+)"))
    assign("수량", first_item_values.get("수량"))
    assign("제조사", first_item_values.get("제조사"))
    assign("납품장소", first_item_values.get("납품장소"))

    supplier = _first_match(text, r"공급하는 자 \(제공자\)\s*상호\s*([^\n]+)")
    assign("공급사", supplier)
    if supplier:
        assign("공급사_약칭", _compact_company_name(supplier), inferred=True)

    if field_values.get("납품기한") and not field_values.get("입고일자"):
        assign("입고일자", field_values["납품기한"], inferred=True)
        warnings.append("입고일자는 발주서의 납품기한 값을 기준으로 먼저 채웠습니다.")

    total_maintenance_years = maintenance_years or 1
    additional_maintenance_years = max(0, total_maintenance_years - 1)
    assign(
        "유지보수종료일",
        _calc_maintenance_end_date(base_years=1, additional_years=additional_maintenance_years),
        inferred=True,
    )
    if maintenance_years:
        warnings.append(
            f"유지보수종료일은 발주서 품목명의 유지보수 {maintenance_years}년을 총 보장 연수로 보고 이번 달 말일 기준으로 계산했습니다."
        )
    else:
        warnings.append("유지보수종료일은 기본 1년을 이번 달 말일 기준으로 계산했습니다.")

    return {
        "field_values": field_values,
        "extracted_keys": extracted_keys,
        "inferred_keys": inferred_keys,
        "warnings": warnings,
        "text_preview": _normalize_space(text)[:500],
    }
