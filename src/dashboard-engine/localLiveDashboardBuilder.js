const LOCAL_DASHBOARD_PREFIX = 'byizon.local.dashboard.';

const PALETTES = [
  { name: 'Warm Executive', primary: '#9a552f', accent: '#c98554', mode: 'light' },
  { name: 'Boardroom Sand', primary: '#7f3f1f', accent: '#d58624', mode: 'light' },
  { name: 'Copper Finance', primary: '#b86b3d', accent: '#2f9d62', mode: 'light' },
  { name: 'Noir Copper', primary: '#c98554', accent: '#e8b27d', mode: 'dark' },
  { name: 'Heritage Analytics', primary: '#8f4e2d', accent: '#c9483f', mode: 'light' },
];

function getDashboardPayload(uploadedData) {
  const analyticsDashboard = uploadedData?.analyticsDataset?.dashboard || {};
  return {
    fileName: uploadedData?.fileName || uploadedData?.name || analyticsDashboard?.source?.fileName || 'Uploaded dataset',
    rows: analyticsDashboard.rows || uploadedData?.rows || [],
    columns: analyticsDashboard.columns || uploadedData?.columns || [],
    kpis: analyticsDashboard.kpis || uploadedData?.kpis || [],
    charts: analyticsDashboard.charts || uploadedData?.charts || [],
    insights: uploadedData?.insightObjects || uploadedData?.insights || [],
    businessSummary: uploadedData?.businessSummary || analyticsDashboard.businessSummary || null,
    report: uploadedData?.report || null,
    trendData: uploadedData?.trendData || [],
    chartData: uploadedData?.chartData || [],
    dataQuality: uploadedData?.dataQuality || analyticsDashboard.dataQuality || {},
    datasetType: uploadedData?.datasetType || uploadedData?.businessDomain || 'Uploaded data',
    columnRoles: uploadedData?.columnRoles || uploadedData?.mappedCols || {},
  };
}

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value ?? '').replace(/[₹,$,%\s]/g, '');
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function pickColumns(rows, columns) {
  const keys = (columns?.length ? columns : Object.keys(rows[0] || {}))
    .map(column => (typeof column === 'string' ? column : column.key || column.name || column.label))
    .filter(Boolean);

  const numeric = [];
  const categorical = [];

  keys.forEach(key => {
    const sample = rows.slice(0, 250).map(row => row?.[key]).filter(value => value !== null && value !== undefined && value !== '');
    if (!sample.length) return;
    const numericCount = sample.filter(value => numericValue(value) !== null).length;
    const uniqueCount = new Set(sample.map(value => String(value).trim()).filter(Boolean)).size;
    if (numericCount / sample.length >= 0.65) {
      numeric.push(key);
    } else if (uniqueCount > 1 && uniqueCount <= Math.max(20, rows.length * 0.35)) {
      categorical.push(key);
    }
  });

  return { numeric, categorical, keys };
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 10000000) return `${(number / 10000000).toFixed(1)}Cr`;
  if (Math.abs(number) >= 100000) return `${(number / 100000).toFixed(1)}L`;
  if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return Number.isInteger(number) ? number.toLocaleString('en-IN') : number.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function aggregateByCategory(rows, categoryKey, valueKey, limit = 10) {
  const map = new Map();
  rows.forEach(row => {
    const name = String(row?.[categoryKey] ?? 'Unknown').trim() || 'Unknown';
    const value = valueKey ? numericValue(row?.[valueKey]) || 0 : 1;
    map.set(name, (map.get(name) || 0) + value);
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function buildTrend(rows, valueKey, limit = 14) {
  const values = rows
    .map((row, index) => ({ name: `P${index + 1}`, value: numericValue(row?.[valueKey]) }))
    .filter(item => item.value !== null)
    .slice(0, limit);
  return values.length >= 3 ? values : [];
}

function humanize(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function compactMetric(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const parsed = numericValue(value);
  return parsed === null ? String(value) : formatNumber(parsed);
}

function normalizeSummaryItems(items = [], limit = 8) {
  return items
    .slice(0, limit)
    .map((item, index) => {
      if (typeof item === 'string') return item;
      return item?.body || item?.text || item?.summary || item?.title || `Insight ${index + 1}`;
    })
    .filter(Boolean);
}

function toChartPoints(items = [], valueKey = 'rawValue', limit = 10) {
  return items
    .slice(0, limit)
    .map(item => ({
      name: String(item.name ?? item.label ?? item.category ?? item.x ?? 'Unknown'),
      value: Number(item[valueKey] ?? item.value ?? item.count ?? item.y ?? 0),
    }))
    .filter(item => Number.isFinite(item.value));
}

function columnByIntent(keys, patterns) {
  return keys.find(key => patterns.some(pattern => pattern.test(String(key).toLowerCase()))) || null;
}

function addChart(widgets, widget) {
  if (Array.isArray(widget.data) && widget.data.length) widgets.push(widget);
}

function hashText(text) {
  return String(text || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function buildLocalLiveDashboard(uploadedData, userPrompt = '') {
  const payload = getDashboardPayload(uploadedData);
  const rows = payload.rows;
  const { numeric, categorical, keys } = pickColumns(rows, payload.columns);
  const palette = PALETTES[(hashText(userPrompt) + Date.now()) % PALETTES.length];
  const business = payload.businessSummary;
  const roles = business?.columns || payload.columnRoles || {};
  const salesColumn = roles.sales || roles.metric || columnByIntent(keys, [/sales/, /revenue/, /amount/, /income/, /net.*profit/, /profit/]) || numeric[0];
  const profitColumn = roles.profit || columnByIntent(keys, [/profit/, /margin/]);
  const lossColumn = columnByIntent(keys, [/loss/, /expense/, /cost/, /spend/]);
  const dateColumn = roles.date || columnByIntent(keys, [/date/, /month/, /quarter/, /year/, /time/]);
  const categoryColumn = roles.category || columnByIntent(keys, [/category/, /industry/, /segment/, /company/, /product/, /country/, /region/]) || categorical[0];
  const secondaryCategory = categorical.find(key => key !== categoryColumn) || categoryColumn;
  const rowCount = rows.length || uploadedData?.rowCount || 0;
  const widgets = [];
  const insights = normalizeSummaryItems(payload.insights, 7).map((text, index) => ({
    id: `insight-${index + 1}`,
    title: `Insight ${index + 1}`,
    body: text,
  }));
  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'summary', label: 'Summary' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'visuals', label: 'Visual Insights' },
    { id: 'charts', label: 'Charts' },
    { id: 'reports', label: 'Reports' },
  ];
  const quality = payload.dataQuality || {};
  const qualityItems = [
    `Dataset type: ${payload.datasetType}`,
    `Rows: ${rowCount.toLocaleString('en-IN')}`,
    `Columns: ${keys.length.toLocaleString('en-IN')}`,
    `Completeness: ${quality.completeness ?? quality.completenessScore ?? 'Not calculated'}`,
    `Quality score: ${quality.quality ?? quality.qualityScore ?? uploadedData?.qualityScore ?? 'Not calculated'}`,
    `Detected numeric fields: ${numeric.slice(0, 8).map(humanize).join(', ') || 'None detected'}`,
    `Detected category fields: ${categorical.slice(0, 8).map(humanize).join(', ') || 'None detected'}`,
  ];

  widgets.push({
    id: 'overview-profile',
    type: 'text',
    section: 'overview',
    title: 'Data Overview',
    description: 'What kind of data is uploaded and what structure was detected.',
    body: `${payload.fileName} contains ${rowCount.toLocaleString('en-IN')} real records across ${keys.length} columns. This page summarizes structure and quality only; charts are placed in Dashboard, Visual Insights and Charts sections where they are useful.`,
    items: qualityItems,
  });

  widgets.push({
    id: 'kpi-total-rows',
    type: 'kpi',
    section: 'overview',
    title: 'Total Records',
    description: 'Actual rows detected from the uploaded dataset.',
    data: { value: rowCount.toLocaleString('en-IN'), trend: 'neutral', trendValue: 'Source dataset' },
    style: { tone: 'primary' },
  });
  widgets.push({
    id: 'kpi-total-columns',
    type: 'kpi',
    section: 'overview',
    title: 'Total Columns',
    description: 'Actual fields detected from the uploaded dataset.',
    data: { value: keys.length.toLocaleString('en-IN'), trend: 'neutral', trendValue: 'Schema detected' },
    style: { tone: 'info' },
  });

  (payload.kpis || []).slice(0, 6).forEach((kpi, index) => {
    widgets.push({
      id: `kpi-existing-${index}`,
      type: 'kpi',
      section: index < 2 ? 'overview' : 'dashboard',
      title: kpi.label || kpi.title || `Metric ${index + 1}`,
      description: kpi.desc || kpi.description || kpi.source || 'Calculated from uploaded data.',
      data: { value: kpi.value ?? compactMetric(kpi.rawValue), trend: 'neutral', trendValue: kpi.formula || kpi.column || 'Calculated metric' },
      style: { tone: index % 2 ? 'success' : 'primary' },
    });
  });

  if (salesColumn) {
    const values = rows.map(row => numericValue(row?.[salesColumn])).filter(value => value !== null);
    const total = values.reduce((sum, value) => sum + value, 0);
    const average = values.length ? total / values.length : 0;
    widgets.push({
      id: 'kpi-sales-total',
      type: 'kpi',
      section: 'summary',
      title: `Total ${humanize(salesColumn)}`,
      description: `SUM(${salesColumn}) from real uploaded records.`,
      data: { value: formatNumber(total), trend: 'positive', trendValue: `Avg ${formatNumber(average)}` },
      style: { tone: 'success' },
    });
  }

  const summaryFacts = [
    salesColumn ? `Primary measure detected: ${salesColumn}` : null,
    profitColumn ? `Profit column detected: ${profitColumn}` : 'Profit column was not confidently detected, so profit charts are limited.',
    lossColumn ? `Cost/loss column detected: ${lossColumn}` : 'Cost/loss column was not confidently detected.',
    categoryColumn ? `Main breakdown dimension: ${categoryColumn}` : null,
    dateColumn ? `Trend/time dimension: ${dateColumn}` : 'No clear time/date column detected; trend lines use row sequence.',
  ].filter(Boolean);

  widgets.push({
    id: 'summary-key-info',
    type: 'text',
    section: 'summary',
    title: 'Key Information Summary',
    description: 'Important detected signals before opening charts.',
    body: uploadedData?.summary || `${payload.fileName} was profiled using detected metrics and dimensions. The dashboard avoids synthetic values and only renders sections where matching columns exist.`,
    items: summaryFacts,
  });

  if (profitColumn) {
    const totalProfit = rows.reduce((sum, row) => sum + (numericValue(row?.[profitColumn]) || 0), 0);
    widgets.push({
      id: 'kpi-profit-total',
      type: 'kpi',
      section: 'summary',
      title: `Total ${humanize(profitColumn)}`,
      description: `Real profit metric calculated from ${profitColumn}.`,
      data: { value: formatNumber(totalProfit), trend: totalProfit >= 0 ? 'positive' : 'negative', trendValue: totalProfit >= 0 ? 'Profit positive' : 'Profit negative' },
      style: { tone: totalProfit >= 0 ? 'success' : 'danger' },
    });
  }

  if (lossColumn) {
    const totalLoss = rows.reduce((sum, row) => sum + (numericValue(row?.[lossColumn]) || 0), 0);
    widgets.push({
      id: 'kpi-loss-total',
      type: 'kpi',
      section: 'summary',
      title: `Total ${humanize(lossColumn)}`,
      description: `Expense/loss signal calculated from ${lossColumn}.`,
      data: { value: formatNumber(totalLoss), trend: 'negative', trendValue: 'Cost / loss signal' },
      style: { tone: 'warning' },
    });
  }

  const categorySales = business?.categoryWise?.length
    ? toChartPoints(business.categoryWise, 'rawValue', 10)
    : categoryColumn && salesColumn ? aggregateByCategory(rows, categoryColumn, salesColumn, 10) : [];
  addChart(widgets, {
      id: 'chart-category-performance',
      type: 'chart',
      section: 'dashboard',
      title: `${humanize(salesColumn)} by ${humanize(categoryColumn)}`,
      description: `Real grouped performance by ${categoryColumn}.`,
      chart: { type: 'bar', xKey: 'name', yKey: 'value' },
      data: categorySales,
      insight: categorySales[0] ? `${categorySales[0].name} is the leading group with ${formatNumber(categorySales[0].value)}.` : '',
  });
  if (categorySales.length) {
    addChart(widgets, {
      id: 'chart-category-performance-all',
      type: 'chart',
      section: 'charts',
      title: `${humanize(salesColumn)} by ${humanize(categoryColumn)}`,
      description: `Full chart copy for all-charts view, based on real ${salesColumn} values.`,
      chart: { type: 'bar', xKey: 'name', yKey: 'value' },
      data: categorySales,
      insight: categorySales[0] ? `${categorySales[0].name} is the leading group with ${formatNumber(categorySales[0].value)}.` : '',
    });
  }

  if (secondaryCategory) {
    const data = aggregateByCategory(rows, secondaryCategory, null, 8);
    addChart(widgets, {
      id: 'chart-distribution',
      type: 'chart',
      section: 'visuals',
      title: `${humanize(secondaryCategory)} Distribution`,
      description: `Record concentration across ${secondaryCategory}.`,
      chart: { type: 'pie', xKey: 'name', yKey: 'value', showLegend: true },
      data,
      insight: data[0] ? `${data[0].name} has the highest record concentration (${formatNumber(data[0].value)} records).` : '',
    });
    addChart(widgets, {
      id: 'chart-distribution-all',
      type: 'chart',
      section: 'charts',
      title: `${humanize(secondaryCategory)} Distribution`,
      description: `All-charts view of record concentration across ${secondaryCategory}.`,
      chart: { type: 'pie', xKey: 'name', yKey: 'value', showLegend: true },
      data,
      insight: data[0] ? `${data[0].name} has the highest record concentration (${formatNumber(data[0].value)} records).` : '',
    });
  }

  if (categoryColumn && profitColumn) {
    const data = aggregateByCategory(rows, categoryColumn, profitColumn, 10);
    addChart(widgets, {
      id: 'chart-profit-distribution',
      type: 'chart',
      section: 'visuals',
      title: `${humanize(profitColumn)} by ${humanize(categoryColumn)}`,
      description: `Profit signal grouped by ${categoryColumn}.`,
      chart: { type: 'bar', xKey: 'name', yKey: 'value' },
      data,
      insight: data[0] ? `${data[0].name} has the highest detected ${profitColumn}: ${formatNumber(data[0].value)}.` : '',
    });
    addChart(widgets, {
      id: 'chart-profit-distribution-all',
      type: 'chart',
      section: 'charts',
      title: `${humanize(profitColumn)} by ${humanize(categoryColumn)}`,
      description: `All-charts view of profit grouped by ${categoryColumn}.`,
      chart: { type: 'bar', xKey: 'name', yKey: 'value' },
      data,
      insight: data[0] ? `${data[0].name} has the highest detected ${profitColumn}: ${formatNumber(data[0].value)}.` : '',
    });
  }

  if (categoryColumn && lossColumn) {
    const data = aggregateByCategory(rows, categoryColumn, lossColumn, 10);
    addChart(widgets, {
      id: 'chart-loss-distribution',
      type: 'chart',
      section: 'visuals',
      title: `${humanize(lossColumn)} by ${humanize(categoryColumn)}`,
      description: `Cost/loss signal grouped by ${categoryColumn}.`,
      chart: { type: 'bar', xKey: 'name', yKey: 'value' },
      data,
      insight: data[0] ? `${data[0].name} carries the highest detected cost/loss signal.` : '',
    });
    addChart(widgets, {
      id: 'chart-loss-distribution-all',
      type: 'chart',
      section: 'charts',
      title: `${humanize(lossColumn)} by ${humanize(categoryColumn)}`,
      description: `All-charts view of cost/loss grouped by ${categoryColumn}.`,
      chart: { type: 'bar', xKey: 'name', yKey: 'value' },
      data,
      insight: data[0] ? `${data[0].name} carries the highest detected cost/loss signal.` : '',
    });
  }

  if (salesColumn) {
    const trend = dateColumn
      ? aggregateByCategory(rows, dateColumn, salesColumn, 16).sort((a, b) => String(a.name).localeCompare(String(b.name)))
      : buildTrend(rows, salesColumn, 16);
    if (trend.length) {
      widgets.push({
        id: 'chart-sales-trend',
        type: 'chart',
        section: 'charts',
        title: `${humanize(salesColumn)} Trend`,
        description: dateColumn ? `Trend grouped by ${dateColumn}.` : 'Line trend from real record sequence.',
        chart: { type: 'line', xKey: 'name', yKey: 'value' },
        data: trend,
        insight: `This line shows how ${salesColumn} moves across ${dateColumn || 'record order'}; no synthetic data is added.`,
      });
      widgets.push({
        id: 'chart-sales-momentum',
        type: 'chart',
        section: 'visuals',
        title: `${humanize(salesColumn)} Momentum`,
        description: 'Area chart for quick rise/fall reading from real values.',
        chart: { type: 'area', xKey: 'name', yKey: 'value' },
        data: trend,
        insight: trend.length ? `Peak visible point: ${[...trend].sort((a, b) => b.value - a.value)[0].name}.` : '',
      });
      widgets.push({
        id: 'chart-sales-trend-dashboard',
        type: 'chart',
        section: 'dashboard',
        title: `${humanize(salesColumn)} Trend`,
        description: dateColumn ? `Main dashboard trend grouped by ${dateColumn}.` : 'Main dashboard trend from real record sequence.',
        chart: { type: 'line', xKey: 'name', yKey: 'value' },
        data: trend,
        insight: `This trend line is calculated from ${salesColumn}; no generated/fake values are used.`,
      });
    }
  }

  const profitLossData = [];
  if (salesColumn) profitLossData.push({ name: humanize(salesColumn), value: rows.reduce((sum, row) => sum + (numericValue(row?.[salesColumn]) || 0), 0) });
  if (profitColumn) profitLossData.push({ name: humanize(profitColumn), value: rows.reduce((sum, row) => sum + (numericValue(row?.[profitColumn]) || 0), 0) });
  if (lossColumn) profitLossData.push({ name: humanize(lossColumn), value: rows.reduce((sum, row) => sum + (numericValue(row?.[lossColumn]) || 0), 0) });
  addChart(widgets, {
    id: 'chart-profit-loss',
    type: 'chart',
    section: 'charts',
    title: 'Profit / Loss / Sales Comparison',
    description: 'Side-by-side comparison from detected financial columns.',
    chart: { type: 'bar', xKey: 'name', yKey: 'value' },
    data: profitLossData,
    insight: 'This chart compares only detected financial columns from the uploaded file.',
  });

  const numericComparison = numeric.slice(0, 6).map(column => ({
    name: humanize(column),
    value: rows.reduce((sum, row) => sum + (numericValue(row?.[column]) || 0), 0),
  })).filter(item => item.value !== 0);
  addChart(widgets, {
    id: 'chart-numeric-comparison',
    type: 'chart',
    section: 'dashboard',
    title: 'Key Numeric Fields Comparison',
    description: 'Compares totals from important numeric columns detected in the dataset.',
    chart: { type: 'bar', xKey: 'name', yKey: 'value' },
    data: numericComparison,
    insight: numericComparison[0] ? `${numericComparison.sort((a, b) => b.value - a.value)[0].name} is the largest numeric total in the detected fields.` : '',
  });

  const recordTrend = buildTrend(rows, numeric[1] || salesColumn, 18);
  addChart(widgets, {
    id: 'chart-secondary-trend',
    type: 'chart',
    section: 'charts',
    title: `${humanize(numeric[1] || salesColumn)} Secondary Trend`,
    description: 'Additional line chart to reveal movement across records.',
    chart: { type: 'line', xKey: 'name', yKey: 'value' },
    data: recordTrend,
    insight: 'This trend is calculated from a detected numeric field; it helps compare movement against the main trend.',
  });

  const profitability = business?.categoryProfitability?.length
    ? business.categoryProfitability.map(item => ({ name: item.name, sales: Number(item.salesRaw || 0), profit: Number(item.profitRaw || 0) })).slice(0, 10)
    : [];
  addChart(widgets, {
    id: 'chart-profit-by-category',
    type: 'chart',
    section: 'charts',
    title: 'Profit by Category',
    description: 'Profit contribution by category where profit column exists.',
    chart: { type: 'bar', xKey: 'name', yKey: 'profit' },
    data: profitability,
    insight: profitability[0] ? `${profitability[0].name} has the strongest detected profit contribution.` : '',
  });

  widgets.push({
    id: 'summary-narrative',
    type: 'text',
    section: 'summary',
    title: 'Executive Summary',
    description: 'Grounded summary from uploaded analysis.',
    body: uploadedData?.summary || payload.report?.executiveSummary || `${payload.fileName} contains ${rowCount.toLocaleString('en-IN')} records and ${keys.length} columns. Charts are generated only from detected fields.`,
    items: normalizeSummaryItems(payload.insights, 5),
  });

  widgets.push({
    id: 'reports-findings',
    type: 'text',
    section: 'reports',
    title: 'Report Findings',
    description: 'Important points and recommendations from the analysis.',
    items: [
      ...(normalizeSummaryItems(uploadedData?.recommendations || [], 5)),
      ...(normalizeSummaryItems(uploadedData?.risks || [], 4)),
      ...(normalizeSummaryItems(uploadedData?.hiddenPatterns || [], 4)),
    ].slice(0, 10),
    body: uploadedData?.conclusion || 'Use this report section to review recommendations, risks, and hidden patterns detected from the uploaded data.',
  });

  widgets.push({
    id: 'table-preview',
    type: 'table',
    section: 'reports',
    title: 'Key Data Preview',
    description: 'Important columns from the uploaded dataset.',
    table: {
      columns: keys.slice(0, 6).map(key => ({ key, label: key })),
      pagination: { pageSize: 8 },
    },
    data: rows.slice(0, 80),
  });

  if (categorySales[0]) {
    insights.unshift({
      id: 'insight-top-category',
      title: `Top ${humanize(categoryColumn)}`,
      body: `${categorySales[0].name} leads ${humanize(salesColumn)} with ${formatNumber(categorySales[0].value)} based on uploaded records.`,
    });
  }

  const id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    dashboardId: id,
    title: `${payload.fileName} Live Dashboard`,
    version: 1,
    createdAt: new Date().toISOString(),
    dashboardJson: {
      kind: 'byizon.dynamic-dashboard',
      dashboard: {
        title: `${payload.fileName} Dashboard`,
        description: `${payload.datasetType} · Generated from real uploaded data with sectioned dashboard, summary, reports, visual insights, and charts.`,
        sections,
        theme: {
          mode: palette.mode,
          tokens: {
            primary: palette.primary,
            radius: ['18px', '22px', '26px'][Math.floor(Math.random() * 3)],
            fontFamily: 'Inter, Plus Jakarta Sans, system-ui, sans-serif',
          },
        },
        source: {
          fileName: payload.fileName,
          rowCount,
          columnCount: keys.length,
          generator: `Actual Live Website · ${palette.name}`,
        },
        filters: categorical.slice(0, 2).map(field => ({
          id: `filter-${field}`,
          label: field,
          field,
          options: Array.from(new Set(rows.map(row => String(row?.[field] ?? '').trim()).filter(Boolean))).slice(0, 18),
        })),
        widgets,
        insights,
      },
    },
  };
}

export function saveLocalLiveDashboard(dashboard) {
  localStorage.setItem(`${LOCAL_DASHBOARD_PREFIX}${dashboard.dashboardId}`, JSON.stringify(dashboard));
  return dashboard;
}

export function getLocalLiveDashboard(dashboardId) {
  if (!dashboardId?.startsWith('local-')) return null;
  const raw = localStorage.getItem(`${LOCAL_DASHBOARD_PREFIX}${dashboardId}`);
  if (!raw) return null;
  return JSON.parse(raw);
}
