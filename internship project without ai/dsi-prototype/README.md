# DSI Analytics Platform

DSI is a full-stack business intelligence application. The React frontend lets
users connect or upload data, explore dashboards, generate reports, and query
their data. The Python backend owns ingestion, deterministic analytics, secure
connector storage, sharing, PDF export, and optional AI/voice integrations.

## Technology

- Frontend: React 19, Vite 8, React Router, Recharts, PapaParse, SheetJS
- Backend: Python, Uvicorn, pandas, NumPy, scikit-learn, Matplotlib
- Storage: local SQLite databases under `backend/data/`
- Delivery: Docker, Render, Vercel, and GitHub Actions configuration

## Project structure

```text
dsi-prototype/
|-- backend/
|   |-- ai/                 # AI orchestration, prompts, and validation
|   |-- analytics/          # Data pipeline, metrics, charts, and reports
|   |-- tests/              # Backend contract tests and fixtures
|   |-- voice/              # Voice agent and ElevenLabs integration
|   |-- app.py              # API and production entry point
|   `-- requirements.txt    # Python dependencies
|-- docs/                   # Architecture, deployment, OAuth, and voice guides
|-- output/pdf/             # Generated documentation PDFs
|-- public/                 # Static browser assets
|-- scripts/                # Local development and documentation scripts
|-- src/
|   |-- api/                # Frontend API clients and processing stages
|   |-- components/         # Reusable React components
|   |-- context/            # Application state providers
|   |-- pages/              # Route-level screens
|   |-- utils/              # Browser-side helpers
|   |-- voice/              # Voice assistant UI and API client
|   |-- App.jsx             # Routes and top-level providers
|   `-- main.jsx            # Browser entry point
|-- .env.example            # Safe environment-variable template
|-- Dockerfile              # Production image
|-- package.json            # JavaScript dependencies and commands
`-- vite.config.js          # Frontend build configuration
```

Generated folders such as `node_modules/`, `.venv/`, `dist/`, `tmp/`, logs,
Python bytecode, and local databases are intentionally excluded from Git.

## Local setup

Requirements: Node.js 22+ and Python 3.12+.

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
Copy-Item .env.example .env
npm run dev
```

The frontend runs through Vite and the backend listens on
`http://127.0.0.1:8000`. Set `PYTHON` before `npm run dev` if the desired Python
executable is not available as `python`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run frontend and backend together |
| `npm run frontend` | Run only the Vite frontend |
| `npm run backend` | Run only the Python API |
| `npm run test:backend` | Run backend contract tests |
| `npm run lint` | Lint JavaScript and JSX source |
| `npm run build` | Build the production frontend |
| `npm run verify` | Run tests, lint, and production build |

## Configuration and data safety

Copy `.env.example` to `.env` and fill only the integrations you use. Never
commit `.env`, `backend/data/`, connector keys, session keys, or SQLite files.
Existing local data is preserved during normal cleanup.

## Documentation

- [Documentation index](docs/README.md)
- [System architecture](docs/SYSTEM_ARCHITECTURE.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [OAuth and connector setup](docs/OAUTH_SETUP.md)
- [Voice AI setup](docs/VOICE_AI_SETUP.md)
