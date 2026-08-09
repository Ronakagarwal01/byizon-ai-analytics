/**
 * metrics.js — Pure Math Utilities
 *
 * This file now contains ONLY deterministic, side-effect-free math utilities
 * used by the Analytics Engine (analyticsEngine.js).
 *
 * REMOVED (replaced by schema-driven analytics pipeline):
 *   - DATASET_CLASSIFICATION_KEYWORDS
 *   - MAPPING_SYNONYMS
 *   - detectDatasetType()
 *   - fuzzyMapColumns()
 *   - calculateMappingConfidence()
 *   - selectDatasetKPIs()
 *   - computeDataMetrics()
 *   - extractMetadata() → moved to dataProfiler.js
 *
 * KEPT (pure computation helpers):
 *   - parseDate()
 *   - cleanNumber()
 *   - calculateGrowthRates()
 *   - detectFilterColumns()
 *   - detectAnomalies()
 *   - profileDataQuality()
 *   - calculate14KPIs()
 *   - profileDataset()
 */

// ── Date Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a value into a JavaScript Date object.
 * Supports Excel serial numbers, ISO strings, DD/MM/YYYY, MM/DD/YYYY.
 */
export function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

  // Excel serial date number
  const num = Number(val);
  if (!isNaN(num) && num > 25569 && num < 100000) {
    return new Date((num - 25569) * 86400 * 1000);
  }

  const s = String(val).trim();
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // DD/MM/YYYY and DD-MM-YYYY
  const parts = s.split(/[-/]/);
  if (parts.length === 3) {
    const [p0, p1, p2] = parts.map(p => parseInt(p, 10));
    if (String(parts[2]).length === 4 && !isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      if (p1 <= 12) {
        d = new Date(p2, p1 - 1, p0);
        if (!isNaN(d.getTime())) return d;
      }
    }
    if (String(parts[0]).length === 4 && !isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      d = new Date(p0, p1 - 1, p2);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

// ── Number Parsing ──────────────────────────────────────────────────────────

/**
 * Parse any value into a clean number.
 * Handles currency symbols, commas, and percentages.
 */
export function cleanNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  const s = String(val).replace(/[₹$€£,\s%]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Growth Rate Calculations ────────────────────────────────────────────────

/**
 * Calculate monthly, quarterly, and yearly growth rates from row data.
 */
export function calculateGrowthRates(rows, dateCol, metricCol) {
  const growth = { monthly: 0, quarterly: 0, yearly: 0 };
  if (!dateCol || !metricCol || !rows || rows.length === 0) return growth;

  const monthlySums = {};
  const quarterlySums = {};
  const yearlySums = {};

  rows.forEach(r => {
    const d = parseDate(r[dateCol]);
    if (!d) return;
    const val = cleanNumber(r[metricCol]);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const quarter = Math.ceil((d.getMonth() + 1) / 3);

    const mKey = `${year}-${month}`;
    const qKey = `${year}-Q${quarter}`;
    const yKey = `${year}`;

    monthlySums[mKey] = (monthlySums[mKey] || 0) + val;
    quarterlySums[qKey] = (quarterlySums[qKey] || 0) + val;
    yearlySums[yKey] = (yearlySums[yKey] || 0) + val;
  });

  const getGrowth = sums => {
    const keys = Object.keys(sums).sort();
    if (keys.length < 2) return 0;
    const latest = sums[keys[keys.length - 1]];
    const prev = sums[keys[keys.length - 2]];
    return prev > 0 ? ((latest - prev) / prev) * 100 : 0;
  };

  growth.monthly = getGrowth(monthlySums);
  growth.quarterly = getGrowth(quarterlySums);
  growth.yearly = getGrowth(yearlySums);
  return growth;
}

// ── Filter Column Detection ─────────────────────────────────────────────────

/**
 * Detect columns suitable for filter dropdowns (low cardinality: 2–15 unique values).
 */
export function detectFilterColumns(columns, rows) {
  const sampleSize = Math.min(rows.length, 500);
  return columns
    .filter(col => {
      const l = col.toLowerCase();
      if (l.endsWith('id') && !l.includes('device') && !l.includes('building')) return false;
      const unique = new Set(rows.slice(0, sampleSize).map(r => String(r[col] ?? '').trim()));
      return unique.size >= 2 && unique.size <= 15;
    })
    .map(col => ({
      column: col,
      values: [...new Set(rows.map(r => String(r[col] ?? '').trim()))].filter(Boolean).sort(),
    }));
}

// ── Data Quality Profiling ──────────────────────────────────────────────────

/**
 * Compute data quality metrics for a dataset.
 */
export function profileDataQuality(columns, rows, anomalies = []) {
  const rowCount = rows.length;
  const colCount = columns.length;
  const totalCells = rowCount * colCount;
  if (totalCells === 0) return { completeness: 0, quality: 0, emptyCount: 0 };

  let emptyCount = 0;
  rows.forEach(r => {
    columns.forEach(c => {
      const v = r[c];
      if (v === undefined || v === null || v === '') emptyCount++;
    });
  });

  const completeness = parseFloat(((totalCells - emptyCount) / totalCells * 100).toFixed(1));
  const missingPenalty = Math.min(25, (emptyCount / totalCells) * 100);
  const anomalyPenalty = Math.min(25, anomalies.length * 2);
  const quality = parseFloat(Math.max(0, Math.min(100, 100 - missingPenalty - anomalyPenalty)).toFixed(1));

  return {
    completeness,
    quality,
    emptyCount,
    totalCells,
    outliersCount: anomalies.filter(a => a.type?.includes('Outlier') || a.type?.includes('Spike')).length,
    duplicatesCount: anomalies.filter(a => a.type?.includes('Duplicate')).length,
  };
}

// ── Dataset Statistical Profiling ───────────────────────────────────────────

/**
 * Generate column-level statistical profiles for the AI context object.
 */
export function profileDataset(columns, rows) {
  const profile = {
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    numericColumns: {},
    categoricalColumns: {},
  };
  if (!rows || rows.length === 0) return profile;

  columns.forEach(col => {
    let numCount = 0;
    let emptyCount = 0;
    const checkCount = Math.min(rows.length, 100);

    for (let i = 0; i < checkCount; i++) {
      const val = rows[i][col];
      if (val === undefined || val === null || val === '') { emptyCount++; continue; }
      if (typeof val === 'number' || (!isNaN(parseFloat(val)) && isFinite(val))) numCount++;
    }

    const nonEmpty = checkCount - emptyCount || 1;
    if (numCount / nonEmpty > 0.80) {
      let sum = 0, min = Infinity, max = -Infinity, count = 0;
      rows.forEach(r => {
        const v = cleanNumber(r[col]);
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
        count++;
      });
      profile.numericColumns[col] = {
        sum: Math.round(sum * 100) / 100,
        min: min === Infinity ? 0 : Math.round(min * 100) / 100,
        max: max === -Infinity ? 0 : Math.round(max * 100) / 100,
        avg: count > 0 ? Math.round((sum / count) * 100) / 100 : 0,
      };
    } else {
      const freq = {};
      rows.forEach(r => {
        const v = String(r[col] ?? 'N/A').trim();
        freq[v] = (freq[v] || 0) + 1;
      });
      const topValues = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([name, count]) => ({ name, count }));
      profile.categoricalColumns[col] = { uniqueCount: Object.keys(freq).length, topValues };
    }
  });

  return profile;
}
