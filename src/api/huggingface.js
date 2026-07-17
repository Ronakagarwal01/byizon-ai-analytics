import { askBackendChat } from './universalBackend';

const HF_BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_HF_MODEL = 'google/gemma-2-2b-it';

function getHFConfig() {
  const apiKey = import.meta.env.VITE_HF_API_KEY || import.meta.env.VITE_HUGGINGFACE_API_KEY || '';
  return {
    apiKey: apiKey.trim(),
    baseUrl: (import.meta.env.VITE_HF_API_BASE || HF_BASE_URL).replace(/\/$/, ''),
    model: import.meta.env.VITE_HF_MODEL || DEFAULT_HF_MODEL,
  };
}

export function hasHuggingFaceConfig() {
  return Boolean(getHFConfig().apiKey);
}

export function handleHuggingFaceError(error) {
  const msg = error?.message || '';
  if (/401|403|unauthorized|forbidden|token|api key/i.test(msg)) {
    return 'Hugging Face token invalid ya missing hai. .env me VITE_HF_API_KEY set karein.';
  }
  if (/429|rate|quota|exceeded/i.test(msg)) {
    return 'Hugging Face rate limit hit ho gaya. Local exact analysis abhi bhi available hai.';
  }
  if (/503|overload|unavailable|timeout/i.test(msg)) {
    return 'Hugging Face model temporarily unavailable hai. Thodi der baad try karein.';
  }
  if (/network|fetch|failed/i.test(msg)) {
    return 'Network error: Hugging Face API tak request nahi pahunchi.';
  }
  return `Hugging Face error: ${msg || 'Unknown error.'}`;
}

export async function callHuggingFaceChat(messages, options = {}) {
  const { apiKey, baseUrl, model } = getHFConfig();
  if (!apiKey) {
    throw new Error('Hugging Face API key is not configured.');
  }

  const body = {
    model: options.model || model,
    messages,
    max_tokens: options.maxTokens || 700,
    temperature: options.temperature ?? 0.2,
    stream: false,
  };

  if (options.responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const detail = json?.error?.message || json?.message || raw || response.statusText;
    throw new Error(`${response.status}: ${detail}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) {
    throw new Error('Empty response from Hugging Face model.');
  }
  return String(content).trim();
}

function compactKpis(data) {
  return (data.kpis || [])
    .map(k => `- ${k.label}: ${k.value}; formula=${k.explainability?.formula || 'n/a'}; source=${k.explainability?.sourceColumn || 'n/a'}`)
    .join('\n');
}

function compactAnomalies(data) {
  return (data.anomalies || [])
    .slice(0, 12)
    .map(a => {
      if (typeof a === 'string') return `- ${a}`;
      return `- ${a.severity || 'Info'} ${a.type || 'Anomaly'}: ${a.description || ''}`;
    })
    .join('\n');
}

function compactCharts(data) {
  return (data.charts || [])
    .slice(0, 4)
    .map(c => `- ${c.title || c.id}: ${(c.data || []).slice(0, 8).map(d => `${d.name ?? d.x}:${d.value ?? d.y}`).join(', ')}`)
    .join('\n');
}

function buildChatContext(data) {
  const roles = data.columnRoles || data.mappedCols || {};
  const business = data.businessSummary;
  return `
Dataset: ${data.fileName || 'dataset'}
Rows: ${(data.rowCount || 0).toLocaleString()}
Columns: ${(data.columns || []).join(', ')}
Type: ${data.datasetType || 'General'} | Domain: ${data.businessDomain || 'General'}
Quality: completeness=${data.dataQuality?.completeness ?? 'n/a'}%, score=${data.dataQuality?.quality ?? 'n/a'}/100
Model/engine: ${data.model || 'local'}

Column roles:
${Object.entries(roles).filter(([, value]) => value).map(([role, col]) => `- ${role}: ${col}`).join('\n') || '- none'}

Exact computed KPIs:
${compactKpis(data) || '- none'}

Business summary:
${business ? [
    `- Total ${business.salesLabel}: ${business.overall.totalSalesFormatted}`,
    `- Total Profit: ${business.overall.totalProfitFormatted}`,
    `- Avg Profit Margin: ${business.overall.avgProfitMarginFormatted}`,
    `- Total Units Sold: ${business.overall.totalUnitsFormatted}`,
  ].join('\n') : '- none'}

Chart samples:
${compactCharts(data) || '- none'}

Anomalies:
${compactAnomalies(data) || '- none'}

Executive summary:
${data.summary || 'No summary available.'}

Insights:
${(data.insights || []).map((x, i) => `${i + 1}. ${x}`).join('\n') || 'None'}

Recommendations:
${(data.recommendations || []).map((r, i) => `${i + 1}. ${r.title || ''}: ${r.desc || ''}`).join('\n') || 'None'}
`.trim();
}

function findMatchingKpis(data, query) {
  const q = query.toLowerCase();
  const kpis = data.kpis || [];
  const directPriority = [
    { rx: /profit|munafa|margin/i, match: /profit|margin/i },
    { rx: /net\s*sales|net sale|sales|revenue|income|bikri/i, match: /net|sales|revenue|income/i },
    { rx: /quantity|unit|units|sold|order/i, match: /quantity|unit|record|order/i },
    { rx: /cost|expense/i, match: /cost|expense/i },
  ];
  for (const rule of directPriority) {
    if (rule.rx.test(q)) {
      const found = kpis.filter(k => rule.match.test(`${k.label || ''} ${k.desc || ''}`));
      if (found.length) return found;
    }
  }

  return kpis.filter(k => {
    const label = `${k.label || ''} ${k.desc || ''}`.toLowerCase();
    return label.split(/\s+/).some(token => token.length > 3 && token !== 'total' && q.includes(token));
  });
}

function formatBusinessSummary(data) {
  const b = data.businessSummary;
  if (!b) return '';
  const lines = [
    `**Overall**`,
    `- Total ${b.salesLabel}: **${b.overall.totalSalesFormatted}**`,
    `- Total Profit: **${b.overall.totalProfitFormatted}**`,
    `- Avg Profit Margin: **${b.overall.avgProfitMarginFormatted}**`,
    `- Total Units Sold: **${b.overall.totalUnitsFormatted}**`,
  ];

  if (b.regionWise?.length) {
    lines.push('', `**Region-wise (${b.salesLabel})**`, ...b.regionWise.map(x => `- ${x.name}: **${x.value}**`));
  }
  if (b.categoryWise?.length) {
    lines.push('', `**Category-wise (${b.salesLabel})**`, ...b.categoryWise.map(x => `- ${x.name}: **${x.value}**`));
  }
  if (b.topSalesReps?.length) {
    lines.push('', `**Top Sales Reps**`, ...b.topSalesReps.slice(0, 3).map(x => `- ${x.name}: **${x.value}**`));
  }
  if (b.topProducts?.length) {
    lines.push('', `**Top Products by Sales**`, b.topProducts.map(x => `${x.name} (${x.value})`).join(' > '));
  }
  if (b.paymentModes?.length) {
    lines.push('', `**Payment Mode**`, b.paymentModes.map(x => `${x.name} (${x.count} orders)`).join(', '));
  }
  return lines.join('\n');
}

function isGreetingQuestion(question) {
  return /^(hi|hii|hello|hey|hlo|hy|namaste|namaskar|ram ram|good\s*(morning|afternoon|evening))[\s!.?]*$/i.test(question.trim());
}

function isDeterministicDataQuestion(question) {
  return /profit|margin|sales|revenue|income|quantity|unit|order|kpi|metric|summary|overview|region|category|product|payment|rep|sales rep|top|cost|average|avg|total|highest|lowest|anomal|outlier|column|schema/i.test(question);
}

function localAnswer(question, data) {
  if (!data) return 'Pehle Dashboard par CSV/Excel file upload karein, phir main exact analysis bata paunga.';

  const q = question.toLowerCase();
  const kpis = data.kpis || [];
  const kpiLines = kpis.map(k => `- **${k.label}:** ${k.value}`).join('\n');

  if (isGreetingQuestion(question)) {
    return [
      'Hello! Dataset loaded hai.',
      'Aap exact questions pooch sakte ho, jaise `total profit kitna hai`, `region-wise sales dikhao`, `top products`, `payment mode popularity`, ya `data me anomalies hai kya`.',
    ].join('\n\n');
  }

  if (/overall|summary|overview|region|category|sales rep|rep|product|payment|top/i.test(q) && data.businessSummary) {
    return formatBusinessSummary(data);
  }

  if (/profit|munafa|margin/i.test(q) && data.businessSummary) {
    return [
      `**Total Profit:** ${data.businessSummary.overall.totalProfitFormatted}`,
      `**Avg Profit Margin:** ${data.businessSummary.overall.avgProfitMarginFormatted}`,
      data.businessSummary.columns?.profit ? `Source column: \`${data.businessSummary.columns.profit}\`` : '',
    ].filter(Boolean).join('\n');
  }

  if (/column|field|schema|structure|datatype|data type/i.test(q)) {
    return `**${data.fileName}** me **${(data.rowCount || 0).toLocaleString()} rows** aur **${(data.columns || []).length} columns** hain.\n\nColumns: ${(data.columns || []).map(c => `\`${c}\``).join(', ')}`;
  }

  if (/anomal|outlier|problem|issue|risk|missing|duplicate/i.test(q)) {
    const anomalies = (data.anomalies || []).slice(0, 10);
    if (!anomalies.length) return 'Current analysis me koi critical anomaly detect nahi hui. Data quality panel me completeness aur duplicate score bhi review kar sakte hain.';
    return `Detected anomalies:\n\n${compactAnomalies({ anomalies })}`;
  }

  if (/recommend|suggest|action|next step|what should/i.test(q)) {
    const recs = data.recommendations || [];
    if (!recs.length) return 'Current dataset summary me recommendation available nahi hai.';
    return recs.map((r, i) => `**${i + 1}. ${r.title || 'Recommendation'}**\n${r.desc || ''}`).join('\n\n');
  }

  if (/hidden|insight|finding|pattern|trend|summary|overview|about|file/i.test(q)) {
    const patterns = data.hiddenPatterns || [];
    const insights = data.insights || [];
    const body = [
      data.summary || 'Summary not available.',
      patterns.length ? `\n**Hidden Patterns**\n${patterns.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '',
      insights.length ? `\n**Insights**\n${insights.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');
    return body;
  }

  const matched = findMatchingKpis(data, question);
  if (matched.length) {
    return matched.map(k => {
      const formula = k.explainability?.formula ? `\nFormula: \`${k.explainability.formula}\`` : '';
      return `**${k.label}: ${k.value}**${formula}`;
    }).join('\n\n');
  }

  if (/kpi|metric|revenue|sales|profit|cost|average|avg|total|highest|lowest|count|quantity|orders/i.test(q)) {
    return `Yeh exact computed KPIs hain:\n\n${kpiLines || 'No KPIs available.'}`;
  }

  if (/chart|breakdown|category|product|segment|top/i.test(q)) {
    return compactCharts(data) || 'Current dataset me chart breakdown available nahi hai.';
  }

  return [
    'Aapka question data-specific clear nahi laga. Main current uploaded dataset ke exact computed results se answer karta hoon.',
    'Try karein: `total profit kitna hai`, `net sales by region`, `top 5 products`, `category-wise sales`, `payment mode count`, ya `data quality summary`.',
  ].join('\n\n');
}

export async function askDataChat(question, data, history = []) {
  const connectedSourceRequest = (
    /\b(slack|channel|workspace|connected)\b/i.test(question)
    || /(?:se|waha|wahan).*(?:data|file|dataset)/i.test(question)
    || /(?:data|file|dataset).*(?:lao|lekar|mang|fetch|import)/i.test(question)
  ) && /analy|analysis|fetch|import|load|lao|lekar|mang|data|file|dataset|excel|sheet/i.test(question);
  if (!data) {
    try {
      return await askBackendChat(question, null, history);
    } catch {
      return 'Pehle file upload karein ya connected Slack channel/file ka naam batakar analysis request karein.';
    }
  }

  const local = () => localAnswer(question, data);
  if (data.engineType === 'python-pandas') {
    try {
      return await askBackendChat(question, data, history);
    } catch (error) {
      if (connectedSourceRequest) throw error;
      console.warn('[BackendChat] Falling back to local answer:', error);
    }
  }
  if (isGreetingQuestion(question) || isDeterministicDataQuestion(question)) return local();
  if (!hasHuggingFaceConfig()) return local();

  try {
    const messages = [
      {
        role: 'system',
        content: [
          'You are DSI Data Analyst.',
          'Answer only from the provided dataset context.',
          'Never invent, estimate, or recalculate hidden numbers.',
          'If a metric is not present, say it is not available in the current dataset summary.',
          'Keep answers concise, business-friendly, and use markdown.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `DATASET CONTEXT:\n${buildChatContext(data)}`,
      },
      ...history.slice(-6).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text || '',
      })),
      { role: 'user', content: question },
    ];

    return await callHuggingFaceChat(messages, { maxTokens: 700, temperature: 0.15 });
  } catch (error) {
    console.warn('[HuggingFaceChat] Falling back to local answer:', error);
    return local();
  }
}
