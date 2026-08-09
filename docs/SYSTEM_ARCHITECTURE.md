# Byizon AI Analytics Platform

## Complete System Architecture

**Document status:** Current implementation mapped from the codebase  
**Architecture style:** Database-first, deterministic analytics, evidence-grounded AI  
**Primary stack:** React, Vite, Python, Pandas, scikit-learn, SQLite, OAuth 2.0

---

## 1. Architecture Objective

Byizon converts uploaded files and connected business-system data into verified analytics, dashboards, reports, and controlled business actions.

The central architecture rule is:

> Raw data is stored and processed by the backend first. The language model receives only query-relevant, validated, structured evidence. It does not receive the complete uploaded dataset.

This design separates:

- **Calculation:** deterministic Python/Pandas code
- **Storage:** server-side database owned by a workspace
- **Reasoning context:** small, query-specific JSON
- **Explanation:** deterministic response today, with an optional LLM narrative layer
- **Actions:** permission-controlled connector operations
- **Presentation:** dashboards, charts, reports, and protected links

---

## 2. System Context

```mermaid
flowchart LR
    User["User / Business Analyst"]
    Web["Byizon React Web App"]
    API["Python ASGI Backend"]
    Sources["Files and Business Sources"]
    Data["Server-side Data Stores"]
    Analytics["Deterministic Analytics Engine"]
    AI["Evidence-grounded AI Layer"]
    Output["Dashboards, Reports, Chat and Actions"]

    User --> Web
    Web --> API
    Sources -->|"Upload or OAuth"| API
    API -->|"Store first"| Data
    Data --> Analytics
    Analytics -->|"Validated metrics and aggregates"| AI
    AI --> Output
    Output --> Web
```

### Supported input paths

- Excel, including multiple sheets
- CSV
- JSON
- PDF text and tables
- TXT
- SQL text/export files
- SQLite/database exports
- Google Workspace resources
- Slack files and channel resources
- Generic URL-based and OAuth connector resources

---

## 3. Container Architecture

```mermaid
flowchart TB
    subgraph Client["Presentation Layer"]
        React["React 19 + Vite SPA"]
        Pages["Dashboard, AI Chat, Meetings, Calendar, Integrations, Reports, Studio"]
        Charts["Recharts Dashboard Renderer"]
        VoiceUI["Global Voice Assistant"]
        ClientState["Workspace-scoped UI State"]
    end

    subgraph Backend["Application and Orchestration Layer"]
        ASGI["Custom ASGI API - backend/app.py"]
        Identity["Workspace Session and Owner Isolation"]
        Upload["Upload Orchestrator"]
        ChatAPI["Chat and Query Orchestrator"]
        OAuth["OAuth and Connector Orchestrator"]
        Actions["Business Action Executor"]
        Sharing["Protected Share and PDF Services"]
        Studio["Dashboard Studio Orchestrator"]
    end

    subgraph Intelligence["Data Intelligence Layer"]
        Parser["Universal Parser Engine"]
        Schema["Schema and Semantic Understanding"]
        Quality["Profiling, Quality and Anomaly Engines"]
        Stats["Statistics and Pattern Discovery"]
        Metrics["Metric and KPI Planner"]
        DashPlan["Adaptive Dashboard and Chart Planner"]
        Insights["Insights, Root Cause and Recommendations"]
        ML["EDA, Preprocessing and ML Readiness"]
        QueryPlan["Intent and Query Context Planner"]
    end

    subgraph Storage["Persistence Layer"]
        MainDB[("connections.sqlite3")]
        ShareDB[("protected_shares.sqlite3")]
        VoiceDB[("Voice Memory")]
        Disk["Persistent Data Volume"]
    end

    subgraph External["External Services"]
        Google["Google Workspace APIs"]
        Slack["Slack API"]
        CRM["CRM / ERP / Work Tools"]
        HF["Hugging Face - Optional Narrative/Planning"]
        Stitch["Google Stitch - Dashboard Design"]
        Eleven["ElevenLabs - Optional Voice"]
    end

    React --> Pages
    Pages --> ASGI
    VoiceUI --> ASGI
    ASGI --> Identity
    ASGI --> Upload
    ASGI --> ChatAPI
    ASGI --> OAuth
    ASGI --> Actions
    ASGI --> Sharing
    ASGI --> Studio

    Upload --> MainDB
    MainDB --> Parser
    Parser --> Schema
    Schema --> Quality
    Quality --> Stats
    Stats --> Metrics
    Metrics --> DashPlan
    DashPlan --> Insights
    Insights --> ML
    ChatAPI --> QueryPlan
    QueryPlan --> MainDB

    OAuth --> Google
    OAuth --> Slack
    OAuth --> CRM
    Actions --> Google
    Actions --> Slack
    Studio --> Stitch
    Studio --> HF
    VoiceUI --> Eleven

    Identity --> MainDB
    Sharing --> ShareDB
    VoiceUI --> VoiceDB
    MainDB --> Disk
    ShareDB --> Disk
```

---

## 4. Database-First Upload Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as React Upload UI
    participant API as Backend API
    participant DB as Dataset Store
    participant Engine as Analytics Engine
    participant Session as Analysis Session Store

    User->>UI: Upload file
    UI->>API: POST /api/analyze
    API->>API: Validate workspace, file type and size
    API->>DB: Save original bytes, owner, source and metadata
    DB->>DB: Generate dataset ID and SHA-256 fingerprint
    API->>DB: Reload stored bytes by dataset ID + owner
    DB-->>API: Authoritative stored file
    API->>Engine: Parse and calculate analysis
    Engine->>Engine: Schema, quality, statistics, KPIs, charts, insights
    Engine-->>API: Structured analysis JSON
    API->>Session: Save analysis with dataset ID and workspace owner
    Session-->>API: Session ID
    API-->>UI: Dashboard payload + session ID + source audit
```

### Why this matters

- A new upload receives a new dataset ID and fingerprint.
- Analysis starts from server-stored bytes, not stale browser state.
- Every session is tied to a workspace owner.
- A later chatbot request references the saved session instead of resending the file.
- The source fingerprint can be shown as proof of which file was analyzed.

---

## 5. Analytics Processing Pipeline

```mermaid
flowchart LR
    Stored["Stored Source Bytes"]
    Parse["Parse tables/sheets"]
    Detect["Detect schema and semantics"]
    Profile["Profile quality and completeness"]
    Validate["Validate data types and values"]
    Stats["Calculate statistics"]
    KPI["Plan and calculate valid KPIs"]
    Patterns["Detect trends, outliers and relationships"]
    Plan["Plan dashboard and charts"]
    Report["Generate insights and report"]
    Persist["Persist analysis session"]

    Stored --> Parse --> Detect --> Profile --> Validate --> Stats --> KPI --> Patterns --> Plan --> Report --> Persist
```

### Engine modules

| Responsibility | Main module |
|---|---|
| Universal file parsing | `backend/analytics/file_parser.py` |
| Structural schema detection | `backend/analytics/schema_detector.py` |
| Semantic role inference | `backend/analytics/semantic_understanding_engine.py` |
| Domain confidence | `backend/analytics/domain_detector.py` |
| Completeness and profiling | `backend/analytics/data_profiler.py` |
| EDA | `backend/analytics/eda_engine.py` |
| Statistics | `backend/analytics/statistics_engine.py` |
| Anomaly grouping | `backend/analytics/anomaly_engine.py` |
| KPI selection | `backend/analytics/metric_planner.py` |
| KPI calculations | `backend/analytics/kpi_engine.py` |
| Dashboard planning | `backend/analytics/dashboard_planner.py` |
| Chart selection and data | `backend/analytics/chart_planner.py` |
| Pattern discovery | `backend/analytics/pattern_discovery_engine.py` |
| Business insights | `backend/analytics/insight_engine.py` |
| Root-cause hypotheses | `backend/analytics/root_cause_engine.py` |
| Recommendations | `backend/analytics/recommendation_engine.py` |
| Report structure | `backend/analytics/report_generator.py` |
| ML readiness/workflow | `backend/analytics/data_science_engine.py` |

---

## 6. Chatbot Query Flow

```mermaid
sequenceDiagram
    actor User
    participant Chat as Chat Interface
    participant API as Chat API
    participant Session as Server Session Store
    participant Router as Intent and Query Planner
    participant Evidence as Processed Evidence Selector
    participant Answer as Deterministic Answer Engine
    participant LLM as Optional LLM Explanation Layer

    User->>Chat: Ask a question
    Chat->>API: Question + session ID
    API->>Session: Load analysis by session ID and workspace owner
    Session-->>API: Stored structured analysis
    API->>Router: Detect metric, quality, trend, ranking or relationship intent
    Router->>Evidence: Select relevant KPIs, aggregates, chart points and insights
    Evidence->>Evidence: Exclude raw rows and sensitive columns
    Evidence-->>API: Query-scoped JSON + context audit
    API->>Answer: Calculate grounded response
    Answer-->>API: Answer with evidence
    opt Optional controlled narrative
        API->>LLM: Relevant evidence JSON only
        LLM-->>API: Human-friendly explanation
    end
    API-->>Chat: Answer + formula/source context
```

### Payload sent from the browser

The normal chatbot request contains:

- `sessionId`
- `question`
- optional interaction metadata

It does not need to resend the complete dataset.

### Query-scoped evidence

The backend context planner selects only:

- relevant KPI values
- formulas
- source columns
- a limited number of chart points
- relevant quality summaries
- selected insights and recommendations

The context audit records:

- database-first status
- whether raw rows were included
- whether the full dataset was included
- whether sensitive columns were removed
- context size
- number of selected evidence objects

### Current implementation truth

The standard analytics chatbot currently uses the deterministic Python answer engine for numerical accuracy. Hugging Face is optional for language-oriented planning and dashboard customization. This is safer for finance calculations because the LLM is not the calculator.

---

## 7. SQL Generator Position

The current application analyzes uploaded files with Pandas after persisting them in SQLite. It does **not** currently depend on model-generated SQL for ordinary file questions.

For a future warehouse architecture, the safe flow should be:

```mermaid
flowchart LR
    Q["User Question"]
    Intent["Intent Detection"]
    Plan["Typed Query Plan"]
    Compiler["Validated Read-only SQL Compiler"]
    Guard["Schema, scope and cost guard"]
    Warehouse[("PostgreSQL / Warehouse")]
    Process["Aggregate and Validate"]
    JSON["Safe Evidence JSON"]
    Explain["LLM Explanation"]

    Q --> Intent --> Plan --> Compiler --> Guard --> Warehouse --> Process --> JSON --> Explain
```

The model should create a typed query plan. A trusted compiler should produce parameterized, read-only SQL. Arbitrary LLM SQL should never run directly against production data.

---

## 8. Connector and OAuth Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as Integrations UI
    participant API as Connector API
    participant Provider as Google / Slack / CRM
    participant Vault as Encrypted Connection Store

    User->>UI: Connect provider
    UI->>API: Start OAuth
    API->>Provider: Redirect with scopes, state and callback URL
    Provider->>User: Login and permission screen
    User->>Provider: Allow selected permissions
    Provider->>API: Authorization code
    API->>Provider: Exchange code for tokens
    Provider-->>API: Access/refresh token and account identity
    API->>Vault: AES-GCM encrypted token storage by owner + provider
    API-->>UI: Connected account
```

### Multi-connector behavior

Connections are stored as independent records using:

- connection ID
- connector ID
- workspace owner ID
- account metadata
- encrypted OAuth credential payload

Connecting Google must not overwrite Slack, and connecting another account must not clear earlier provider records. Resource browsing and actions always use the selected connection ID.

### Connector resource analysis

```mermaid
flowchart LR
    Provider["Connected Provider"]
    Browse["List authorized resources"]
    Select["User/AI selects resource"]
    Download["Backend downloads resource"]
    Store["Dataset Store"]
    Analyze["Same deterministic analytics pipeline"]
    Dashboard["Dashboard and Chat Session"]

    Provider --> Browse --> Select --> Download --> Store --> Analyze --> Dashboard
```

---

## 9. Text and Voice Action Flow

```mermaid
flowchart TB
    Input["Text or Voice Command"]
    STT["Speech-to-Text, when voice is used"]
    Intent["Intent and Action Detection"]
    Permission["Provider and Scope Verification"]
    Confirm["User Confirmation for Important Action"]
    Execute["Connector Action Executor"]
    Provider["Gmail, Calendar, Meet, Slack or Sheet"]
    Activity["Automation Activity Log"]
    Result["Visible Result, Link or Error"]
    TTS["Optional Text-to-Speech"]

    Input --> STT --> Intent --> Permission --> Confirm --> Execute --> Provider
    Provider --> Activity --> Result --> TTS
```

Examples:

- create a Google Calendar event with a Google Meet link
- return the generated meeting link in chat
- send the meeting link to a Slack channel
- send an email through the authorized Gmail account
- browse and analyze a Google Sheet

The provider executes the action. The LLM may understand the request, but it never fabricates a successful provider response.

---

## 10. Adaptive Dashboard Architecture

```mermaid
flowchart LR
    Schema["Semantic Schema"]
    Measures["Valid Measures"]
    Dimensions["Useful Dimensions"]
    Time["Time Columns"]
    Target["Detected Target"]
    Quality["Quality Findings"]
    Planner["Dashboard Planner"]
    Cards["3-5 Overview KPIs"]
    Stories["Target, Trend, Segment, Distribution and Risk Sections"]
    Charts["Relevant Charts Only"]
    UI["Responsive React Dashboard"]

    Schema --> Planner
    Measures --> Planner
    Dimensions --> Planner
    Time --> Planner
    Target --> Planner
    Quality --> Planner
    Planner --> Cards
    Planner --> Stories
    Planner --> Charts
    Cards --> UI
    Stories --> UI
    Charts --> UI
```

The planner skips:

- identifiers
- postal and phone codes
- encoded categories
- high-cardinality labels
- columns with insufficient usable values
- meaningless sums or averages

Each selected KPI or chart can carry:

- reason for selection
- formula
- source columns
- confidence
- analytical usefulness

---

## 11. Dashboard Studio and Stitch

Dashboard Studio receives only:

- calculated KPIs
- KPI formulas
- selected aggregated chart data
- grounded insights
- layout instructions

Raw spreadsheet rows are intentionally excluded from the Stitch request.

```mermaid
flowchart LR
    Analysis["Saved Analysis Session"]
    Safe["Safe KPI and Aggregate Builder"]
    Prompt["User Design Prompt"]
    Stitch["Google Stitch"]
    Plan["Validated Dashboard Plan"]
    Preview["Interactive Preview"]
    History["Dashboard History"]
    Share["Secure Live Link"]

    Analysis --> Safe
    Safe --> Stitch
    Prompt --> Stitch
    Stitch --> Plan --> Preview
    Preview --> History
    Preview --> Share
```

When Stitch is unavailable, a deterministic dashboard-plan fallback keeps data values grounded.

---

## 12. Reports and Secure Sharing

### Protected live dashboard

1. The backend removes raw rows, tables, chat history, and other blocked fields.
2. A random password is generated.
3. The password is hashed with bcrypt.
4. The dashboard payload is encrypted with AES-256-GCM.
5. The plain password is returned once and is never stored.
6. Access uses password verification, expiry, attempt limits, and a temporary access token.
7. A share can be revoked.

### Protected PDF

The report exporter creates a PDF from verified analysis. When password protection is selected, the exported file is encrypted before delivery.

---

## 13. Persistence Model

| Store | Purpose | Important ownership/security rule |
|---|---|---|
| `uploaded_datasets` | Original file bytes and source metadata | Dataset belongs to one workspace owner |
| `analysis_sessions` | Calculated analytics and chat history | Loaded by session ID plus owner |
| `connections` | Provider connection metadata and encrypted tokens | Each provider/account is an independent record |
| `owner_aliases` | Maps temporary and authenticated workspace identities | Preserves ownership after login |
| `automation_activity` | Executed action history | Records actual provider outcomes |
| `dashboard_shares` | Encrypted protected-report payloads | Password, expiry, lock and revoke controls |
| Voice memory store | Voice interaction context | Kept separate from analytical source data |

### Current database

The local and Render implementation uses SQLite with a persistent server data directory.

### Production scale target

| Current | Production evolution |
|---|---|
| SQLite metadata and file BLOBs | PostgreSQL metadata plus encrypted object storage |
| In-process analysis | Queue-based worker jobs |
| One application instance | Horizontally scalable API and workers |
| Local key fallback | Cloud KMS and managed secrets |
| Local activity log | Immutable audit event stream |
| Session JSON | Versioned analytical result store |

---

## 14. Security Architecture

### Implemented controls

- workspace ownership validation
- server-side sessions
- OAuth state validation
- encrypted provider credentials using AES-GCM
- SHA-256 dataset fingerprints
- password-hashed protected links
- AES-GCM protected share payloads
- share expiry, failed-attempt lock, rate limit and revocation
- processed-evidence-only AI context policy
- raw rows removed from protected shares
- secrets read from server environment variables

### Recommended production controls

- PostgreSQL row-level security
- object-storage encryption with customer/workspace keys
- cloud KMS key rotation
- centralized secrets manager
- malware scanning before parsing uploads
- configurable PII detection and masking policy
- append-only audit logs
- automated backup and restore testing
- per-workspace quotas and API rate limits
- OAuth incremental consent
- explicit confirmation for send, write, delete, and share actions

---

## 15. Accuracy Architecture

Byizon cannot promise mathematical correctness by asking an LLM to calculate. Accuracy is created by system controls:

1. **Single authoritative source:** analysis reloads the server-stored file.
2. **Deterministic calculations:** Pandas and NumPy calculate metrics.
3. **Semantic guards:** IDs, codes, names, and encoded categories are not treated as measures.
4. **Transparent formulas:** KPIs retain formulas and source columns.
5. **Data validation:** missing values, duplicates, types, and outliers are profiled.
6. **Source fingerprinting:** every dataset gets a SHA-256 digest.
7. **Session isolation:** questions are answered from the selected saved session.
8. **Evidence-scoped AI:** no full raw dataset is placed in the model prompt.
9. **Graceful refusal:** unsupported metrics should report insufficient evidence.
10. **Provider verification:** actions are shown as successful only after a provider confirms them.

For finance-grade use, important totals should additionally support:

- decimal arithmetic instead of binary floating point where required
- configurable currency and rounding rules
- reconciliation against control totals
- maker-checker approval for exported or shared financial reports
- automated regression datasets with known expected outputs

---

## 16. Deployment Architecture

```mermaid
flowchart TB
    GitHub["GitHub Repository"]
    Render["Render Docker Web Service"]
    Build["Node 22 Frontend Build"]
    Runtime["Python 3.12 Runtime"]
    Uvicorn["Uvicorn ASGI Server"]
    SPA["Compiled React SPA"]
    API["/api Backend Routes"]
    Volume[("Persistent /var/data Volume")]
    Providers["OAuth and AI Providers"]

    GitHub --> Render
    Render --> Build
    Build --> SPA
    Render --> Runtime
    Runtime --> Uvicorn
    Uvicorn --> SPA
    Uvicorn --> API
    API --> Volume
    API --> Providers
```

The Docker image:

1. installs frontend dependencies,
2. builds the Vite application,
3. installs Python dependencies,
4. copies the compiled frontend into the runtime image,
5. serves both the SPA and API from one public web service.

This avoids a production frontend/backend CORS split. Local development still uses:

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8000`

---

## 17. Environment Configuration

Only server-side environment variables should contain secrets.

### Core platform

- `BYIZON_ENV`
- `BYIZON_DATA_DIR`
- `BYIZON_SESSION_SECRET`
- `BYIZON_CONNECTOR_ENCRYPTION_KEY`
- `BYIZON_SHARE_ENCRYPTION_KEY`
- `FRONTEND_URL`
- `FRONTEND_ORIGIN`
- `OAUTH_CALLBACK_BASE`

### Google Workspace

- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_WORKSPACE_CLIENT_ID`
- `GOOGLE_WORKSPACE_CLIENT_SECRET`

### Slack

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_SIGNING_SECRET`
- `SLACK_WEBHOOK_URL` when webhook notifications are used

### AI and dashboard design

- `HF_API_KEY`
- `HF_MODEL`
- `STITCH_API_KEY`

### Optional voice

- `ELEVENLABS_API_KEY`

No `.env` file or secret value should be committed to GitHub.

---

## 18. API Surface

| Area | Representative endpoints |
|---|---|
| Health | `GET /api/health` |
| Session | `GET /api/auth/session`, `POST /api/auth/logout` |
| Analysis | `POST /api/analyze`, `POST /api/recalculate` |
| Chat | `POST /api/chat` |
| Connectors | `GET/POST /api/connections...` |
| OAuth | `GET /api/oauth/start/{provider}`, `GET /api/oauth/callback/{provider}` |
| Sharing | `POST /api/shares`, access and revoke routes |
| Reports | export-report routes |
| Voice | config, transcribe, speak and agent routes |
| Studio | config and dashboard-plan routes |
| Activities | automation activity routes |

---

## 19. End-to-End Architecture Summary

```mermaid
flowchart TB
    User["1. User Query or File"]
    Interface["2. Chat / Upload / Connector UI"]
    Router["3. Intent and Source Router"]
    Source["4. Workspace-owned Source"]
    Store["5. Persist File and Metadata"]
    Process["6. Parse, Filter, Aggregate and Validate"]
    KPIs["7. Calculate KPIs and Statistical Evidence"]
    SafeJSON["8. Remove Sensitive/Irrelevant Data and Format JSON"]
    Explain["9. Deterministic Answer or Optional LLM Explanation"]
    Present["10. Dashboard, Charts, Report or Provider Action"]
    Audit["11. Session, Source and Activity Audit"]

    User --> Interface --> Router --> Source --> Store --> Process --> KPIs --> SafeJSON --> Explain --> Present --> Audit
```

### One-line presentation explanation

> Byizon first stores and verifies the user's authorized data, calculates results with deterministic analytics, sends only relevant evidence to the AI layer, and then produces traceable dashboards, explanations, reports, and business actions.

---

## 20. Recommended Production Roadmap

### Phase 1: Demonstration-ready

- keep the current database-first upload flow
- complete end-to-end regression tests for each supported file type
- test multiple simultaneous OAuth connections
- show source fingerprint, formula, and source columns in the UI
- add explicit confirmation for outbound actions

### Phase 2: Multi-user production

- move metadata to PostgreSQL
- move uploaded bytes to encrypted object storage
- add job queue and worker service
- add structured audit events
- add workspace roles and permissions
- add PII classification and masking

### Phase 3: Enterprise analytics

- add read-only warehouse connectors
- add validated typed query plans and SQL compilation
- add semantic metric registry
- add reconciliation rules and approval workflows
- add observability for data lineage, model context, cost, and latency

### Phase 4: Governed AI automation

- provider-specific action policies
- human approval based on action risk
- reusable workflows
- scheduled refresh and anomaly monitoring
- evaluation suite for intent routing, metric accuracy, and action execution

---

## 21. Final Architecture Principle

The language model is a planner and explanation layer, not the source of truth.

The source of truth is:

1. the workspace-owned stored dataset or authorized provider,
2. deterministic calculations,
3. traceable formulas and source columns,
4. validated provider responses,
5. auditable sessions and activities.

That separation is what makes Byizon suitable for serious analytics and future finance-related use.
