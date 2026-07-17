import { Link } from 'react-router-dom';
import {
  BarChart2, FileText, Share2,
  ArrowRight, Zap, Brain, Globe, ChevronRight
} from 'lucide-react';

const features = [
  { icon: Brain,       title: 'AI Insights',        desc: 'Natural language queries instantly turn into deep business intelligence with contextual recommendations.' },
  { icon: BarChart2,   title: 'Live Dashboards',     desc: 'Auto-generated, real-time dashboards that update as your data evolves — no manual setup required.' },
  { icon: FileText,    title: 'Smart Reports',       desc: 'Executive-quality reports with AI-written summaries, trend analysis, and actionable recommendations.' },
  { icon: Share2,      title: 'Protected Sharing',   desc: 'Share encrypted live reports and password-protected PDFs with authorized stakeholders.' },
];

const steps = [
  { num: '01', title: 'Converse',  desc: "Type a business question in plain English — like you'd ask a colleague." },
  { num: '02', title: 'AI Analyzes', desc: 'DSI connects to your data, runs analysis, and generates dashboards in seconds.' },
  { num: '03', title: 'Share & Act', desc: 'Export reports, share live links, or embed dashboards anywhere.' },
];

export default function Landing() {
  return (
    <div className="landing-wrap">
      {/* Navbar */}
      <nav className="landing-nav">
        <div className="nav-logo">
          <div className="nav-logo-icon">D</div>
          <span className="nav-logo-text">DSI</span>
        </div>
        <div className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#how"      className="nav-link">How it works</a>
        </div>
        <div className="nav-cta">
          <Link to="/dashboard">
            <button className="btn-primary" style={{ fontSize: 13, padding: '8px 20px' }}>
              Start Free Trial <ArrowRight size={14} />
            </button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-section">
        <div className="hero-bg-orb hero-bg-orb-1" />
        <div className="hero-bg-orb hero-bg-orb-2" />

        <div className="hero-badge">
          <span className="hero-badge-dot" />
          Conversational Business Intelligence · Powered by AI
        </div>

        <h1 className="hero-title">
          <span className="gradient-text">Talk to your data.</span>
          <br />
          Get instant intelligence.
        </h1>

        <p className="hero-subtitle">
          DSI is the AI-native operating system for business teams. Ask questions in plain English — get dashboards, reports, and shareable insights in seconds.
        </p>

        <div className="hero-actions">
          <Link to="/chat">
            <button className="btn-primary" style={{ fontSize: 16, padding: '14px 32px' }}>
              <Zap size={17} />
              Try the Demo
            </button>
          </Link>
          <Link to="/dashboard">
            <button className="btn-outline" style={{ fontSize: 15, padding: '13px 28px' }}>
              Generate Report <ChevronRight size={15} />
            </button>
          </Link>
        </div>

        {/* Demo Preview Window */}
        <div className="hero-demo-preview">
          <div className="preview-bar">
            <div className="preview-dots-wrap">
              <div className="preview-dot" style={{ background: '#ef4444' }} />
              <div className="preview-dot" style={{ background: '#f59e0b' }} />
              <div className="preview-dot" style={{ background: '#10b981' }} />
            </div>
            <div className="preview-url">app.dsi.ai/dashboard</div>
          </div>
          <div className="preview-body">
            <div className="preview-sidebar-mini">
              {['Home','Chat','Dashboards','Reports','Settings'].map((item, i) => (
                <div key={item} className={`preview-nav-item ${i === 0 ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 10, color: i === 0 ? 'var(--blue-400)' : 'var(--text-muted)' }}>{item}</div>
              ))}
            </div>
            <div className="preview-main">
              <div className="preview-kpi-row">
                {['$148K Revenue','1,250 Orders','↑18% Growth','892 Customers'].map(k => (
                  <div key={k} className="preview-kpi-mini" style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>{k.split(' ').slice(1).join(' ')}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{k.split(' ')[0]}</div>
                  </div>
                ))}
              </div>
              <div className="preview-chart-big">
                <div style={{ textAlign: 'center' }}>
                  <BarChart2 size={28} color="var(--blue-600)" style={{ margin: '0 auto 6px' }} />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Revenue Trend · 12 months</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* Features */}
      <section id="features" className="features-section">
        <div className="section-header">
          <div className="section-eyebrow">Platform Features</div>
          <h2 className="section-title">Everything your business needs</h2>
          <p className="section-desc">From raw data to boardroom-ready insights in one conversation.</p>
        </div>
        <div className="features-grid">
          {features.map((f, i) => (
            <div key={f.title} className={`feature-card animate-fadeInUp delay-${i + 1}`}>
              <div className="feature-icon">
                <f.icon size={24} color="var(--blue-400)" />
              </div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="how-section">
        <div className="section-header">
          <div className="section-eyebrow">Workflow</div>
          <h2 className="section-title">Simple. Powerful. Instant.</h2>
          <p className="section-desc">Three steps from question to insight.</p>
        </div>
        <div className="steps-grid">
          {steps.map(({ num, title, desc }) => (
            <div key={num} className="step-card">
              <div className="step-num">{num}</div>
              <div className="step-title">{title}</div>
              <p className="step-desc">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="cta-section">
        <h2 className="cta-title">
          Ready to talk to <span className="gradient-text">your data?</span>
        </h2>
        <p className="cta-desc">Join 500+ companies using DSI to make faster, smarter decisions with AI.</p>
        <div className="cta-actions">
          <Link to="/chat">
            <button className="btn-primary" style={{ fontSize: 16, padding: '14px 36px' }}>
              <Zap size={17} /> Start Free Demo
            </button>
          </Link>
          <Link to="/dashboard">
            <button className="btn-outline" style={{ fontSize: 15, padding: '13px 28px' }}>
              <Globe size={16} /> Upload Data
            </button>
          </Link>
        </div>
      </section>


    </div>
  );
}
