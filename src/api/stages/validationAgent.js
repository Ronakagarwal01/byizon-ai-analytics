/**
 * Stage 6: Validation Agent
 * Validates and auto-repairs every field in the schema agent output.
 * Ensures ALL column references actually exist in the dataset before
 * the schema reaches the Analytics Engine.
 *
 * Returns: ValidatedSchema with an attached validationReport.
 */

const VALID_AGGREGATIONS = new Set(['sum', 'avg', 'count', 'max', 'min', 'count_distinct']);
const VALID_CHART_TYPES = new Set(['area', 'bar', 'line', 'pie', 'scatter', 'radar']);

/**
 * @param {RawAISchema} rawSchema - Output of Stage 5 (AI Schema Agent)
 * @param {string[]} columns     - Actual column names from the parsed dataset
 * @returns {ValidatedSchema}
 */
export function runValidationAgent(rawSchema, columns) {
  let columnSet = new Set(columns);
  const autoCorrections = [];
  const columnIssues = [];
  const kpiIssues = [];
  const chartIssues = [];

  // Deep-clone to avoid mutating the original AI output
  const schema = JSON.parse(JSON.stringify(rawSchema));
  const baseColumnSet = new Set(columns);

  if (!Array.isArray(schema.derivedColumns)) {
    schema.derivedColumns = [];
  }

  schema.derivedColumns = schema.derivedColumns
    .filter((derived, i) => {
      const valid =
        derived &&
        typeof derived.name === 'string' &&
        derived.name.trim() &&
        derived.formula === 'product' &&
        Array.isArray(derived.operands) &&
        derived.operands.length === 2 &&
        derived.operands.every(col => baseColumnSet.has(col));

      if (!valid) {
        autoCorrections.push(`derivedColumns[${i}] invalid or references missing columns - removed`);
      }
      return valid;
    })
    .map(derived => ({
      name: derived.name.trim(),
      label: String(derived.label || derived.name).trim(),
      formula: derived.formula,
      operands: derived.operands,
    }));

  columnSet = new Set([...columns, ...schema.derivedColumns.map(col => col.name)]);

  // ── 1. Validate columnRoles ─────────────────────────────────────────────
  const knownRoles = [
    'date', 'metric', 'quantity', 'price', 'cost', 'profit', 'discount',
    'product', 'customer', 'employee', 'department', 'category', 'entity',
    'city', 'state', 'country',
  ];

  if (!schema.columnRoles || typeof schema.columnRoles !== 'object') {
    schema.columnRoles = {};
    autoCorrections.push('columnRoles was missing — initialized to empty object');
  }

  // Ensure all known roles exist in the object
  knownRoles.forEach(role => {
    if (!(role in schema.columnRoles)) {
      schema.columnRoles[role] = null;
    }
  });

  // Validate each role's column reference
  const assignedCols = new Set();
  knownRoles.forEach(role => {
    const col = schema.columnRoles[role];
    if (col === null || col === undefined) return;

    if (!columnSet.has(col)) {
      const msg = `columnRoles.${role}: "${col}" not found in dataset — cleared to null`;
      columnIssues.push(msg);
      autoCorrections.push(msg);
      schema.columnRoles[role] = null;
      return;
    }

    // Detect conflicting dual-assignments (same column mapped to two roles)
    if (assignedCols.has(col)) {
      const msg = `columnRoles.${role}: "${col}" already used by another role — cleared`;
      columnIssues.push(msg);
      autoCorrections.push(msg);
      schema.columnRoles[role] = null;
    } else {
      assignedCols.add(col);
    }
  });

  // ── 2. Validate kpiList ─────────────────────────────────────────────────
  if (!Array.isArray(schema.kpiList) || schema.kpiList.length === 0) {
    schema.kpiList = buildDefaultKPIList();
    autoCorrections.push('kpiList was empty — injected default Total Records KPI');
  } else {
    const validKPIs = [];
    schema.kpiList.forEach((kpi, i) => {
      // Validate column ref
      if (kpi.column !== null && kpi.column !== undefined) {
        if (!columnSet.has(kpi.column)) {
          const msg = `kpiList[${i}] "${kpi.label}": column "${kpi.column}" not in dataset — removed`;
          kpiIssues.push(msg);
          autoCorrections.push(msg);
          return; // Skip this KPI
        }
      }
      // Validate aggregation
      if (!VALID_AGGREGATIONS.has(kpi.aggregation)) {
        const msg = `kpiList[${i}] "${kpi.label}": invalid aggregation "${kpi.aggregation}" — set to "sum"`;
        autoCorrections.push(msg);
        kpi.aggregation = 'sum';
      }
      // Ensure required fields with defaults
      kpi.id = kpi.id || `kpi_${i}`;
      kpi.label = typeof kpi.label === 'string' ? kpi.label : `KPI ${i + 1}`;
      kpi.prefix = typeof kpi.prefix === 'string' ? kpi.prefix : '';
      kpi.suffix = typeof kpi.suffix === 'string' ? kpi.suffix : '';
      kpi.description = typeof kpi.description === 'string' ? kpi.description : kpi.label;
      validKPIs.push(kpi);
    });

    schema.kpiList = validKPIs.length > 0 ? validKPIs : buildDefaultKPIList();
    if (validKPIs.length === 0) {
      autoCorrections.push('All kpiList entries were invalid — injected default Total Records KPI');
    }
  }

  // ── 3. Validate chartList ───────────────────────────────────────────────
  if (!Array.isArray(schema.chartList)) {
    schema.chartList = [];
    autoCorrections.push('chartList was missing or invalid — set to empty array');
  } else {
    schema.chartList = schema.chartList
      .filter((chart, i) => {
        if (!VALID_CHART_TYPES.has(chart.type)) {
          const msg = `chartList[${i}] "${chart.title}": invalid type "${chart.type}" — removed`;
          chartIssues.push(msg);
          autoCorrections.push(msg);
          return false;
        }
        return true;
      })
      .map((chart, i) => {
        // Validate axis column references — nullify invalid refs instead of removing chart
        const axisFields = ['xAxis', 'yAxis', 'dimension', 'metric'];
        axisFields.forEach(field => {
          if (chart[field] && !columnSet.has(chart[field])) {
            const msg = `chartList[${i}] "${chart.title}": ${field} "${chart[field]}" not found — cleared`;
            chartIssues.push(msg);
            autoCorrections.push(msg);
            chart[field] = null;
          }
        });
        chart.id = chart.id || `chart_${i}`;
        chart.title = typeof chart.title === 'string' ? chart.title : `Chart ${i + 1}`;
        return chart;
      });
  }

  // ── 4. Validate filterColumns ───────────────────────────────────────────
  if (!Array.isArray(schema.filterColumns)) {
    schema.filterColumns = [];
  } else {
    schema.filterColumns = schema.filterColumns.filter(col => {
      if (!columnSet.has(col)) {
        autoCorrections.push(`filterColumns: "${col}" not found — removed`);
        return false;
      }
      return true;
    });
  }

  // ── 5. Validate anomalyRules ────────────────────────────────────────────
  if (!Array.isArray(schema.anomalyRules)) {
    schema.anomalyRules = [];
  } else {
    schema.anomalyRules = schema.anomalyRules.filter(rule => {
      if (rule.column && !columnSet.has(rule.column)) {
        autoCorrections.push(`anomalyRules: column "${rule.column}" not found — rule removed`);
        return false;
      }
      return true;
    });
  }

  // ── 6. Normalize narrative array fields ─────────────────────────────────
  const arrayFields = [
    'insights', 'risks', 'opportunities', 'patterns',
    'forecast', 'strengths', 'weaknesses', 'relationships',
  ];
  arrayFields.forEach(field => {
    if (!Array.isArray(schema[field])) {
      schema[field] = schema[field] ? [String(schema[field])] : [];
    }
    schema[field] = schema[field].map(String).filter(Boolean);
  });

  if (!Array.isArray(schema.recommendations)) {
    schema.recommendations = [];
  } else {
    schema.recommendations = schema.recommendations
      .filter(r => r && typeof r === 'object')
      .map(r => ({ title: String(r.title || ''), desc: String(r.desc || '') }))
      .filter(r => r.title || r.desc);
  }

  // ── 7. Normalize scalar fields ──────────────────────────────────────────
  schema.datasetType = typeof schema.datasetType === 'string' && schema.datasetType
    ? schema.datasetType : 'General Dataset';
  schema.businessDomain = typeof schema.businessDomain === 'string' ? schema.businessDomain : '';
  schema.summary = typeof schema.summary === 'string' ? schema.summary
    : `Analysis of ${columns.length} columns.`;
  schema.conclusion = typeof schema.conclusion === 'string' ? schema.conclusion
    : 'Analysis completed.';
  schema.health = typeof schema.health === 'string' ? schema.health : 'Stable';
  schema.currencySymbol = typeof schema.currencySymbol === 'string' ? schema.currencySymbol : '₹';
  schema.currency = typeof schema.currency === 'string' ? schema.currency : 'INR';
  schema.confidence = typeof schema.confidence === 'number' ? schema.confidence : 0;
  schema.drilldownPath = typeof schema.drilldownPath === 'string' ? schema.drilldownPath : '';

  const totalIssues = autoCorrections.length;
  const passed = columnIssues.length === 0 && kpiIssues.length === 0;

  return {
    ...schema,
    validationReport: {
      passed,
      columnIssues,
      kpiIssues,
      chartIssues,
      autoCorrections,
      totalIssues,
    },
  };
}

function buildDefaultKPIList() {
  return [
    {
      id: 'total_records',
      label: 'Total Records',
      column: null,
      aggregation: 'count',
      prefix: '',
      suffix: '',
      description: 'Total number of records in the dataset.',
    },
  ];
}
