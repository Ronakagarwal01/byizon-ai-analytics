from __future__ import annotations

import io
import os
import re
import textwrap
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


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
    lines.extend(
        f"{item.get('title')}: {item.get('desc')}" if isinstance(item, dict) else str(item)
        for item in analysis.get("recommendations", [])
    )
    return "\n".join(lines)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = ["arialbd.ttf", "calibrib.ttf"] if bold else ["arial.ttf", "calibri.ttf"]
    for name in names:
        path = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.isfile(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, width: int) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    average = max(8, int(width / max(1, draw.textlength("ABCDEFGHIJKLMNOPQRSTUVWXYZ", font=font) / 26)))
    lines: list[str] = []
    for candidate in textwrap.wrap(text, width=average, break_long_words=True, break_on_hyphens=True):
        while draw.textlength(candidate, font=font) > width and len(candidate) > 1:
            split = max(1, len(candidate) - 1)
            while split > 1 and draw.textlength(candidate[:split], font=font) > width:
                split -= 1
            lines.append(candidate[:split])
            candidate = candidate[split:]
        if candidate:
            lines.append(candidate)
    return lines


def _new_page(page_number: int) -> tuple[Image.Image, ImageDraw.ImageDraw, int]:
    image = Image.new("RGB", (1240, 1754), "#f7f8fc")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((54, 48, 1186, 1706), radius=20, fill="#ffffff", outline="#dce3f0", width=2)
    draw.rectangle((54, 48, 1186, 60), fill="#b35d32")
    draw.text((86, 82), "BYIZON  /  AI ANALYTICS REPORT", font=_font(18, True), fill="#8a4829")
    draw.text((1085, 82), f"PAGE {page_number}", font=_font(16, True), fill="#667085")
    return image, draw, 132


def _render_report_images(analysis: dict[str, Any]) -> list[Image.Image]:
    pages: list[Image.Image] = []
    image, draw, y = _new_page(1)
    content_left, content_right, bottom = 86, 1154, 1640

    title = str(analysis.get("fileName") or "Dataset Analysis Report")
    for line in _wrap(draw, title, _font(42, True), content_right - content_left):
        draw.text((content_left, y), line, font=_font(42, True), fill="#101828")
        y += 52
    y += 8
    meta = f"{int(analysis.get('rowCount') or 0):,} rows   |   {len(analysis.get('columns', []))} columns   |   Password protected"
    draw.text((content_left, y), meta, font=_font(18), fill="#667085")
    y += 54

    def next_page() -> None:
        nonlocal image, draw, y
        pages.append(image)
        image, draw, y = _new_page(len(pages) + 1)

    for raw_line in _report_text(analysis).splitlines():
        clean = re.sub(r"^#+\s*", "", raw_line.strip())
        if not clean:
            y += 15
            continue
        is_heading = (len(clean) < 80 and clean.upper() == clean and any(char.isalpha() for char in clean)) or clean.endswith(":")
        font = _font(24, True) if is_heading else _font(19)
        line_height = 34 if is_heading else 29
        wrapped = _wrap(draw, clean, font, content_right - content_left - (28 if not is_heading else 0))
        required = len(wrapped) * line_height + (28 if is_heading else 18)
        if y + required > bottom:
            next_page()
        if is_heading:
            draw.rounded_rectangle((content_left, y - 8, content_right, y + required - 5), radius=12, fill="#f3f6fb")
            draw.rectangle((content_left, y - 8, content_left + 7, y + required - 5), fill="#b35d32")
            x = content_left + 24
            color = "#8a4829"
        else:
            draw.ellipse((content_left + 3, y + 9, content_left + 11, y + 17), fill="#b35d32")
            x = content_left + 28
            color = "#344054"
        for line in wrapped:
            draw.text((x, y), line, font=font, fill=color)
            y += line_height
        y += 20 if is_heading else 12

    pages.append(image)
    return pages


def create_encrypted_pdf(analysis: dict[str, Any], password: str) -> tuple[str, bytes]:
    if len(password) < 8:
        raise ValueError("PDF password must contain at least 8 characters.")

    # Each PDF page contains a single raster image, so sensitive report text is
    # never stored as a selectable or extractable PDF text layer.
    raw_pdf = io.BytesIO()
    pdf = canvas.Canvas(raw_pdf, pagesize=A4, pageCompression=1)
    page_width, page_height = A4
    for page_image in _render_report_images(analysis):
        pdf.drawImage(ImageReader(page_image), 0, 0, width=page_width, height=page_height)
        pdf.showPage()
    pdf.save()

    reader = PdfReader(io.BytesIO(raw_pdf.getvalue()))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.add_metadata({"/Title": "Protected Byizon visual report", "/Author": "Byizon Analytics"})
    writer.encrypt(user_password=password, owner_password=os.urandom(32).hex(), algorithm="AES-256-R5")
    encrypted = io.BytesIO()
    writer.write(encrypted)
    base_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(analysis.get("fileName") or "analysis"))
    return f"{base_name}_protected_visual_report.pdf", encrypted.getvalue()
