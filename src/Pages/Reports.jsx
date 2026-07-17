import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import SecureExportDialog from '../components/SecureExportDialog';
import { RevenueAreaChart, CategoryBarChart } from '../components/RevenueChart';
import { useData } from '../context/DataContext';
import {
  TrendingUp, CheckCircle2, Lightbulb,
  Download, Share2, FileText, ExternalLink,
  BarChart2, Target, FileSpreadsheet, MessageSquare, AlertTriangle, AlertCircle,
  Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';

const INSIGHT_COLORS = [
  { bg: 'rgba(16,185,129,0.1)',  color: '#10b981' },
  { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
  { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
  { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
  { bg: 'rgba(99,102,241,0.1)',  color: '#818cf8' },
  { bg: 'rgba(59,130,246,0.1)', color: '#60a5fa' },
];

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

function SimpleTable({ columns, rows = [], emptyText = 'Not enough columns available' }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>{columns.map(col => <th key={col.key}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>
                {emptyText}
              </td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={row.id || `${row.column || row.title || 'row'}-${index}`}>
              {columns.map(col => (
                <td key={col.key}>
                  {col.render ? col.render(row, index) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniBarList({ title, data = [], valueKey = 'value' }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(item => Number(item[valueKey] ?? item.rawValue ?? item.count ?? 0)), 1);
  return (
    <div className="chart-card">
      <div className="chart-card-header" style={{ marginBottom: 12 }}>
        <div className="chart-card-title">{title}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.slice(0, 10).map((item, index) => {
          const raw = Number(item[valueKey] ?? item.rawValue ?? item.count ?? 0);
          return (
            <div key={`${item.name}-${index}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                <strong>{item.value || item.count || raw.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(4, (raw / max) * 100)}%`, height: '100%', background: 'var(--blue-500)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="no-data-placeholder">
      <FileText size={48} color="var(--text-muted)" />
      <h3>No AI report generated yet</h3>
      <p>Upload an Excel or CSV file on the Dashboard. The local analytics engine will compute KPIs, insights, strengths, weaknesses, and recommendations here.</p>
      <Link to="/dashboard">
        <button className="btn-primary" style={{ marginTop: 8, gap: 6 }}>
          <FileSpreadsheet size={14} /> Go to Dashboard
        </button>
      </Link>
    </div>
  );
}

export default function Reports() {
  const { uploadedData } = useData();
  const [secureDialogMode, setSecureDialogMode] = useState(null);

  const handleExportPDF = () => {
    setSecureDialogMode('pdf');
  };

  const handleDownloadReportText = () => {
    if (!uploadedData) return;
    
    const content = uploadedData.reportText || [
      `AI BUSINESS REPORT: ${uploadedData.fileName}`,
      `Dataset Classification: ${uploadedData.datasetType}`,
      `Generated by ${uploadedData.model || 'Local Analytics'} from ${uploadedData.rowCount.toLocaleString()} rows and ${uploadedData.columns.length} columns`,
      `=========================================`,
      ``,
      `1. EXECUTIVE SUMMARY:`,
      uploadedData.summary,
      ``,
      `=========================================`,
      `2. DATASET OVERVIEW:`,
      `- File Name: ${uploadedData.fileName}`,
      `- Total Rows: ${uploadedData.rowCount}`,
      `- Total Columns: ${uploadedData.columns.length}`,
      `- Columns: ${uploadedData.columns.join(', ')}`,
      ``,
      `=========================================`,
      `3. KEY KPIS:`,
      ...(uploadedData.kpis || []).map(k => `- ${k.label}: ${k.value} (${k.desc})`),
      ``,
      `=========================================`,
      `4. KEY INSIGHTS:`,
      ...(uploadedData.insights || []).map((ins, idx) => `${idx + 1}. ${ins}`),
      ``,
      `=========================================`,
      `5. HIDDEN PATTERNS:`,
      ...(uploadedData.hiddenPatterns || []).map((pattern, idx) => `${idx + 1}. ${pattern}`),
      ``,
      `=========================================`,
      `5. RECOMMENDATIONS:`,
      ...(uploadedData.recommendations || []).map((rec, idx) => `${idx + 1}. ${rec.title}: ${rec.desc}`),
      ``,
      `=========================================`,
      `6. RISKS:`,
      ...(uploadedData.risks || []).map(r => `- ${r}`),
      ``,
      `=========================================`,
      `7. STRENGTHS:`,
      ...(uploadedData.strengths || []).map(s => `- ${s}`),
      ``,
      `=========================================`,
      `8. WEAKNESSES:`,
      ...(uploadedData.weaknesses || []).map(w => `- ${w}`),
      ``,
      `=========================================`,
      `9. FUTURE OPPORTUNITIES:`,
      ...(uploadedData.opportunities || []).map(o => `- ${o}`),
      ``,
      `=========================================`,
      `10. MISSING VALUE SUMMARY:`,
      ...(uploadedData.missingValueSummary || []).map((item, idx) => `${idx + 1}. ${item.column}: ${item.missingCount} missing (${item.missingPercent}%) - ${item.recommendedAction}`),
      ``,
      `=========================================`,
      `11. OUTLIER SUMMARY:`,
      ...(uploadedData.outlierSummary || []).map((item, idx) => `${idx + 1}. ${item.column}: ${item.totalOutliers} outliers - ${item.recommendedAction}`),
      ``,
      `=========================================`,
      `12. POSSIBLE ROOT CAUSES:`,
      ...(uploadedData.possibleRootCauses || []).map((item, idx) => `${idx + 1}. ${item.title}: ${item.whatHappened} Evidence: ${item.evidence}`),
      ``,
      `=========================================`,
      `13. CONCLUSION:`,
      uploadedData.conclusion,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dsi_report_${uploadedData.fileName.replace(/\.[^/.]+$/, "")}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!uploadedData) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <div>
              <h1 className="page-title">AI Business Report</h1>
              <p className="page-subtitle">Upload your data to generate a report</p>
            </div>
          </div>
          <EmptyState />
        </main>
      </div>
    );
  }

  const qualitySummary = uploadedData.dataQualitySummary || {
    totalRows: uploadedData.rowCount || 0,
    totalColumns: uploadedData.columns?.length || 0,
    completenessScore: uploadedData.dataQuality?.completeness ?? 'N/A',
    qualityScore: uploadedData.dataQuality?.quality ?? 'N/A',
    duplicateCount: uploadedData.dataQuality?.duplicatesCount || 0,
    missingCellCount: uploadedData.dataQuality?.emptyCount || 0,
    invalidValueCount: uploadedData.dataQuality?.invalidDates || 0,
    outlierCount: uploadedData.dataQuality?.outliersCount || 0,
    severity: uploadedData.dataQuality?.severity || 'Low',
  };
  const missingSummary = uploadedData.missingValueSummary || [];
  const outlierSummary = uploadedData.outlierSummary || [];
  const anomalyImpacts = uploadedData.anomalyBusinessImpacts || [];
  const rootCauses = uploadedData.possibleRootCauses || [];
  const unavailableRootCauseChecks = uploadedData.unavailableRootCauseChecks || [];
  const topBottom = uploadedData.topBottom || {};
  const correlations = uploadedData.correlationAnalysis?.pairs || [];
  const missingChart = (uploadedData.charts || []).find(chart => chart.id === 'missing_values');
  const outlierChart = (uploadedData.charts || []).find(chart => chart.id === 'outlier_summary');
  const statusChart = (uploadedData.charts || []).find(chart => /status|payment|priority|channel/i.test(chart.id || chart.title || ''));
  const topSegmentEntries = Object.entries(topBottom)
    .filter(([key, value]) => key.toLowerCase().startsWith('top') && Array.isArray(value) && value.length)
    .slice(0, 4);
  const bottomSegmentEntries = Object.entries(topBottom)
    .filter(([key, value]) => key.toLowerCase().startsWith('bottom') && Array.isArray(value) && value.length)
    .slice(0, 4);
  const missingBarData = missingChart?.data || missingSummary.map(item => ({
    name: item.column,
    value: item.missingCount,
    rawValue: item.missingCount,
  }));
  const outlierBarData = outlierChart?.data || outlierSummary.map(item => ({
    name: item.column,
    value: item.totalOutliers,
    rawValue: item.totalOutliers,
  }));
  const previewColumns = (uploadedData.columns || []).slice(0, 8).map(column => ({ key: column, label: column }));
  const previewRows = (uploadedData.rows || []).slice(0, 10);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">

        {/* Printable optimization styles */}
        <style>{`
          @media print {
            body {
              background: white !important;
              color: black !important;
            }
            .sidebar {
              display: none !important;
            }
            .main-content {
              margin-left: 0 !important;
              padding: 0 !important;
              width: 100% !important;
            }
            .page-actions, .data-banner, .footer-actions, button {
              display: none !important;
            }
            .report-hero {
              border: 1px solid #ccc !important;
              background: #f9f9f9 !important;
              color: black !important;
              padding: 20px !important;
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

        {/* Data Banner */}
        <div className="data-banner">
          <FileSpreadsheet size={15} />
          <span>AI Report from:</span>
          <span className="data-banner-file">{uploadedData.fileName}</span>
          <span className="data-banner-meta">
            · {uploadedData.rowCount.toLocaleString()} rows · {uploadedData.model || 'Local Analytics'}
          </span>
          <Link to="/chat" style={{ marginLeft: 'auto' }}>
            <button className="btn-outline" style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}>
              <MessageSquare size={11} /> Ask AI
            </button>
          </Link>
        </div>

        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">AI Report · {uploadedData.fileName}</h1>
            <p className="page-subtitle">
              Generated by {uploadedData.model || 'Local Analytics'} from {uploadedData.rowCount.toLocaleString()} rows · {uploadedData.columns.length} columns
            </p>
          </div>
          <div className="page-actions">
            <button className="btn-outline" style={{ gap: 6, fontSize: 13 }} onClick={() => setSecureDialogMode('share')}>
              <ExternalLink size={13} /> Secure Share
            </button>
            <button className="btn-primary" onClick={handleExportPDF} style={{ gap: 6, fontSize: 13 }}>
              <Download size={13} /> Export PDF
            </button>
          </div>
        </div>

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

        {/* Executive Summary Banner */}
        <div className="report-hero animate-fadeInUp">
          <div className="report-meta">
            <span className="badge badge-blue"><FileText size={11} /> AI Generated</span>
            <span className="badge badge-green"><CheckCircle2 size={11} /> Auto-analyzed</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              File: {uploadedData.fileName} · {uploadedData.rowCount.toLocaleString()} rows · {uploadedData.model || 'Local Analytics'}
            </span>
          </div>
          <h2 className="report-title">{uploadedData.datasetType} Analysis Report</h2>
          <p className="report-summary">{uploadedData.summary}</p>
        </div>

        {/* Dataset Overview */}
        <div className="report-section animate-fadeInUp" style={{ marginTop: 20, animationDelay: '0.1s' }}>
          <div className="report-section-title">
            <BarChart2 size={18} color="var(--blue-400)" />
            Dataset Overview
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
            {[
              { label: 'File Name', value: uploadedData.fileName },
              { label: 'Dataset Type', value: uploadedData.datasetType || 'Generic Dataset' },
              { label: 'Business Domain', value: uploadedData.businessDomain || 'Generic' },
              { label: 'Rows', value: formatMaybeNumber(uploadedData.rowCount) },
              { label: 'Columns', value: formatMaybeNumber(uploadedData.columns.length) },
              { label: 'Tables', value: formatMaybeNumber(uploadedData.tables?.length || 1) },
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: '14px 16px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value}</div>
              </div>
            ))}
          </div>
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--blue-400)', fontSize: 13, fontWeight: 700 }}>View detected columns</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {uploadedData.columns.map(col => (
                <span key={col} className="column-badge">{col}</span>
              ))}
            </div>
          </details>
        </div>

        {/* Dynamic KPIs Section */}
        {uploadedData.kpis?.length > 0 && (
          <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.15s' }}>
            <div className="report-section-title">
              <CheckCircle2 size={18} color="var(--blue-400)" />
              KPI Cards
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {uploadedData.kpis.map(k => (
                <div key={k.label} style={{ padding: '12px 16px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{k.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data Quality Section */}
        {uploadedData.dataQuality && (
          <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.18s', marginTop: 20 }}>
            <div className="report-section-title" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={18} color="var(--blue-400)" />
                Data Quality Audit
              </span>
              <SeverityBadge severity={qualitySummary.severity} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              {[
                ['Total Rows', formatMaybeNumber(qualitySummary.totalRows)],
                ['Total Columns', formatMaybeNumber(qualitySummary.totalColumns)],
                ['Completeness', formatMaybeNumber(qualitySummary.completenessScore, '%')],
                ['Quality Score', `${formatMaybeNumber(qualitySummary.qualityScore)}/100`],
                ['Duplicates', formatMaybeNumber(qualitySummary.duplicateCount)],
                ['Missing Cells', formatMaybeNumber(qualitySummary.missingCellCount)],
                ['Invalid Values', formatMaybeNumber(qualitySummary.invalidValueCount)],
                ['Outliers', formatMaybeNumber(qualitySummary.outlierCount)],
              ].map(([label, value]) => (
                <div key={label} style={{ padding: '12px 14px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.19s', marginTop: 20 }}>
          <div className="report-section-title">
            <BarChart2 size={18} color="var(--blue-400)" />
            Missing Values Summary
          </div>
          <SimpleTable
            columns={[
              { key: 'column', label: 'Column' },
              { key: 'missingCount', label: 'Missing Count', render: row => row.missingCount.toLocaleString('en-IN') },
              { key: 'missingPercent', label: 'Missing %', render: row => `${row.missingPercent}%` },
              { key: 'severity', label: 'Severity', render: row => <SeverityBadge severity={row.severity} /> },
              { key: 'possibleReason', label: 'Possible Reason' },
              { key: 'recommendedAction', label: 'Recommended Action' },
            ]}
            rows={missingSummary}
            emptyText="No missing values detected."
          />
        </div>

        <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.2s', marginTop: 20 }}>
          <div className="report-section-title">
            <AlertTriangle size={18} color="#f59e0b" />
            Outlier Summary
          </div>
          {outlierSummary.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
              No numeric outlier groups detected.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {outlierSummary.map((item, index) => (
                <details key={`${item.table}-${item.column}`} className="chart-card" style={{ padding: 0, overflow: 'hidden' }} open={index === 0}>
                  <summary style={{ cursor: 'pointer', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{item.column}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {item.totalOutliers.toLocaleString('en-IN')} outliers · normal IQR range {formatMaybeNumber(item.normalRange?.lower)} to {formatMaybeNumber(item.normalRange?.upper)}
                      </div>
                    </div>
                    <SeverityBadge severity={item.severity} />
                  </summary>
                  <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16, marginBottom: 16 }}>
                      {[
                        ['Min Outlier', formatMaybeNumber(item.minOutlier)],
                        ['Max Outlier', formatMaybeNumber(item.maxOutlier)],
                        ['Affected Rows', (item.affectedRows || []).join(', ') || 'N/A'],
                        ['Business Impact', item.businessImpact],
                      ].map(([label, value]) => (
                        <div key={label} style={{ padding: 12, background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 5 }}>{label}</div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>What happened:</strong> {item.whatHappened}<br />
                      <strong style={{ color: 'var(--text-primary)' }}>Why it matters:</strong> {item.whyItMatters}<br />
                      <strong style={{ color: 'var(--text-primary)' }}>Evidence:</strong> {item.evidence}<br />
                      <strong style={{ color: 'var(--text-primary)' }}>Recommended action:</strong> {item.recommendedAction}
                    </div>
                    <details>
                      <summary style={{ cursor: 'pointer', color: 'var(--blue-400)', fontSize: 13, fontWeight: 700 }}>View All Rows</summary>
                      <div style={{ marginTop: 10 }}>
                        <SimpleTable
                          columns={[
                            { key: 'row', label: 'Row' },
                            { key: 'value', label: 'Value', render: row => formatMaybeNumber(row.value) },
                            { key: 'lowerBound', label: 'Lower Bound', render: row => formatMaybeNumber(row.lowerBound) },
                            { key: 'upperBound', label: 'Upper Bound', render: row => formatMaybeNumber(row.upperBound) },
                          ]}
                          rows={item.details || []}
                        />
                      </div>
                    </details>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

        {anomalyImpacts.length > 0 && (
          <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.21s', marginTop: 20 }}>
            <div className="report-section-title">
              <AlertCircle size={18} color="#f59e0b" />
              Business Impact Layer
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {anomalyImpacts.map((impact, index) => (
                <details key={`${impact.title}-${index}`} open={index === 0} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-glass-light)', overflow: 'hidden' }}>
                  <summary style={{ cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{impact.title}</span>
                    <SeverityBadge severity={impact.severity} />
                  </summary>
                  <div style={{ padding: '0 16px 16px', fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>What happened:</strong> {impact.whatHappened}<br />
                    <strong style={{ color: 'var(--text-primary)' }}>Why it matters:</strong> {impact.whyItMatters}<br />
                    <strong style={{ color: 'var(--text-primary)' }}>Evidence:</strong> {impact.evidence}<br />
                    <strong style={{ color: 'var(--text-primary)' }}>Recommended action:</strong> {impact.recommendedAction}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* AI Insights Grid */}
        {uploadedData.insights?.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lightbulb size={14} color="var(--blue-400)" />
              Key Insights from {uploadedData.model || 'Local Analytics'}
            </div>
            <div className="insights-grid animate-fadeInUp" style={{ animationDelay: '0.2s' }}>
              {uploadedData.insights.map((text, i) => {
                const { bg, color } = INSIGHT_COLORS[i % INSIGHT_COLORS.length];
                return (
                  <div key={i} className="insight-card" style={{ animationDelay: `${i * 0.07}s` }}>
                    <div className="insight-icon" style={{ background: bg }}>
                      <TrendingUp size={18} color={color} />
                    </div>
                    <div className="insight-label">Insight {i + 1}</div>
                    <div className="insight-desc">{text}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: 24, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart2 size={14} color="var(--blue-400)" />
          Visual Dashboard
        </div>
        <div className="chart-grid animate-fadeInUp" style={{ animationDelay: '0.25s' }}>
          <MiniBarList title="Missing Values by Column" data={missingBarData} />
          <MiniBarList title="Outliers by Column" data={outlierBarData} />
          {statusChart?.data?.length > 0 && (
            <MiniBarList title={statusChart.title || 'Status / Channel Distribution'} data={statusChart.data} />
          )}
        </div>

        <div className="chart-grid animate-fadeInUp" style={{ animationDelay: '0.26s', marginTop: 20 }}>
          <div className="chart-card">
            <div className="chart-card-header">
              <div>
                <div className="chart-card-title">Trend Analysis</div>
                <div className="chart-card-subtitle">Month/period pattern when date columns exist</div>
              </div>
            </div>
            {uploadedData.trendData?.length > 0 ? (
              <RevenueAreaChart data={uploadedData.trendData} />
            ) : (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                Not enough columns available for trend analysis.
              </div>
            )}
          </div>
          <div className="chart-card">
            <div className="chart-card-header">
              <div>
                <div className="chart-card-title">Category/Segment Analysis</div>
                <div className="chart-card-subtitle">Best and worst visible segments</div>
              </div>
            </div>
            {uploadedData.chartData?.length > 0 ? (
              <CategoryBarChart data={uploadedData.chartData} />
            ) : (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                Not enough columns available for category breakdown.
              </div>
            )}
          </div>
        </div>

        <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.27s', marginTop: 20 }}>
          <div className="report-section-title">
            <BarChart2 size={18} color="var(--blue-400)" />
            Category/Segment Analysis
          </div>
          {topSegmentEntries.length === 0 && bottomSegmentEntries.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
              Not enough columns available for top/bottom segment analysis.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {topSegmentEntries.map(([key, value]) => (
                <div key={`top-${key}`} style={{ padding: 14, background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <SimpleTable
                    columns={[
                      { key: 'name', label: 'Segment' },
                      { key: 'value', label: 'Value' },
                    ]}
                    rows={value.slice(0, 5)}
                  />
                </div>
              ))}
              {bottomSegmentEntries.map(([key, value]) => (
                <div key={`bottom-${key}`} style={{ padding: 14, background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <SimpleTable
                    columns={[
                      { key: 'name', label: 'Segment' },
                      { key: 'value', label: 'Value' },
                    ]}
                    rows={value.slice(0, 5)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.28s', marginTop: 20 }}>
          <div className="report-section-title">
            <Activity size={18} color="var(--blue-400)" />
            Correlation Analysis
          </div>
          <SimpleTable
            columns={[
              { key: 'columns', label: 'Columns', render: row => `${row.x || row.columns?.[0] || ''} vs ${row.y || row.columns?.[1] || ''}` },
              { key: 'correlation', label: 'Correlation', render: row => formatMaybeNumber(row.correlation) },
              {
                key: 'strength',
                label: 'Strength',
                render: row => {
                  const value = Math.abs(Number(row.correlation || 0));
                  if (value >= 0.7) return 'Strong';
                  if (value >= 0.4) return 'Moderate';
                  return 'Weak';
                },
              },
              { key: 'direction', label: 'Direction', render: row => Number(row.correlation || 0) >= 0 ? 'Positive' : 'Negative' },
            ]}
            rows={correlations.slice(0, 10)}
            emptyText="Not enough numeric columns available for correlation analysis."
          />
        </div>

        {uploadedData.hiddenPatterns?.length > 0 && (
          <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.29s', marginTop: 20 }}>
            <div className="report-section-title">
              <Lightbulb size={18} color="var(--blue-400)" />
              Hidden Patterns
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {uploadedData.hiddenPatterns.map((pattern, i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 14px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                  {pattern}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.295s', marginTop: 20 }}>
          <div className="report-section-title">
            <Target size={18} color="var(--blue-400)" />
            Possible Root Causes
          </div>
          {rootCauses.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
              Not enough columns available for root cause analysis.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rootCauses.map((cause, index) => (
                <details key={`${cause.title}-${index}`} open={index === 0} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-glass-light)', overflow: 'hidden' }}>
                  <summary style={{ cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{cause.title}</span>
                    <SeverityBadge severity={cause.severity || 'Medium'} />
                  </summary>
                  <div style={{ padding: '0 16px 16px', fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>What happened:</strong> {cause.whatHappened}<br />
                    <strong style={{ color: 'var(--text-primary)' }}>Why it matters:</strong> {cause.whyItMatters}<br />
                    <strong style={{ color: 'var(--text-primary)' }}>Evidence:</strong> {cause.evidence}<br />
                    <strong style={{ color: 'var(--text-primary)' }}>Recommended action:</strong> {cause.recommendedAction}
                  </div>
                </details>
              ))}
            </div>
          )}
          {unavailableRootCauseChecks.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--blue-400)', fontSize: 13, fontWeight: 700 }}>Unavailable checks</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {unavailableRootCauseChecks.map((item, index) => (
                  <div key={`${typeof item === 'string' ? item : item.title}-${index}`} style={{ color: 'var(--text-muted)', fontSize: 13, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                    {typeof item === 'string' ? item : `${item.title}: ${item.reason || 'Not enough columns available'}`}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* AI Recommendations */}
        {uploadedData.recommendations?.length > 0 && (
          <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.3s' }}>
            <div className="report-section-title">
              <Target size={18} color="var(--blue-400)" />
              Business Recommendations
            </div>
            <div className="recommendations-list">
              {uploadedData.recommendations.map((r, i) => (
                <div key={i} className="recommendation-item">
                  <div className="recommendation-num">{i + 1}</div>
                  <div>
                    <div className="recommendation-title">{r.title}</div>
                    <div className="recommendation-desc">{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risks & Weaknesses */}
        {((uploadedData.risks && uploadedData.risks.length > 0) || (uploadedData.weaknesses && uploadedData.weaknesses.length > 0)) && (
          <div className="chart-grid animate-fadeInUp" style={{ gridTemplateColumns: '1fr 1fr', animationDelay: '0.35s' }}>
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

        {/* Strengths & Future Opportunities */}
        {((uploadedData.strengths && uploadedData.strengths.length > 0) || (uploadedData.opportunities && uploadedData.opportunities.length > 0)) && (
          <div className="chart-grid animate-fadeInUp" style={{ gridTemplateColumns: '1fr 1fr', animationDelay: '0.4s', marginTop: 20 }}>
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

        <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.45s', marginTop: 20 }}>
          <div className="report-section-title">
            <FileSpreadsheet size={18} color="var(--blue-400)" />
            Detailed Rows / Drill-down
          </div>
          <details open>
            <summary style={{ cursor: 'pointer', color: 'var(--blue-400)', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              Preview first {previewRows.length} rows
            </summary>
            <SimpleTable
              columns={previewColumns}
              rows={previewRows}
              emptyText="No row preview available."
            />
          </details>
          {outlierSummary.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--blue-400)', fontSize: 13, fontWeight: 700 }}>
                Drill into grouped outlier evidence
              </summary>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {outlierSummary.map(item => (
                  <div key={`drill-${item.table}-${item.column}`} style={{ padding: 12, background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {item.column}: {item.totalOutliers.toLocaleString('en-IN')} outliers
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Affected rows preview: {(item.affectedRows || []).join(', ') || 'N/A'}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Conclusion Section */}
        {uploadedData.conclusion && (
          <div className="report-section animate-fadeInUp" style={{ animationDelay: '0.5s', marginTop: 20 }}>
            <div className="report-section-title">
              <FileText size={18} color="var(--blue-400)" />
              Conclusion
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
              {uploadedData.conclusion}
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="footer-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8, paddingBottom: 24 }}>
          <button className="btn-outline" style={{ gap: 6 }} onClick={() => setSecureDialogMode('share')}>
            <Share2 size={14} /> Share Protected Link
          </button>
          <button className="btn-primary" onClick={handleDownloadReportText} style={{ gap: 6 }}>
            <Download size={14} /> Download Full Report
          </button>
        </div>

        <SecureExportDialog
          open={Boolean(secureDialogMode)}
          mode={secureDialogMode}
          data={uploadedData}
          onClose={() => setSecureDialogMode(null)}
        />
      </main>
    </div>
  );
}
