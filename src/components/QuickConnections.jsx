import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, LockKeyhole, X } from 'lucide-react';
import { getConnectors, oauthStartUrl } from '../api/universalBackend';

const LOGO_SLUGS = {
  'microsoft-365': 'microsoft',
  salesforce: 'salesforce',
  'google-workspace': 'google',
  glean: 'glean',
  zapier: 'zapier',
  workato: 'workato',
  hubspot: 'hubspot',
  slack: 'slack',
  jira: 'jira',
};
const PROVIDER_DOMAINS = {
  'microsoft-365': 'microsoft.com',
  salesforce: 'salesforce.com',
  'google-workspace': 'workspace.google.com',
  glean: 'glean.com',
  zapier: 'zapier.com',
  workato: 'workato.com',
  hubspot: 'hubspot.com',
  slack: 'slack.com',
  jira: 'atlassian.com',
};

export function ProviderLogo({ connector }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const slug = LOGO_SLUGS[connector.id];
  const domain = PROVIDER_DOMAINS[connector.id];
  const sources = [
    slug ? `https://cdn.simpleicons.org/${slug}` : null,
    domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null,
  ].filter(Boolean);
  if (!sources[sourceIndex]) {
    return <span className="quick-provider-fallback">{connector.name.slice(0, 2).toUpperCase()}</span>;
  }
  return (
    <span className="quick-provider-logo">
      <img
        src={sources[sourceIndex]}
        alt={`${connector.name} logo`}
        onError={() => setSourceIndex(index => index + 1)}
      />
    </span>
  );
}

export default function QuickConnections() {
  const [catalog, setCatalog] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const payload = await getConnectors();
      setCatalog(payload.catalog || []);
      setConnections(payload.connections || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'success') setNotice('Business account connected successfully.');
    if (params.get('oauth') === 'error') setError(params.get('message') || 'Account permission was not granted.');
    if (params.has('oauth')) window.history.replaceState({}, '', '/');
    load();
  }, []);

  const connectedIds = new Set(connections.filter(item => item.status === 'connected').map(item => item.connectorId));

  const connect = () => {
    if (!selected?.oauthReady) {
      setError(`${selected.name} OAuth credentials are not configured on this server yet.`);
      setSelected(null);
      return;
    }
    window.location.assign(oauthStartUrl(selected.id, '/'));
  };

  return (
    <section className="quick-connections" aria-labelledby="quick-connections-title">
      <div className="quick-connections-heading">
        <div>
          <span className="section-kicker">Or connect your workspace</span>
          <h2 id="quick-connections-title">Use data directly from your business tool</h2>
          <p>Select the CRM or workspace your team already uses. Permission is requested on the provider's official website.</p>
        </div>
        {loading && <Loader2 size={18} className="spin" />}
      </div>
      {notice && <div className="quick-connection-notice"><CheckCircle2 size={16} />{notice}</div>}
      {error && <div className="quick-connection-error" role="alert">{error}</div>}
      <div className="quick-provider-grid">
        {catalog.map(connector => {
          const connected = connectedIds.has(connector.id);
          return (
            <button
              key={connector.id}
              className={`quick-provider-button ${connected ? 'connected' : ''}`}
              onClick={() => setSelected(connector)}
            >
              <ProviderLogo connector={connector} />
              <span><strong>{connector.name}</strong><small>{connected ? 'Connected' : connector.category}</small></span>
              {connected ? <CheckCircle2 size={17} /> : <ArrowRight size={16} />}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="secure-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && setSelected(null)}>
          <section className="secure-dialog quick-oauth-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-oauth-title">
            <button className="secure-dialog-close" onClick={() => setSelected(null)} aria-label="Close"><X size={18} /></button>
            <ProviderLogo connector={selected} />
            <span className="section-kicker">Secure account permission</span>
            <h2 id="quick-oauth-title">Connect {selected.name}</h2>
            <p>
              You will leave Byizon temporarily and sign in on {selected.name}'s official website.
              {selected.id === 'google-workspace'
                ? ' Select your existing Google account, review the requested Sheets, Gmail, Calendar, Drive, and Docs permissions, then approve access.'
                : ' Choose the account or workspace, review the requested permissions, then approve access to return here.'}
            </p>
            <div className="quick-oauth-safety">
              <LockKeyhole size={18} />
              <span>Your provider password is never entered into or stored by Byizon.</span>
            </div>
            {!selected.oauthReady && (
              <div className="secure-dialog-error">Developer Client ID and Client Secret must be configured before this provider can connect.</div>
            )}
            <button className="secure-dialog-submit" onClick={connect} disabled={!selected.oauthReady}>
              <ExternalLink size={17} />
              {selected.oauthReady ? `Continue to ${selected.name}` : 'OAuth setup required'}
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
