import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookMarked,
  Bot,
  CalendarDays,
  ChevronDown,
  Database,
  FileSpreadsheet,
  FileText,
  Home as HomeIcon,
  Link2,
  MessageSquareText,
  MoreHorizontal,
  Paintbrush,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  Workflow,
} from 'lucide-react';
import { getConnectors } from '../api/universalBackend';
import { useData } from '../context/DataContext';
import { useWorkspaceUser, workspaceInitials } from '../utils/workspaceUser';
import Dashboard from './Dashboard';
import './PublicPages.css';

const navItems = [
  { label: 'Dashboard', icon: HomeIcon, path: '/', active: true },
  { label: 'AI Assistant', icon: Sparkles, path: '/chat' },
  { label: 'Reports', icon: FileText, path: '/reports' },
  { label: 'Data Sources', icon: Database, path: '/upload' },
  { label: 'Integrations', icon: Link2, path: '/connections' },
  { label: 'Tasks', icon: ShieldCheck, path: '/analytics' },
  { label: 'Meetings', icon: CalendarDays, path: '/meetings' },
  { label: 'Saved Items', icon: BookMarked, path: '/reports' },
];

const workspaces = [
  ['Celebso Group', '#9a552f'],
  ['Marketing', '#fb7a22'],
  ['Operations', '#45b979'],
  ['Finance', '#7c63d9'],
];

export default function Home() {
  const navigate = useNavigate();
  const { uploadedData, chatHistory } = useData();
  const user = useWorkspaceUser();
  const [aiPanelHidden, setAiPanelHidden] = useState(false);
  const [connectedApps, setConnectedApps] = useState([]);
  const [voiceLog, setVoiceLog] = useState({
    status: 'idle',
    transcript: '',
    response: '',
  });
  const firstName = user.firstName || 'there';
  const displayName = user.displayName || 'Guest Workspace';
  const initials = workspaceInitials(user);
  const goToDashboardBuilder = () => navigate(uploadedData ? '/studio' : '/upload');

  const refreshConnectedApps = useCallback(() => getConnectors()
      .then(payload => {
        const catalog = payload.catalog || [];
        const catalogById = new Map(catalog.map(item => [item.id, item]));
        const activeConnections = (payload.connections || [])
          .filter(item => item.status === 'connected' && !item.requiresReconnect)
          .map(item => {
            const connector = catalogById.get(item.connectorId) || {};
            return {
              id: item.connectionId || item.connectorId,
              name: connector.name || item.name || item.connectorId,
              accent: connector.accent || '#9a552f',
            };
          });
        setConnectedApps(activeConnections);
      })
      .catch(() => setConnectedApps([])), []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (!cancelled) refreshConnectedApps();
    };
    refresh();
    const timer = window.setInterval(refresh, 3500);
    window.addEventListener('focus', refresh);
    window.addEventListener('byizon:connections-changed', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('byizon:connections-changed', refresh);
    };
  }, [refreshConnectedApps]);

  useEffect(() => {
    const onVoiceStatus = event => {
      const detail = event.detail || {};
      setVoiceLog(current => ({
        status: detail.status || current.status,
        transcript: detail.transcript || current.transcript,
        response: detail.response || current.response,
      }));
    };
    window.addEventListener('byizon:voice-status', onVoiceStatus);
    return () => window.removeEventListener('byizon:voice-status', onVoiceStatus);
  }, []);

  const allChatTurns = Object.values(chatHistory || {})
    .flat()
    .filter(item => item?.text)
    .slice(-6);
  const latestUserTurn = [...allChatTurns].reverse().find(item => item.role === 'user')?.text || '';
  const latestAiTurn = [...allChatTurns].reverse().find(item => item.role !== 'user')?.text || '';

  if (uploadedData) {
    return <Dashboard />;
  }

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
          <button type="button" className="home-create-dashboard" onClick={goToDashboardBuilder}>
            <Plus size={14} /> Create Dashboard
          </button>
          <button type="button" onClick={goToDashboardBuilder}>
            <Paintbrush size={14} /> Update UI
          </button>
          <button type="button" onClick={() => navigate('/connections')}>
            <Database size={14} /> Connect data
          </button>
          <button type="button" className="home-bell"><Bell size={18} /><span>3</span></button>
          <span className="home-top-avatar" title={`${displayName} - ${user.role || 'Super Admin'}`}>{initials}</span>
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

      <aside className={`byizon-ai-status-panel${aiPanelHidden ? ' is-hidden' : ''}`}>
        {aiPanelHidden && (
          <button
            type="button"
            className="byizon-ai-hide-tab"
            onClick={() => setAiPanelHidden(false)}
            aria-label="Show Byizon AI panel"
            title="Show Byizon AI panel"
          >
            <Sparkles size={16} />
            <span>AI</span>
          </button>
        )}
        <header>
          <strong><Sparkles size={16} /> Byizon AI</strong>
          <button
            type="button"
            className="byizon-ai-hide-button"
            onClick={() => setAiPanelHidden(true)}
            aria-label="Hide Byizon AI panel"
            title="Hide Byizon AI panel"
          >
            Hide
          </button>
          <button type="button" aria-label="Close panel">×</button>
        </header>

        <div className="system-pill"><span /> All Systems Connected</div>

        <button
          type="button"
          className="ai-bot-preview"
          onClick={() => window.dispatchEvent(new Event('byizon:toggle-voice'))}
          aria-label="Start Byizon voice assistant"
          title="Start voice assistant"
        >
          <div><Bot size={42} /></div>
          <strong>Ready to help you<br />make smarter decisions</strong>
        </button>

        <section className="home-voice-log" aria-label="Voice conversation preview">
          <div>
            <span>Aapne bola</span>
            <p>{voiceLog.transcript || latestUserTurn || (voiceLog.status === 'listening' ? 'Sun raha hoon...' : 'Abhi koi real conversation nahi hai.')}</p>
          </div>
          <div>
            <span>Byizon ka jawab</span>
            <p>{voiceLog.response || latestAiTurn || 'Byizon ka real response yahan dikhega.'}</p>
          </div>
        </section>

        <div className="integration-status-list">
          {connectedApps.length > 0 ? connectedApps.map(app => (
            <article key={app.id}>
              <span style={{ color: app.accent }}><Workflow size={17} /></span>
              <p>{app.name}</p>
              <em>Connected</em>
            </article>
          )) : (
            <article className="no-connected-apps">
              <span><Workflow size={17} /></span>
              <p>No connected apps</p>
              <em>Connect</em>
            </article>
          )}
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
