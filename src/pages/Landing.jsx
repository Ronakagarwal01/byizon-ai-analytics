import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  Database,
  FileSpreadsheet,
  Link2,
  Menu,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import './PublicPages.css';

const capabilities = [
  {
    icon: BarChart3,
    title: 'Clear business analytics',
    copy: 'Turn spreadsheets and connected business data into focused KPIs, trends, quality checks, and reports.',
  },
  {
    icon: Bot,
    title: 'AI that knows your work',
    copy: 'Ask questions in natural language and get answers grounded in the workspace and data you choose.',
  },
  {
    icon: Link2,
    title: 'Connected tools, one view',
    copy: 'Bring data from the tools your team already uses into one organized business workspace.',
  },
  {
    icon: Workflow,
    title: 'Less repetitive work',
    copy: 'Move from data to insight, reports, follow-ups, and meetings without switching between disconnected screens.',
  },
];

const steps = [
  ['01', 'Connect or upload', 'Choose a business tool or upload Excel, CSV, JSON, PDF, and other supported files.'],
  ['02', 'Byizon organizes the signal', 'Your workspace prepares the useful metrics, patterns, quality notes, and context.'],
  ['03', 'Decide and act', 'Explore the dashboard, ask Byizon AI, create reports, and keep the next action visible.'],
];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="byizon-landing">
      <header className="byizon-landing-header">
        <Link className="byizon-landing-brand" to="/" aria-label="Byizon home">
          <span>BYiZON</span>
          <small>AI POWERED BUSINESS OS</small>
        </Link>

        <button
          className="byizon-landing-menu"
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMenuOpen(open => !open)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>

        <nav className={menuOpen ? 'is-open' : ''} aria-label="Main navigation">
          <a href="#platform" onClick={() => setMenuOpen(false)}>Platform</a>
          <a href="#workflow" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#security" onClick={() => setMenuOpen(false)}>Security</a>
        </nav>

        <div className="byizon-landing-auth">
          <Link className="byizon-login-link" to="/login">Login</Link>
          <Link className="byizon-signup-link" to="/signup">Sign up <ArrowRight size={16} /></Link>
        </div>
      </header>

      <section className="byizon-hero" aria-labelledby="byizon-hero-title">
        <div className="byizon-hero-shade" />
        <div className="byizon-hero-content">
          <span className="byizon-hero-label"><Sparkles size={16} /> Your business, working as one</span>
          <h1 id="byizon-hero-title">AI-powered business OS for faster decisions.</h1>
          <p>
            Connect your data, understand what matters, and move from question to action in one calm, intelligent workspace.
          </p>
          <div className="byizon-hero-actions">
            <Link to="/signup">Start with Byizon <ArrowRight size={18} /></Link>
            <a href="#platform">Explore the platform</a>
          </div>
          <div className="byizon-hero-proof" aria-label="Platform strengths">
            <span><Check size={15} /> Unified business context</span>
            <span><Check size={15} /> Data-grounded answers</span>
            <span><Check size={15} /> Human-readable insights</span>
          </div>
        </div>
        <a className="byizon-hero-next" href="#platform" aria-label="Continue to platform overview">
          <span>See what Byizon brings together</span>
          <ArrowRight size={17} />
        </a>
      </section>

      <section className="byizon-capability-band" id="platform">
        <div className="byizon-section-heading">
          <span>ONE CONNECTED WORKSPACE</span>
          <h2>Everything important, easier to understand.</h2>
          <p>Byizon brings analytics, AI assistance, connected tools, and daily workflows into a single operating view.</p>
        </div>
        <div className="byizon-capability-grid">
          {capabilities.map(({ icon: Icon, title, copy }) => (
            <article key={title}>
              <Icon size={22} />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="byizon-product-band">
        <div className="byizon-product-copy">
          <span>BUSINESS INTELLIGENCE, WITHOUT THE CLUTTER</span>
          <h2>See the story behind your numbers.</h2>
          <p>
            Upload a dataset or connect a source. Byizon turns it into an organized view designed for scanning, comparison, and action.
          </p>
          <ul>
            <li><Check size={17} /> KPIs and trends built from your uploaded data</li>
            <li><Check size={17} /> Plain-language insights and data-quality signals</li>
            <li><Check size={17} /> Reports and conversations kept in the same workspace</li>
          </ul>
          <Link to="/signup">Create your workspace <ArrowRight size={17} /></Link>
        </div>

        <div className="byizon-product-preview" aria-label="Byizon dashboard preview">
          <div className="byizon-preview-top">
            <span><Sparkles size={15} /> AI Generated Dashboard</span>
            <small>Live workspace</small>
          </div>
          <div className="byizon-preview-title">
            <div><strong>Business overview</strong><span>Today&apos;s key signals</span></div>
            <button type="button">Refresh</button>
          </div>
          <div className="byizon-preview-metrics">
            <div><small>Revenue trend</small><strong>+12.4%</strong><span>Moving up</span></div>
            <div><small>Active records</small><strong>582</strong><span>Across sources</span></div>
            <div><small>Data quality</small><strong>96%</strong><span>Ready to analyze</span></div>
          </div>
          <div className="byizon-preview-chart">
            <div className="byizon-chart-head"><span>Performance trend</span><small>Last 8 periods</small></div>
            <div className="byizon-chart-lines" aria-hidden="true">
              {[42, 55, 48, 67, 61, 78, 72, 90].map((height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>
          <div className="byizon-preview-assistant">
            <Bot size={19} />
            <div><strong>Byizon AI</strong><span>Revenue is improving. Review the strongest segment next.</span></div>
            <ArrowRight size={16} />
          </div>
        </div>
      </section>

      <section className="byizon-workflow-band" id="workflow">
        <div className="byizon-section-heading">
          <span>FROM SOURCE TO DECISION</span>
          <h2>A simple path from scattered data to useful action.</h2>
        </div>
        <div className="byizon-steps">
          {steps.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="byizon-tool-band">
        <div>
          <span>BUILT AROUND THE WAY TEAMS ALREADY WORK</span>
          <h2>Files, business apps, AI, and action in one place.</h2>
        </div>
        <div className="byizon-tool-list" aria-label="Supported workflows">
          <span><FileSpreadsheet size={19} /> Excel & CSV</span>
          <span><Database size={19} /> Business data</span>
          <span><MessageSquareText size={19} /> Team conversations</span>
          <span><Zap size={19} /> Automated actions</span>
        </div>
      </section>

      <section className="byizon-security-band" id="security">
        <ShieldCheck size={34} />
        <div>
          <span>CONTROLLED BY YOUR WORKSPACE</span>
          <h2>Your data stays connected to its source and separated by workspace.</h2>
          <p>Choose what to upload, what to connect, and what Byizon can use for each analysis and conversation.</p>
        </div>
        <Link to="/privacy">Read privacy details <ArrowRight size={16} /></Link>
      </section>

      <section className="byizon-final-cta">
        <Sparkles size={28} />
        <h2>Make your next business decision with better context.</h2>
        <p>Bring your data and workflows into one focused AI business workspace.</p>
        <div>
          <Link to="/signup">Create an account <ArrowRight size={17} /></Link>
          <Link to="/login">Login</Link>
        </div>
      </section>

      <footer className="byizon-landing-footer">
        <Link className="byizon-landing-brand" to="/">
          <span>BYiZON</span>
          <small>AI POWERED BUSINESS OS</small>
        </Link>
        <p>Connected analytics and AI-assisted business workflows.</p>
        <div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/login">Login</Link></div>
        <small>Copyright 2026 Byizon. All rights reserved.</small>
      </footer>
    </main>
  );
}
