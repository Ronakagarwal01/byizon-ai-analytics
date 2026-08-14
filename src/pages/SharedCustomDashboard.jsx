import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMemo } from 'react';
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck, Search, TrendingUp, Lightbulb, FileText, ClipboardList } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { getProtectedShareMetadata, unlockProtectedShare } from '../api/universalBackend';
import { enhanceStitchHtml } from '../utils/stitchPreview';

const CHART_COLOR = '#3f6f8f';
const COLORS = ['#3f6f8f', '#6f8f7a', '#b68a56', '#7b718f', '#8b6f65', '#56828f', '#8d965f', '#69778c'];

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function parseDashboardPlan(customization) {
  const source = String(customization?.html || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!source || (/^<!doctype|^<html|^<body|^<div/i.test(source))) return null;
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function numericValue(value) {
  const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function buildDataOverview(analysis) {
  const quality = analysis.dataQualitySummary || analysis.dataQuality || {};
  const warnings = analysis.warnings || analysis.dataWarnings || analysis.qualityWarnings || [];
  const insights = analysis.insights || analysis.keyInsights || [];
  const columns = analysis.columnCount || analysis.colCount || analysis.columns?.length || quality.totalColumns || 0;
  const rows = analysis.rowCount || quality.totalRows || 0;
  const completeness = quality.completenessScore ?? quality.completeness ?? analysis.completenessScore ?? 'N/A';
  const score = quality.qualityScore ?? quality.quality ?? analysis.qualityScore ?? 'N/A';
  const duplicates = quality.duplicateCount ?? quality.duplicatesCount ?? analysis.duplicateCount ?? 0;
  const mainEntity = analysis.mainEntity || analysis.semanticProfile?.mainEntity || analysis.entity || 'Not specifically identified';
  const firstWarning = warnings[0];
  const firstInsight = insights[0];
  const asText = item => typeof item === 'object' ? item.text || item.message || item.observation || item.title || item.desc : item;
  return [
    `${analysis.fileName || 'The uploaded dataset'} contains ${Number(rows).toLocaleString('en-IN')} records across ${Number(columns).toLocaleString('en-IN')} columns.`,
    `The data is classified as ${analysis.datasetType || 'a structured business dataset'}${analysis.businessDomain ? ` in the ${analysis.businessDomain} domain` : ''}.`,
    `Data quality is ${score}${score !== 'N/A' && !String(score).includes('/') ? '/100' : ''}, with ${completeness}${completeness !== 'N/A' && !String(completeness).includes('%') ? '%' : ''} completeness and ${Number(duplicates).toLocaleString('en-IN')} duplicate rows.`,
    `The primary business entity is ${mainEntity}.`,
    firstWarning ? `Primary data warning: ${asText(firstWarning)}.` : 'No critical structural warning was detected in the uploaded data.',
    firstInsight ? `Key finding: ${asText(firstInsight)}.` : 'Charts and metrics below present the strongest measurable signals found in the data.',
  ].filter(Boolean);
}

function SharedChart({ chart, forceType }) {
  const data = (chart?.data || []).slice(0, 12).map(item => ({
    ...item,
    name: String(item.name ?? item.x ?? item.label ?? 'Item'),
    value: numericValue(item.value ?? item.rawValue ?? item.count),
  }));
  const type = String(forceType || chart?.type || 'bar').toLowerCase();
  if (!data.length) return <div className="shared-dashboard-no-data">No chart data available</div>;
  if (type === 'pie' || type === 'donut') {
    return <ResponsiveContainer width="100%" height={290}><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={type === 'donut' ? 58 : 0} outerRadius={92} paddingAngle={2}>{data.map((entry, itemIndex) => <Cell key={`${entry.name}-${itemIndex}`} fill={COLORS[itemIndex % COLORS.length]} />)}</Pie><Tooltip formatter={value => Number(value).toLocaleString('en-IN')} /><Legend /></PieChart></ResponsiveContainer>;
  }
  if (type === 'line' || type === 'area') {
    return <ResponsiveContainer width="100%" height={290}><LineChart data={data} margin={{ left: 4, right: 12, bottom: 38 }}><CartesianGrid strokeDasharray="3 3" stroke="#e3e7eb" /><XAxis dataKey="name" angle={-20} textAnchor="end" height={62} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={value => Number(value).toLocaleString('en-IN')} /><Line type="monotone" dataKey="value" stroke={CHART_COLOR} strokeWidth={3} dot={{ r: 4, fill: CHART_COLOR }} /></LineChart></ResponsiveContainer>;
  }
  return (
    <ResponsiveContainer width="100%" height={290}>
      <BarChart data={data} margin={{ left: 4, right: 12, bottom: 38 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8e1db" vertical={false} />
        <XAxis dataKey="name" angle={-20} textAnchor="end" height={62} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={value => Number(value).toLocaleString('en-IN')} />
        <Bar dataKey="value" radius={[5, 5, 0, 0]}>
          {data.map((entry, itemIndex) => (
            <Cell key={`${entry.name}-${itemIndex}`} fill={CHART_COLOR} opacity={Math.max(0.62, 1 - itemIndex * 0.035)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function NativeSharedDashboard({ analysis, plan }) {
  const [query, setQuery] = useState('');
  const kpis = plan?.kpis?.length ? plan.kpis : (analysis.kpis || []).slice(0, 6);
  const charts = plan?.charts?.length ? plan.charts : (analysis.charts || []).slice(0, 8);
  const insights = plan?.insights?.length ? plan.insights : (analysis.insights || analysis.keyInsights || []).slice(0, 8);
  const recommendations = (analysis.recommendations || analysis.actions || []).slice(0, 6);
  const executiveSummary = plan?.summary || analysis.summary || analysis.executiveSummary || 'This dashboard summarizes the most important patterns and business signals detected in the uploaded dataset.';
  const pieSource = charts.find(chart => Array.isArray(chart?.data) && chart.data.length > 1);
  const visibleCharts = useMemo(() => charts.filter(chart => String(chart.title || '').toLowerCase().includes(query.toLowerCase())), [charts, query]);
  return (
    <div className="shared-live-dashboard">
      <nav className="shared-dashboard-toolbar"><div><TrendingUp size={17} /><strong>Executive overview</strong></div><label><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search charts" /></label></nav>
      <section className="shared-dashboard-kpis">
        {kpis.map((item, index) => <article key={`${item.label}-${index}`}><span>{item.label || item.title || 'Metric'}</span><strong>{item.value ?? item.formattedValue ?? 'N/A'}</strong><small>{item.description || 'Calculated from the uploaded dataset'}</small></article>)}
      </section>
      <section className="shared-dashboard-report-grid">
        <article className="shared-dashboard-narrative"><header><FileText size={20} /><div><span>EXECUTIVE SUMMARY</span><h2>Business overview</h2></div></header><p>{executiveSummary}</p></article>
        <article className="shared-dashboard-report-facts"><header><ClipboardList size={20} /><div><span>REPORT PROFILE</span><h2>Analysis coverage</h2></div></header><dl><div><dt>Records</dt><dd>{Number(analysis.rowCount || 0).toLocaleString('en-IN')}</dd></div><div><dt>Columns</dt><dd>{Number(analysis.columnCount || analysis.columns?.length || 0).toLocaleString('en-IN')}</dd></div><div><dt>Quality</dt><dd>{analysis.qualityScore ?? analysis.dataQuality?.score ?? 'Analyzed'}</dd></div></dl></article>
      </section>
      <section className="shared-dashboard-charts">
        {pieSource && <article><header><div><span>DISTRIBUTION</span><h2>{pieSource.title || 'Category share'}</h2></div><i /></header><SharedChart chart={pieSource} forceType="pie" /></article>}
        {visibleCharts.map((chart, index) => <article key={`${chart.title}-${index}`}><header><div><span>VISUAL ANALYSIS</span><h2>{chart.title || 'Data overview'}</h2></div><i /></header><SharedChart chart={chart} /></article>)}
      </section>
      <section className="shared-dashboard-insights"><header><Lightbulb size={20} /><div><span>DECISION SUPPORT</span><h2>Major insights</h2></div></header><div>{insights.map((item, index) => <article key={index}><b>{String(index + 1).padStart(2, '0')}</b><p>{typeof item === 'object' ? item.text || item.title || item.desc : item}</p></article>)}</div></section>
      <section className="shared-dashboard-recommendations"><header><ClipboardList size={20} /><div><span>REPORT ACTIONS</span><h2>Recommendations</h2></div></header><div>{(recommendations.length ? recommendations : insights.slice(0, 4)).map((item, index) => <article key={index}><strong>{typeof item === 'object' ? item.title || `Action ${index + 1}` : `Action ${index + 1}`}</strong><p>{typeof item === 'object' ? item.desc || item.text || item.description : item}</p></article>)}</div></section>
    </div>
  );
}

export default function SharedCustomDashboard() {
  const { reportId } = useParams();
  const [metadata, setMetadata] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setLoading(false);
      setError('Secure dashboard is taking too long to respond. Please refresh this link or generate a new one.');
    }, 12000);
    getProtectedShareMetadata(reportId)
      .then(value => {
        if (!active) return;
        setMetadata(value);
        setError('');
      })
      .catch(err => active && setError(errorMessage(err, 'Protected dashboard could not be verified. You can still try the shared password.')))
      .finally(() => {
        if (!active) return;
        window.clearTimeout(timeout);
        setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [reportId]);

  const unlock = async (event) => {
    event.preventDefault();
    if (!password || unlocking) return;
    setUnlocking(true);
    setError('');
    try {
      setAnalysis(await unlockProtectedShare(reportId, password));
      setPassword('');
    } catch (err) {
      setError(errorMessage(err, 'Protected report could not be unlocked.'));
    } finally {
      setUnlocking(false);
    }
  };

  if (!analysis) {
    return (
      <main className="custom-share-gate-page">
        <header><Link to="/" className="byizon-logo"><span>Byi</span><b>zon</b></Link><span><ShieldCheck size={14} /> Protected dashboard</span></header>
        <section className="protected-share-gate">
          <div className="protected-share-icon">{loading ? <Loader2 size={26} className="spin" /> : <LockKeyhole size={26} />}</div>
          <span className="section-kicker">Password-protected live dashboard</span>
          <h1>{loading ? 'Checking secure link...' : metadata?.fileName || 'Customized dashboard'}</h1>
          <p>Enter the password shared by the dashboard owner. Five incorrect attempts lock this link.</p>
          {!loading ? (
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
          ) : null}
        </section>
      </main>
    );
  }

  const customization = analysis.studioCustomization;
  const plan = parseDashboardPlan(customization);
  const validHtml = /^<!doctype|^<html|^<body|^<div/i.test(String(customization?.html || '').trim());
  const overviewBullets = buildDataOverview(analysis);
  return (
    <main className="custom-shared-dashboard">
      <header><div><ShieldCheck size={16} /><strong>Protected Customized Dashboard</strong></div><span>{analysis.fileName}</span></header>
      <section className="protected-dashboard-overview">
        <div><FileText size={20} /><span><small>DATA OVERVIEW</small><strong>Complete analysis summary</strong></span></div>
        <ul>{overviewBullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>
      </section>
      {plan || !validHtml ? (
        <NativeSharedDashboard analysis={analysis} plan={plan} />
      ) : customization?.html ? (
        <iframe title="Shared customized dashboard" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={enhanceStitchHtml(customization.html)} />
      ) : customization?.imageUrl ? (
        <img src={customization.imageUrl} alt="Shared customized dashboard" />
      ) : (
        <section className="stitch-empty-stage"><LockKeyhole /><h1>Customized dashboard output is unavailable</h1><p>Ask the owner to generate and share the Stitch dashboard again.</p></section>
      )}
    </main>
  );
}
