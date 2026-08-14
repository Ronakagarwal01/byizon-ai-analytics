import { useState, useRef, useEffect, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import KPICard from '../components/KPICard';
import SecureExportDialog from '../components/SecureExportDialog';
import { useData } from '../context/DataContext';
import { recomputeFilteredKPIs } from '../api/analyticsEngine';
import { askDataChat } from '../api/huggingface';
import { getAutoWebsiteStatus, refreshConnectedSource } from '../api/universalBackend';
import { useChartTheme } from '../utils/chartTheme';
import * as XLSX from 'xlsx';
import {
  LineChart, Line,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  DollarSign, ShoppingCart, TrendingUp, TrendingDown, Users, BarChart2,
  Download, RefreshCw, FileSpreadsheet,
  Sparkles, AlertTriangle, CheckCircle2, Target, Send, Zap, Loader2,
  Filter, ChevronLeft, ChevronRight, ChevronDown, DownloadCloud,
  Activity, Copy, RotateCcw, Square, PanelBottomClose, PanelBottomOpen,
  ExternalLink, Globe2, LockKeyhole
} from 'lucide-react';
import { Link } from 'react-router-dom';

const VISUAL_COLORS = ['#a8552f', '#2f9e68', '#e67e22', '#7c5ce5', '#d94f5c', '#2878c8'];
const POSITIVE_CHART_COLOR = '#2f9e68';
const WARNING_CHART_COLOR = '#e67e22';
const SOFT_CHART_COLOR = '#7c5ce5';
const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};
const DEFAULT_DASHBOARD_QUALITY = { completeness: 0, quality: 0 };
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

function SummaryList({ title, items, mode = 'value' }) {
  if (!items?.length) return null;
  return (
    <div style={{ padding: 16, background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.rank}. {item.name}
            </span>
            <strong style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {mode === 'count' ? `${item.count.toLocaleString('en-IN')} records` : item.value}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatShortNumber(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(1)}cr`;
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatCurrencyTooltip(value) {
  return `â‚¹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function toValueChartData(items = [], valueKey = 'rawValue') {
  return items.map(item => ({
    name: item.name,
    value: Number(item[valueKey] ?? item.count ?? 0),
    label: item.value || (item.count !== undefined ? `${item.count.toLocaleString('en-IN')} records` : ''),
  }));
}

function formatInsightNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  if (Math.abs(number) >= 10000000) return `${(number / 10000000).toFixed(1)}Cr`;
  if (Math.abs(number) >= 100000) return `${(number / 100000).toFixed(1)}L`;
  if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return number % 1 === 0 ? number.toLocaleString('en-IN') : number.toFixed(2);
}

function cleanUserWarning(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value
    .replace(/Review anomalies:/i, 'Review data quality:')
    .replace(/critical/gi, 'high priority')
    .replace(/warning-level groups?/gi, 'items')
    .replace(/Validation Engine/gi, 'Data check')
    .replace(/\s+/g, ' ');
}

function dashboardDisplayTitle(uploadedData) {
  const type = uploadedData?.datasetType || uploadedData?.businessDomain || 'Business';
  if (/sales|revenue/i.test(type)) return 'Sales Dashboard';
  if (/support|ticket|customer/i.test(type)) return 'Customer Support Dashboard';
  if (/finance|profit|expense/i.test(type)) return 'Financial Performance Dashboard';
  if (/event|time series/i.test(type)) return 'Trend Analysis Dashboard';
  return `${type} Dashboard`;
}

function makeChartTakeaway(chart, data = []) {
  const points = data
    .map(item => ({
      name: String(item.name ?? item.x ?? item.column ?? item.y ?? 'Unknown'),
      value: numericChartValue(item),
    }))
    .filter(item => Number.isFinite(item.value));

  if (!points.length) {
    return 'Key takeaway: Is chart ke liye abhi enough measurable values nahi mile; upload/mapping ke baad signal stronger dikhega.';
  }

  const sorted = [...points].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const second = sorted[1];
  const low = sorted[sorted.length - 1];
  const total = points.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const topShare = total > 0 ? Math.round((Math.max(0, top.value) / total) * 100) : 0;
  const title = String(chart?.title || '').toLowerCase();
  const type = String(chart?.type || '').toLowerCase();

  if (type === 'heatmap' || title.includes('correlation')) {
    return `Key takeaway: Strongest relationship ${top.name} me dikh raha hai (${formatInsightNumber(top.value)}), is pair ko deeper analysis me priority do.`;
  }

  if (title.includes('distribution')) {
    return `Key takeaway: Highest concentration ${top.name} bucket me hai (${formatInsightNumber(top.value)} records), yahi dataset ka main cluster dikhata hai.`;
  }

  if (title.includes('outlier') || title.includes('anomal')) {
    return `Key takeaway: Sabse bada unusual signal ${top.name} par hai (${formatInsightNumber(top.value)}), isko validation/risk review me pehle check karo.`;
  }

  if (points.length === 1) {
    return `Key takeaway: ${top.name} ka value ${formatInsightNumber(top.value)} hai — abhi ye single measurable signal chart me aa raha hai.`;
  }

  const comparison = second
    ? `${second.name} (${formatInsightNumber(second.value)}) se compare karke gap samjho.`
    : `${low.name} lowest point hai.`;
  return `Key takeaway: ${top.name} lead kar raha hai ${formatInsightNumber(top.value)} ke saath${topShare ? ` (~${topShare}% visible share)` : ''}. ${comparison}`;
}

function makeTrendTakeaway(sourceTitle, data = []) {
  const points = data
    .map(item => ({ name: String(item.name ?? item.x ?? 'Point'), value: numericChartValue(item) }))
    .filter(item => Number.isFinite(item.value));
  if (points.length < 2) return `Key takeaway: ${sourceTitle} me trend line ke liye abhi enough points nahi hain.`;
  const first = points[0];
  const last = points[points.length - 1];
  const direction = last.value >= first.value ? 'upward' : 'downward';
  const change = first.value ? Math.round(((last.value - first.value) / Math.abs(first.value)) * 100) : 0;
  const peak = [...points].sort((a, b) => b.value - a.value)[0];
  return `Key takeaway: Trend ${first.name} se ${last.name} tak ${direction} move kar raha hai${Number.isFinite(change) ? ` (${change}% change)` : ''}. Peak ${peak.name} par ${formatInsightNumber(peak.value)} hai.`;
}

function makeTrendChartFromSource(chart, index) {
  const data = (chart?.data || [])
    .slice(0, 12)
    .map(item => ({
      ...item,
      name: String(item.name ?? item.x ?? item.column ?? item.y ?? `Point ${index + 1}`),
      numericValue: numericChartValue(item),
    }))
    .filter(item => Number.isFinite(item.numericValue));

  if (data.length < 3) return null;

  return {
    id: `trend-${chart.id || chart.title || index}`,
    type: 'line',
    title: `${chart.title || 'Metric'} Trend Line`,
    description: 'Line chart showing movement across visible data points',
    data,
    takeaway: makeTrendTakeaway(chart.title || 'this metric', data),
  };
}

function getAnomalySeverity(anomaly) {
  if (typeof anomaly === 'string') return 'Warning';
  return anomaly?.severity || 'Info';
}

function VisualChartCard({ id, title, subtitle, children, onExport, takeaway }) {
  return (
    <div className="chart-card visual-polished-card" id={id}>
      <div className="chart-card-header">
        <div>
          <div className="chart-card-title">{title}</div>
          <div className="chart-card-subtitle">{subtitle}</div>
        </div>
        {onExport && (
          <button className="btn-outline" onClick={() => onExport(id)} style={{ fontSize: 11, padding: '4px 8px' }}>
            <DownloadCloud size={12} /> PNG
          </button>
        )}
      </div>
      {children}
      {takeaway && (
        <div className="chart-takeaway">
          <Sparkles size={15} />
          <span>{takeaway}</span>
        </div>
      )}
    </div>
  );
}

function numericChartValue(item) {
  const candidates = [item.rawValue, item.value, item.count, item.revenue, item.sales, item.profit];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function UniversalChart({ chart, index }) {
  const chartTheme = useChartTheme();
  const chartColor = VISUAL_COLORS[index % VISUAL_COLORS.length];
  const chartColorSoft = VISUAL_COLORS[(index + 2) % VISUAL_COLORS.length];
  const gradientId = `visual-gradient-${index}`;
  const data = (chart.data || []).slice(0, 30).map(item => ({
    ...item,
    name: String(item.name ?? item.x ?? item.column ?? item.y ?? `Item ${index + 1}`),
    numericValue: numericChartValue(item),
  }));
  if (!data.length) return null;
  const takeaway = chart.takeaway || chart.insight || makeChartTakeaway(chart, data);

  if (chart.type === 'heatmap') {
    const cells = data.slice(0, 80);
    return (
      <VisualChartCard id={`auto-chart-${index}`} title={chart.title} subtitle={chart.description || 'Calculated from numeric columns'} takeaway={takeaway}>
        <div className="mini-heatmap-grid">
          {cells.map((cell, i) => {
            const intensity = Math.min(1, Math.abs(Number(cell.value || 0)));
            const color = VISUAL_COLORS[i % VISUAL_COLORS.length];
            return (
              <div key={`${cell.x}-${cell.y}-${i}`} title={`${cell.x} vs ${cell.y}: ${cell.value}`} style={{
                '--heatmap-color': color,
                '--heatmap-alpha': 0.10 + intensity * 0.42,
              }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell.x}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{cell.y}</div>
                <strong>{Number(cell.value || 0).toFixed(2)}</strong>
              </div>
            );
          })}
        </div>
      </VisualChartCard>
    );
  }

  if (chart.type === 'line') {
    return (
      <VisualChartCard id={`auto-chart-${index}`} title={chart.title} subtitle={chart.description || 'Trend'} takeaway={takeaway}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 30 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={chartColor} />
                <stop offset="100%" stopColor={chartColorSoft} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={58} />
            <YAxis tick={chartTheme.mutedTick} axisLine={false} tickLine={false} tickFormatter={formatShortNumber} />
            <Tooltip contentStyle={chartTheme.tooltip} formatter={(value) => [formatCurrencyTooltip(value), 'Value']} />
            <Line type="monotone" dataKey="numericValue" stroke={`url(#${gradientId})`} strokeWidth={3} dot={{ r: 4, fill: chartColor, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7 }} />
          </LineChart>
        </ResponsiveContainer>
      </VisualChartCard>
    );
  }

  if (chart.type === 'pie' || chart.type === 'donut') {
    return (
      <VisualChartCard id={`auto-chart-${index}`} title={chart.title} subtitle={chart.description || 'Distribution'} takeaway={takeaway}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={data.slice(0, 10)} dataKey="numericValue" nameKey="name" innerRadius={chart.type === 'donut' ? 48 : 0} outerRadius={86} paddingAngle={2}>
              {data.slice(0, 10).map((entry, i) => (
                <Cell key={entry.name} fill={VISUAL_COLORS[i % VISUAL_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={chartTheme.tooltip} formatter={(value) => [Number(value || 0).toLocaleString('en-IN'), 'Value']} />
            <Legend verticalAlign="bottom" height={44} wrapperStyle={chartTheme.legend} />
          </PieChart>
        </ResponsiveContainer>
      </VisualChartCard>
    );
  }

  return (
    <VisualChartCard id={`auto-chart-${index}`} title={chart.title} subtitle={chart.description || 'Auto-generated chart'} takeaway={takeaway}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data.slice(0, 12)} margin={{ top: 8, right: 12, left: 0, bottom: 42 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColor} stopOpacity={0.96} />
              <stop offset="100%" stopColor={chartColorSoft} stopOpacity={0.78} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
          <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={66} />
          <YAxis tick={chartTheme.mutedTick} axisLine={false} tickLine={false} tickFormatter={formatShortNumber} />
          <Tooltip contentStyle={chartTheme.tooltip} formatter={(value) => [Number(value || 0).toLocaleString('en-IN'), 'Value']} />
          <Bar dataKey="numericValue" name="Value" fill={`url(#${gradientId})`} radius={[10, 10, 3, 3]}>
            {data.slice(0, 12).map((entry, i) => (
              <Cell key={`${entry.name}-${i}`} fill={chartColor} opacity={Math.max(0.58, 0.96 - i * 0.03)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </VisualChartCard>
  );
}

export default function Dashboard() {
  const { uploadedData, setUploadedData } = useData();
  const chartTheme = useChartTheme();
  const [activeTab, setActiveTab] = useState('overview'); // overview | visuals | quality | drilldown | anomalies
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilters, setActiveFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [anomalyFilter, setAnomalyFilter] = useState('All'); // All | Critical | Warning | Info
  const [debugMode, setDebugMode] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [secureDialogMode, setSecureDialogMode] = useState(null);
  const [autoWebsite, setAutoWebsite] = useState(uploadedData?.autoWebsite || { status: 'queued' });
  const [copiedWebsiteField, setCopiedWebsiteField] = useState('');
  const rowsPerPage = 10;
  const analyticsDataset = uploadedData?.analyticsDataset || null;
  const dashboardDataset = analyticsDataset?.dashboard || EMPTY_OBJECT;
  const analyticsSourceLocked = Boolean(analyticsDataset);
  const dashboardRows = dashboardDataset.rows || uploadedData?.rows || EMPTY_ARRAY;
  const dashboardColumns = dashboardDataset.columns || uploadedData?.columns || EMPTY_ARRAY;
  const dashboardCharts = dashboardDataset.charts || uploadedData?.charts || EMPTY_ARRAY;
  const dashboardQuality = dashboardDataset.dataQuality || uploadedData?.dataQuality || DEFAULT_DASHBOARD_QUALITY;
  const analyticsDashboardPlan = dashboardDataset.dashboardPlan || uploadedData?.dashboardPlan || uploadedData?.dashboard_plan || EMPTY_OBJECT;

  // Collapsed states for Drill Down view
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedProducts, setExpandedProducts] = useState({});
  const [expandedCustomers, setExpandedCustomers] = useState({});

  // Reset tab and filters when a new file is uploaded
  useEffect(() => {
    setActiveTab('overview');
    setActiveFilters({});
    setSearchQuery('');
    setCurrentPage(1);
    setExpandedCategories({});
    setExpandedProducts({});
    setExpandedCustomers({});
  }, [uploadedData?.fileName]);

  useEffect(() => {
    const sessionId = uploadedData?.sessionId;
    if (!sessionId) return undefined;
    let cancelled = false;
    let timer;
    const passwordKey = `byizon:auto-website-password:${sessionId}`;
    const savedPassword = sessionStorage.getItem(passwordKey) || '';
    setAutoWebsite({ ...(uploadedData.autoWebsite || { status: 'queued' }), ...(savedPassword ? { password: savedPassword } : {}) });

    const poll = async () => {
      try {
        const website = await getAutoWebsiteStatus(sessionId);
        if (cancelled) return;
        if (website.password) sessionStorage.setItem(passwordKey, website.password);
        const password = website.password || sessionStorage.getItem(passwordKey) || '';
        setAutoWebsite({ ...website, ...(password ? { password } : {}) });
        if (!['error'].includes(website.status) && (website.status !== 'ready' || !password)) timer = window.setTimeout(poll, 1600);
      } catch {
        if (!cancelled) timer = window.setTimeout(poll, 2400);
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [uploadedData?.sessionId]);

  const copyWebsiteValue = async (field, value) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedWebsiteField(field);
    window.setTimeout(() => setCopiedWebsiteField(current => current === field ? '' : current), 1800);
  };

  // Hook Ctrl+Shift+D for Developer Debug mode toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDebugMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Pre-render Validation Engine warnings check
  const validationWarnings = useMemo(() => {
    if (!uploadedData) return [];
    const warnings = [];
    const dataQuality = dashboardQuality || { completeness: 100, quality: 100, duplicatesCount: 0 };
    const anomalies = uploadedData.anomalies || [];
    const rowCount = uploadedData.rowCount || 1;

    if ((dataQuality.completeness || 100) < 60) {
      warnings.push(`Low Data Completeness: Only ${dataQuality.completeness}% of cells are filled. Results may be statistically biased.`);
    }

    const dupCount = dataQuality.duplicatesCount || 0;
    if (dupCount > 0 && rowCount > 0 && dupCount / rowCount > 0.15) {
      warnings.push(`High Duplicate Rate: ${dupCount.toLocaleString()} duplicate records detected (${((dupCount / rowCount) * 100).toFixed(1)}% of rows).`);
    }

    const criticalAnomalies = anomalies.filter(a => a.severity === 'Critical').length;
    const warningAnomalies = anomalies.filter(a => a.severity === 'Warning').length;
    if (criticalAnomalies > 0 || warningAnomalies > Math.max(50, rowCount * 0.15)) {
      warnings.push(`Review anomalies: ${criticalAnomalies} critical and ${warningAnomalies} warning-level groups detected.`);
    }

    return warnings;
  }, [uploadedData, dashboardQuality]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (!uploadedData?.connectedSource) return;
      const result = await refreshConnectedSource(uploadedData.connectedSource, uploadedData.sessionId);
      if (result.clearActiveAnalysis || !result.valid) {
        setUploadedData(null);
        return;
      }
      if (result.analysis) {
        setUploadedData({ ...result.analysis, sessionId: result.sessionId || result.analysis.sessionId });
      }
    } catch (error) {
      console.warn('[Dashboard] connected source refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleExportCSV = () => {
    if (!filteredRows || filteredRows.length === 0) return;
    setShowExportMenu(false);
    
    const headers = dashboardColumns;
    const csvContent = [
      headers.join(','),
      ...filteredRows.map(row => 
        headers.map(header => {
          const val = String(row[header] ?? '').replace(/"/g, '""');
          return (val.includes(',') || val.includes('\n') || val.includes('\r') || val.includes('"'))
            ? `"${val}"` : val;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dsi_export_${uploadedData.fileName || 'data.csv'}`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (!filteredRows || filteredRows.length === 0) return;
    setShowExportMenu(false);
    
    const worksheet = XLSX.utils.json_to_sheet(filteredRows.map(r => {
      const rest = { ...r };
      delete rest._fileName;
      return rest;
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `dsi_export_${uploadedData.fileName || 'data'}.xlsx`);
  };

  const exportChartAsPNG = (chartId, fileName) => {
    const chartContainer = document.getElementById(chartId);
    const svgElement = chartContainer?.querySelector('svg');
    if (!svgElement) return;

    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);
    
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svgElement.clientWidth * 2;
      canvas.height = svgElement.clientHeight * 2;
      const context = canvas.getContext('2d');
      
      context.fillStyle = '#ffffff'; 
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(2, 2);
      context.drawImage(image, 0, 0, svgElement.clientWidth, svgElement.clientHeight);
      
      const png = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = png;
      downloadLink.download = `${fileName}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };
    image.src = blobURL;
  };

  // Mappings are handled automatically by the smart detection engine

  // Auto-filter columns â€” provided by the Analytics Engine in analyticsResult
  const autoFilterColumns = useMemo(() => {
    return uploadedData?.autoFilterColumns || [];
  }, [uploadedData]);

  // Compute filtered rows (includes search query match)
  const filteredRows = useMemo(() => {
    if (!uploadedData || !dashboardRows.length) return [];
    return dashboardRows.filter(row => {
      // 1. Matches filter select inputs
      const matchFilters = Object.entries(activeFilters).every(([col, val]) => {
        if (!val || val === '') return true;
        return String(row[col] ?? '').trim() === val;
      });

      // 2. Matches search text queries
      const matchSearch = searchQuery === '' || Object.values(row).some(cell =>
        String(cell ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      );

      return matchFilters && matchSearch;
    });
  }, [uploadedData, dashboardRows, activeFilters, searchQuery]);

  // Metrics remain locked to the backend analytics dataset. Legacy browser-only
  // uploads can still use the old local recompute path for backward compatibility.
  const filteredKPIs = useMemo(() => {
    if (analyticsSourceLocked) return dashboardDataset.kpis || uploadedData?.kpis || [];
    if (!uploadedData || !uploadedData._kpiList) return uploadedData?.kpis || [];
    return recomputeFilteredKPIs(filteredRows, uploadedData);
  }, [analyticsSourceLocked, dashboardDataset.kpis, uploadedData, filteredRows]);

  const activeKPIs = filteredKPIs;
  const dashboardPlan = analyticsDashboardPlan;
  const plannedSections = dashboardPlan.main_story_sections || [];
  const plannedInsights = dashboardPlan.insights || [];
  const skippedColumns = dashboardPlan.skipped_columns || [];
  const dataSciencePlots = uploadedData?.dataScience?.visualizations?.plots || [];
  const mappedCols = useMemo(
    () => uploadedData?.columnRoles || uploadedData?.mappedCols || {},
    [uploadedData?.columnRoles, uploadedData?.mappedCols]
  );
  const dataQuality = dashboardQuality;
  const allAnomalies = useMemo(() => uploadedData?.anomalies || [], [uploadedData?.anomalies]);
  const actionableAnomalies = useMemo(
    () => allAnomalies.filter(a => getAnomalySeverity(a) !== 'Info'),
    [allAnomalies]
  );
  const infoAnomalies = useMemo(
    () => allAnomalies.filter(a => getAnomalySeverity(a) === 'Info'),
    [allAnomalies]
  );
  const businessSummary = uploadedData?.businessSummary;
  const primaryTableProfile = useMemo(() => {
    const profiles = uploadedData?.tableProfiles || [];
    return profiles.find(profile => profile.name === uploadedData?.primaryTable) || profiles[0] || null;
  }, [uploadedData?.tableProfiles, uploadedData?.primaryTable]);
  const qualityAuditRows = useMemo(() => {
    if (primaryTableProfile?.columns?.length) {
      const total = primaryTableProfile.rowCount || uploadedData?.rowCount || 0;
      return primaryTableProfile.columns.map(col => ({
        role: col.role || '-',
        name: col.name,
        type: col.detectedType || 'unknown',
        total,
        populated: Math.max(0, total - (col.missingCount || 0)),
        empty: col.missingCount || 0,
        completeness: ((1 - (col.missingRate || 0)) * 100).toFixed(1),
        unique: col.uniqueCount ?? 0,
      }));
    }

    return Object.entries(mappedCols)
      .filter(([, colName]) => colName)
      .map(([role, colName]) => {
        const total = uploadedData?.rows?.length || 0;
        const filled = (uploadedData?.rows || []).filter(row => (
          row[colName] !== undefined && row[colName] !== null && row[colName] !== ''
        )).length;
        return {
          role,
          name: colName,
          type: 'mapped',
          total,
          populated: filled,
          empty: total - filled,
          completeness: total > 0 ? ((filled / total) * 100).toFixed(1) : '0.0',
          unique: new Set((uploadedData?.rows || []).map(row => String(row[colName] ?? '').trim()).filter(Boolean)).size,
        };
      });
  }, [primaryTableProfile, uploadedData?.rowCount, uploadedData?.rows, mappedCols]);
  const visualCharts = useMemo(() => {
    if (!businessSummary) {
      return {
        regions: [],
        categories: [],
        reps: [],
        products: [],
        payments: [],
        categoryProfitability: [],
        marginByCategory: [],
      };
    }

    const profitability = businessSummary.categoryProfitability || [];
    return {
      regions: toValueChartData(businessSummary.regionWise),
      categories: toValueChartData(businessSummary.categoryWise),
      reps: toValueChartData(businessSummary.topSalesReps),
      products: toValueChartData(businessSummary.topProducts),
      payments: toValueChartData(businessSummary.paymentModes),
      categoryProfitability: profitability.map(item => ({
        name: item.name,
        sales: Number(item.salesRaw || 0),
        profit: Number(item.profitRaw || 0),
        margin: Number(item.margin || 0),
      })),
      marginByCategory: profitability
        .filter(item => item.margin !== null && item.margin !== undefined)
        .map(item => ({ name: item.name, value: Number(item.margin || 0) })),
    };
  }, [businessSummary]);

  const visualTrendCharts = useMemo(() => {
    const sourceCharts = (dashboardCharts || [])
      .filter(chart => chart?.type !== 'line' && chart?.type !== 'pie' && chart?.type !== 'donut' && chart?.type !== 'heatmap')
      .map((chart, index) => makeTrendChartFromSource(chart, index))
      .filter(Boolean)
      .slice(0, 3);

    if (sourceCharts.length > 0) return sourceCharts;

    const fallbackSources = [
      { title: businessSummary?.salesLabel ? `${businessSummary.salesLabel} by Region` : 'Region Performance', data: visualCharts.regions },
      { title: businessSummary?.salesLabel ? `${businessSummary.salesLabel} by Category` : 'Category Performance', data: visualCharts.categories },
      { title: 'Profit Margin by Category', data: visualCharts.marginByCategory },
    ];

    return fallbackSources
      .map((chart, index) => makeTrendChartFromSource(chart, index))
      .filter(Boolean)
      .slice(0, 2);
  }, [businessSummary?.salesLabel, dashboardCharts, visualCharts.categories, visualCharts.marginByCategory, visualCharts.regions]);

  const totalPages = Math.ceil((filteredRows || []).length / rowsPerPage);
  const paginatedRows = (filteredRows || []).slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Filtered Anomaly logs
  const filteredAnomalies = useMemo(() => {
    return allAnomalies.filter(a => {
      const severity = getAnomalySeverity(a);
      if (anomalyFilter === 'All') return severity !== 'Info';
      return severity === anomalyFilter;
    });
  }, [allAnomalies, anomalyFilter]);


  const cleanNumber = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  // Collapsible Categories tree grouped calculations
  const drillDownCategories = useMemo(() => {
    if (!uploadedData || !filteredRows.length) return [];
    const catCol = mappedCols.category;
    const prodCol = mappedCols.product;
    const custCol = mappedCols.customer;
    const metricCol = mappedCols.metric;

    if (!catCol) return [];

    const cats = {};
    filteredRows.forEach(row => {
      const cat = String(row[catCol] || 'Unknown');
      const prod = prodCol ? String(row[prodCol] || 'Unknown Product') : 'All Products';
      const cust = custCol ? String(row[custCol] || 'Anonymous Customer') : 'All Customers';
      const val = metricCol ? cleanNumber(row[metricCol]) : 1;

      if (!cats[cat]) cats[cat] = { name: cat, total: 0, products: {} };
      cats[cat].total += val;

      if (!cats[cat].products[prod]) cats[cat].products[prod] = { name: prod, total: 0, customers: {} };
      cats[cat].products[prod].total += val;

      if (!cats[cat].products[prod].customers[cust]) cats[cat].products[prod].customers[cust] = { name: cust, total: 0, rows: [] };
      cats[cat].products[prod].customers[cust].total += val;
      cats[cat].products[prod].customers[cust].rows.push(row);
    });

    return Object.values(cats).sort((a,b) => b.total - a.total);
  }, [uploadedData, filteredRows, mappedCols]);

  if (!uploadedData) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content dashboard-page">
          <div className="page-header">
            <div>
              <h1 className="page-title">Analysis Workspace</h1>
              <p className="page-subtitle">No active analysis session is loaded.</p>
            </div>
          </div>

          <div className="empty-workspace-card">
            <FileSpreadsheet size={30} color="var(--blue-600)" />
            <h2>Start with a new upload</h2>
            <p>Page 2 only shows results from the current uploaded file. Upload a dataset to create a fresh isolated analysis session.</p>
            <Link to="/upload">
              <button className="btn-primary">Upload Dataset</button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Removed mapping editor render card

  // â”€â”€ Tab Renderers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content dashboard-page executive-dashboard">

        {uploadedData.analysisStatus === 'processing' && (
          <div className="dashboard-analysis-progress" role="status" aria-live="polite">
            <Loader2 size={16} className="pipeline-spinner-sm" />
            <div className="dashboard-analysis-progress-copy">
              <strong>Dashboard ready, advanced analysis is updating</strong>
              <span>{uploadedData.processing?.message || 'Preparing deeper insights and report...'}</span>
            </div>
            <div className="dashboard-analysis-progress-meter" aria-hidden="true">
              <i style={{ width: `${uploadedData.processing?.progress || 70}%` }} />
            </div>
            <b>{uploadedData.processing?.progress || 70}%</b>
          </div>
        )}

        {uploadedData.analysisStatus === 'failed' && (
          <div className="dashboard-analysis-progress is-warning" role="status">
            <AlertTriangle size={16} />
            <div className="dashboard-analysis-progress-copy">
              <strong>Quick dashboard is ready</strong>
              <span>Advanced analysis could not finish. Your uploaded data and current dashboard are still available.</span>
            </div>
          </div>
        )}

        {/* Validation Engine Warnings Banner (Fix #9) */}
        {validationWarnings.length > 0 && (
          <div className="validation-banner">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div className="validation-banner-content">
              <div className="validation-banner-title">Data checks need attention</div>
              <ul className="validation-banner-list">
                {validationWarnings.map((warn, index) => (
                  <li key={index}>{cleanUserWarning(warn)}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Protected live dashboard publishing */}
        <section className="dashboard-publish-panel">
          <div className="dashboard-publish-steps" aria-label="Protected dashboard publishing status">
            {[
              ['Reading dashboard', 'Data prepared', true],
              ['Creating live website', autoWebsite.status === 'ready' ? 'Stitch website ready' : 'Stitch is generating', autoWebsite.status === 'ready'],
              ['Optimizing access', autoWebsite.status === 'ready' ? 'Interactions enabled' : 'Wiring interactions', autoWebsite.status === 'ready'],
              ['Protecting dashboard', autoWebsite.status === 'ready' ? 'Password required' : 'Preparing security', autoWebsite.status === 'ready'],
              ['Ready to publish', autoWebsite.status === 'ready' ? 'Protected link ready' : autoWebsite.status === 'error' ? 'Generation failed' : 'Working automatically', autoWebsite.status === 'ready'],
            ].map(([label, status, complete]) => (
              <div className={`dashboard-publish-step ${complete ? 'complete' : 'current'}`} key={label}>
                {complete ? <CheckCircle2 size={16} /> : <Loader2 size={16} className={autoWebsite.status === 'error' ? '' : 'spin'} />}
                <span><strong>{label}</strong><small>{status}</small></span>
              </div>
            ))}
          </div>
          <div className="dashboard-publish-browser">
            {autoWebsite.status === 'ready' ? (
              <div className="dashboard-publish-credentials">
                <div className="dashboard-credential-field website-link-field">
                  <span>Website link</span>
                  <a href={autoWebsite.urlPath} target="_blank" rel="noreferrer">{`${window.location.origin}${autoWebsite.urlPath}`}</a>
                  <button onClick={() => copyWebsiteValue('link', `${window.location.origin}${autoWebsite.urlPath}`)} title="Copy website link">
                    {copiedWebsiteField === 'link' ? <><CheckCircle2 size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
                  </button>
                </div>
                <div className="dashboard-credential-field password-field">
                  <span>Password</span>
                  <code>{autoWebsite.password || 'Loading password...'}</code>
                  <button disabled={!autoWebsite.password} onClick={() => copyWebsiteValue('password', autoWebsite.password)} title="Copy website password">
                    {copiedWebsiteField === 'password' ? <><CheckCircle2 size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="dashboard-publish-building"><Loader2 className="spin" size={16} /> {autoWebsite.status === 'error' ? autoWebsite.error : 'Website link and password are being prepared automatically.'}</div>
            )}
          </div>
        </section>

        {/* Tab Buttons bar */}
        <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border-subtle)', marginBottom: 24, paddingBottom: 1 }}>
          {[
            { id: 'overview', label: 'Overview', icon: BarChart2 },
            { id: 'visuals', label: 'Insights', icon: Activity },
            { id: 'quality', label: 'Data Quality', icon: Activity },
            { id: 'drilldown', label: 'Drill Down', icon: Target },
            { id: 'anomalies', label: `Issues (${actionableAnomalies.length})`, icon: AlertTriangle },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                background: activeTab === t.id ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                color: activeTab === t.id ? 'var(--blue-400)' : 'var(--text-secondary)',
                borderBottom: activeTab === t.id ? '2px solid var(--blue-400)' : 'none',
                fontWeight: activeTab === t.id ? 700 : 500,
                fontSize: 13,
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                cursor: 'pointer',
                transition: 'var(--transition)'
              }}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Dynamic Global Filters (Overview & Drilldown only) */}
        {(activeTab === 'overview' || activeTab === 'drilldown') && (
          <div className="chart-card" style={{ padding: '16px 20px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--blue-400)', marginRight: 16 }}>
                <Filter size={15} />
                Filters
              </div>
              <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 200 }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search records..."
                  style={{
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6,
                    padding: '6px 12px',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    flex: 1
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(autoFilterColumns || []).slice(0, 4).map(f => (
                  <select
                    key={f.column}
                    value={activeFilters[f.column] || ''}
                    onChange={(e) => setActiveFilters(prev => ({ ...prev, [f.column]: e.target.value }))}
                    style={{
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      padding: '6px 12px',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      minWidth: 130
                    }}
                  >
                    <option value="">{f.column}</option>
                    {f.values.map(val => (
                      <option key={val} value={val}>{val}</option>
                    ))}
                  </select>
                ))}
                {(Object.keys(activeFilters).some(k => activeFilters[k]) || searchQuery) && (
                  <button
                    className="btn-outline"
                    onClick={() => { setActiveFilters({}); setSearchQuery(''); }}
                    style={{ fontSize: 11, padding: '4px 10px', height: 32, borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€ TAB CONTENT: OVERVIEW DASHBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'overview' && (
          <div className="animate-fadeIn">
            {(plannedSections.length > 0 || plannedInsights.length > 0 || skippedColumns.length > 0) && (
              <div className="report-section dashboard-technical-plan animate-fadeInUp" style={{ marginBottom: 24 }}>
                <div className="report-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Target size={18} color="var(--blue-400)" />
                  Adaptive Dashboard Story Plan
                </div>

                {plannedSections.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
                    {plannedSections.map(section => (
                      <div key={section.id} style={{ padding: '14px 16px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>{section.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{section.reason}</div>
                        {section.sourceColumns?.length > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--blue-400)', marginTop: 8 }}>
                            Source: {section.sourceColumns.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {plannedInsights.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                    {plannedInsights.slice(0, 4).map((insight, i) => (
                      <div key={`${insight.type}-${i}`} style={{ padding: 16, background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 900, marginBottom: 6 }}>
                          Priority Insight · {insight.confidence || 'Medium'} confidence
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 800, marginBottom: 8 }}>{insight.observation}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{insight.evidence}</div>
                      </div>
                    ))}
                  </div>
                )}

                {skippedColumns.length > 0 && (
                  <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{skippedColumns.length} columns skipped from KPI cards</strong>
                    <span> because they look like IDs, encoded categories, contact fields, high-cardinality text, or insufficient data.</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === '__legacy_summary' && businessSummary && (
              <div className="report-section animate-fadeInUp" style={{ marginBottom: 24 }}>
                <div className="report-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Target size={18} color="var(--blue-400)" />
                  Adaptive Data Summary ({businessSummary.salesLabel})
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {activeKPIs.slice(0, 4).map((kpi) => (
                    <div key={kpi.label} style={{ padding: '14px 16px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 6 }}>{kpi.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>{kpi.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                  <SummaryList title={`Segment breakdown${mappedCols.category ? ` by ${mappedCols.category}` : ''}`} items={businessSummary.categoryWise} />
                  <SummaryList title={`Count distribution${mappedCols.category ? ` by ${mappedCols.category}` : ''}`} items={businessSummary.paymentModes} mode="count" />
                </div>
              </div>
            )}

            {/* Dynamic Local/AI Executive Summary */}
            {typeof uploadedData.summary === 'string' && uploadedData.summary.trim() && (
              <div className="report-hero animate-fadeInUp" style={{ padding: '20px 24px', marginBottom: 24 }}>
                <div className="report-meta" style={{ marginBottom: 8 }}>
                  <span className="badge badge-blue"><Sparkles size={11} /> Executive Summary</span>
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' }}>
                  {uploadedData.summary}
                </p>
              </div>
            )}

            {/* Planner-selected dashboard charts */}
            {(dashboardCharts || []).length > 0 && (
              <div className="chart-grid">
                {(dashboardCharts || []).slice(0, 4).map((chart, chartIndex) => (
                  <UniversalChart key={chart.id || chart.title || chartIndex} chart={chart} index={chartIndex} />
                ))}
              </div>
            )}

            {(dashboardCharts || []).length === 0 && (
              <div className="chart-card" style={{ padding: 28, marginBottom: 24, color: 'var(--text-secondary)', textAlign: 'center' }}>
                No meaningful dashboard chart was selected because the dataset does not contain enough valid measures, dimensions, targets, or time columns.
              </div>
            )}


            {/* Paginated Data Preview Grid */}
            <div className="data-table-card">
              <div className="data-table-header">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Filtered Records Preview</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Showing {Math.min(filteredRows.length, (currentPage - 1) * rowsPerPage + 1)} to {Math.min(filteredRows.length, currentPage * rowsPerPage)} of {filteredRows.length.toLocaleString()} rows
                  </div>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {(dashboardColumns || []).slice(0, 7).map(c => <th key={c}>{c}</th>)}
                      {(dashboardColumns || []).length > 7 && <th>+{(dashboardColumns || []).length - 7} more</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, i) => (
                      <tr key={i}>
                        {(dashboardColumns || []).slice(0, 7).map((c, j) => (
                          <td key={c} style={j === 0 ? { fontWeight: 600, color: 'var(--text-primary)' } : {}}>
                            {String(row[c] ?? 'â€”').slice(0, 24)}
                          </td>
                        ))}
                        {dashboardColumns.length > 7 && <td style={{ color: 'var(--text-muted)' }}>â€¦</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 12, borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    className="btn-outline"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    style={{ padding: '6px 12px', opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                  </span>
                  <button
                    className="btn-outline"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    style={{ padding: '6px 12px', opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* â”€â”€ TAB CONTENT: VISUAL INSIGHTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'visuals' && (
          <div className="animate-fadeIn">
            {(dashboardCharts || []).length === 0 && dataSciencePlots.length === 0 ? (
              <div className="chart-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                No statistically supported charts were generated for this dataset.
              </div>
            ) : (
              <>
                <div className="report-section animate-fadeInUp" style={{ marginBottom: 24 }}>
                  <div className="report-section-title">
                    <BarChart2 size={18} color="var(--blue-400)" />
                    Auto-generated Visual Dashboard
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
                    Charts below use a focused premium palette and include key takeaways for quick business reading.
                  </p>
                </div>
                {visualTrendCharts.length > 0 && (
                  <div className="animate-fadeInUp" style={{ marginBottom: 24 }}>
                    <div className="report-section-title" style={{ marginBottom: 16 }}>
                      <Activity size={18} color="var(--blue-400)" />
                      Trend Line Insights
                    </div>
                    <div className="visual-trend-grid">
                      {visualTrendCharts.map((chart, chartIndex) => (
                        <UniversalChart key={chart.id || chart.title || chartIndex} chart={chart} index={chartIndex + 20} />
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 20 }}>
                  {(dashboardCharts || []).map((chart, chartIndex) => (
                    <UniversalChart key={chart.id || chart.title || chartIndex} chart={chart} index={chartIndex} />
                  ))}
                </div>
                {dataSciencePlots.length > 0 && (
                  <div className="animate-fadeInUp" style={{ marginTop: 24 }}>
                    <div className="report-section-title" style={{ marginBottom: 16 }}>
                      <Sparkles size={18} color="var(--blue-400)" />
                      AI Data Scientist Visual EDA
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 20 }}>
                      {dataSciencePlots.map((plot, plotIndex) => (
                        <div key={plot.id || plot.title || plotIndex} className="chart-card visual-polished-card">
                          <div className="chart-card-header">
                            <div>
                              <div className="chart-card-title">{plot.title}</div>
                              <div className="chart-card-subtitle">{plot.reason}</div>
                            </div>
                          </div>
                          <img
                            src={plot.image}
                            alt={plot.title}
                            style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)', background: '#fff' }}
                          />
                          <div className="chart-takeaway">
                            <Sparkles size={15} />
                            <span>Key takeaway: {plot.reason || 'Ye AI-generated visual dataset ke hidden pattern ko quickly samjhane ke liye banaya gaya hai.'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === '__legacy_visuals' && (
          <div className="animate-fadeIn">
            {!businessSummary ? (
              <div className="chart-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                Visual insights require mapped sales or profit columns in the uploaded dataset.
              </div>
            ) : (
              <>
                <div className="report-section animate-fadeInUp" style={{ marginBottom: 24 }}>
                  <div className="report-section-title">
                    <BarChart2 size={18} color="var(--blue-400)" />
                    Visual Insights ({businessSummary.salesLabel})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    {[
                      ['Top Region', visualCharts.regions[0]?.name || 'N/A', visualCharts.regions[0]?.label || ''],
                      ['Top Category', visualCharts.categories[0]?.name || 'N/A', visualCharts.categories[0]?.label || ''],
                      ['Top Product', visualCharts.products[0]?.name || 'N/A', visualCharts.products[0]?.label || ''],
                      ['Top Payment Mode', visualCharts.payments[0]?.name || 'N/A', visualCharts.payments[0]?.label || ''],
                    ].map(([label, name, value]) => (
                      <div key={label} style={{ padding: '14px 16px', background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 6 }}>{label}</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                        <div style={{ fontSize: 12, color: 'var(--blue-400)', marginTop: 3 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 20, marginBottom: 24 }}>
                  <VisualChartCard
                    id="visual-region-sales"
                    title={`Region-wise ${businessSummary.salesLabel}`}
                    subtitle="Geographic revenue concentration"
                    onExport={(chartId) => exportChartAsPNG(chartId, `${uploadedData.fileName}_${chartId}`)}
                  >
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={visualCharts.regions} margin={{ top: 8, right: 12, left: 0, bottom: 28 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                        <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                        <YAxis tick={chartTheme.mutedTick} axisLine={false} tickLine={false} tickFormatter={formatShortNumber} />
                        <Tooltip contentStyle={chartTheme.tooltip} formatter={(value) => [formatCurrencyTooltip(value), businessSummary.salesLabel]} />
                        <Bar dataKey="value" name={businessSummary.salesLabel} fill="var(--blue-500)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </VisualChartCard>

                  <VisualChartCard
                    id="visual-category-sales"
                    title={`Category-wise ${businessSummary.salesLabel}`}
                    subtitle="Category contribution ranking"
                    onExport={(chartId) => exportChartAsPNG(chartId, `${uploadedData.fileName}_${chartId}`)}
                  >
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={visualCharts.categories} margin={{ top: 8, right: 12, left: 0, bottom: 36 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                        <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={62} />
                        <YAxis tick={chartTheme.mutedTick} axisLine={false} tickLine={false} tickFormatter={formatShortNumber} />
                        <Tooltip contentStyle={chartTheme.tooltip} formatter={(value) => [formatCurrencyTooltip(value), businessSummary.salesLabel]} />
                        <Bar dataKey="value" name={businessSummary.salesLabel} fill={POSITIVE_CHART_COLOR} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </VisualChartCard>

                  <VisualChartCard
                    id="visual-top-products"
                    title="Top Products by Sales"
                    subtitle="Best-selling products by exact sales total"
                    onExport={(chartId) => exportChartAsPNG(chartId, `${uploadedData.fileName}_${chartId}`)}
                  >
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart layout="vertical" data={visualCharts.products} margin={{ top: 8, right: 12, left: 34, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                        <XAxis type="number" tick={chartTheme.mutedTick} axisLine={false} tickLine={false} tickFormatter={formatShortNumber} />
                        <YAxis type="category" dataKey="name" width={110} tick={chartTheme.tick} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={chartTheme.tooltip} formatter={(value) => [formatCurrencyTooltip(value), businessSummary.salesLabel]} />
                        <Bar dataKey="value" name={businessSummary.salesLabel} fill={WARNING_CHART_COLOR} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </VisualChartCard>

                  <VisualChartCard
                    id="visual-sales-reps"
                    title="Top Sales Reps"
                    subtitle="Sales rep contribution"
                    onExport={(chartId) => exportChartAsPNG(chartId, `${uploadedData.fileName}_${chartId}`)}
                  >
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart layout="vertical" data={visualCharts.reps} margin={{ top: 8, right: 12, left: 34, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                        <XAxis type="number" tick={chartTheme.mutedTick} axisLine={false} tickLine={false} tickFormatter={formatShortNumber} />
                        <YAxis type="category" dataKey="name" width={112} tick={chartTheme.tick} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={chartTheme.tooltip} formatter={(value) => [formatCurrencyTooltip(value), businessSummary.salesLabel]} />
                        <Bar dataKey="value" name={businessSummary.salesLabel} fill={SOFT_CHART_COLOR} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </VisualChartCard>

                  <VisualChartCard
                    id="visual-payment-mode"
                    title="Payment Mode Popularity"
                    subtitle="Order count distribution"
                    onExport={(chartId) => exportChartAsPNG(chartId, `${uploadedData.fileName}_${chartId}`)}
                  >
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={visualCharts.payments} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2}>
                          {visualCharts.payments.map((entry, index) => (
                            <Cell key={entry.name} fill={VISUAL_COLORS[index % VISUAL_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTheme.tooltip} formatter={(value) => [`${Number(value || 0).toLocaleString('en-IN')} orders`, 'Orders']} />
                        <Legend verticalAlign="bottom" height={44} wrapperStyle={chartTheme.legend} />
                      </PieChart>
                    </ResponsiveContainer>
                  </VisualChartCard>

                  {visualCharts.categoryProfitability.length > 0 && (
                    <VisualChartCard
                      id="visual-category-profitability"
                      title="Category Sales vs Profit"
                      subtitle="Profit contribution beside revenue"
                      onExport={(chartId) => exportChartAsPNG(chartId, `${uploadedData.fileName}_${chartId}`)}
                    >
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={visualCharts.categoryProfitability} margin={{ top: 8, right: 12, left: 0, bottom: 36 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                          <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={62} />
                          <YAxis tick={chartTheme.mutedTick} axisLine={false} tickLine={false} tickFormatter={formatShortNumber} />
                          <Tooltip contentStyle={chartTheme.tooltip} formatter={(value, name) => [formatCurrencyTooltip(value), name]} />
                          <Legend wrapperStyle={chartTheme.legend} />
                          <Bar dataKey="sales" name={businessSummary.salesLabel} fill="var(--blue-500)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="profit" name="Profit" fill={POSITIVE_CHART_COLOR} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </VisualChartCard>
                  )}

                  {visualCharts.marginByCategory.length > 0 && (
                    <VisualChartCard
                      id="visual-category-margin"
                      title="Profit Margin by Category"
                      subtitle="Hidden profitability signal"
                      onExport={(chartId) => exportChartAsPNG(chartId, `${uploadedData.fileName}_${chartId}`)}
                    >
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={visualCharts.marginByCategory} margin={{ top: 8, right: 12, left: 0, bottom: 36 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                          <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={62} />
                          <YAxis tick={chartTheme.mutedTick} axisLine={false} tickLine={false} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                          <Tooltip contentStyle={chartTheme.tooltip} formatter={(value) => [`${Number(value || 0).toFixed(1)}%`, 'Profit Margin']} />
                          <Bar dataKey="value" name="Profit Margin" fill={SOFT_CHART_COLOR} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </VisualChartCard>
                  )}
                </div>

                {(dashboardCharts || []).length > 0 && (
                  <div className="animate-fadeInUp" style={{ marginTop: 24 }}>
                    <div className="report-section-title" style={{ marginBottom: 16 }}>
                      <Activity size={18} color="var(--blue-400)" />
                      Auto-generated Charts
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 20 }}>
                      {(dashboardCharts || []).slice(0, 8).map((chart, chartIndex) => (
                        <UniversalChart key={chart.id || chart.title || chartIndex} chart={chart} index={chartIndex} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* â”€â”€ TAB CONTENT: DATA QUALITY DASHBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'quality' && (
          <div className="animate-fadeIn">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {/* Circular gauges card */}
              <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                <div style={{ display: 'flex', gap: 40, width: '100%', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--chart-grid)" strokeWidth="8" />
                        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--blue-400)" strokeWidth="8" strokeDasharray="314" strokeDashoffset={314 - (314 * dataQuality.completeness) / 100} transform="rotate(-90 60 60)" />
                      </svg>
                      <div style={{ position: 'absolute', fontSize: 20, fontWeight: 900 }}>{dataQuality.completeness}%</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: 'var(--text-secondary)' }}>Completeness Rate</div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--chart-grid)" strokeWidth="8" />
                        <circle cx="60" cy="60" r="50" fill="none" stroke={dataQuality.quality > 90 ? 'var(--success)' : dataQuality.quality > 70 ? 'var(--warning)' : 'var(--danger)'} strokeWidth="8" strokeDasharray="314" strokeDashoffset={314 - (314 * dataQuality.quality) / 100} transform="rotate(-90 60 60)" />
                      </svg>
                      <div style={{ position: 'absolute', fontSize: 20, fontWeight: 900 }}>{dataQuality.quality}%</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: 'var(--text-secondary)' }}>Data Quality Score</div>
                  </div>
                </div>
              </div>

              {/* Counters box */}
              <div className="chart-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Missing Cells', val: dataQuality.emptyCount, c: dataQuality.emptyCount > 0 ? 'var(--warning)' : 'var(--text-muted)' },
                  { label: 'Duplicate Rows', val: dataQuality.duplicatesCount, c: dataQuality.duplicatesCount > 0 ? 'var(--warning)' : 'var(--text-muted)' },
                  { label: 'Invalid Date cells', val: dataQuality.invalidDates, c: dataQuality.invalidDates > 0 ? 'var(--danger)' : 'var(--text-muted)' },
                  { label: 'Invalid Values', val: dataQuality.invalidValueCount || dataQuality.invalidDates || 0, c: (dataQuality.invalidValueCount || dataQuality.invalidDates || 0) > 0 ? 'var(--danger)' : 'var(--text-muted)' },
                  { label: 'Negative Numeric Values', val: dataQuality.negativeValues || 0, c: (dataQuality.negativeValues || 0) > 0 ? 'var(--danger)' : 'var(--text-muted)' },
                  { label: 'Zero Numeric Values', val: dataQuality.zeroValues || 0, c: (dataQuality.zeroValues || 0) > 0 ? '#fbbf24' : 'var(--text-muted)' },
                  { label: 'Outlier Values', val: dataQuality.outliersCount, c: dataQuality.outliersCount > 0 ? 'var(--blue-400)' : 'var(--text-muted)' }
                ].map((item, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{item.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: item.val > 0 ? item.c : 'var(--text-primary)', marginTop: 4 }}>
                      {(item.val ?? 0).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quality Audit Grid */}
            <div className="data-table-card">
              <div className="data-table-header">
                <div style={{ fontWeight: 700, fontSize: 15 }}>Column Profiling & Completeness Audit</div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mapped Role</th>
                    <th>Column</th>
                    <th>Detected Type</th>
                    <th>Row Count</th>
                    <th>Populated Cells</th>
                    <th>Empty Cells</th>
                    <th>Unique Values</th>
                    <th>Completeness %</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityAuditRows.map((row) => (
                    <tr key={`${row.role}-${row.name}`}>
                      <td style={{ textTransform: 'capitalize', fontWeight: 600, color: row.role === '-' ? 'var(--text-muted)' : 'var(--blue-400)' }}>{row.role}</td>
                      <td><strong>{row.name}</strong></td>
                      <td style={{ textTransform: 'capitalize' }}>{row.type}</td>
                      <td>{row.total.toLocaleString()}</td>
                      <td>{row.populated.toLocaleString()}</td>
                      <td>{row.empty.toLocaleString()}</td>
                      <td>{row.unique.toLocaleString()}</td>
                      <td>
                        <span style={{ color: parseFloat(row.completeness) > 95 ? 'var(--success)' : parseFloat(row.completeness) > 80 ? 'var(--warning)' : 'var(--danger)' }}>
                          {row.completeness}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* â”€â”€ TAB CONTENT: COLLAPSIBLE DRILL DOWN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'drilldown' && (
          <div className="animate-fadeIn chart-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--blue-400)', marginBottom: 20 }}>
              <Target size={16} />
              Interactive Hierarchy Drill Down
            </div>

            {!mappedCols.category ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                Drill down requires at least one detected categorical segment column.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {drillDownCategories.map(cat => {
                  const isCatExpanded = !!expandedCategories[cat.name];
                  return (
                    <div key={cat.name} style={{ background: 'var(--bg-glass-light)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                      {/* Level 1: Category */}
                      <div
                        onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.name]: !prev[cat.name] }))}
                        style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '14px 20px', cursor: 'pointer', background: 'rgba(255,255,255,0.01)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                          {isCatExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <span style={{ fontSize: 14, fontWeight: 700 }}>Segment: {cat.name}</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue-400)' }}>
                          {uploadedData.currencySymbol}{Math.round(cat.total).toLocaleString()}
                        </span>
                      </div>

                      {/* Level 2: Product */}
                      {isCatExpanded && (
                        <div style={{ padding: '4px 20px 12px 36px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-subtle)' }}>
                          {Object.values(cat.products).map(prod => {
                            const prodKey = `${cat.name}_${prod.name}`;
                            const isProdExpanded = !!expandedProducts[prodKey];
                            return (
                              <div key={prod.name} style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12 }}>
                                <div
                                  onClick={() => setExpandedProducts(prev => ({ ...prev, [prodKey]: !prev[prodKey] }))}
                                  style={{ display: 'flex', alignItems: 'center', padding: '8px 0', cursor: 'pointer' }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                                    {isProdExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    <span style={{ fontSize: 13, fontWeight: 600 }}>Sub-segment: {prod.name}</span>
                                  </div>
                                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {uploadedData.currencySymbol}{Math.round(prod.total).toLocaleString()}
                                  </span>
                                </div>

                                {/* Level 3: Customer */}
                                {isProdExpanded && (
                                  <div style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {Object.values(prod.customers).map(cust => {
                                      const custKey = `${prodKey}_${cust.name}`;
                                      const isCustExpanded = !!expandedCustomers[custKey];
                                      return (
                                        <div key={cust.name} style={{ borderLeft: '1px dotted var(--border-subtle)', paddingLeft: 12 }}>
                                          <div
                                            onClick={() => setExpandedCustomers(prev => ({ ...prev, [custKey]: !prev[custKey] }))}
                                            style={{ display: 'flex', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                                              {isCustExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Detail: {cust.name}</span>
                                            </div>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                              ({cust.rows.length} records) - {Math.round(cust.total).toLocaleString()}
                                            </span>
                                          </div>

                                          {/* Level 4: Individual Transaction details */}
                                          {isCustExpanded && (
                                            <div style={{ background: 'var(--bg-base)', padding: 10, borderRadius: 6, marginTop: 4, overflowX: 'auto' }}>
                                              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                                <thead>
                                                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                                                    {(dashboardColumns || []).slice(0, 5).map(h => (
                                                      <th key={h} style={{ textAlign: 'left', padding: '4px 8px' }}>{h}</th>
                                                    ))}
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {cust.rows.map((r, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                      {(dashboardColumns || []).slice(0, 5).map(h => (
                                                        <td key={h} style={{ padding: '4px 8px' }}>{String(r[h] ?? '')}</td>
                                                      ))}
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* â”€â”€ TAB CONTENT: ANOMALY TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {activeTab === 'anomalies' && (
          <div className="animate-fadeIn">
            {/* Filter buttons */}
            <div className="chart-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyBetween: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {['All', 'Critical', 'Warning', 'Info'].map(level => (
                  <button
                    key={level}
                    onClick={() => setAnomalyFilter(level)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      background: anomalyFilter === level ? 'var(--blue-600)' : 'var(--bg-glass-light)',
                      border: '1px solid var(--border-subtle)',
                      color: anomalyFilter === level ? 'white' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    {level === 'All' ? 'Actionable' : level}
                  </button>
                ))}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
                {anomalyFilter === 'All'
                  ? `Found ${filteredAnomalies.length} actionable anomalies`
                  : `Found ${filteredAnomalies.length} ${anomalyFilter.toLowerCase()} records`}
                {anomalyFilter === 'All' && infoAnomalies.length > 0 && (
                  <span style={{ marginLeft: 10, color: 'var(--blue-400)' }}>
                    {infoAnomalies.length} info highlights in Info filter
                  </span>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="data-table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Anomaly Mapped Type</th>
                    <th>Audit Description Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnomalies.length === 0 ? (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                        {anomalyFilter === 'All'
                          ? `No critical or warning anomalies found. ${infoAnomalies.length} high-value informational highlights are available in the Info filter.`
                          : 'No data anomalies matching active filter level.'}
                      </td>
                    </tr>
                  ) : (
                    filteredAnomalies.map((anom, index) => {
                      const severity = getAnomalySeverity(anom);
                      const type = typeof anom === 'string' ? 'Validation finding' : (anom.type || 'Statistical finding');
                      const description = typeof anom === 'string' ? anom : (anom.description || 'No description available.');
                      return (
                        <tr key={anom.id || `${severity}-${index}`}>
                          <td>
                            <span className={`badge ${severity === 'Critical' ? 'badge-red' : severity === 'Warning' ? 'badge-yellow' : 'badge-blue'}`}>
                              {severity}
                            </span>
                          </td>
                          <td><strong>{type}</strong></td>
                          <td style={{ color: 'var(--text-secondary)' }}>{description}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Developer Debug Mode Panel (Fix #8) */}
        {debugMode && (
          <div className="debug-panel animate-fadeIn">
            <div className="debug-panel-header">
              <span className="debug-panel-title">Developer Intelligence Panel</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hotkey: Ctrl + Shift + D</span>
            </div>
            <div className="debug-panel-grid">
              <div>
                <div className="debug-box-title">Schema Roles & Mappings</div>
                <div className="debug-box">
                  {JSON.stringify(uploadedData.columnRoles || {}, null, 2)}
                </div>
              </div>
              <div>
                <div className="debug-box-title">Validation Engine Output</div>
                <div className="debug-box">
                  {JSON.stringify(uploadedData.validationReport || {}, null, 2)}
                </div>
              </div>
              <div>
                <div className="debug-box-title">Data Profiler Metrics</div>
                <div className="debug-box">
                  {JSON.stringify(dataQuality || {}, null, 2)}
                </div>
              </div>
              <div>
                <div className="debug-box-title font-mono">Telemetry & Model Context</div>
                <div className="debug-box">
                  {JSON.stringify({
                    fileName: uploadedData.fileName,
                    datasetType: uploadedData.datasetType,
                    confidence: uploadedData.detectionConfidence,
                    modelUsed: uploadedData.model,
                    pipelineMs: uploadedData.pipelineRunMs,
                    analyticsDatasetId: analyticsDataset?.analyticsDatasetId,
                    totalKPIs: activeKPIs?.length,
                    totalCharts: dashboardCharts?.length
                  }, null, 2)}
                </div>
              </div>
            </div>
          </div>
        )}

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

function DashboardChatWidget({ data }) {
  const { analysisSession, setSessionChatHistory, setUploadedData } = useData();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const chatMessagesRef = useRef(null);
  const sessionId = data?.sessionId || analysisSession?.sessionId;
  const history = useMemo(() => analysisSession?.chatHistory || [], [analysisSession?.chatHistory]);

  const suggestions = useMemo(() => {
    const cols = data?.columns || [];
    const hasMissing = (data?.missingValueSummary || []).length > 0;
    const hasModel = data?.dataScience?.modelTraining?.trained;
    return [
      'Explain the most important finding',
      hasMissing ? 'Which columns have missing values?' : 'What is the data quality summary?',
      'What are the strongest relationships?',
      (data?.outlierSummary || []).length ? 'Show the most unusual records' : 'What risks exist in this dataset?',
      hasModel ? 'Which features are most important?' : 'What preprocessing is recommended?',
      cols.length ? `Explain column ${cols[0]}` : 'Summarize the report in simple language',
    ].filter(Boolean).slice(0, 6);
  }, [data]);

  const handleSend = async (txt = query) => {
    const activeText = txt.trim();
    if (!activeText || loading) return;
    setError('');
    
    const userMsg = { role: 'user', text: activeText };
    setSessionChatHistory(sessionId, prev => [...prev, userMsg]);
    setQuery('');
    setLoading(true);

    try {
      const response = await askDataChat(activeText, data, [...history, userMsg]);
      const reply = typeof response === 'string' ? response : response.answer;
      let replySessionId = sessionId;
      if (typeof response === 'object' && response.analysis) {
        const nextData = { ...response.analysis, sessionId: response.sessionId || response.analysis.sessionId };
        replySessionId = nextData.sessionId;
        setUploadedData(nextData);
      } else if (typeof response === 'object' && response.clearActiveAnalysis) {
        setUploadedData(null);
      }
      if (replySessionId) {
        setSessionChatHistory(replySessionId, prev => [...prev, { role: 'assistant', text: reply }]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const regenerateLast = () => {
    const lastUser = [...history].reverse().find(msg => msg.role === 'user');
    if (lastUser) handleSend(lastUser.text);
  };

  useEffect(() => {
    const messages = chatMessagesRef.current;
    if (messages) messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
  }, [history, loading, error]);

  return (
    <section className={`analysis-chat-dock ${collapsed ? 'is-collapsed' : ''}`} aria-label="Dataset chatbot">
      <div className="analysis-chat-header">
        <div className="analysis-chat-title">
          <strong>AI Data Assistant</strong>
          <span title={data?.fileName || 'current session'}>Grounded to {data?.fileName || 'current session'}</span>
        </div>
        <div className="analysis-chat-actions">
          {loading && (
            <button type="button" className="chat-tool-btn" onClick={() => setLoading(false)} title="Stop generation">
              <Square size={14} />
            </button>
          )}
          <button type="button" className="chat-tool-btn" onClick={regenerateLast} disabled={!history.some(m => m.role === 'user') || loading} title="Regenerate last answer">
            <RotateCcw size={14} />
          </button>
          <button type="button" className="chat-tool-btn" onClick={() => setCollapsed(v => !v)} title={collapsed ? 'Open chat' : 'Collapse chat'}>
            {collapsed ? <PanelBottomOpen size={15} /> : <PanelBottomClose size={15} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div ref={chatMessagesRef} className="analysis-chat-messages">
            {history.length === 0 && (
              <div className="analysis-chat-empty">
                <Zap size={22} color="var(--blue-600)" />
                <div>Ask questions about the current uploaded file, analysis, charts, preprocessing, or model results.</div>
                <div className="analysis-chat-suggestions">
                  {suggestions.map(hint => (
                    <button key={hint} className="chat-hint" onClick={() => handleSend(hint)} disabled={loading}>
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.map((msg, i) => (
              <div key={`${msg.role}-${i}`} className={`analysis-chat-row ${msg.role}`}>
                <div className="analysis-chat-bubble">
                  <div>{msg.text}</div>
                  {msg.role === 'assistant' && (
                    <button
                      type="button"
                      className="copy-response-btn"
                      onClick={() => navigator.clipboard?.writeText(msg.text)}
                      title="Copy response"
                    >
                      <Copy size={12} /> Copy
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="analysis-chat-row assistant">
                <div className="analysis-chat-bubble typing">
                  <Loader2 size={13} className="upload-spinner" />
                  Assistant is reading the current analysis...
                </div>
              </div>
            )}
            {error && (
              <div className="analysis-chat-error">
                <AlertTriangle size={14} />
                <span>{error}</span>
                <button type="button" onClick={regenerateLast}>Retry</button>
              </div>
            )}
          </div>

          <div className="analysis-chat-composer">
            <textarea
              className="analysis-chat-input"
              placeholder="Ask about this dataset..."
              value={query}
              rows={1}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading}
              aria-label="Ask a question about the current analysis"
            />
            <button className="analysis-chat-send" onClick={() => handleSend()} disabled={loading || !query.trim()} aria-label="Send message">
              {loading ? <Loader2 size={15} className="upload-spinner" /> : <Send size={15} />}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
