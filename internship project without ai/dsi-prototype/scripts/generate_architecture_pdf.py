from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Byizon_System_Architecture.pdf"

NAVY = colors.HexColor("#07101F")
PANEL = colors.HexColor("#101B2E")
PANEL_2 = colors.HexColor("#16243B")
BLUE = colors.HexColor("#4F8CFF")
CYAN = colors.HexColor("#43D7C4")
ORANGE = colors.HexColor("#FF8A3D")
WHITE = colors.HexColor("#F7FAFF")
MUTED = colors.HexColor("#A9B6C9")
LINE = colors.HexColor("#293A55")
GREEN = colors.HexColor("#3FD49B")
RED = colors.HexColor("#FF647C")


def register_font() -> str:
    candidates = [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            pdfmetrics.registerFont(TTFont("ByizonSans", str(candidate)))
            return "ByizonSans"
    return "Helvetica"


FONT = register_font()


class ArchitectureDoc(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=landscape(A4),
            leftMargin=16 * mm,
            rightMargin=16 * mm,
            topMargin=15 * mm,
            bottomMargin=15 * mm,
            title="Byizon AI Analytics Platform - System Architecture",
            author="Byizon",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="main",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(PageTemplate(id="architecture", frames=[frame], onPage=self._decorate))

    def _decorate(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, 0, landscape(A4)[0], landscape(A4)[1], fill=1, stroke=0)
        if doc.page > 1:
            canvas.setStrokeColor(LINE)
            canvas.line(16 * mm, 12 * mm, landscape(A4)[0] - 16 * mm, 12 * mm)
            canvas.setFont(FONT, 8)
            canvas.setFillColor(MUTED)
            canvas.drawString(16 * mm, 7 * mm, "BYIZON AI ANALYTICS - SYSTEM ARCHITECTURE")
            canvas.drawRightString(landscape(A4)[0] - 16 * mm, 7 * mm, f"Page {doc.page}")
        canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverBrand",
        fontName=FONT,
        fontSize=15,
        leading=18,
        textColor=CYAN,
        alignment=TA_CENTER,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        fontName=FONT,
        fontSize=32,
        leading=38,
        textColor=WHITE,
        alignment=TA_CENTER,
        spaceAfter=14,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSub",
        fontName=FONT,
        fontSize=13,
        leading=19,
        textColor=MUTED,
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        name="H1Dark",
        fontName=FONT,
        fontSize=23,
        leading=28,
        textColor=WHITE,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="H2Dark",
        fontName=FONT,
        fontSize=14,
        leading=18,
        textColor=CYAN,
        spaceBefore=7,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyDark",
        fontName=FONT,
        fontSize=10,
        leading=15,
        textColor=WHITE,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="SmallDark",
        fontName=FONT,
        fontSize=8.5,
        leading=12,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="BoxTitle",
        fontName=FONT,
        fontSize=10,
        leading=13,
        textColor=WHITE,
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        name="BoxText",
        fontName=FONT,
        fontSize=8,
        leading=11,
        textColor=MUTED,
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        name="TableHead",
        fontName=FONT,
        fontSize=9,
        leading=12,
        textColor=WHITE,
    )
)
styles.add(
    ParagraphStyle(
        name="TableCell",
        fontName=FONT,
        fontSize=8.2,
        leading=11,
        textColor=WHITE,
    )
)


def p(text: str, style: str = "BodyDark") -> Paragraph:
    return Paragraph(text, styles[style])


def bullet(text: str) -> Paragraph:
    return Paragraph(f'<font color="#43D7C4">-</font> {text}', styles["BodyDark"])


def title(text: str, subtitle: str | None = None):
    items = [p(text, "H1Dark")]
    if subtitle:
        items.extend([p(subtitle, "SmallDark"), Spacer(1, 5 * mm)])
    return items


def panel(content, widths=None, background=PANEL):
    row = [content] if widths and len(widths) == 1 else content
    table = Table([row], colWidths=widths, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.8, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    return table


def flow_row(labels: list[tuple[str, str]], width: float):
    cells = []
    cell_width = (width - (len(labels) - 1) * 9 * mm) / len(labels)
    col_widths = []
    for index, (name, detail) in enumerate(labels):
        cells.append([p(name, "BoxTitle"), Spacer(1, 2), p(detail, "BoxText")])
        col_widths.append(cell_width)
        if index < len(labels) - 1:
            cells.append(p(">", "CoverBrand"))
            col_widths.append(9 * mm)
    table = Table([cells], colWidths=col_widths, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]
    for index in range(0, len(cells), 2):
        commands.extend(
            [
                ("BACKGROUND", (index, 0), (index, 0), PANEL_2),
                ("BOX", (index, 0), (index, 0), 0.9, BLUE),
            ]
        )
    table.setStyle(TableStyle(commands))
    return table


def architecture_table(headers: list[str], rows: list[list[str]], widths):
    data = [[p(value, "TableHead") for value in headers]]
    data.extend([[p(value, "TableCell") for value in row] for row in rows])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17345D")),
                ("BACKGROUND", (0, 1), (-1, -1), PANEL),
                ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def build_story():
    story = []

    story.extend(
        [
            Spacer(1, 24 * mm),
            p("BYIZON AI", "CoverBrand"),
            p("Universal Analytics and Business Automation Platform", "CoverSub"),
            Spacer(1, 12 * mm),
            p("Complete System Architecture", "CoverTitle"),
            p(
                "Database-first data processing, deterministic calculations, evidence-grounded AI, "
                "adaptive dashboards, secure sharing, OAuth integrations and controlled actions.",
                "CoverSub",
            ),
            Spacer(1, 16 * mm),
            panel(
                [
                    p("CORE PRINCIPLE", "BoxTitle"),
                    p(
                        "Raw data is stored and processed by the backend first. "
                        "Only validated, query-relevant evidence is available to the AI layer.",
                        "BoxText",
                    ),
                ],
                widths=[150 * mm],
                background=colors.HexColor("#112A3B"),
            ),
            Spacer(1, 19 * mm),
            p("Current implementation mapped from the Byizon codebase", "CoverSub"),
            PageBreak(),
        ]
    )

    story.extend(title("1. Executive Architecture", "How the complete platform is divided into independently governed layers."))
    story.append(
        flow_row(
            [
                ("User Experience", "React UI, chat, voice, dashboards, meetings and reports"),
                ("Application API", "ASGI routes, identity, sessions, actions and orchestration"),
                ("Data Intelligence", "Pandas, statistics, KPIs, anomalies, insights and ML readiness"),
                ("Persistence", "Datasets, analysis sessions, connections, shares and activity"),
                ("External Services", "Google, Slack, CRM, Hugging Face, Stitch and voice providers"),
            ],
            265 * mm,
        )
    )
    story.append(Spacer(1, 8 * mm))
    cols = [
        [
            p("What the backend owns", "H2Dark"),
            bullet("Original uploaded bytes and SHA-256 fingerprint"),
            bullet("Workspace ownership and authoritative analysis session"),
            bullet("OAuth token storage and provider execution"),
            bullet("Metric calculation, validation and data quality"),
        ],
        [
            p("What the AI layer receives", "H2Dark"),
            bullet("Relevant KPI values and formulas"),
            bullet("Selected aggregates and chart points"),
            bullet("Quality summaries and grounded insights"),
            bullet("No complete raw dataset in the normal query context"),
        ],
    ]
    story.append(panel(cols, widths=[132.5 * mm, 132.5 * mm]))
    story.append(PageBreak())

    story.extend(title("2. Database-First Upload and Analysis", "A new upload is persisted before any parser or analytics module reads it."))
    story.append(
        flow_row(
            [
                ("Upload", "Excel, CSV, JSON, PDF, TXT, SQL or SQLite"),
                ("Persist", "Dataset ID, owner, source, bytes and SHA-256"),
                ("Reload", "Read authoritative bytes from server storage"),
                ("Analyze", "Parse, schema, quality, statistics and KPIs"),
                ("Save Session", "Structured analysis linked to dataset and owner"),
            ],
            265 * mm,
        )
    )
    story.append(Spacer(1, 8 * mm))
    story.append(
        architecture_table(
            ["Stage", "Control", "Why it protects accuracy"],
            [
                ["Source validation", "File type, size and workspace are checked", "Rejects unsupported or mis-scoped input"],
                ["Dataset store", "Original bytes are saved before parsing", "Prevents stale browser data becoming authoritative"],
                ["Fingerprint", "SHA-256 is recorded", "Identifies the exact analyzed source"],
                ["Deterministic analysis", "Pandas/NumPy execute formulas", "The language model is not used as a calculator"],
                ["Session persistence", "Analysis is saved by dataset ID and owner", "Follow-up questions use the correct source"],
            ],
            [48 * mm, 94 * mm, 123 * mm],
        )
    )
    story.append(PageBreak())

    story.extend(title("3. Universal Analytics Engine", "The analysis is generated from detected schema and statistical evidence."))
    story.append(
        flow_row(
            [
                ("Parser", "Tables, sheets and source metadata"),
                ("Schema", "Data types, roles, IDs, targets and semantics"),
                ("Quality", "Missing, duplicates, invalid values and outliers"),
                ("Statistics", "Distribution, trends, correlations and patterns"),
                ("Planning", "Useful KPIs, charts, insights and report sections"),
            ],
            265 * mm,
        )
    )
    story.append(Spacer(1, 7 * mm))
    story.append(
        architecture_table(
            ["Engine group", "Responsibilities", "Representative modules"],
            [
                ["Understanding", "File parsing, schema and semantic role detection", "file_parser, schema_detector, semantic_understanding_engine"],
                ["Validation", "Profiles, EDA, anomalies and statistics", "data_profiler, eda_engine, anomaly_engine, statistics_engine"],
                ["Planning", "Metrics, KPIs, dashboard stories and chart selection", "metric_planner, kpi_engine, dashboard_planner, chart_planner"],
                ["Explanation", "Insights, hidden patterns, root causes and recommendations", "insight_engine, pattern_discovery_engine, root_cause_engine"],
                ["Data science", "Preprocessing, feature engineering, task detection and ML readiness", "data_science_engine and supporting modules"],
            ],
            [42 * mm, 105 * mm, 118 * mm],
        )
    )
    story.append(PageBreak())

    story.extend(title("4. Chatbot Evidence Flow", "The browser sends the question and session ID. The backend selects the evidence."))
    story.append(
        flow_row(
            [
                ("Question", "Text or transcribed voice command"),
                ("Load Session", "Dataset session checked against workspace owner"),
                ("Intent Plan", "Metric, quality, trend, ranking or relationship"),
                ("Evidence JSON", "Selected KPIs, aggregates, charts and insights"),
                ("Answer", "Deterministic result plus optional LLM explanation"),
            ],
            265 * mm,
        )
    )
    story.append(Spacer(1, 8 * mm))
    story.append(
        panel(
            [
                p("CONTEXT AUDIT", "H2Dark"),
                bullet("databaseFirst: verifies that a stored dataset backs the session"),
                bullet("rawRowsIncluded: false"),
                bullet("fullDatasetIncluded: false"),
                bullet("sensitiveColumnsRemoved: true"),
                bullet("selectedEvidence: records how many evidence objects were used"),
                Spacer(1, 3 * mm),
                p(
                    "Current numerical answers are produced by deterministic Python logic. "
                    "Hugging Face remains optional for constrained narrative and design-planning tasks.",
                    "BodyDark",
                ),
            ],
            widths=[265 * mm],
        )
    )
    story.append(PageBreak())

    story.extend(title("5. OAuth, Data Connections and Actions", "Each provider account is an independent, encrypted, workspace-owned connection."))
    story.append(
        flow_row(
            [
                ("Connect", "Start provider OAuth with signed state"),
                ("Consent", "User logs in and grants selected scopes"),
                ("Token Exchange", "Backend exchanges code with provider"),
                ("Encrypted Store", "AES-GCM credential payload per connection"),
                ("Use", "Browse resources, import data or execute an action"),
            ],
            265 * mm,
        )
    )
    story.append(Spacer(1, 7 * mm))
    story.append(
        architecture_table(
            ["Provider group", "Supported workflow", "Execution rule"],
            [
                ["Google Workspace", "Sheets/Drive import, Gmail send, Calendar event and Meet link, Docs", "Use the selected Google connection and granted scope"],
                ["Slack", "Browse authorized resources, import files, send channel messages", "Use the selected Slack connection and channel membership"],
                ["CRM and work tools", "OAuth or URL-based connector framework", "Provider adapters vary; do not claim unavailable actions"],
                ["Multiple accounts", "Separate connection IDs under one owner", "Connecting one provider must not delete another"],
            ],
            [48 * mm, 112 * mm, 105 * mm],
        )
    )
    story.append(PageBreak())

    story.extend(title("6. Dashboards, Studio, Reports and Sharing", "Presentation is generated from structured analysis, not from invented values."))
    story.append(
        flow_row(
            [
                ("Dashboard Plan", "Valid KPIs, target story, trends, segments and risks"),
                ("React Renderer", "Responsive KPI cards, charts, filters and drill-down"),
                ("Stitch Studio", "Aggregates and design prompt only"),
                ("Report", "Executive summary, evidence, risks and recommendations"),
                ("Secure Share", "Encrypted payload, password, expiry and revoke"),
            ],
            265 * mm,
        )
    )
    story.append(Spacer(1, 8 * mm))
    story.append(
        panel(
            [
                p("SECURE LIVE LINK", "H2Dark"),
                bullet("Raw rows, tables and chat history are removed from the share payload."),
                bullet("The share payload is encrypted with AES-256-GCM."),
                bullet("The password is stored only as a bcrypt hash."),
                bullet("The plain password is returned once, then discarded."),
                bullet("Expiry, failed-attempt lock, rate limiting and revocation are supported."),
            ],
            widths=[265 * mm],
        )
    )
    story.append(PageBreak())

    story.extend(title("7. Storage and Security Model", "Data ownership, secrets and result lineage remain server-side."))
    story.append(
        architecture_table(
            ["Store", "Content", "Protection or ownership rule"],
            [
                ["uploaded_datasets", "Original file bytes, source metadata and fingerprint", "Dataset ID plus workspace owner"],
                ["analysis_sessions", "Structured analysis and chat history", "Session ID plus workspace owner"],
                ["connections", "Provider account metadata and credentials", "AES-GCM encrypted tokens"],
                ["owner_aliases", "Temporary-to-authenticated identity mapping", "Preserves workspace ownership after login"],
                ["automation_activity", "Executed provider actions and outcomes", "Records actual result, not a fabricated success"],
                ["dashboard_shares", "Protected dashboard payload", "AES-GCM, bcrypt, expiry, lock and revoke"],
                ["voice memory", "Voice interaction context", "Separated from the analytical source of truth"],
            ],
            [47 * mm, 105 * mm, 113 * mm],
        )
    )
    story.append(Spacer(1, 7 * mm))
    story.append(
        panel(
            [
                p("PRODUCTION HARDENING", "H2Dark"),
                p(
                    "Move metadata to PostgreSQL, bytes to encrypted object storage, keys to cloud KMS, "
                    "and analysis to queue-based workers. Add PII masking, immutable audit events, "
                    "workspace roles, malware scanning, backups and action-level approvals.",
                    "BodyDark",
                ),
            ],
            widths=[265 * mm],
        )
    )
    story.append(PageBreak())

    story.extend(title("8. Deployment Architecture", "One Docker web service serves the compiled frontend and Python API."))
    story.append(
        flow_row(
            [
                ("GitHub", "Version-controlled source"),
                ("Node Build", "React/Vite production bundle"),
                ("Python Runtime", "Python 3.12 and analytics dependencies"),
                ("Uvicorn", "ASGI API plus compiled SPA"),
                ("Persistent Disk", "Databases, datasets and encrypted share data"),
            ],
            265 * mm,
        )
    )
    story.append(Spacer(1, 8 * mm))
    story.append(
        architecture_table(
            ["Environment", "Frontend", "Backend/API", "Data"],
            [
                ["Local development", "http://127.0.0.1:5173", "http://127.0.0.1:8000", "Local backend/data directory"],
                ["Render production", "Served by the same public service", "Same-origin /api routes", "Persistent /var/data volume"],
            ],
            [45 * mm, 72 * mm, 72 * mm, 76 * mm],
        )
    )
    story.append(PageBreak())

    story.extend(title("9. Accuracy and Governance", "Accuracy is an engineering property, not an LLM promise."))
    two = [
        [
            p("Implemented controls", "H2Dark"),
            bullet("Database-first source handling"),
            bullet("Pandas/NumPy deterministic calculations"),
            bullet("Semantic exclusion of IDs and codes"),
            bullet("Formula and source-column traceability"),
            bullet("Source fingerprints and session isolation"),
            bullet("Evidence-scoped AI context"),
        ],
        [
            p("Finance-grade additions", "H2Dark"),
            bullet("Decimal arithmetic and currency rules"),
            bullet("Control-total reconciliation"),
            bullet("Known-output regression datasets"),
            bullet("Maker-checker report approval"),
            bullet("Versioned metric definitions"),
            bullet("Independent audit logs and backups"),
        ],
    ]
    story.append(panel(two, widths=[132.5 * mm, 132.5 * mm]))
    story.append(Spacer(1, 9 * mm))
    story.append(
        panel(
            [
                p("ARCHITECTURE PRINCIPLE", "H2Dark"),
                p(
                    "The language model is a planner and explanation layer, not the source of truth. "
                    "The source of truth is the workspace-owned dataset, deterministic calculations, "
                    "traceable formulas, validated provider responses and auditable sessions.",
                    "BodyDark",
                ),
            ],
            widths=[265 * mm],
            background=colors.HexColor("#102A35"),
        )
    )
    story.append(PageBreak())

    story.extend(title("10. Production Roadmap", "A staged path from demonstration to governed enterprise automation."))
    story.append(
        architecture_table(
            ["Phase", "Primary changes", "Outcome"],
            [
                ["1. Demonstration-ready", "Regression tests, source proofs, multi-OAuth tests, action confirmation", "Reliable live presentation"],
                ["2. Multi-user production", "PostgreSQL, object storage, workers, roles, PII controls", "Secure scale and isolation"],
                ["3. Enterprise analytics", "Warehouse connectors, typed query plans, semantic metric registry", "Governed cross-system analytics"],
                ["4. AI automation", "Risk policies, approvals, scheduling, monitoring and evaluations", "Controlled business execution"],
            ],
            [48 * mm, 137 * mm, 80 * mm],
        )
    )
    story.append(Spacer(1, 10 * mm))
    story.append(
        panel(
            [
                p("ONE-LINE PRESENTATION EXPLANATION", "H2Dark"),
                p(
                    "Byizon first stores and verifies the user's authorized data, calculates results with "
                    "deterministic analytics, sends only relevant evidence to the AI layer, and then produces "
                    "traceable dashboards, explanations, reports and business actions.",
                    "BodyDark",
                ),
            ],
            widths=[265 * mm],
        )
    )
    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = ArchitectureDoc(str(OUTPUT))
    document.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
