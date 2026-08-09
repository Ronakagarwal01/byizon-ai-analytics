import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CircleHelp, Copy, Database, ExternalLink, Globe2, Loader2, Menu, Moon, Paintbrush, Plus, Sparkles, Sun, X } from 'lucide-react';
import { createJsonDashboard, getAuthSession, getConnectors, oauthStartUrl } from '../api/universalBackend';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { buildLocalLiveDashboard } from '../dashboard-engine/localLiveDashboardBuilder';
import { GUEST_WORKSPACE_USER, getStoredWorkspaceUser, isGuestWorkspaceUser, normalizeWorkspaceUser, workspaceInitials } from '../utils/workspaceUser';

const GUEST_ACCOUNT = { ...GUEST_WORKSPACE_USER, email: '' };

export default function WorkspaceTopbar() {
  const navigate = useNavigate();
  const { uploadedData } = useData();
  const { isDark, toggleTheme } = useTheme();
  const [account, setAccount] = useState(GUEST_ACCOUNT);
  const [catalog, setCatalog] = useState([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderPrompt, setBuilderPrompt] = useState('');
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderResult, setBuilderResult] = useState(null);
  const [builderError, setBuilderError] = useState('');
  const [copiedField, setCopiedField] = useState('');

  useEffect(() => {
    getAuthSession()
      .then(payload => setAccount(isGuestWorkspaceUser(payload.user) ? getStoredWorkspaceUser() : normalizeWorkspaceUser(payload.user || GUEST_ACCOUNT)))
      .catch(() => {});
    getConnectors()
      .then(payload => setCatalog(payload.catalog || []))
      .catch(() => {});
  }, []);

  const googleConnector = useMemo(
    () => catalog.find(item => item.id === 'google-workspace'),
    [catalog],
  );

  const accountInitial = workspaceInitials(account);

  const connectData = () => {
    if (account.authenticated) {
      navigate('/connections');
      return;
    }
    if (googleConnector?.oauthReady) {
      window.location.assign(oauthStartUrl(googleConnector.id, '/', 'all'));
      return;
    }
    navigate('/connections');
  };

  const openBuilder = () => {
    if (!uploadedData) {
      navigate('/upload');
      return;
    }
    setBuilderPrompt(`Create a premium live dashboard for ${uploadedData.fileName || 'this uploaded dataset'} with key KPIs, trend lines, filters, colorful charts, and executive insights.`);
    setBuilderResult(null);
    setBuilderError('');
    setBuilderOpen(true);
  };

  const generateLocalDashboard = async (event) => {
    event.preventDefault();
    if (!uploadedData || builderLoading) return;
    setBuilderLoading(true);
    setBuilderError('');
    setBuilderResult(null);
    try {
      const draft = buildLocalLiveDashboard(uploadedData, builderPrompt);
      const published = await createJsonDashboard(uploadedData.sessionId, uploadedData, {
        prompt: builderPrompt,
        dashboardJson: draft.dashboardJson,
      });
      const link = `${window.location.origin}/dashboard/${published.dashboardId}`;
      setBuilderResult({ ...published, link });
    } catch (err) {
      setBuilderError(err.message || 'Live website dashboard could not be generated.');
    } finally {
      setBuilderLoading(false);
    }
  };

  const copyBuilderValue = async (field, value) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 1600);
  };

  return (
    <>
      <header className="workspace-topbar" aria-label="Workspace actions">
        <button
          className="workspace-menu-button"
          type="button"
          onClick={() => window.dispatchEvent(new Event('byizon:open-navigation'))}
          aria-label="Open navigation"
        >
          <Menu size={17} />
        </button>

        <div className="workspace-topbar-actions">
          <button className="topbar-help-button" type="button">
            <CircleHelp size={15} />
            <span>Need Help?</span>
          </button>
          <button
            className="topbar-create-dashboard topbar-hidden-control"
            type="button"
            onClick={openBuilder}
          >
            <Plus size={15} />
            <span>Create Dashboard</span>
          </button>
        <button
          className="topbar-theme-toggle topbar-hidden-control"
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
          <span>{isDark ? 'Light' : 'Dark'}</span>
        </button>
        <button
          className="topbar-update-ui topbar-hidden-control"
          type="button"
          onClick={() => navigate(uploadedData ? '/studio' : '/upload')}
          title={uploadedData ? 'Customize the current dashboard' : 'Upload data before customizing the dashboard'}
        >
          <Paintbrush size={14} />
          <span>Update UI</span>
        </button>
        <button className="topbar-connect-data topbar-hidden-control" type="button" onClick={connectData}>
          <Database size={14} />
          <span>{account.authenticated ? 'Connect data' : 'Connect data'}</span>
        </button>
        <button className="topbar-icon-button" type="button" aria-label="Notifications">
          <Bell size={17} />
        </button>
        <span className="topbar-avatar" title={account.email || 'Guest workspace'}>
          {accountInitial}
        </span>
      </div>
      </header>

      {builderOpen && (
        <div className="live-builder-backdrop" role="dialog" aria-modal="true" aria-labelledby="live-builder-title">
          <section className="live-builder-modal">
            <button className="live-builder-close" type="button" onClick={() => setBuilderOpen(false)} aria-label="Close live dashboard builder">
              <X size={18} />
            </button>
            <div className="live-builder-icon"><Globe2 size={24} /></div>
            <span className="section-kicker">Actual Live Website · Tailwind/shadcn style</span>
            <h2 id="live-builder-title">Generate live dashboard without Stitch</h2>
            <p>
              Ye flow uploaded data se app ke andar hi dynamic website dashboard banata hai. Har generate par layout, palette, KPIs,
              charts, filters aur insights data ke hisaab se change ho sakte hain.
            </p>

            {!builderResult ? (
              <form className="live-builder-form" onSubmit={generateLocalDashboard}>
                <label>
                  <span>Dashboard query / design instruction</span>
                  <textarea
                    value={builderPrompt}
                    onChange={event => setBuilderPrompt(event.target.value)}
                    placeholder="Example: create a premium finance dashboard with trend lines, risk insights and filters..."
                    rows={5}
                  />
                </label>
                {builderError && <div className="secure-dialog-error">{builderError}</div>}
                <button type="submit" disabled={builderLoading}>
                  {builderLoading ? <Loader2 size={17} className="spin" /> : <Sparkles size={17} />}
                  {builderLoading ? 'Generating live website...' : 'Generate actual live link'}
                </button>
              </form>
            ) : (
              <div className="live-builder-result">
                <strong>Live dashboard ready</strong>
                <p>No Stitch. Dashboard JSON saved to your app backend, so this link works for another person too.</p>
                <div className="live-builder-password">
                  <span>One-time password</span>
                  <div className="live-builder-copy-row">
                    <code>{builderResult.password}</code>
                    <button type="button" onClick={() => copyBuilderValue('password', builderResult.password)}>
                      {copiedField === 'password' ? <Check size={15} /> : <Copy size={15} />}
                      {copiedField === 'password' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="live-builder-link-block">
                  <span>Live dashboard link</span>
                <div className="live-builder-link-row">
                  <input value={builderResult.link} readOnly />
                  <button type="button" onClick={() => copyBuilderValue('link', builderResult.link)}>
                    {copiedField === 'link' ? <Check size={15} /> : <Copy size={15} />}
                    {copiedField === 'link' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                </div>
                <button className="live-builder-open" type="button" onClick={() => navigate(`/dashboard/${builderResult.dashboardId}`)}>
                  <ExternalLink size={16} /> Open live dashboard
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
