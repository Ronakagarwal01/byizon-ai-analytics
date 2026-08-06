from __future__ import annotations

import html
import io
import os
import re
from typing import Any

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


def _register_font() -> str:
    candidates = [
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibri.ttf",
    ]
    for path in candidates:
        if os.path.isfile(path):
            pdfmetrics.registerFont(TTFont("ByizonFont", path))
            return "ByizonFont"
    return "Helvetica"


def _report_text(analysis: dict[str, Any]) -> str:
    existing = str(analysis.get("reportText") or "").strip()
    if existing:
        return existing
    lines = [
        "EXECUTIVE SUMMARY",
        str(analysis.get("summary") or "No executive summary was generated."),
        "",
        "KEY METRICS",
    ]
    lines.extend(f"{item.get('label')}: {item.get('value')}" for item in analysis.get("kpis", []))
    lines.extend(["", "INSIGHTS"])
    lines.extend(str(item) for item in analysis.get("insights", []))
    lines.extend(["", "RECOMMENDATIONS"])
    lines.extend(f"{item.get('title')}: {item.get('desc')}" if isinstance(item, dict) else str(item) for item in analysis.get("recommendations", []))
    return "\n".join(lines)


def create_encrypted_pdf(analysis: dict[str, Any], password: str) -> tuple[str, bytes]:
    if len(password) < 8:
        raise ValueError("PDF password must contain at least 8 characters.")
    font = _register_font()
    raw_pdf = io.BytesIO()
    document = SimpleDocTemplate(
        raw_pdf,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Protected analysis - {analysis.get('fileName', 'dataset')}",
        author="Byizon Analytics",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ByizonTitle", parent=styles["Title"], fontName=font, fontSize=22, leading=27, textColor=colors.HexColor("#0f172a"), alignment=TA_LEFT, spaceAfter=8)
    meta_style = ParagraphStyle("ByizonMeta", parent=styles["Normal"], fontName=font, fontSize=9, leading=13, textColor=colors.HexColor("#64748b"), spaceAfter=14)
    heading_style = ParagraphStyle("ByizonHeading", parent=styles["Heading2"], fontName=font, fontSize=13, leading=17, textColor=colors.HexColor("#1d4ed8"), spaceBefore=9, spaceAfter=5)
    body_style = ParagraphStyle("ByizonBody", parent=styles["BodyText"], fontName=font, fontSize=9.5, leading=14, textColor=colors.HexColor("#334155"), spaceAfter=5)

    story = [
        Paragraph("BYIZON ANALYTICS", meta_style),
        Paragraph(html.escape(str(analysis.get("fileName") or "Dataset Analysis Report")), title_style),
        Paragraph(
            html.escape(f"{analysis.get('rowCount', 0):,} rows | {len(analysis.get('columns', []))} columns | Password protected"),
            meta_style,
        ),
        Spacer(1, 4 * mm),
    ]
    for raw_line in _report_text(analysis).splitlines():
        line = raw_line.strip()
        if not line:
            story.append(Spacer(1, 2.5 * mm))
            continue
        if line == "\f":
            story.append(PageBreak())
            continue
        clean = re.sub(r"^#+\s*", "", line)
        is_heading = (len(clean) < 80 and clean.upper() == clean and any(char.isalpha() for char in clean)) or clean.endswith(":")
        story.append(Paragraph(html.escape(clean), heading_style if is_heading else body_style))
    document.build(story)

    reader = PdfReader(io.BytesIO(raw_pdf.getvalue()))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.add_metadata({"/Title": f"Protected analysis - {analysis.get('fileName', 'dataset')}", "/Author": "Byizon Analytics"})
    writer.encrypt(user_password=password, owner_password=secrets_owner_password(), algorithm="AES-256-R5")
    encrypted = io.BytesIO()
    writer.write(encrypted)
    base_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(analysis.get("fileName") or "analysis"))
    return f"{base_name}_protected_report.pdf", encrypted.getvalue()


def secrets_owner_password() -> str:
    return os.urandom(32).hex()
