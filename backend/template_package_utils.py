import io
import re
import zipfile
from html import unescape
from typing import Iterable
from xml.sax.saxutils import escape


PLACEHOLDER_RE = re.compile(r"\{\{([^{}]+)\}\}")


def _sorted_replacements(replacements: dict[str, object], escape_xml: bool) -> list[tuple[str, str]]:
    ordered: list[tuple[str, str]] = []
    for old, new in sorted(replacements.items(), key=lambda item: len(str(item[0])), reverse=True):
        if old is None:
            continue
        old_text = str(old)
        new_text = "" if new is None else str(new)
        ordered.append((old_text, escape(new_text) if escape_xml else new_text))
    return ordered


def replace_text_in_office_package(
    data: bytes,
    replacements: dict[str, object],
    xml_prefixes: Iterable[str],
    *,
    escape_xml: bool,
) -> bytes:
    prefixes = tuple(xml_prefixes)
    ordered = _sorted_replacements(replacements, escape_xml=escape_xml)
    source = io.BytesIO(data)
    output = io.BytesIO()

    with zipfile.ZipFile(source) as zin, zipfile.ZipFile(output, "w") as zout:
        for info in zin.infolist():
            blob = zin.read(info.filename)
            if info.filename.endswith(".xml") and info.filename.startswith(prefixes):
                try:
                    text = blob.decode("utf-8")
                except UnicodeDecodeError:
                    zout.writestr(info, blob)
                    continue

                for old, new in ordered:
                    text = text.replace(old, new)
                blob = text.encode("utf-8")

            zout.writestr(info, blob)

    return output.getvalue()


def extract_placeholders_from_office_package(
    data: bytes,
    xml_prefixes: Iterable[str],
) -> list[str]:
    prefixes = tuple(xml_prefixes)
    keys: set[str] = set()

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in zf.namelist():
            if not name.endswith(".xml") or not name.startswith(prefixes):
                continue
            try:
                text = unescape(zf.read(name).decode("utf-8"))
            except UnicodeDecodeError:
                continue

            for match in PLACEHOLDER_RE.finditer(text):
                key = match.group(1).strip()
                if key:
                    keys.add(key)

    return sorted(keys)
