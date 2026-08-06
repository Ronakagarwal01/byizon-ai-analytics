import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Eye, EyeOff, Loader2, LockKeyhole, RefreshCcw, ShieldCheck } from 'lucide-react';
import DynamicDashboardRenderer from '../dashboard-engine/DynamicDashboardRenderer';
import { downloadJsonDashboard, getJsonDashboardMetadata, regenerateJsonDashboard, unlockJsonDashboard } from '../api/universalBackend';
import { useData } from '../context/DataContext';

export default function DynamicDashboardPage() {
  const { dashboardId } = useParams();
  const { uploadedData } = useData();
  const [metadata, setMetadata] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');
  const [regenerated, setRegenerated] = useState(null);
  const datasetName = metadata?.sourceFileName || metadata?.source?.fileName || 'Shared dashboard dataset';
  const dashboardTitle = metadata?.title && metadata.title !== datasetName
    ? metadata.title
    : 'Protected live dashboard';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setDashboard(null);
    setAccessToken('');
    getJsonDashboardMetadata(dashboardId)
      .then(value => active && setMetadata(value))
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [dashboardId]);

  const unlock = async (event) => {
    event.preventDefault();
    if (!password || unlocking) return;
    setUnlocking(true);
    setError('');
    try {
      const result = await unlockJsonDashboard(dashboardId, password);
      setAccessToken(result.accessToken);
      setDashboard(result.dashboard);
      setMetadata(result.dashboard);
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUnlocking(false);
    }
  };

  const downloadJson = async () => {
    try {
      const { blob, fileName } = await downloadJsonDashboard(dashboardId, accessToken);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const regenerate = async () => {
    if (!uploadedData?.sessionId || regenerating) return;
    setRegenerating(true);
    setError('');
    setRegenerated(null);
    try {
      const next = await regenerateJsonDashboard(dashboardId, uploadedData.sessionId, uploadedData, 'Regenerate from current uploaded dataset');
      setRegenerated(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  };

  if (!dashboard) {
    return (
      <main className="custom-share-gate-page dynamic-dashboard-gate">
        <header><Link to="/" className="byizon-logo"><span>Byi</span><b>zon</b></Link><span><ShieldCheck size={14} /> Protected dynamic dashboard</span></header>
        <section className="protected-share-gate">
          <div className="protected-share-icon">{loading ? <Loader2 size={26} className="spin" /> : <LockKeyhole size={26} />}</div>
          <span className="section-kicker">Password-protected dashboard</span>
          <h1>{loading ? 'Checking dashboard...' : 'Unlock this live dashboard'}</h1>
          {!loading && metadata && (
            <div className="dashboard-gate-summary">
              <strong>{dashboardTitle}</strong>
              <span>{datasetName}</span>
              <small>Version {metadata.version || 1} · JSON-rendered live website</small>
            </div>
          )}
          <p>Enter the password shared by the dashboard owner. The renderer loads only the saved dashboard JSON after verification.</p>
          {!loading && metadata ? (
            <form onSubmit={unlock}>
              <label>
                <span>Dashboard password</span>
                <div>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" autoFocus placeholder="Enter password" />
                  <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
              </label>
              {error && <div className="secure-dialog-error" role="alert">{error}</div>}
              <button className="secure-dialog-submit" type="submit" disabled={!password || unlocking}>{unlocking ? <Loader2 size={17} className="spin" /> : <ShieldCheck size={17} />}{unlocking ? 'Unlocking...' : 'Unlock dashboard'}</button>
            </form>
          ) : !loading && <div className="secure-dialog-error">{error || 'This dashboard is unavailable.'}</div>}
        </section>
      </main>
    );
  }

  return (
    <div className="dynamic-dashboard-page">
      <header className="dynamic-dashboard-toolbar">
        <div>
          <ShieldCheck size={17} />
          <strong>{metadata?.title || 'Dynamic Dashboard'}</strong>
          <span>Version {metadata?.version || 1}</span>
        </div>
        <nav>
          <button onClick={downloadJson}><Download size={15} /> Download JSON</button>
          <button onClick={regenerate} disabled={!uploadedData?.sessionId || regenerating} title={uploadedData?.sessionId ? 'Create a new dashboard version' : 'Open the owner workspace with uploaded data to regenerate'}>
            {regenerating ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
            Regenerate
          </button>
        </nav>
      </header>
      {regenerated && (
        <div className="dynamic-dashboard-version-alert">
          New version created: <Link to={`/dashboard/${regenerated.dashboardId}`}>open version {regenerated.version}</Link>.
          Password: <code>{regenerated.password}</code>
        </div>
      )}
      {error && <div className="dynamic-dashboard-version-alert error">{error}</div>}
      <DynamicDashboardRenderer config={dashboard.dashboardJson} />
    </div>
  );
}
