import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  BarChart3, BriefcaseBusiness, CalendarDays, ChevronRight, Crown, Database,
  FileText, LayoutGrid, LogOut, Menu, MessageSquarePlus, PanelsTopLeft,
  PlugZap, Settings, Sparkles, UsersRound, X,
} from 'lucide-react';
import { getAuthSession, logoutWorkspace } from '../api/universalBackend';

const navItems = [
  { label: 'Dashboard', icon: LayoutGrid, path: '/dashboard' },
  { label: 'AI Chat', icon: MessageSquarePlus, path: '/' },
  { label: 'Meetings', icon: UsersRound, path: '/meetings' },
  { label: 'CRM', icon: BriefcaseBusiness, path: '/connections?filter=CRM' },
  { label: 'Calendar', icon: CalendarDays, path: '/calendar' },
  { label: 'Data Sources', icon: Database, path: '/upload' },
  { label: 'Analytics', icon: Sparkles, path: '/chat' },
  { label: 'Integrations', icon: PlugZap, path: '/connections', badge: 'New' },
  { label: 'Update UI', icon: PanelsTopLeft, path: '/studio' },
  { label: 'Reports', icon: FileText, path: '/reports' },
];

const GUEST_USER = {
  authenticated: false,
  displayName: 'Guest Workspace',
  email: 'Connect Google to sign in',
};

export default function Sidebar() {
  const { pathname, search } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(GUEST_USER);

  useEffect(() => {
    const openNavigation = () => setIsOpen(true);
    window.addEventListener('byizon:open-navigation', openNavigation);
    return () => window.removeEventListener('byizon:open-navigation', openNavigation);
  }, []);

  useEffect(() => {
    getAuthSession()
      .then(payload => setUser(payload.user || GUEST_USER))
      .catch(() => {});
  }, []);

  const signOut = async () => {
    await logoutWorkspace().catch(() => {});
    window.location.assign('/');
  };

  const initial = (user.displayName || user.email || 'G').trim().charAt(0).toUpperCase();

  return (
    <>
      <div className="mobile-top-bar">
        <button className="mobile-toggle-btn" onClick={() => setIsOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <div className="mobile-brand"><span>Byi</span><b>zon</b></div>
      </div>
      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />}

      <aside className={`sidebar byizon-sidebar ${isOpen ? 'open' : ''}`}>
        <button className="sidebar-close-btn" onClick={() => setIsOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        <Link to="/" className="byizon-logo" onClick={() => setIsOpen(false)}>
          <span>Byi</span><b>zon</b><Sparkles size={12} />
          <small>Enterprise AI OS</small>
        </Link>

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
                  if (routePath === '/') window.dispatchEvent(new Event('byizon:new-chat'));
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
                {badge && <em>{badge}</em>}
                {active && <ChevronRight size={13} className="nav-chevron" />}
              </Link>
            );
          })}
          <Link to="/connections" className="sidebar-item" onClick={() => setIsOpen(false)}>
            <Settings size={16} /><span>Settings</span>
          </Link>
        </nav>

        <div className="byizon-sidebar-footer">
          <div className="byizon-plan-card">
            <div><Crown size={14} /><strong>Byizon Pro</strong></div>
            <span>Your local plan is active</span>
            <div className="plan-progress"><i /></div>
            <Link to="/connections">Workspace settings</Link>
          </div>
          <div className="byizon-user-row">
            <span>{initial}</span>
            <div><strong>{user.displayName}</strong><small>{user.email || 'Private browser workspace'}</small></div>
            {user.authenticated ? (
              <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={15} /></button>
            ) : <BarChart3 size={15} />}
          </div>
        </div>
      </aside>
    </>
  );
}
