import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Blocks,
  Bot,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import PublicSiteLayout from "../components/PublicSiteLayout";

const capabilities = [
  {
    icon: FileSpreadsheet,
    title: "Universal file analytics",
    text: "Upload Excel, CSV, JSON, PDF, TXT, SQL, or SQLite data for validation, profiling, and analysis.",
  },
  {
    icon: Blocks,
    title: "Connected workflows",
    text: "Authorize supported business tools through their official consent screens and run user-directed actions.",
  },
  {
    icon: Database,
    title: "Process before AI",
    text: "Data is filtered, validated, aggregated, and converted into compact evidence before AI explanation.",
  },
  {
    icon: BarChart3,
    title: "Adaptive analytics",
    text: "Dashboards, charts, reports, and KPIs are selected from the structure and values in the active dataset.",
  },
];

const workflow = [
  {
    number: "01",
    title: "Connect or upload",
    text: "Choose a local dataset or authorize a supported source with your own account.",
  },
  {
    number: "02",
    title: "Process and validate",
    text: "The backend parses the source, checks quality, applies calculations, and prepares analytics-ready evidence.",
  },
  {
    number: "03",
    title: "Analyze and act",
    text: "Explore grounded dashboards, ask questions, create reports, or run an authorized workflow.",
  },
];

export default function Landing() {
  return (
    <PublicSiteLayout>
      <section className="product-hero">
        <div className="public-container product-hero-grid">
          <div className="product-hero-copy">
            <span className="public-eyebrow">
              <Sparkles size={17} aria-hidden="true" />
              Connected AI analytics
            </span>
            <h1>Byizon AI</h1>
            <p className="product-hero-lead">
              A unified workspace for analyzing uploaded and connected business
              data, creating adaptive dashboards, and running permission-based
              workflows.
            </p>
            <div className="product-hero-actions">
              <Link className="public-primary-action" to="/">
                Open analytics workspace
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link className="public-secondary-action" to="/connections">
                Connect a data source
              </Link>
            </div>
            <div className="product-trust-line">
              <span>
                <CheckCircle2 aria-hidden="true" />
                User-authorized access
              </span>
              <span>
                <CheckCircle2 aria-hidden="true" />
                Evidence-grounded answers
              </span>
              <span>
                <CheckCircle2 aria-hidden="true" />
                Reusable reports and exports
              </span>
            </div>
          </div>

          <div className="product-hero-visual" aria-label="Byizon AI processing flow">
            <div className="hero-visual-header">
              <span className="hero-visual-brand">
                <Bot size={18} aria-hidden="true" />
                Analytics request
              </span>
              <span className="hero-status">Ready</span>
            </div>
            <div className="hero-query">
              Show the strongest supported findings in my active dataset.
            </div>
            <div className="hero-process-list">
              <div>
                <FileSpreadsheet aria-hidden="true" />
                <span>
                  <strong>Source understood</strong>
                  Schema and permissions identified
                </span>
                <CheckCircle2 aria-hidden="true" />
              </div>
              <div>
                <Workflow aria-hidden="true" />
                <span>
                  <strong>Evidence prepared</strong>
                  Filtered, validated, and aggregated
                </span>
                <CheckCircle2 aria-hidden="true" />
              </div>
              <div>
                <BarChart3 aria-hidden="true" />
                <span>
                  <strong>Output generated</strong>
                  Dashboard, insights, and report
                </span>
                <CheckCircle2 aria-hidden="true" />
              </div>
            </div>
            <div className="hero-evidence-note">
              <ShieldCheck aria-hidden="true" />
              AI receives relevant structured evidence, not OAuth secrets.
            </div>
          </div>
        </div>
      </section>

      <section className="product-capabilities" id="product">
        <div className="public-container">
          <div className="public-section-heading">
            <span>One governed workspace</span>
            <h2>From source data to useful decisions</h2>
            <p>
              Each layer has a clear responsibility, so data processing and AI
              explanation remain separate and traceable.
            </p>
          </div>
          <div className="capability-grid">
            {capabilities.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span className="capability-icon">
                  <Icon aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="product-workflow">
        <div className="public-container product-workflow-grid">
          <div className="workflow-copy">
            <span className="public-eyebrow">
              <Workflow size={17} aria-hidden="true" />
              How it works
            </span>
            <h2>A clear path from data to evidence</h2>
            <p>
              Byizon AI keeps source access, deterministic analytics, and AI
              explanation in distinct stages.
            </p>
          </div>
          <div className="workflow-steps">
            {workflow.map((step) => (
              <article key={step.number}>
                <span>{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="product-google-use">
        <div className="public-container google-use-grid">
          <div>
            <span className="public-eyebrow">
              <LockKeyhole size={17} aria-hidden="true" />
              Google data use
            </span>
            <h2>Your account, your permission, your instruction</h2>
          </div>
          <div className="google-use-details">
            <p>
              Google Workspace access starts only after you approve the
              permissions shown on Google’s official consent screen. Byizon AI
              uses authorized data to perform the action you request, such as
              analyzing a selected Sheet, sending an email, or creating a
              Calendar event.
            </p>
            <ul>
              <li>No sale of Google user data</li>
              <li>No advertising based on Google user data</li>
              <li>No generalized AI model training with Google user data</li>
              <li>Access can be revoked from your Google Account</li>
            </ul>
            <Link to="/privacy">
              Read the Privacy Policy
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </PublicSiteLayout>
  );
}
