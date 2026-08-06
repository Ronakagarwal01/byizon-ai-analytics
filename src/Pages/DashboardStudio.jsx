import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, CheckCircle2, Clock3, ExternalLink, Globe2, History, Loader2,
  LockKeyhole, Palette, RotateCcw, Send, Share2, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import SecureExportDialog from '../components/SecureExportDialog';
import {
  generateDashboardPlan, getAutomationActivities, getDashboardStudioConfig, getProtectedShareData,
} from '../api/universalBackend';
import { clearDashboardHistory, loadDashboardHistory, saveDashboardVersion } from '../utils/dashboardHistory';
import { enhanceStitchHtml } from '../utils/stitchPreview';

const SUGGESTIONS = [
  'Create a clean executive dashboard with the most important KPIs and charts',
  'Use a dark professional theme and organize the analysis as a visual story',
  'Make the dashboard compact, highlight risks, and prioritize actionable insights',
];

const BUILD_STAGES = [
  'Understanding your dashboard prompt',
  'Reading grounded KPIs and chart data',
  'Planning the responsive page structure',
  'Generating dashboard components',
  'Wiring navigation and interactions',
  'Validating the final preview',
];

function initialPlan(analysis) {
  return {
    title: `${analysis?.fileName || 'Data'} Dashboard`,
    subtitle: 'A Stitch dashboard grounded in the uploaded dataset',
    theme: 'light', density: 'comfortable', layout: 'grid',
    kpiLimit: Math.min(5, analysis?.kpis?.length || 0),
    chartIds: (analysis?.charts || []).slice(0, 8).map(chart => String(chart.id)),
    showInsights: true, accent: 'blue',
  };
}

function portableAnalysis(analysis) {
  return {
    fileName: analysis?.fileName,
    rowCount: analysis?.rowCount,
    columns: (analysis?.columns || []).slice(0, 80),
    kpis: (analysis?.kpis || []).slice(0, 12),
    charts: (analysis?.charts || []).slice(0, 20),
    insightObjects: (analysis?.insightObjects || []).slice(0, 8),
    insights: (analysis?.insights || []).slice(0, 8),
  };
}

export default function DashboardStudio() {
  const { reportId } = useParams();
  const { uploadedData } = useData();
  const [analysis, setAnalysis] = useState(reportId ? null : uploadedData);
  const [plan, setPlan] = useState(() => initialPlan(uploadedData));
  const [config, setConfig] = useState(null);
  const [prompt, setPrompt] = useState('Create a responsive professional analytics dashboard using only the calculated KPIs, aggregated charts, and insights from this dataset.');
  const [stitchResult, setStitchResult] = useState(null);
  const [loading, setLoading] = useState(Boolean(reportId));
  const [generating, setGenerating] = useState(false);
  const [buildStage, setBuildStage] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    let active = true;
    const loadConfig = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const next = await getDashboardStudioConfig();
          if (active) setConfig(next);
          return;
        } catch {
          if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
        }
      }
      if (active) setConfig({ stitchConfigured: false });
    };
    loadConfig();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadActivities = () => getAutomationActivities(8)
      .then(items => active && setActivities(items))
      .catch(() => {});
    loadActivities();
    const timer = window.setInterval(loadActivities, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!reportId) {
      setAnalysis(uploadedData);
      setPlan(initialPlan(uploadedData));
      setStitchResult(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getProtectedShareData(reportId)
      .then(value => {
        if (!active) return;
        setAnalysis(value);
        setPlan(initialPlan(value));
        setStitchResult(value.studioCustomization || null);
      })
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reportId, uploadedData]);

  const datasetKey = analysis ? String(reportId || analysis.sessionId || analysis.fileName || 'dataset') : '';

  useEffect(() => {
    if (!datasetKey) return;
    let active = true;
    setHistoryLoading(true);
    loadDashboardHistory(datasetKey)
      .then(versions => {
        if (!active) return;
        setHistory(versions);
        if (!stitchResult && versions[0]) {
          setStitchResult(versions[0].stitchResult);
          if (versions[0].plan) setPlan(versions[0].plan);
        }
      })
      .catch(() => active && setHistory([]))
      .finally(() => active && setHistoryLoading(false));
    return () => { active = false; };
    // A dataset change should load its own saved versions only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetKey]);

  useEffect(() => {
    if (!generating) return undefined;
    setBuildStage(0);
    const timer = window.setInterval(() => {
      setBuildStage(current => Math.min(BUILD_STAGES.length - 1, current + 1));
    }, 7000);
    return () => window.clearInterval(timer);
  }, [generating]);

  const generateWithStitch = async (event) => {
    event?.preventDefault();
    if (!prompt.trim() || generating || !analysis || !config?.stitchConfigured) return;
    setGenerating(true);
    setError('');
    try {
      const result = await generateDashboardPlan({
        sessionId: reportId ? undefined : analysis.sessionId,
        shareId: reportId,
        prompt: prompt.trim(),
        currentPlan: plan,
        analysis: reportId ? undefined : portableAnalysis(analysis),
        useStitch: true,
        stitchState: stitchResult ? {
          projectId: stitchResult.projectId,
          screenId: stitchResult.screenId,
        } : null,
      });
      if (result.stitch?.status !== 'generated') {
        throw new Error(result.stitch?.error || 'Stitch could not generate the dashboard.');
      }
      const promptText = prompt.trim();
      const nextStitchResult = { ...result.stitch, prompt: promptText };
      setPlan(result.plan);
      setStitchResult(nextStitchResult);
      const nextHistory = await saveDashboardVersion({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        datasetKey,
        createdAt: new Date().toISOString(),
        prompt: promptText,
        plan: result.plan,
        stitchResult: nextStitchResult,
      }).catch(() => null);
      if (nextHistory) setHistory(nextHistory);
      setPrompt('');
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <main className="studio-state"><Loader2 className="spin" /><h1>Opening Customized Dashboard...</h1></main>;
  if (!analysis && !reportId) return <Navigate to="/" replace />;
  if (!analysis) return (
    <main className="studio-state"><LockKeyhole /><h1>{error || 'Protected dashboard is unavailable'}</h1><p>Unlock the protected link before opening its dashboard editor.</p><Link to={`/report/${reportId}`}>Unlock report</Link></main>
  );

  const hasDashboard = stitchResult?.status === 'generated' || Boolean(stitchResult?.projectId);

  const openDashboardHtml = () => {
    if (!stitchResult?.html) {
      if (stitchResult?.htmlUrl) window.open(stitchResult.htmlUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const url = URL.createObjectURL(new Blob([enhanceStitchHtml(stitchResult.html)], { type: 'text/html;charset=utf-8' }));
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const restoreVersion = (version) => {
    setStitchResult(version.stitchResult);
    if (version.plan) setPlan(version.plan);
    setPrompt('');
    setHistoryOpen(false);
  };

  const clearHistory = async () => {
    await clearDashboardHistory(datasetKey);
    setHistory([]);
  };

  return (
    <div className="dashboard-studio studio-light studio-comfortable">
      <header className="studio-topbar">
        <Link to="/dashboard"><ArrowLeft size={17} /> Back to Dashboard</Link>
        <div><Palette size={18} /><strong>Customized Dashboard</strong></div>
        <div className="studio-topbar-actions">
          <button className="studio-history-button" onClick={() => setHistoryOpen(true)}><History size={15} /> History {history.length ? `(${history.length})` : ''}</button>
          <button className="studio-secure-share" disabled={!hasDashboard} onClick={() => setShareOpen(true)}><Share2 size={15} /> Secure Live Link</button>
          <div className="studio-animated-profile" title="Ronak Workspace"><span>R</span><i /></div>
        </div>
      </header>

      <section className="studio-composer stitch-only-composer">
        <div className="stitch-editor-heading">
          <div>
            <span className="studio-kicker"><Sparkles size={15} /> Google Stitch dashboard editor</span>
            <h1>{hasDashboard ? 'Edit your dashboard with a prompt' : 'Generate your customized dashboard'}</h1>
            <p>Stitch receives calculated KPIs, aggregated chart data, and grounded insights. Raw spreadsheet rows are not sent.</p>
          </div>
          <div className={`studio-stitch-status ${config?.stitchConfigured ? 'ready' : ''}`}>
            <CheckCircle2 size={14} /> {!config ? 'Checking Stitch...' : config.stitchConfigured ? 'Stitch connected' : 'STITCH_API_KEY required'}
          </div>
        </div>

        <form className="stitch-prompt-form" onSubmit={generateWithStitch}>
          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            rows={4}
            placeholder={hasDashboard ? 'Example: make the KPI cards compact and move risk insights to the top...' : 'Describe the dashboard you want Stitch to create...'}
          />
          <button type="submit" disabled={!config?.stitchConfigured || !prompt.trim() || generating}>
            {generating ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            {generating ? 'Stitch is working...' : hasDashboard ? 'Apply Stitch edit' : 'Generate with Stitch'}
          </button>
        </form>
        {!hasDashboard && <div className="studio-suggestions">{SUGGESTIONS.map(value => <button key={value} onClick={() => setPrompt(value)}>{value}</button>)}</div>}
        {generating && <p className="studio-build-note">Stitch normally takes 30-90 seconds. Keep this page open.</p>}
        {error && <p className="studio-error">{error}</p>}
      </section>

      {activities.length > 0 && (
        <section className="studio-activity-panel" aria-labelledby="studio-activity-title">
          <div className="studio-activity-heading">
            <div><Activity size={17} /><span><strong id="studio-activity-title">Connected workflow activity</strong><small>Live actions completed by chat and voice</small></span></div>
            <em>{activities.length} recent</em>
          </div>
          <div className="studio-activity-list">
            {activities.slice(0, 6).map(activity => (
              <article key={activity.activityId}>
                <span className="studio-activity-state"><CheckCircle2 size={15} /></span>
                <div>
                  <strong>{activity.title}</strong>
                  <small>{activity.message}</small>
                </div>
                <time>{new Date(activity.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</time>
                {activity.url && <a href={activity.url} target="_blank" rel="noreferrer" aria-label={`Open ${activity.title}`}><ExternalLink size={14} /></a>}
              </article>
            ))}
          </div>
        </section>
      )}

      <main className="stitch-dashboard-stage">
        {generating ? (
          <div className="stitch-live-build" aria-live="polite">
            <div className="stitch-build-preview">
              <div className="stitch-build-sidebar">
                <i /><i /><i /><i /><i />
              </div>
              <div className="stitch-build-canvas">
                <div className="stitch-build-header" />
                <div className="stitch-build-kpis"><i /><i /><i /><i /></div>
                <div className="stitch-build-charts"><i /><i /></div>
              </div>
            </div>
            <div className="stitch-build-progress">
              <div><Sparkles size={18} /><span><strong>Building your live dashboard</strong><small>{BUILD_STAGES[buildStage]}</small></span></div>
              <div className="stitch-build-progress-track"><i style={{ width: `${((buildStage + 1) / BUILD_STAGES.length) * 100}%` }} /></div>
              <ol>
                {BUILD_STAGES.map((stage, index) => (
                  <li key={stage} className={index < buildStage ? 'complete' : index === buildStage ? 'active' : ''}>
                    {index < buildStage ? <CheckCircle2 size={14} /> : index === buildStage ? <Loader2 size={14} className="spin" /> : <Clock3 size={14} />}
                    {stage}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : hasDashboard ? (
          <>
            <div className="stitch-stage-toolbar">
              <div><Globe2 size={17} /><strong>Stitch Preview</strong><span>{analysis.fileName}</span></div>
              <div>
                {(stitchResult.html || stitchResult.htmlUrl) && <button onClick={openDashboardHtml}><ExternalLink size={14} /> Open dashboard</button>}
                <button onClick={() => setShareOpen(true)}><ShieldCheck size={14} /> Share securely</button>
              </div>
            </div>
            {stitchResult.html ? (
              <iframe
                className="stitch-dashboard-frame"
                title="Customized Stitch dashboard"
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                srcDoc={enhanceStitchHtml(stitchResult.html)}
              />
            ) : stitchResult.imageUrl ? (
              <img className="stitch-dashboard-image" src={stitchResult.imageUrl} alt="Customized Stitch dashboard preview" />
            ) : (
              <div className="stitch-empty-stage"><Globe2 /><h2>Dashboard generated</h2><p>Use Open HTML to view the Stitch output.</p></div>
            )}
          </>
        ) : (
          <div className="stitch-empty-stage"><Globe2 size={34} /><h2>Your Stitch dashboard will appear here</h2><p>Describe the layout above. All displayed numbers will remain grounded in the uploaded analysis.</p></div>
        )}
      </main>

      <SecureExportDialog
        open={shareOpen}
        mode="share"
        data={analysis}
        customization={hasDashboard ? stitchResult : null}
        onClose={() => setShareOpen(false)}
      />

      {historyOpen && (
        <div className="studio-history-backdrop" onMouseDown={event => event.target === event.currentTarget && setHistoryOpen(false)}>
          <aside className="studio-history-drawer" aria-labelledby="studio-history-title">
            <header>
              <div><History size={19} /><div><h2 id="studio-history-title">Dashboard History</h2><p>Previous prompts and generated versions</p></div></div>
              <button onClick={() => setHistoryOpen(false)} aria-label="Close history"><X size={18} /></button>
            </header>
            <div className="studio-history-list">
              {historyLoading ? <div className="studio-history-empty"><Loader2 className="spin" /> Loading history...</div> : history.length ? history.map((version, index) => (
                <article key={version.id} className={version.stitchResult?.screenId === stitchResult?.screenId ? 'active' : ''}>
                  <div className="studio-history-meta"><span><Clock3 size={13} /> {new Date(version.createdAt).toLocaleString('en-IN')}</span><em>{index === 0 ? 'Latest' : `Version ${history.length - index}`}</em></div>
                  <strong>{version.prompt}</strong>
                  {version.stitchResult?.imageUrl && <img src={version.stitchResult.imageUrl} alt="Dashboard version preview" />}
                  <button onClick={() => restoreVersion(version)}><RotateCcw size={14} /> Restore this dashboard</button>
                </article>
              )) : <div className="studio-history-empty"><History size={28} /><strong>No dashboard history yet</strong><p>Each successful Stitch prompt will be saved here automatically.</p></div>}
            </div>
            {history.length > 0 && <footer><button onClick={clearHistory}><Trash2 size={14} /> Clear history</button></footer>}
          </aside>
        </div>
      )}
    </div>
  );
}
