import { memo, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, FileText, Filter, Info, Search, Table2 } from 'lucide-react';

const CHART_COLORS = ['#2563eb', '#7c3aed', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444'];
const DEFAULT_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'summary', label: 'Summary' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'visuals', label: 'Visual Insights' },
  { id: 'charts', label: 'Charts' },
  { id: 'reports', label: 'Reports' },
];

function normalizeDashboard(config) {
  return config?.kind === 'byizon.dynamic-dashboard' ? config.dashboard : config?.dashboard || config || {};
}

function formatCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}

function applyFilters(rows, filters) {
  return rows.filter(row => Object.entries(filters).every(([key, value]) => !value || String(row[key] ?? '') === String(value)));
}

function inferWidgetSection(widget) {
  if (widget.section) return widget.section;
  const text = `${widget.title || ''} ${widget.description || ''} ${widget.chart?.type || ''}`.toLowerCase();
  if (widget.type === 'kpi') return text.includes('row') || text.includes('column') || text.includes('total') ? 'overview' : 'summary';
  if (widget.type === 'table') return 'reports';
  if (widget.type === 'text') return text.includes('report') || text.includes('recommend') || text.includes('risk') ? 'reports' : 'summary';
  if (text.includes('trend') || text.includes('profit') || text.includes('loss') || text.includes('sales') || text.includes('revenue')) return 'charts';
  if (text.includes('distribution') || text.includes('visual') || text.includes('momentum') || text.includes('category')) return 'visuals';
  return 'dashboard';
}

const KpiWidget = memo(function KpiWidget({ widget }) {
  const trend = String(widget.data?.trend || 'neutral').toLowerCase();
  const isUp = trend.includes('up') || trend.includes('positive') || trend.includes('increase');
  const isDown = trend.includes('down') || trend.includes('negative') || trend.includes('decrease');
  return (
    <article className={`dd-card dd-kpi dd-tone-${widget.style?.tone || 'primary'}`} aria-label={widget.accessibility?.label || widget.title}>
      <div className="dd-kpi-icon">{isDown ? <ArrowDownRight size={18} /> : isUp ? <ArrowUpRight size={18} /> : <Info size={18} />}</div>
      <span>{widget.title}</span>
      <strong>{formatCell(widget.data?.value)}</strong>
      <p>{widget.description}</p>
      <small>{widget.data?.trendValue || 'Live metric'}</small>
    </article>
  );
});

function ChartWidget({ widget }) {
  const chart = widget.chart || {};
  const data = Array.isArray(widget.data) ? widget.data : [];
  const type = chart.type || 'bar';
  const xKey = chart.xKey || chart.categoryKey || 'name';
  const yKey = chart.yKey || chart.valueKey || 'value';
  const common = {
    data,
    margin: { top: 14, right: 16, left: 0, bottom: 8 },
  };

  const axis = (
    <>
      <CartesianGrid stroke="var(--dd-grid)" strokeDasharray="3 3" />
      <XAxis dataKey={xKey} tick={{ fill: 'var(--dd-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--dd-border)' }} tickLine={false} />
      <YAxis tick={{ fill: 'var(--dd-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--dd-border)' }} tickLine={false} />
      <Tooltip contentStyle={{ background: 'var(--dd-surface-strong)', border: '1px solid var(--dd-border)', borderRadius: 14, color: 'var(--dd-text)' }} />
      {chart.showLegend && <Legend />}
    </>
  );

  return (
    <article className="dd-card dd-chart-card" aria-label={widget.accessibility?.label || widget.title}>
      <div className="dd-card-heading">
        <div>
          <span><BarChart3 size={15} /> {type.toUpperCase()}</span>
          <h3>{widget.title}</h3>
        </div>
        <p>{widget.description}</p>
      </div>
      <div className="dd-chart-shell">
        <ResponsiveContainer width="100%" height={300}>
          {type === 'line' ? (
            <LineChart {...common}>{axis}<Line type="monotone" dataKey={yKey} stroke="var(--dd-chart-1)" strokeWidth={3} dot={{ r: 3 }} /></LineChart>
          ) : type === 'area' ? (
            <AreaChart {...common}>{axis}<Area type="monotone" dataKey={yKey} stroke="var(--dd-chart-2)" fill="var(--dd-chart-soft)" strokeWidth={3} /></AreaChart>
          ) : type === 'pie' ? (
            <PieChart>
              <Tooltip contentStyle={{ background: 'var(--dd-surface-strong)', border: '1px solid var(--dd-border)', borderRadius: 14, color: 'var(--dd-text)' }} />
              <Pie data={data} dataKey={yKey} nameKey={xKey} outerRadius={105} innerRadius={58} paddingAngle={3}>
                {data.map((_, index) => <Cell key={`slice-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
              </Pie>
              <Legend />
            </PieChart>
          ) : (
            <BarChart {...common}>{axis}<Bar dataKey={yKey} radius={[10, 10, 0, 0]} fill="var(--dd-chart-1)" /></BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {widget.insight && <p className="dd-widget-insight">{widget.insight}</p>}
    </article>
  );
}

function TextWidget({ widget }) {
  const items = Array.isArray(widget.items) ? widget.items : [];
  return (
    <article className="dd-card dd-text-card">
      <div className="dd-card-heading">
        <div>
          <span><FileText size={15} /> REPORT</span>
          <h3>{widget.title}</h3>
        </div>
        <p>{widget.description}</p>
      </div>
      {widget.body && <p className="dd-text-body">{widget.body}</p>}
      {items.length > 0 && (
        <ul className="dd-text-list">
          {items.map((item, index) => (
            <li key={`${widget.id}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function TableWidget({ widget, activeFilters }) {
  const [page, setPage] = useState(1);
  const rows = useMemo(() => applyFilters(Array.isArray(widget.data) ? widget.data : [], activeFilters), [widget.data, activeFilters]);
  const columns = widget.table?.columns || Object.keys(rows[0] || {}).map(key => ({ key, label: key }));
  const pageSize = widget.table?.pagination?.pageSize || 12;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <article className="dd-card dd-table-card">
      <div className="dd-card-heading">
        <div>
          <span><Table2 size={15} /> TABLE</span>
          <h3>{widget.title}</h3>
        </div>
        <p>{widget.description}</p>
      </div>
      <div className="dd-table-wrap">
        <table>
          <thead>
            <tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={`${page}-${index}`}>
                {columns.map(column => <td key={column.key}>{formatCell(row[column.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="dd-pagination">
        <span>{rows.length.toLocaleString()} rows</span>
        <button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1}>Previous</button>
        <em>{page} / {pageCount}</em>
        <button onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>Next</button>
      </footer>
    </article>
  );
}

function InsightsPanel({ insights }) {
  if (!insights?.length) return null;
  return (
    <aside className="dd-insights">
      <span><AlertTriangle size={15} /> AI Insights</span>
      {insights.map(insight => (
        <article key={insight.id}>
          <strong>{insight.title}</strong>
          <p>{insight.body}</p>
        </article>
      ))}
    </aside>
  );
}

export default function DynamicDashboardRenderer({ config }) {
  const dashboard = normalizeDashboard(config);
  const widgets = Array.isArray(dashboard.widgets) ? dashboard.widgets : [];
  const filters = Array.isArray(dashboard.filters) ? dashboard.filters : [];
  const sections = Array.isArray(dashboard.sections) && dashboard.sections.length
    ? dashboard.sections
    : DEFAULT_SECTIONS;
  const [activeFilters, setActiveFilters] = useState({});
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState(sections[0]?.id || 'dashboard');
  const themeMode = dashboard.theme?.mode || 'light';
  const tokenStyle = {
    '--dd-primary': dashboard.theme?.tokens?.primary || '#2563eb',
    '--dd-radius': dashboard.theme?.tokens?.radius || '20px',
    '--dd-font': dashboard.theme?.tokens?.fontFamily || 'Inter, system-ui, sans-serif',
  };
  const filteredWidgets = widgets.filter(widget => {
    const matchesSearch = !search.trim() || `${widget.title} ${widget.description}`.toLowerCase().includes(search.toLowerCase());
    const matchesSection = inferWidgetSection(widget) === activeSection;
    return matchesSearch && matchesSection;
  });

  return (
    <main className={`dynamic-dashboard dd-${themeMode}`} style={tokenStyle}>
      <header className="dd-hero">
        <div>
          <span className="dd-kicker">JSON-driven dashboard</span>
          <h1>{dashboard.title || 'AI Dashboard'}</h1>
          <p>{dashboard.description}</p>
        </div>
        <div className="dd-source-card">
          <strong>{dashboard.source?.fileName || 'Uploaded dataset'}</strong>
          <span>{Number(dashboard.source?.rowCount || 0).toLocaleString()} rows · {Number(dashboard.source?.columnCount || 0).toLocaleString()} columns</span>
        </div>
      </header>

      <section className="dd-filter-bar" aria-label="Dashboard filters">
        <label className="dd-search">
          <Search size={15} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search widgets..." />
        </label>
        {filters.map(filter => (
          <label key={filter.id}>
            <Filter size={14} />
            <span>{filter.label}</span>
            <select value={activeFilters[filter.field] || ''} onChange={event => setActiveFilters(current => ({ ...current, [filter.field]: event.target.value }))}>
              <option value="">All</option>
              {(filter.options || []).map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
        {Object.values(activeFilters).some(Boolean) && <button onClick={() => setActiveFilters({})}>Clear filters</button>}
      </section>

      <nav className="dd-section-tabs" aria-label="Live dashboard sections">
        {sections.map(section => (
          <button
            key={section.id}
            className={section.id === activeSection ? 'active' : ''}
            type="button"
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <section className="dd-grid">
        {filteredWidgets.map(widget => {
          if (widget.type === 'kpi') return <KpiWidget key={widget.id} widget={widget} />;
          if (widget.type === 'chart') return <ChartWidget key={widget.id} widget={widget} />;
          if (widget.type === 'table') return <TableWidget key={widget.id} widget={widget} activeFilters={activeFilters} />;
          if (widget.type === 'text') return <TextWidget key={widget.id} widget={widget} />;
          return null;
        })}
      </section>

      <InsightsPanel insights={dashboard.insights} />
    </main>
  );
}
