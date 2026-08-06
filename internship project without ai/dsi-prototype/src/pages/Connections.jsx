import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, CalendarDays, CheckCircle2, Cloud, Database, ExternalLink, FileText, Link2,
  FileSpreadsheet, Loader2, LockKeyhole, Mail, PlugZap, RefreshCw, Search, ShieldCheck,
  Sheet, Trash2, Video, X,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import {
  analyzeConnectedResource, connectBusinessTool, disconnectBusinessTool,
  getConnectionResources, getConnectors, oauthStartUrl, testSlackIntegration,
} from '../api/universalBackend';
import { useData } from '../context/DataContext';

const FALLBACK_CONNECTORS = [
  ['microsoft-365', 'Microsoft 365', 'Productivity', '#2563eb'],
  ['salesforce', 'Salesforce', 'CRM', '#0ea5e9'],
  ['google-workspace', 'Google Workspace', 'Productivity', '#16a34a'],
  ['slack', 'Slack', 'Collaboration', '#4a154b'],
  ['glean', 'Glean', 'Enterprise Search', '#7c3aed'],
  ['zapier', 'Zapier', 'Automation', '#f97316'],
  ['workato', 'Workato', 'Enterprise Automation', '#dc2626'],
  ['hubspot', 'HubSpot', 'CRM', '#ea580c'],
  ['jira', 'Jira', 'Project Management', '#0c66e4'],
].map(([id, name, category, accent]) => ({
  id, name, category, accent, authModes: ['oauth', 'url'], capabilities: [], oauthReady: false,
  description: 'Connect this business source to the unified analytics workspace.',
}));

const GOOGLE_PERMISSION_ICONS = {
  drive: Database,
  sheets: Sheet,
  gmail: Mail,
  calendar: CalendarDays,
  meet: Video,
  docs: FileText,
};

function ConnectorMark({ connector, size = 44 }) {
  return (
    <div
      className="connector-mark"
      style={{ '--connector-accent': connector.accent, width: size, height: size }}
      aria-hidden="true"
    >
      {connector.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2)}
    </div>
  );
}

export default function Connections() {
  const navigate = useNavigate();
  const { setUploadedData } = useData();
  const [catalog, setCatalog] = useState(FALLBACK_CONNECTORS);
  const [connections, setConnections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [authMode, setAuthMode] = useState('oauth');
  const [sourceUrl, setSourceUrl] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resourceConnection, setResourceConnection] = useState(null);
  const [resources, setResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [analyzingResource, setAnalyzingResource] = useState('');
  const [testingSlack, setTestingSlack] = useState(false);
  const [resourceFilter, setResourceFilter] = useState('all');
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const load = async (suppressLegacyNotice = false) => {
    setLoading(true);
    setError('');
    try {
      const payload = await getConnectors();
      setCatalog(payload.catalog || FALLBACK_CONNECTORS);
      setConnections(payload.connections || []);
      if (payload.legacyConnectionsRequireReconnect && suppressLegacyNotice !== true) {
        setNotice('A connection created before user isolation is hidden for security. Reconnect that provider once to bind it to this workspace.');
      }
    } catch (err) {
      setError(`${err.message} Start the analytics backend to manage live connections.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get('oauth');
    if (oauth === 'success') setNotice('Account authenticated successfully. Your available data is ready to browse.');
    if (oauth === 'error') setError(params.get('message') || 'Account authorization failed.');
    if (oauth) window.history.replaceState({}, '', '/connections');
    load(Boolean(oauth));
  }, []);

  const categories = useMemo(
    () => ['All', ...new Set(catalog.map(item => item.category))],
    [catalog],
  );

  const filtered = useMemo(() => catalog.filter(item => {
    const matchesCategory = category === 'All' || item.category === category;
    const haystack = `${item.name} ${item.category} ${item.description} ${(item.capabilities || []).join(' ')}`.toLowerCase();
    return matchesCategory && haystack.includes(query.trim().toLowerCase());
  }), [catalog, category, query]);

  const connectionSubtitle = (connection) => {
    if (connection.authMode === 'url') return connection.sourceUrl;
    const account = connection.account || {};
    const identity = account.displayName && account.email
      ? `${account.displayName} (${account.email})`
      : account.displayName || account.email || account.user;
    return identity ? `Authorized workspace: ${identity}` : 'Authorized for this Byizon workspace';
  };

  const openConnector = (connector) => {
    setSelected(connector);
    setAuthMode('oauth');
    setSourceUrl('');
    setError('');
  };

  useEffect(() => {
    if (deepLinkHandled || !catalog.length) return;
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    const filter = params.get('filter');
    if (!source && !filter) return;
    if (filter && categories.includes(filter)) setCategory(filter);
    if (source) {
      const requested = catalog.find(item => item.id === source);
      if (requested) openConnector(requested);
    }
    setDeepLinkHandled(true);
    window.history.replaceState({}, '', '/connections');
  }, [catalog, categories, deepLinkHandled]);

  const closeDialog = () => {
    if (saving) return;
    setSelected(null);
    setSourceUrl('');
  };

  const submitConnection = async (event) => {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError('');
    try {
      if (authMode === 'oauth') {
        if (!selected.oauthReady) {
          throw new Error(`${selected.name} OAuth app credentials are not configured yet. Add its Client ID and Client Secret to the backend environment first.`);
        }
        window.location.assign(oauthStartUrl(
          selected.id,
          '/connections',
          selected.id === 'google-workspace' ? 'all' : '',
        ));
        return;
      }
      const connection = await connectBusinessTool({
        connectorId: selected.id,
        authMode,
        sourceUrl: authMode === 'url' ? sourceUrl.trim() : '',
      });
      setConnections(current => [connection, ...current]);
      closeDialog();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const browseConnection = async (connection) => {
    setResourceConnection(connection);
    setResources([]);
    setResourceFilter('all');
    setLoadingResources(true);
    setError('');
    try {
      setResources(await getConnectionResources(connection.connectionId));
    } catch (err) {
      setError(err.message);
      setResourceConnection(null);
    } finally {
      setLoadingResources(false);
    }
  };

  const analyzeResource = async (resource) => {
    if (!resourceConnection || analyzingResource) return;
    setAnalyzingResource(resource.id);
    setError('');
    try {
      const analysis = await analyzeConnectedResource(resourceConnection.connectionId, resource.id);
      setUploadedData(analysis);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzingResource('');
    }
  };

  const removeConnection = async (connectionId) => {
    setError('');
    try {
      await disconnectBusinessTool(connectionId);
      setConnections(current => current.filter(item => item.connectionId !== connectionId));
    } catch (err) {
      setError(err.message);
    }
  };

  const testSlack = async (event) => {
    event.stopPropagation();
    if (testingSlack) return;
    setTestingSlack(true);
    setError('');
    setNotice('');
    try {
      await testSlackIntegration();
      setNotice('Slack webhook test successful. Check the configured Slack channel.');
    } catch (err) {
      setError(err.message);
    } finally {
      setTestingSlack(false);
    }
  };

  const googleResourceFilters = [
    { id: 'all', label: 'All sources' },
    { id: 'drive', label: 'Drive & Docs', types: ['google_drive_file', 'google_doc'] },
    { id: 'sheets', label: 'Google Sheets', types: ['google_sheet'] },
    { id: 'gmail', label: 'Gmail', types: ['gmail_messages'] },
    { id: 'calendar', label: 'Calendar', types: ['google_calendar_events'] },
  ];
  const selectedResourceFilter = googleResourceFilters.find(item => item.id === resourceFilter);
  const visibleResources = selectedResourceFilter?.types
    ? resources.filter(item => selectedResourceFilter.types.includes(item.type) || item.type === 'permission_error')
    : resources;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content connections-page">
        <section className="connections-hero">
          <div>
            <span className="connections-eyebrow"><PlugZap size={14} /> Unified data connections</span>
            <h1>Connect your business tools</h1>
            <p>
              Add a shared data URL or authorize a business platform. Byizon keeps each
              source traceable, then prepares it for one real-time analytical workspace.
            </p>
          </div>
          <div className="connection-flow" aria-label="Connection workflow">
            <span><Link2 size={17} /> Connect</span>
            <ArrowRight size={16} />
            <span><Database size={17} /> Unify</span>
            <ArrowRight size={16} />
            <span><Cloud size={17} /> Analyze</span>
          </div>
        </section>

        {error && <div className="connections-alert" role="alert">{error}</div>}
        {notice && <div className="connections-notice" role="status"><CheckCircle2 size={17} /> {notice}</div>}

        {connections.length > 0 && (
          <section className="connections-section" aria-labelledby="active-connections-title">
            <div className="connections-section-heading">
              <div>
                <span className="section-kicker">Workspace</span>
                <h2 id="active-connections-title">Active connections</h2>
              </div>
              <button className="icon-label-button" onClick={load} disabled={loading}>
                <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
              </button>
            </div>
            <div className="active-connections-list">
              {connections.map(connection => {
                const connector = catalog.find(item => item.id === connection.connectorId) || connection;
                const ready = connection.status === 'connected' && !connection.requiresReconnect;
                return (
                  <article className="active-connection-row" key={connection.connectionId}>
                    <ConnectorMark connector={connector} size={38} />
                    <div className="active-connection-main">
                      <strong>{connection.name}</strong>
                      <span>{connectionSubtitle(connection)}</span>
                    </div>
                    <span className={`connection-status ${ready ? 'ready' : 'pending'}`}>
                      {ready ? <CheckCircle2 size={14} /> : <LockKeyhole size={14} />}
                      {ready ? 'Connected' : connection.requiresReconnect ? 'Permission update required' : 'Authorization required'}
                    </span>
                    {connection.connectorId === 'google-workspace' && (
                      <div className="google-permission-summary" aria-label="Google permissions">
                        {(connection.permissions || []).map(permission => (
                          <span key={permission.id} className={permission.granted ? 'granted' : ''}>
                            {permission.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {ready && (
                      <button className="connection-browse-button" onClick={() => browseConnection(connection)}>
                        <Database size={15} /> Browse data
                      </button>
                    )}
                    {connection.requiresReconnect && (
                      <button className="connection-browse-button" onClick={() => window.location.assign(oauthStartUrl(connection.connectorId))}>
                        <RefreshCw size={15} /> Reconnect
                      </button>
                    )}
                    <button
                      className="connection-remove-button"
                      onClick={() => removeConnection(connection.connectionId)}
                      aria-label={`Remove ${connection.name}`}
                      title="Remove connection"
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="connections-section" aria-labelledby="connector-catalog-title">
          <div className="connections-section-heading catalog-heading">
            <div>
              <span className="section-kicker">Connector catalog</span>
              <h2 id="connector-catalog-title">Choose a business source</h2>
            </div>
            <div className="connector-search-wrap">
              <Search size={16} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search connectors"
                aria-label="Search connectors"
              />
            </div>
          </div>

          <div className="connector-category-tabs" role="tablist" aria-label="Connector categories">
            {categories.map(item => (
              <button
                key={item}
                className={category === item ? 'active' : ''}
                onClick={() => setCategory(item)}
                role="tab"
                aria-selected={category === item}
              >
                {item}
              </button>
            ))}
          </div>

          {loading && catalog === FALLBACK_CONNECTORS ? (
            <div className="connector-loading"><Loader2 size={20} className="spin" /> Loading connectors...</div>
          ) : (
            <div className="connector-grid">
              {filtered.map(connector => (
                <article className="connector-card" key={connector.id}>
                  <div className="connector-card-top">
                    <ConnectorMark connector={connector} />
                    <span>{connector.webhookReady ? 'Webhook ready' : connector.category}</span>
                  </div>
                  <h3>{connector.name}</h3>
                  <p>{connector.description}</p>
                  <div className="connector-capabilities">
                    {(connector.capabilities || []).map(item => (
                      connector.id === 'google-workspace'
                        ? (
                          <button
                            type="button"
                            key={item}
                            onClick={() => openConnector(connector)}
                            title={`Connect ${item} with your Google account`}
                          >
                            {item}
                          </button>
                        )
                        : <span key={item}>{item}</span>
                    ))}
                  </div>
                  <button className="connector-action" onClick={() => openConnector(connector)}>
                    Connect <ArrowRight size={15} />
                  </button>
                  {connector.id === 'slack' && connector.webhookReady && (
                    <button className="connector-action secondary" onClick={testSlack} disabled={testingSlack}>
                      {testingSlack ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                      Test notification
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="connection-security-note">
          <ShieldCheck size={20} />
          <div>
            <strong>Credentials stay with the provider</strong>
            <span>Secure OAuth keeps provider passwords outside Byizon. Every connection is isolated to the browser workspace that authorized it.</span>
          </div>
        </div>
      </main>

      {selected && (
        <div className="connection-dialog-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && closeDialog()}>
          <section className="connection-dialog" role="dialog" aria-modal="true" aria-labelledby="connection-dialog-title">
            <button className="connection-dialog-close" onClick={closeDialog} aria-label="Close connection dialog">
              <X size={18} />
            </button>
            <ConnectorMark connector={selected} size={50} />
            <span className="section-kicker">New connection</span>
            <h2 id="connection-dialog-title">Connect {selected.name}</h2>
            <p>Authorize your existing account once. You do not need to create an app or enter a Client ID here.</p>

            <form onSubmit={submitConnection}>
              <div className="connection-mode-control" aria-label="Connection method">
                <button type="button" className={authMode === 'oauth' ? 'active' : ''} onClick={() => setAuthMode('oauth')}>
                  <LockKeyhole size={15} /> Secure login
                </button>
                {selected.authModes?.includes('url') && (
                  <button type="button" className={authMode === 'url' ? 'active' : ''} onClick={() => setAuthMode('url')}>
                    <Link2 size={15} /> Data URL
                  </button>
                )}
              </div>

              {authMode === 'url' ? (
                <label className="connection-field">
                  <span>HTTPS data source URL</span>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={event => setSourceUrl(event.target.value)}
                    placeholder="https://example.com/data.csv"
                    required
                    autoFocus
                  />
                  <small>Use a share link, published data endpoint, or authorized webhook URL.</small>
                </label>
              ) : (
                <>
                  {selected.id === 'google-workspace' && (
                    <div className="google-permission-picker">
                      <div>
                        <strong>One Google sign-in</strong>
                        <span>Authorize once, then choose the Google service when you run or browse a task.</span>
                      </div>
                      <div className="google-service-overview">
                        {(selected.permissionGroups || []).map(permission => {
                          const Icon = GOOGLE_PERMISSION_ICONS[permission.id] || Database;
                          return (
                            <span key={permission.id}>
                              <Icon size={18} />
                              <strong>{permission.label}</strong>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="oauth-explanation">
                    <ExternalLink size={18} />
                    <div>
                      <strong>Provider authorization</strong>
                      <span>
                        {selected.oauthReady
                          ? selected.id === 'google-workspace'
                            ? 'Google opens one official account chooser and requests the listed Workspace permissions together. During each task, Byizon still asks which service to use and only performs the requested action.'
                            : `You will sign in on ${selected.name}'s official website, choose the account or workspace, and approve the requested access. Byizon never receives your password.`
                          : selected.id === 'slack' && selected.webhookReady
                            ? 'Slack notifications are configured. Add Slack OAuth Client ID and Client Secret to also read and analyze channel history.'
                            : `Developer OAuth credentials are required before ${selected.name} can open its official permission screen.`}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <button className="connection-submit" type="submit" disabled={saving || (authMode === 'oauth' && !selected.oauthReady)}>
                {saving ? <Loader2 size={16} className="spin" /> : authMode === 'url' ? <Link2 size={16} /> : <LockKeyhole size={16} />}
                {saving ? 'Saving...' : authMode === 'url' ? 'Register source' : selected.oauthReady
                  ? selected.id === 'google-workspace'
                    ? 'Continue with Google Workspace'
                    : `Continue with ${selected.name}`
                  : 'OAuth setup required'}
              </button>
            </form>
          </section>
        </div>
      )}

      {resourceConnection && (
        <div className="connection-dialog-backdrop" role="presentation">
          <section className="connection-dialog resource-dialog" role="dialog" aria-modal="true" aria-labelledby="resource-dialog-title">
            <button className="connection-dialog-close" onClick={() => setResourceConnection(null)} aria-label="Close data browser">
              <X size={18} />
            </button>
            <Database size={30} color="var(--blue-600)" />
            <span className="section-kicker">Connected data</span>
            <h2 id="resource-dialog-title">Choose data from {resourceConnection.name}</h2>
            <p>Select a file or business object. Byizon will download it through the authorized provider API and start a new isolated analysis session.</p>
            {resourceConnection.connectorId === 'google-workspace' && (
              <div className="google-resource-filters" aria-label="Choose Google data source">
                {googleResourceFilters.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    className={resourceFilter === item.id ? 'active' : ''}
                    onClick={() => setResourceFilter(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {loadingResources ? (
              <div className="connector-loading"><Loader2 size={20} className="spin" /> Loading authorized data...</div>
            ) : visibleResources.length ? (
              <div className="connection-resource-list">
                {visibleResources.map(resource => (
                  <article className="connection-resource-row" key={resource.id}>
                    <FileSpreadsheet size={18} />
                    <div>
                      <strong>{resource.name}</strong>
                      <span>{resource.message || resource.type}{resource.modifiedAt ? ` · ${new Date(resource.modifiedAt).toLocaleDateString()}` : ''}</span>
                    </div>
                    <button
                      onClick={() => analyzeResource(resource)}
                      disabled={!resource.canAnalyze || Boolean(analyzingResource)}
                    >
                      {analyzingResource === resource.id ? <Loader2 size={15} className="spin" /> : <ArrowRight size={15} />}
                      {resource.canAnalyze ? 'Analyze' : 'Unsupported'}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="resource-empty">No supported files or business objects were found in this account.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
