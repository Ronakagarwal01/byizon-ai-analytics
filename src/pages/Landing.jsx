import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUp,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  FileText,
  GitBranch,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import PublicSiteLayout from "../components/PublicSiteLayout";
import { useWorkspaceUser, workspaceInitials } from "../utils/workspaceUser";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/" },
  { icon: Sparkles, label: "AI Assistant", to: "/landing", active: true },
  { icon: FileText, label: "Reports", to: "/reports" },
  { icon: Users, label: "Connections", to: "/connections" },
  { icon: Database, label: "Data Sources", to: "/upload" },
  { icon: Workflow, label: "Integrations", to: "/connections" },
  { icon: CalendarDays, label: "Calendar", to: "/calendar" },
];

const suggestions = [
  "Give me today's executive brief",
  "Which revenue segment is slipping?",
  "Show my strongest growth signal",
];

const metrics = [
  {
    label: "Revenue",
    value: "₹24.8L",
    change: "+12.4%",
    points: "0,34 16,31 31,32 47,25 63,27 78,18 94,21 110,12 126,15 143,5",
  },
  {
    label: "Profit",
    value: "₹5.2L",
    change: "+4.1%",
    points: "0,35 16,33 31,28 47,30 63,22 78,20 94,22 110,14 126,10 143,4",
  },
  {
    label: "Orders",
    value: "582",
    change: "+18.0%",
    points: "0,35 16,30 31,31 47,24 63,19 78,22 94,13 110,15 126,7 143,4",
  },
  {
    label: "Cash flow",
    value: "Healthy",
    change: "No issues",
    positive: true,
    points: "0,34 16,33 31,28 47,29 63,21 78,18 94,20 110,11 126,9 143,2",
  },
];

const connections = [
  { name: "CRM (HubSpot)", color: "#ff7a59" },
  { name: "ERP (Zoho)", color: "#38bdf8" },
  { name: "Google Workspace", color: "#fbbc04" },
  { name: "Data Sources", color: "#818cf8" },
  { name: "Integrations", color: "#a78bfa" },
];

export default function Landing() {
  const navigate = useNavigate();
  const workspaceUser = useWorkspaceUser();
  const [query, setQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const firstName = workspaceUser.firstName || "there";
  const displayName = workspaceUser.displayName || "Guest Workspace";
  const initials = workspaceInitials(workspaceUser);

  const submitQuery = (event) => {
    event?.preventDefault();
    const trimmed = query.trim();
    navigate("/chat", trimmed ? { state: { initialQuery: trimmed } } : undefined);
  };

  return (
    <PublicSiteLayout immersive>
      <div className="ai-landing">
        <header className="ai-topbar">
          <button
            className="ai-mobile-menu"
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>
          <Link className="ai-wordmark" to="/landing">
            <span><Sparkles size={17} /></span>
            BYIZON
          </Link>
          <div className="ai-topbar-center">
            <span className="ai-live-dot" />
            Business intelligence, always on
          </div>
          <div className="ai-topbar-actions">
            <button type="button" aria-label="Search"><Search size={18} /></button>
            <button type="button" aria-label="Notifications" className="ai-notification">
              <Bell size={18} /><span />
            </button>
            <span className="ai-user-avatar">{initials}</span>
            <span className="ai-user-name">{displayName}</span>
            <ChevronDown size={16} />
          </div>
        </header>

        <div className="ai-shell">
          <aside className={`ai-sidebar${mobileNavOpen ? " is-open" : ""}`}>
            <div className="ai-sidebar-head">
              <span>Workspace</span>
              <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
                <X size={18} />
              </button>
            </div>
            <nav>
              {navItems.map(({ icon: Icon, label, to, active }) => (
                <Link
                  key={label}
                  className={active ? "active" : ""}
                  to={to}
                  onClick={() => setMobileNavOpen(false)}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  {active && <span className="ai-nav-pulse" />}
                </Link>
              ))}
            </nav>
            <div className="ai-workspaces">
              <p>My workspaces</p>
              <span><i className="orange" /> Celebso Group</span>
              <span><i className="violet" /> Marketing</span>
              <span><i className="green" /> Operations</span>
              <span><i className="blue" /> Finance</span>
              <button type="button"><Plus size={14} /> Add workspace</button>
            </div>
            <div className="ai-upgrade-card">
              <Zap size={17} />
              <strong>Unlock more insight</strong>
              <p>Advanced AI, unlimited reports and integrations.</p>
              <button type="button">Explore Pro</button>
            </div>
          </aside>

          <main className="ai-main">
            <section className="ai-welcome">
              <div className="ai-greeting-icon"><Sparkles size={22} /></div>
              <p>THURSDAY, 30 JULY</p>
              <h1>Good afternoon, {firstName}.</h1>
              <span>Your business is moving. Let&apos;s see what matters.</span>
            </section>

            <section className="ai-command-card">
              <form className="ai-command-form" onSubmit={submitQuery}>
                <button type="button" className="ai-add-button" aria-label="Add data">
                  <Plus size={20} />
                </button>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ask anything about your business..."
                  aria-label="Ask Byizon AI"
                />
                <button type="button" className="ai-settings-button" aria-label="Prompt settings">
                  <Settings2 size={18} />
                </button>
                <button type="submit" className="ai-send-button" aria-label="Send question">
                  <ArrowUp size={19} />
                </button>
              </form>
              <div className="ai-suggestion-row">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => setQuery(suggestion)}>
                    <Sparkles size={13} />
                    {suggestion}
                  </button>
                ))}
              </div>
              <div className="ai-source-row">
                <span>Ask across</span>
                <button type="button"><MessageCircle size={14} /> Slack</button>
                <button type="button"><Database size={14} /> Drive</button>
                <button type="button"><Workflow size={14} /> Jira</button>
                <button type="button"><GitBranch size={14} /> GitHub</button>
                <button type="button"><Plus size={14} /> 6 more</button>
              </div>
            </section>

            <section className="ai-metrics-grid" aria-label="Business metrics">
              {metrics.map((metric) => (
                <article key={metric.label}>
                  <div className="ai-metric-top">
                    <span>{metric.label}</span>
                    <BarChart3 size={15} />
                  </div>
                  <strong className={metric.positive ? "positive" : ""}>{metric.value}</strong>
                  <small className={metric.positive ? "muted" : ""}>
                    {!metric.positive && <ArrowUp size={12} />}
                    {metric.change}
                  </small>
                  <svg viewBox="0 0 143 40" preserveAspectRatio="none" aria-hidden="true">
                    <polyline points={metric.points} />
                  </svg>
                </article>
              ))}
            </section>

            <section className="ai-brief">
              <div className="ai-brief-icon"><Bot size={19} /></div>
              <div>
                <span>AI EXECUTIVE BRIEF</span>
                <h2>Revenue is accelerating, but one signal needs attention.</h2>
                <p>
                  Revenue is up 12.4% today and order volume remains strong.
                  Enterprise renewals are slowing in the West region.
                </p>
              </div>
              <Link to="/reports">Read full report <ArrowUp size={15} /></Link>
            </section>
          </main>

          <aside className="ai-copilot">
            <div className="ai-copilot-head">
              <span><Sparkles size={15} /> Byizon AI</span>
              <button type="button" aria-label="Help"><CircleHelp size={17} /></button>
            </div>
            <div className="ai-system-status">
              <span><i /> All systems connected</span>
            </div>
            <div className="ai-orb-wrap">
              <div className="ai-orb"><Sparkles size={28} /></div>
              <h2>Ready when you are</h2>
              <p>Ask a question or choose a prompt to make a smarter decision.</p>
            </div>
            <div className="ai-connections">
              {connections.map((connection) => (
                <div key={connection.name}>
                  <span><i style={{ background: connection.color }} />{connection.name}</span>
                  <small><Check size={12} /> Connected</small>
                </div>
              ))}
            </div>
            <div className="ai-memory">
              <div><span>AI Memory</span><strong>100%</strong></div>
              <div className="ai-memory-track"><span /></div>
              <small><i /> Updated just now</small>
            </div>
          </aside>
        </div>
      </div>
    </PublicSiteLayout>
  );
}
