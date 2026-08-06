import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookMarked,
  Bot,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Database,
  FileSpreadsheet,
  FileText,
  Home as HomeIcon,
  Link2,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  Workflow,
} from 'lucide-react';
import { useWorkspaceUser, workspaceInitials } from '../utils/workspaceUser';
import './PublicPages.css';

const navItems = [
  { label: 'Dashboard', icon: HomeIcon, path: '/', active: true },
  { label: 'AI Assistant', icon: Sparkles, path: '/chat' },
  { label: 'Reports', icon: FileText, path: '/reports' },
  { label: 'Data Sources', icon: Database, path: '/upload' },
  { label: 'Integrations', icon: Link2, path: '/connections' },
  { label: 'Tasks', icon: ShieldCheck, path: '/analytics' },
  { label: 'Calendar', icon: CalendarDays, path: '/calendar' },
  { label: 'Saved Items', icon: BookMarked, path: '/reports' },
];

const workspaces = [
  ['Celebso Group', '#9a552f'],
  ['Marketing', '#fb7a22'],
  ['Operations', '#45b979'],
  ['Finance', '#7c63d9'],
];

const integrations = [
  ['CRM (HubSpot)', '#ff7a59'],
  ['ERP (Zoho)', '#36b37e'],
  ['Google Workspace', '#ea4335'],
  ['Data Sources', '#9a552f'],
  ['Integrations', '#b56a3c'],
];

export default function Home() {
  const navigate = useNavigate();
  const user = useWorkspaceUser();
  const firstName = user.firstName || 'there';
  const displayName = user.displayName || 'Guest Workspace';
  const initials = workspaceInitials(user);

  return (
    <main className="byizon-home-shell">
      <aside className="byizon-home-sidebar">
        <Link className="home-brand" to="/">
          BYiZON
          <span>AI POWERED BUSINESS OS</span>
        </Link>

        <label className="home-sidebar-search">
          <Search size={14} />
          <input placeholder="Search anything..." />
          <kbd>⌘K</kbd>
        </label>

        <nav className="home-sidebar-nav" aria-label="Workspace navigation">
          {navItems.map(({ label, icon: Icon, path, active }) => (
            <Link className={active ? 'active' : ''} key={label} to={path}>
              <Icon size={17} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <section className="home-workspaces">
          <div>
            <span>My Workspaces</span>
            <button type="button" aria-label="Add workspace"><Plus size={15} /></button>
          </div>
          {workspaces.map(([name, color]) => (
            <button key={name} type="button">
              <i style={{ background: color }} />
              {name}
            </button>
          ))}
          <button type="button" className="add-workspace">
            <Plus size={14} /> Add Workspace
          </button>
        </section>

        <section className="home-user-mini">
          <span>{initials}</span>
          <div>
            <strong>{displayName}</strong>
            <small>{user.role || 'Super Admin'}</small>
          </div>
          <ChevronDown size={15} />
        </section>
      </aside>

      <section className="byizon-home-main">
        <header className="home-top-actions">
          <button type="button"><CircleHelp size={16} /> Need Help?</button>
          <button type="button" className="home-bell"><Bell size={18} /><span>3</span></button>
          <section className="home-top-profile">
            <span>{initials}</span>
            <div><strong>{displayName}</strong><small>{user.role || 'Super Admin'}</small></div>
            <ChevronDown size={15} />
          </section>
        </header>

        <section className="home-center-stage">
          <div className="home-orb"><Sparkles size={30} /></div>
          <h1>Good morning, {firstName} 👋</h1>
          <p>How can I help you make smarter decisions today?</p>

          <form
            className="home-prompt-box"
            onSubmit={event => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get('prompt')?.toString().trim();
              navigate('/chat', value ? { state: { initialQuery: value } } : undefined);
            }}
          >
            <Sparkles size={20} />
            <input name="prompt" placeholder="Ask Byizon anything or type @ to connect apps..." />
            <button type="button" aria-label="Prompt settings"><Settings2 size={17} /></button>
          </form>

          <div className="home-quick-actions">
            <button type="button" onClick={() => navigate('/upload')}><Upload size={17} /> Upload File</button>
            <button type="button" onClick={() => navigate('/connections')}><Database size={17} /> Google Drive</button>
            <button type="button" onClick={() => navigate('/connections')}><MessageSquareText size={17} /> Slack</button>
            <button type="button" onClick={() => navigate('/upload')}><FileSpreadsheet size={17} /> Excel</button>
            <button type="button" onClick={() => navigate('/connections')}><MoreHorizontal size={17} /></button>
          </div>
        </section>
      </section>

      <aside className="byizon-ai-status-panel">
        <header>
          <strong><Sparkles size={16} /> Byizon AI</strong>
          <button type="button" aria-label="Close panel">×</button>
        </header>

        <div className="system-pill"><span /> All Systems Connected</div>

        <section className="ai-bot-preview">
          <div><Bot size={42} /></div>
          <strong>Ready to help you<br />make smarter decisions</strong>
        </section>

        <div className="integration-status-list">
          {integrations.map(([name, color]) => (
            <article key={name}>
              <span style={{ color }}><Workflow size={17} /></span>
              <p>{name}</p>
              <em>Connected</em>
            </article>
          ))}
        </div>

        <section className="ai-memory-card">
          <div><strong>AI Memory</strong><span>100%</span></div>
          <i />
          <small><span /> Updated just now</small>
        </section>
      </aside>
    </main>
  );
}
