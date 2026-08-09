import { useEffect, useState } from 'react';
import { RevenueAreaChart, CategoryBarChart } from '../components/RevenueChart';
import { Link, useParams } from 'react-router-dom';
import {
  Lock, Share2, TrendingUp, TrendingDown,
  CheckCircle2, Zap,
  FileSpreadsheet, AlertCircle, AlertTriangle, Target,
  DollarSign, ShoppingCart, Users, BarChart2, Activity,
  Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck, Palette
} from 'lucide-react';
import KPICard from '../components/KPICard';
import { getProtectedShareMetadata, unlockProtectedShare } from '../api/universalBackend';

const ICON_MAP = {
  'Total Sales': DollarSign,
  'Total Revenue': DollarSign,
  'Total Income': DollarSign,
  'Total Expense': TrendingDown,
  'Net Profit': DollarSign,
  'Total Orders': ShoppingCart,
  'Ad Spend': DollarSign,
  'Average Order Value': BarChart2,
  'Total Products Sold': Users,
  'Units Sold': Users,
  'Highest Sale': TrendingUp,
  'Lowest Sale': TrendingDown,
  'Attendance Rate': CheckCircle2,
  'Present Days': CheckCircle2,
  'Active Employees': Users,
  'Attrition Rate': Users,
  'Average Score': Target,
  'Win Rate %': Target,
  'Stock Value': FileSpreadsheet,
  'Unique SKUs': FileSpreadsheet,
};

const ICON_BKGS = {
  'Total Sales': 'rgba(154,85,47,0.12)',
  'Total Revenue': 'rgba(154,85,47,0.12)',
  'Total Income': 'rgba(154,85,47,0.12)',
  'Total Expense': 'rgba(239,68,68,0.1)',
  'Net Profit': 'rgba(16,185,129,0.1)',
  'Total Orders': 'rgba(201,133,84,0.14)',
  'Average Order Value': 'rgba(245,158,11,0.1)',
  'Total Products Sold': 'rgba(16,185,129,0.1)',
  'Units Sold': 'rgba(16,185,129,0.1)',
  'Highest Sale': 'rgba(20,184,166,0.1)',
  'Lowest Sale': 'rgba(239,68,68,0.1)',
  'Attendance Rate': 'rgba(16,185,129,0.1)',
  'Present Days': 'rgba(16,185,129,0.1)',
  'Active Employees': 'rgba(154,85,47,0.12)',
  'Attrition Rate': 'rgba(239,68,68,0.1)',
  'Average Score': 'rgba(201,133,84,0.14)',
  'Win Rate %': 'rgba(20,184,166,0.1)',
  'Stock Value': 'rgba(245,158,11,0.1)',
  'Unique SKUs': 'rgba(201,133,84,0.14)',
};

function formatMaybeNumber(value, suffix = '') {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'number') return `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`;
  return `${value}${suffix}`;
}

function severityColors(severity = 'Low') {
  const normalized = String(severity).toLowerCase();
  if (normalized === 'high' || normalized === 'critical') {
    return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.32)', color: '#f87171' };
  }
  if (normalized === 'medium' || normalized === 'warning') {
    return { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.32)', color: '#fbbf24' };
  }
  return { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.28)', color: '#34d399' };
}

function SeverityBadge({ severity }) {
  const colors = severityColors(severity);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 9px',
      borderRadius: 999,
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      color: colors.color,
      fontSize: 11,
      fontWeight: 800,
      textTransform: 'uppercase'
    }}>
      {severity || 'Low'}
    </span>
  );
}

export default function SharedReport() {
  const [copied, setCopied] = useState(false);
  const { reportId } = useParams();
  const [uploadedData, setUploadedData] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAccessError('');
    getProtectedShareMetadata(reportId)
      .then(value => active && setMetadata(value))
      .catch(err => active && setAccessError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reportId]);

  const unlockReport = async (event) => {
    event.preventDefault();
    if (!password || unlocking) return;
    setUnlocking(true);
    setAccessError('');
    try {
      setUploadedData(await unlockProtectedShare(reportId, password));
      setPassword('');
    } catch (err) {
      setAccessError(err.message);
    } finally {
      setUnlocking(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!uploadedData) {
    return (
      <div className="shared-page protected-share-page">
        <div className="shared-topbar">
          <div className="shared-branding">
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#9a552f,#7f3f1f)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: 'white' }}>B</div>
            <span style={{ fontWeight: 800, fontSize: 17, marginLeft: 8 }}>Byizon</span>
          </div>
        </div>
        <div className="shared-content">
          <section className="protected-share-gate" aria-labelledby="protected-report-title">
            <div className="protected-share-icon">{loading ? <Loader2 size={26} className="spin" /> : <LockKeyhole size={26} />}</div>
            <span className="section-kicker">Encrypted live report</span>
            <h1 id="protected-report-title">{loading ? 'Checking protected link...' : metadata?.fileName || 'Protected report'}</h1>
            <p>This report contains private analytical data. Enter the password provided by the report owner to continue.</p>
            {!loading && metadata ? (
              <form onSubmit={unlockReport}>
                <label>
                  <span>Report password</span>
                  <div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
                {accessError && <div className="secure-dialog-error" role="alert">{accessError}</div>}
                <button className="secure-dialog-submit" type="submit" disabled={unlocking || !password}>
                  {unlocking ? <Loader2 size={17} className="spin" /> : <ShieldCheck size={17} />}
                  {unlocking ? 'Verifying...' : 'Unlock report'}
                </button>
              </form>
            ) : !loading && (
              <>
                <div className="secure-dialog-error">{accessError || 'This protected report is unavailable.'}</div>
                <Link to="/"><button className="btn-outline">Return to Byizon</button></Link>
              </>
            )}
            <small>Five incorrect attempts lock this link. The owner can revoke it and generate a new one.</small>
          </section>
        </div>
      </div>
    );
  }

  const qualitySummary = uploadedData.dataQualitySummary || {
    completenessScore: uploadedData.dataQuality?.completeness ?? 'N/A',
    qualityScore: uploadedData.dataQuality?.quality ?? 'N/A',
    duplicateCount: uploadedData.dataQuality?.duplicatesCount || 0,
    missingCellCount: uploadedData.dataQuality?.emptyCount || 0,
    outlierCount: uploadedData.dataQuality?.outliersCount || 0,
    severity: uploadedData.dataQuality?.severity || 'Low',
  };
  const missingSummary = uploadedData.missingValueSummary || [];
  const outlierSummary = uploadedData.outlierSummary || [];

  return (
    <div className="shared-page">
      {/* Printable CSS block */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .shared-topbar, .shared-url-bar, .page-actions, button {
            display: none !important;
          }
          .shared-content {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .report-section, .chart-card {
            border: 1px solid #ccc !important;
            background: white !important;
            color: black !important;
            page-break-inside: avoid;
            margin-bottom: 20px !important;
          }
          .badge, .column-badge {
            border: 1px solid #666 !important;
            color: black !important;
            background: transparent !important;
          }
        }
      `}</style>

      {/* Top Bar */}
      <div className="shared-topbar">
        <div className="shared-branding">
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#9a552f,#7f3f1f)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: 'white' }}>B</div>
          <span style={{ fontWeight: 800, fontSize: 17, background: 'linear-gradient(135deg,#9a552f,#e8b27d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginLeft: 8 }}>Byizon</span>
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>· Shared Report</span>
        </div>

        <div className="shared-url-bar">
          <Lock size={10} color="var(--success)" />
          <span>byizon.ai/report/{reportId || 'shared'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="badge badge-green" style={{ fontSize: 11 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)' }} />
            Live
          </div>
          <Link
            to={`/studio/${reportId}`}
            className="shared-studio-link"
            title="Customize this dashboard"
          >
            <Palette size={13} /> Customize
          </Link>
          <button 
            onClick={handleCopyLink}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 999, fontSize: 12, color: copied ? 'var(--success)' : 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <Share2 size={11} /> {copied ? 'Link Copied!' : 'Share'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="shared-content">
        {/* Header */}
        <div className="shared-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <span className="badge badge-blue"><Lock size={11} /> Password-protected Report</span>
            <span className="badge badge-green"><CheckCircle2 size={11} /> Auto-analyzed</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {uploadedData.rowCount.toLocaleString()} rows · {uploadedData.columns.length} columns · {uploadedData.model || 'Local Analytics'}
            </span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 10, lineHeight: 1.2 }}>
            {uploadedData.fileName}
            <span className="gradient-text" style={{ display: 'block', fontSize: 22 }}>
              {uploadedData.datasetType} Analysis Dashboard
            </span>
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 680 }}>
            {uploadedData.summary}
          </p>
        </div>

        <div className="shared-body">
          {/* Optional AI Unavailability / Fallback Warning Banner */}
          {(uploadedData.isAIUnavailable || uploadedData.isGeminiUnavailable) && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 18px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: 10,
              marginBottom: 20,
              color: '#f59e0b',
              fontSize: 14,
              fontWeight: 500
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span>{uploadedData.aiNotice || uploadedData.aiError || uploadedData.geminiError || "Optional AI narrative is unavailable. Local analytics are still available."}</span>
            </div>
          )}

          {/* KPI Row */}
          {uploadedData.kpis?.length > 0 && (
            <div className="kpi-grid" style={{ marginBottom: 28 }}>
              {uploadedData.kpis.map((k, i) => {
                const IconComponent = ICON_MAP[k.label] || BarChart2;
                const iconBg = ICON_BKGS[k.label] || 'rgba(154,85,47,0.12)';
                return <KPICard key={k.label} label={k.label} value={k.value} desc={k.desc} trend={k.trend || 'up'} trendValue={k.trendValue || '+0%'} icon={IconComponent} iconBg={iconBg} index={i} />;
              })}
            </div>
          )}

          {/* Data Quality Section */}
          {uploadedData.dataQuality && (
            <div className="report-section animate-fadeInUp" style={{ marginBottom: 24 }}>
              <div className="report-section-title" style={{ fontSize: 16, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={18} color="var(--blue-400)" />
                  Dataset Quality & Completeness Audit
                </span>
                <SeverityBadge severity={qualitySummary.severity} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
                {[
                  ['Completeness', formatMaybeNumber(qualitySummary.completenessScore, '%')],
                  ['Quality Score', `${formatMaybeNumber(qualitySummary.qualityScore)}/100`],
                  ['Missing Cells', formatMaybeNumber(qualitySummary.missingCellCount)],
                  ['Duplicates', formatMaybeNumber(qualitySummary.duplicateCount)],
                  ['Outliers', formatMaybeNumber(qualitySummary.outlierCount)],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: '12px 14px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts */}
          {(uploadedData.trendData?.length > 0 || uploadedData.chartData?.length > 0) && (
            <div className="chart-grid" style={{ marginBottom: 24 }}>
              {uploadedData.trendData?.length > 0 && (
                <div className="chart-card">
                  <div className="chart-card-header">
                    <div>
                      <div className="chart-card-title">Trend over Time</div>
                      <div className="chart-card-subtitle">{uploadedData.fileName}</div>
                    </div>
                    <span className="badge badge-blue" style={{ fontSize: 11 }}>Live</span>
                  </div>
                  <RevenueAreaChart data={uploadedData.trendData} />
                </div>
              )}
              <div className="chart-card">
                <div className="chart-card-header">
                  <div>
                    <div className="chart-card-title">Breakdown Overview</div>
                    <div className="chart-card-subtitle">AI-extracted</div>
                  </div>
                </div>
                {(uploadedData.categoryColExists || uploadedData.chartData?.length > 0) ? (
                  <CategoryBarChart data={uploadedData.chartData} />
                ) : (
                  <div style={{
                    height: 240,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    fontSize: 14,
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 8,
                    margin: '0 20px 20px 20px',
                    background: 'rgba(255, 255, 255, 0.01)'
                  }}>
                    Category data not available in the dataset.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Insights */}
          {uploadedData.insights?.length > 0 && (
            <div className="report-section" style={{ marginBottom: 24 }}>
              <div className="report-section-title" style={{ fontSize: 16, marginBottom: 14 }}>
                <Zap size={16} color="var(--blue-400)" />
                AI-Generated Key Insights
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {uploadedData.insights.map((ins, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }} className="animate-fadeInUp">
                    <CheckCircle2 size={15} color="var(--blue-400)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ins}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Recommendations */}
          {uploadedData.recommendations?.length > 0 && (
            <div className="report-section" style={{ marginBottom: 24 }}>
              <div className="report-section-title" style={{ fontSize: 16, marginBottom: 14 }}>
                <Target size={16} color="var(--blue-400)" />
                AI Recommendations
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {uploadedData.recommendations.map((rec, i) => (
                  <div key={i} style={{ padding: '16px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }} className="animate-fadeInUp">
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{rec.title}</div>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{rec.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks & Weaknesses */}
          {((uploadedData.risks && uploadedData.risks.length > 0) || (uploadedData.weaknesses && uploadedData.weaknesses.length > 0)) && (
            <div className="chart-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 24 }}>
              <div className="chart-card">
                <div className="chart-card-header" style={{ marginBottom: 12 }}>
                  <div className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)', fontSize: 16 }}>
                    <AlertTriangle size={18} />
                    Risks & Threats
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {uploadedData.risks?.map((r, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '10px 12px', background: 'rgba(239,68,68,0.02)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 6 }}>
                      {r}
                    </div>
                  ))}
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-card-header" style={{ marginBottom: 12 }}>
                  <div className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b', fontSize: 16 }}>
                    <AlertCircle size={18} />
                    Weaknesses
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {uploadedData.weaknesses?.map((w, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '10px 12px', background: 'rgba(245,158,11,0.02)', border: '1px solid rgba(245,158,11,0.1)', borderRadius: 6 }}>
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Strengths & Opportunities */}
          {((uploadedData.strengths && uploadedData.strengths.length > 0) || (uploadedData.opportunities && uploadedData.opportunities.length > 0)) && (
            <div className="chart-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 24 }}>
              <div className="chart-card">
                <div className="chart-card-header" style={{ marginBottom: 12 }}>
                  <div className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)', fontSize: 16 }}>
                    <CheckCircle2 size={18} />
                    Strengths
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {uploadedData.strengths?.map((s, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '10px 12px', background: 'rgba(16,185,129,0.02)', border: '1px solid rgba(16,185,129,0.1)', borderRadius: 6 }}>
                      {s}
                    </div>
                  ))}
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-card-header" style={{ marginBottom: 12 }}>
                  <div className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--blue-400)', fontSize: 16 }}>
                    <Target size={18} />
                    Future Opportunities
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {uploadedData.opportunities?.map((o, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '10px 12px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
                      {o}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Grouped Data Quality Findings */}
          {(missingSummary.length > 0 || outlierSummary.length > 0) && (
            <div className="report-section" style={{ marginBottom: 24 }}>
              <div className="report-section-title" style={{ fontSize: 16, marginBottom: 14 }}>
                <AlertTriangle size={16} color="#ef4444" />
                Grouped Data Quality Findings
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {missingSummary.slice(0, 5).map((item, i) => (
                  <div key={`missing-${item.column}-${i}`} style={{ padding: '14px 16px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }} className="animate-fadeInUp">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                      <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{item.column}</strong>
                      <SeverityBadge severity={item.severity} />
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {item.missingCount.toLocaleString('en-IN')} missing values ({item.missingPercent}%). {item.recommendedAction}
                    </div>
                  </div>
                ))}
                {outlierSummary.slice(0, 5).map((item, i) => (
                  <div key={`outlier-${item.column}-${i}`} style={{ padding: '14px 16px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }} className="animate-fadeInUp">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                      <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{item.column}</strong>
                      <SeverityBadge severity={item.severity} />
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {item.totalOutliers.toLocaleString('en-IN')} outliers. Normal IQR range {formatMaybeNumber(item.normalRange?.lower)} to {formatMaybeNumber(item.normalRange?.upper)}. {item.recommendedAction}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conclusion */}
          {uploadedData.conclusion && (
            <div className="report-section" style={{ marginBottom: 24 }}>
              <div className="report-section-title" style={{ fontSize: 16, marginBottom: 14 }}>
                <FileSpreadsheet size={16} color="var(--blue-400)" />
                Conclusion
              </div>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                {uploadedData.conclusion}
              </p>
            </div>
          )}

          {/* File info */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <FileSpreadsheet size={14} color="var(--blue-400)" />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{uploadedData.fileName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{uploadedData.rowCount.toLocaleString()} rows · {uploadedData.columns.length} columns</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
