const MONEY_KEYWORDS = [
  'amount', 'revenue', 'sales', 'sale', 'income', 'earning', 'price',
  'cost', 'expense', 'spend', 'profit', 'margin', 'value', 'total',
  'payment', 'invoice', 'billing', 'salary',
];

const ROLE_KEYWORDS = {
  date: ['date', 'time', 'timestamp', 'created', 'updated', 'month', 'year', 'day'],
  quantity: ['quantity', 'qty', 'units', 'unitssold', 'volume', 'count', 'sold', 'stock'],
  price: ['price', 'rate', 'unitprice', 'mrp', 'sellingprice'],
  cost: ['cost', 'expense', 'spend', 'cogs', 'charge'],
  profit: ['profit', 'margin', 'netprofit', 'grossprofit'],
  discount: ['discount', 'rebate', 'coupon'],
  metric: ['amount', 'revenue', 'sales', 'sale', 'total', 'value', 'income', 'score', 'rating', 'marks', 'balance'],
  product: ['product', 'item', 'sku', 'service', 'course', 'plan', 'model'],
  customer: ['customer', 'client', 'buyer', 'user', 'consumer', 'account'],
  employee: ['employee', 'staff', 'agent', 'salesperson', 'rep', 'worker'],
  department: ['department', 'dept', 'team', 'division', 'function'],
  category: ['category', 'type', 'segment', 'group', 'class', 'status', 'channel'],
  entity: ['entity', 'company', 'vendor', 'supplier', 'store', 'branch', 'location', 'organization'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  country: ['country', 'nation'],
};

const ROLE_TYPES = {
  date: ['date'],
  quantity: ['numeric'],
  price: ['numeric'],
  cost: ['numeric'],
  profit: ['numeric'],
  discount: ['numeric'],
  metric: ['numeric'],
  product: ['categorical'],
  customer: ['categorical'],
  employee: ['categorical'],
  department: ['categorical'],
  category: ['categorical', 'boolean'],
  entity: ['categorical'],
  city: ['categorical'],
  state: ['categorical'],
  country: ['categorical'],
};

const ROLE_ORDER = [
  'date', 'quantity', 'price', 'cost', 'profit', 'discount', 'metric',
  'product', 'customer', 'employee', 'department', 'category', 'entity',
  'city', 'state', 'country',
];

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function humanizeColumn(name) {
  return String(name || '')
    .replace(/^__dsi_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function hasKeyword(normalizedName, keywords) {
  return keywords.some(keyword => normalizedName.includes(normalize(keyword)));
}

function isIdLike(profile) {
  const n = normalize(profile.name);
  return (
    n === 'id' ||
    n.endsWith('id') ||
    n.includes('uuid') ||
    n.includes('guid') ||
    n.includes('serialno') ||
    n.includes('invoiceno') ||
    n.includes('orderno') ||
    (n.includes('code') && profile.uniqueRate > 0.75)
  );
}

function scoreRole(profile, role) {
  const allowedTypes = ROLE_TYPES[role] || [];
  const name = normalize(profile.name);
  let score = 0;

  if (allowedTypes.includes(profile.detectedType)) score += 5;
  if (hasKeyword(name, ROLE_KEYWORDS[role] || [])) score += 6;

  if (role === 'metric') {
    if (isIdLike(profile)) score -= 12;
    if (hasKeyword(name, ROLE_KEYWORDS.quantity)) score -= 4;
    if (hasKeyword(name, ROLE_KEYWORDS.discount)) score -= 3;
    if (profile.numericStats && Math.abs(profile.numericStats.sum || 0) > 0) score += 2;
  }

  if (role === 'date' && profile.dateStats) score += 4;
  if (role !== 'metric' && isIdLike(profile)) score -= 4;

  if (['product', 'customer', 'employee', 'department', 'category', 'entity', 'city', 'state', 'country'].includes(role)) {
    if (profile.uniqueRate >= 0.99 && role !== 'customer' && role !== 'employee') score -= 3;
    if (profile.uniqueCount <= 1) score -= 4;
  }

  return score;
}

function pickRole(profiles, role, usedColumns, minScore = 6) {
  const candidates = profiles
    .filter(profile => !usedColumns.has(profile.name))
    .map(profile => ({ profile, score: scoreRole(profile, role) }))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best || best.score < minScore) return null;
  usedColumns.add(best.profile.name);
  return best.profile.name;
}

function pickMetricRole(profiles, usedColumns) {
  const numeric = profiles.filter(profile => profile.detectedType === 'numeric' && !usedColumns.has(profile.name));
  const byPreference = [
    /net\s*sales/i,
    /net\s*revenue/i,
    /net\s*amount/i,
    /sales\s*after/i,
    /revenue/i,
    /sales/i,
    /amount/i,
    /value/i,
  ];

  for (const pattern of byPreference) {
    const match = numeric.find(profile => pattern.test(profile.name));
    if (match && !isIdLike(match)) {
      usedColumns.add(match.name);
      return match.name;
    }
  }

  return pickRole(profiles, 'metric', usedColumns, 7);
}

function detectCurrency(columnProfiles) {
  const allText = columnProfiles
    .flatMap(col => [col.name, ...(col.sampleValues || [])])
    .join(' ');

  if (/₹|rs\.?|inr/i.test(allText)) return { currency: 'INR', currencySymbol: '\u20b9' };
  if (/\$|usd/i.test(allText)) return { currency: 'USD', currencySymbol: '$' };
  if (/€|eur/i.test(allText)) return { currency: 'EUR', currencySymbol: '\u20ac' };
  if (/£|gbp/i.test(allText)) return { currency: 'GBP', currencySymbol: '\u00a3' };
  return { currency: 'INR', currencySymbol: '\u20b9' };
}

function isMoneyColumn(name) {
  return hasKeyword(normalize(name), MONEY_KEYWORDS);
}

function isPercentColumn(name) {
  const n = normalize(name);
  return n.includes('percent') || n.includes('percentage') || n.includes('rate') || n.includes('margin');
}

function uniqueId(prefix, label, existing) {
  const base = `${prefix}_${normalize(label) || 'metric'}`.slice(0, 48);
  let id = base;
  let i = 2;
  while (existing.has(id)) {
    id = `${base}_${i}`;
    i += 1;
  }
  existing.add(id);
  return id;
}

function addKpi(kpis, ids, config) {
  if (!config.label) return;
  kpis.push({
    id: uniqueId('kpi', config.label, ids),
    prefix: '',
    suffix: '',
    description: config.label,
    ...config,
  });
}

function buildKpis(roles, currencySymbol) {
  const kpis = [];
  const ids = new Set();

  addKpi(kpis, ids, {
    label: 'Total Records',
    column: null,
    aggregation: 'count',
    description: 'Total number of records in the dataset.',
  });

  if (roles.metric) {
    const label = humanizeColumn(roles.metric);
    const money = isMoneyColumn(roles.metric);
    const percent = isPercentColumn(roles.metric);
    addKpi(kpis, ids, {
      label: money ? `Total ${label}` : `Total ${label}`,
      column: roles.metric,
      aggregation: 'sum',
      prefix: money ? currencySymbol : '',
      suffix: percent ? '%' : '',
      description: `Sum of ${label}.`,
    });
    addKpi(kpis, ids, {
      label: money ? `Average ${label}` : `Average ${label}`,
      column: roles.metric,
      aggregation: 'avg',
      prefix: money ? currencySymbol : '',
      suffix: percent ? '%' : '',
      description: `Average value of ${label}.`,
    });
    addKpi(kpis, ids, {
      label: `Highest ${label}`,
      column: roles.metric,
      aggregation: 'max',
      prefix: money ? currencySymbol : '',
      suffix: percent ? '%' : '',
      description: `Maximum observed value of ${label}.`,
    });
  }

  if (roles.profit && kpis.length < 8) {
    addKpi(kpis, ids, {
      label: `Total ${humanizeColumn(roles.profit)}`,
      column: roles.profit,
      aggregation: 'sum',
      prefix: currencySymbol,
      description: `Sum of ${humanizeColumn(roles.profit)}.`,
    });
  }

  const marginColumn = Object.values(roles).find(col => /margin/i.test(col || ''));
  if (marginColumn && kpis.length < 8) {
    addKpi(kpis, ids, {
      label: `Average ${humanizeColumn(marginColumn)}`,
      column: marginColumn,
      aggregation: 'avg',
      suffix: '%',
      description: `Average value of ${humanizeColumn(marginColumn)}.`,
    });
  }

  if (roles.quantity) {
    addKpi(kpis, ids, {
      label: `Total ${humanizeColumn(roles.quantity)}`,
      column: roles.quantity,
      aggregation: 'sum',
      description: `Sum of ${humanizeColumn(roles.quantity)}.`,
    });
  }

  ['customer', 'product', 'category', 'employee', 'department'].forEach(role => {
    if (roles[role] && kpis.length < 8) {
      addKpi(kpis, ids, {
        label: `Unique ${humanizeColumn(roles[role])}`,
        column: roles[role],
        aggregation: 'count_distinct',
        description: `Distinct count of ${humanizeColumn(roles[role])}.`,
      });
    }
  });

  return kpis.slice(0, 8);
}

function buildCharts(roles) {
  const charts = [];
  const ids = new Set();
  const metric = roles.metric || roles.quantity;

  if (roles.date && metric) {
    charts.push({
      id: uniqueId('chart', 'Trend Over Time', ids),
      type: 'line',
      title: `${humanizeColumn(metric)} Trend`,
      xAxis: roles.date,
      yAxis: metric,
      dimension: null,
      metric,
      groupBy: 'month',
    });
  }

  const breakdown = roles.category || roles.product || roles.department || roles.city || roles.state || roles.country || roles.customer;
  if (breakdown) {
    charts.push({
      id: uniqueId('chart', `${humanizeColumn(breakdown)} Breakdown`, ids),
      type: 'bar',
      title: `${humanizeColumn(breakdown)} Breakdown`,
      xAxis: breakdown,
      yAxis: metric || null,
      dimension: breakdown,
      metric: metric || null,
      groupBy: null,
    });
  }

  const secondaryBreakdown = [roles.product, roles.customer, roles.entity]
    .find(col => col && col !== breakdown);
  if (secondaryBreakdown && charts.length < 4) {
    charts.push({
      id: uniqueId('chart', `Top ${humanizeColumn(secondaryBreakdown)}`, ids),
      type: 'bar',
      title: `Top ${humanizeColumn(secondaryBreakdown)}`,
      xAxis: secondaryBreakdown,
      yAxis: metric || null,
      dimension: secondaryBreakdown,
      metric: metric || null,
      groupBy: null,
    });
  }

  return charts;
}

function buildNarrative(dataProfile, roles, kpis) {
  const mappedRoles = Object.entries(roles).filter(([, col]) => col);
  const numericCount = dataProfile.columns.filter(c => c.detectedType === 'numeric').length;
  const dateCount = dataProfile.columns.filter(c => c.detectedType === 'date').length;
  const catCount = dataProfile.columns.filter(c => c.detectedType === 'categorical').length;

  return {
    summary: `Detected ${dataProfile.rowCount.toLocaleString()} rows and ${dataProfile.colCount} columns with ${numericCount} numeric, ${catCount} categorical, and ${dateCount} date columns.`,
    insights: [
      `${mappedRoles.length} business roles were mapped from actual column profiles, not guessed values.`,
      `${kpis.length} KPIs will be computed directly from parsed rows using deterministic formulas.`,
      roles.date ? `Time-based trends use the "${roles.date}" date column.` : 'No reliable date column was detected, so time-series charts are skipped.',
    ],
    recommendations: [
      {
        title: 'Validate mapped columns',
        desc: 'Review the developer panel if any KPI looks unexpected; all formulas show their source column.',
      },
      {
        title: 'Check anomaly rows',
        desc: 'Investigate statistical outliers, missing values, and duplicate records before making business decisions.',
      },
    ],
    risks: [],
    opportunities: [],
    patterns: [],
    forecast: [],
    strengths: [],
    weaknesses: [],
    conclusion: 'Analysis completed using deterministic local schema detection and exact row-level aggregation.',
  };
}

function buildDerivedColumns(roles, columnProfiles) {
  if (roles.metric || !roles.quantity || !roles.price) return [];

  const existingNames = new Set(columnProfiles.map(c => c.name));
  let name = 'Calculated Amount';
  let suffix = 2;
  while (existingNames.has(name)) {
    name = `Calculated Amount ${suffix}`;
    suffix += 1;
  }

  roles.metric = name;
  return [{
    name,
    label: name,
    formula: 'product',
    operands: [roles.quantity, roles.price],
  }];
}

export function buildLocalSchema(schemaPayload) {
  const { metadata, columnProfiles } = schemaPayload;
  const used = new Set();
  const roles = {};

  ROLE_ORDER.forEach(role => {
    const minScore = role === 'metric' ? 7 : 6;
    roles[role] = role === 'metric'
      ? pickMetricRole(columnProfiles, used)
      : pickRole(columnProfiles, role, used, minScore);
  });

  const derivedColumns = buildDerivedColumns(roles, columnProfiles);
  const { currency, currencySymbol } = detectCurrency(columnProfiles);
  const kpiList = buildKpis(roles, currencySymbol);
  const chartList = buildCharts(roles);
  const narrative = buildNarrative({ ...metadata, columns: columnProfiles }, roles, kpiList);
  const filterColumns = ['category', 'department', 'city', 'state', 'country']
    .map(role => roles[role])
    .filter(Boolean);
  const anomalyRules = [roles.metric, roles.profit]
    .filter(Boolean)
    .map(column => ({ type: 'zscore_outlier', column, threshold: 4.5 }));

  [roles.metric, roles.cost, roles.profit]
    .filter(Boolean)
    .forEach(column => anomalyRules.push({ type: 'negative_metric', column, threshold: null }));

  [roles.date, roles.metric].filter(Boolean)
    .forEach(column => anomalyRules.push({ type: 'null_check', column, threshold: null }));

  return {
    datasetType: roles.date && roles.metric ? 'Time Series Dataset' : 'General Dataset',
    businessDomain: inferBusinessDomain(columnProfiles, roles),
    confidence: 92,
    language: 'en',
    currency,
    currencySymbol,
    primaryKey: detectPrimaryKey(columnProfiles),
    columnRoles: roles,
    derivedColumns,
    kpiList,
    chartList,
    filterColumns,
    drilldownPath: [roles.category, roles.product, roles.customer].filter(Boolean).join(' > '),
    anomalyRules,
    relationships: [],
    health: 'Stable',
    ...narrative,
    _model: 'local-deterministic-schema',
    _provider: 'local',
  };
}

function detectPrimaryKey(columnProfiles) {
  const candidate = columnProfiles.find(col => isIdLike(col) && col.uniqueRate > 0.95);
  return candidate?.name || null;
}

function inferBusinessDomain(columnProfiles, roles) {
  const text = columnProfiles.map(c => c.name).join(' ').toLowerCase();
  if (roles.product || /sales|revenue|order|invoice|sku|product/.test(text)) return 'Sales / Commerce';
  if (/employee|salary|department|attendance|leave|hr/.test(text)) return 'Human Resources';
  if (/expense|profit|cost|ledger|account|balance|finance/.test(text)) return 'Finance';
  if (/stock|inventory|warehouse|sku/.test(text)) return 'Inventory';
  if (/student|marks|grade|course|school/.test(text)) return 'Education';
  return 'General';
}
