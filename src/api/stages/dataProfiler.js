/**
 * Stage 3: Data Profiler
 * Generates a comprehensive statistical profile of every column in the dataset.
 * This DataProfile is the sole ground-truth payload sent to the AI Schema Agent.
 * No column role guessing — pure statistical observation.
 */

/**
 * Detect the dominant data type of a column from its sample values.
 * @param {any[]} values - Non-null sample values
 * @returns {'numeric'|'date'|'boolean'|'categorical'}
 */
function detectColumnType(values) {
  if (!values || values.length === 0) return 'categorical';

  let numericCount = 0;
  let dateCount = 0;
  let boolCount = 0;
  const total = values.length;

  for (const val of values) {
    if (val === null || val === undefined) continue;
    const s = String(val).trim().toLowerCase();

    if (s === 'true' || s === 'false' || s === 'yes' || s === 'no' || s === '1' || s === '0') {
      boolCount++;
      continue;
    }

    // Numeric: plain number or number with currency symbols
    if (!Number.isNaN(parseNumericValue(val))) {
      numericCount++;
      continue;
    }

    // Date patterns
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}[-/]\d{2}[-/]\d{4}$/,
      /^\d{4}[-/]\d{2}[-/]\d{2}$/,
      /^[a-z]{3}\s\d{4}$/i,
      /^\d{1,2}\s[a-z]{3}\s?\d{2,4}$/i,
    ];
    if (datePatterns.some(p => p.test(s)) || (!isNaN(Date.parse(String(val))) && isNaN(Number(val)))) {
      dateCount++;
    }
  }

  const nonEmpty = total || 1;
  if (numericCount / nonEmpty > 0.75) return 'numeric';
  if (dateCount / nonEmpty > 0.65) return 'date';
  if (boolCount / nonEmpty > 0.80) return 'boolean';
  return 'categorical';
}

function parseNumericValue(val) {
  if (val === null || val === undefined || val === '') return NaN;
  if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;

  let s = String(val).trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[₹$€£\s%]/g, '');
  if (s.includes(',') && !s.includes('.')) {
    const parts = s.split(',');
    const last = parts[parts.length - 1];
    s = last.length > 0 && last.length <= 2
      ? `${parts.slice(0, -1).join('')}.${last}`
      : parts.join('');
  } else {
    s = s.replace(/,/g, '');
  }
  if (!/^[+-]?\d*(\.\d+)?$/.test(s) || !s || s === '.') return NaN;
  const parsed = Number(s);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : NaN;
}

function profileNumericColumn(values) {
  const nums = values.map(parseNumericValue).filter(n => !isNaN(n));
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = sum / nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const variance = nums.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / nums.length;
  const stdev = Math.sqrt(variance);
  return {
    sum: Math.round(sum * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    stdev: Math.round(stdev * 100) / 100,
    count: nums.length,
  };
}

function profileCategoricalColumn(values) {
  const freq = {};
  values.forEach(v => {
    const k = String(v ?? 'N/A').trim();
    if (k !== '') freq[k] = (freq[k] || 0) + 1;
  });
  const topValues = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));
  return {
    uniqueCount: Object.keys(freq).length,
    topValues,
  };
}

function profileDateColumn(values) {
  const dates = values
    .map(v => {
      if (v instanceof Date) return v;
      const s = String(v).trim();
      const parts = s.split(/[-/]/);
      if (parts.length === 3 && String(parts[2]).length === 4) {
        const [p0, p1, p2] = parts.map(p => parseInt(p, 10));
        if (![p0, p1, p2].some(Number.isNaN)) {
          const dayFirst = p0 > 12 || p1 <= 12;
          const d2 = new Date(p2, (dayFirst ? p1 : p0) - 1, dayFirst ? p0 : p1);
          if (!isNaN(d2.getTime())) return d2;
        }
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    })
    .filter(Boolean);

  if (dates.length === 0) return null;
  const sorted = dates.sort((a, b) => a - b);
  return {
    earliest: sorted[0].toISOString().split('T')[0],
    latest: sorted[sorted.length - 1].toISOString().split('T')[0],
    count: dates.length,
  };
}

/**
 * Build a comprehensive DataProfile from columns and rows.
 * @param {string[]} columns
 * @param {object[]} rows
 * @param {string} fileName
 * @param {string[]} sheetNames
 * @returns {DataProfile}
 */
export function buildDataProfile(columns, rows, fileName, sheetNames) {
  const columnProfiles = columns.map(col => {
    const allValues = rows.map(r => r[col]);
    const nonEmpty = allValues.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    const nullCount = allValues.length - nonEmpty.length;
    const uniqueSet = new Set(nonEmpty.map(v => String(v).trim()));

    const detectedType = detectColumnType(nonEmpty.slice(0, 200));

    const profile = {
      name: col,
      detectedType,
      nullCount,
      nullRate: parseFloat((nullCount / (allValues.length || 1)).toFixed(4)),
      uniqueCount: uniqueSet.size,
      uniqueRate: parseFloat((uniqueSet.size / (nonEmpty.length || 1)).toFixed(4)),
      sampleValues: nonEmpty.slice(0, 20).map(v => String(v)),
      numericStats: null,
      categoricalStats: null,
      dateStats: null,
    };

    if (detectedType === 'numeric') {
      profile.numericStats = profileNumericColumn(nonEmpty);
    } else if (detectedType === 'date') {
      profile.dateStats = profileDateColumn(nonEmpty);
      profile.categoricalStats = profileCategoricalColumn(nonEmpty); // fallback for AI
    } else {
      profile.categoricalStats = profileCategoricalColumn(nonEmpty);
    }

    return profile;
  });

  // First 100 clean rows (no internal _meta keys)
  const sampleRows = rows.slice(0, 100).map(row => {
    const clean = {};
    columns.forEach(col => { clean[col] = row[col]; });
    return clean;
  });

  return {
    fileName,
    sheetNames,
    rowCount: rows.length,
    colCount: columns.length,
    columns: columnProfiles,
    sampleRows,
  };
}
