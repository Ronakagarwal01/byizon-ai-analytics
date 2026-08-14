import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  BarChart3, BookMarked, CalendarDays, ChevronLeft, ChevronRight, Crown,
  Database, FileText, Home as HomeIcon, Link2, LogOut,
  Plus, Settings, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import { getAuthSession, logoutWorkspace } from '../api/universalBackend';
import WorkspaceTopbar from './WorkspaceTopbar';
import { GUEST_WORKSPACE_USER, getStoredWorkspaceUser, isGuestWorkspaceUser, normalizeWorkspaceUser } from '../utils/workspaceUser';

const navItems = [
  { label: 'Dashboard', icon: HomeIcon, path: '/dashboard' },
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

const GUEST_USER = { ...GUEST_WORKSPACE_USER, email: 'Connect Google to sign in' };
const DEFAULT_SIDEBAR_WIDTH = 256;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 380;
const COLLAPSE_THRESHOLD = 150;

export default function Sidebar() {
  const { pathname, search } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('byizon:sidebar-collapsed') === 'true');
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const storedWidth = Number(localStorage.getItem('byizon:sidebar-width'));
    return Number.isFinite(storedWidth) && storedWidth >= MIN_SIDEBAR_WIDTH
      ? Math.min(storedWidth, MAX_SIDEBAR_WIDTH)
      : DEFAULT_SIDEBAR_WIDTH;
  });
  const dragWidthRef = useRef(sidebarWidth);
  const [user, setUser] = useState(GUEST_USER);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('byizon-sidebar-collapsed', isCollapsed);
    document.documentElement.style.setProperty('--sidebar-panel-width', `${sidebarWidth}px`);
    document.documentElement.style.setProperty('--sidebar-width', isCollapsed ? '0px' : `${sidebarWidth}px`);
    localStorage.setItem('byizon:sidebar-collapsed', String(isCollapsed));
    window.dispatchEvent(new CustomEvent('byizon:sidebar-state', { detail: { collapsed: isCollapsed } }));
    return () => document.documentElement.classList.remove('byizon-sidebar-collapsed');
  }, [isCollapsed, sidebarWidth]);

  const startSidebarResize = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    dragWidthRef.current = startWidth;
    document.documentElement.classList.add('byizon-sidebar-resizing');

    const resize = (moveEvent) => {
      const nextWidth = startWidth + moveEvent.clientX - startX;
      dragWidthRef.current = nextWidth;
      if (nextWidth <= COLLAPSE_THRESHOLD) {
        document.documentElement.style.setProperty('--sidebar-width', '0px');
        return;
      }
      const clampedWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, nextWidth));
      document.documentElement.style.setProperty('--sidebar-panel-width', `${clampedWidth}px`);
      document.documentElement.style.setProperty('--sidebar-width', `${clampedWidth}px`);
    };

    const stopResize = () => {
      document.documentElement.classList.remove('byizon-sidebar-resizing');
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stopResize);
      if (dragWidthRef.current <= COLLAPSE_THRESHOLD) {
        setIsCollapsed(true);
        return;
      }
      const finalWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, dragWidthRef.current));
      setSidebarWidth(finalWidth);
      localStorage.setItem('byizon:sidebar-width', String(finalWidth));
    };

    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', stopResize, { once: true });
  };

  useEffect(() => {
    const openNavigation = () => setIsOpen(true);
    window.addEventListener('byizon:open-navigation', openNavigation);
    return () => window.removeEventListener('byizon:open-navigation', openNavigation);
  }, []);

  useEffect(() => {
    getAuthSession()
      .then(payload => setUser(isGuestWorkspaceUser(payload.user) ? getStoredWorkspaceUser() : normalizeWorkspaceUser(payload.user || GUEST_USER)))
      .catch(() => {});
  }, []);

  const signOut = async () => {
    await logoutWorkspace().catch(() => {});
    sessionStorage.removeItem('byizon_active_chat_session');
    window.location.assign('/');
  };

  const initial = (user.displayName || user.email || 'G').trim().charAt(0).toUpperCase();

  return (
    <>
      <WorkspaceTopbar />
      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />}

      {isCollapsed && (
        <button
          type="button"
          className="sidebar-restore-handle"
          onClick={() => setIsCollapsed(false)}
          aria-label="Show navigation"
          title="Show navigation"
        >
          <ChevronRight size={20} />
        </button>
      )}

      <aside className={`sidebar byizon-sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
        <button className="sidebar-close-btn" onClick={() => setIsOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        <button
          type="button"
          className="sidebar-collapse-button"
          onClick={() => setIsCollapsed(true)}
          aria-label="Hide navigation"
          title="Hide navigation"
        >
          <ChevronLeft size={20} />
        </button>
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize navigation"
          title="Drag to resize or hide navigation"
          onPointerDown={startSidebarResize}
        />
        <Link to="/dashboard" className="byizon-logo" onClick={() => setIsOpen(false)}>
          <span>BYiZON</span><Sparkles size={12} />
          <small>AI POWERED BUSINESS OS</small>
        </Link>

        {pathname === '/chat' && (
          <button
            type="button"
            className="sidebar-new-chat"
            onClick={() => window.dispatchEvent(new Event('byizon:new-chat'))}
          >
            <Plus size={14} />
            <span>New Chat</span>
          </button>
        )}

        <nav className="sidebar-nav byizon-nav" aria-label="Primary navigation">
          <span className="byizon-nav-label">Workspace</span>
          {navItems.map(({ label, icon: Icon, path, badge }) => {
            const routePath = path.split('?')[0];
            const hasQuery = path.includes('?');
            const active = hasQuery
              ? pathname === routePath && search === `?${path.split('?')[1]}`
              : routePath === '/'
                ? pathname === '/'
                : pathname === routePath || pathname.startsWith(`${routePath}/`);
            return (
              <Link
                key={label}
                to={path}
                className={`sidebar-item ${active ? 'active' : ''}`}
                onClick={() => {
                  setIsOpen(false);
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
                {badge && <em>{badge}</em>}
                {active && <ChevronRight size={13} className="nav-chevron" />}
              </Link>
            );
          })}
        </nav>

        <div className="byizon-sidebar-footer">
          <section className="sidebar-workspaces" aria-label="My workspaces">
            <div>
              <span>My Workspaces</span>
              <button type="button" aria-label="Add workspace"><Plus size={14} /></button>
            </div>
            {workspaces.map(([name, color]) => (
              <button key={name} type="button">
                <i style={{ background: color }} />
                <span>{name}</span>
              </button>
            ))}
            <button type="button" className="sidebar-add-workspace">
              <Plus size={13} />
              <span>Add Workspace</span>
            </button>
          </section>
          <div className="byizon-plan-card">
            <div><Crown size={14} /><strong>Byizon Pro</strong></div>
            <span>Your local plan is active</span>
            <div className="plan-progress"><i /></div>
            <Link to="/connections">Workspace settings</Link>
          </div>
          <section className={`sidebar-settings ${settingsOpen ? 'open' : ''}`}>
            <button
              type="button"
              className="sidebar-settings-toggle"
              onClick={() => setSettingsOpen(open => !open)}
              aria-expanded={settingsOpen}
              aria-controls="sidebar-settings-menu"
            >
              <Settings size={17} />
              <span>Settings</span>
              <ChevronRight size={15} className="sidebar-settings-chevron" />
            </button>
            {settingsOpen && (
              <div id="sidebar-settings-menu" className="sidebar-settings-menu">
                <button type="button" className="sidebar-logout-button" onClick={signOut}>
                  <LogOut size={16} />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </section>
          <div className="byizon-user-row">
            <span>{initial}</span>
            <div><strong>{user.displayName}</strong><small>{user.email || 'Private browser workspace'}</small></div>
            <BarChart3 size={15} />
          </div>
        </div>
      </aside>
    </>
  );
}
