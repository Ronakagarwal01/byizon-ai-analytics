/**
 * Stage 5: Schema Intelligence Agent
 *
 * Accuracy rule:
 * - KPI columns, chart columns, and derived formulas are selected locally from
 *   DataProfile statistics.
 * - Hugging Face is optional and used only for narrative enrichment when
 *   VITE_HF_SCHEMA_ENABLED=true and VITE_HF_API_KEY is configured.
 */

import { buildLocalSchema } from '../localSchemaAgent';
import { callHuggingFaceChat, hasHuggingFaceConfig } from '../huggingface';

function getCacheKey(metadata) {
  return `dsi_schema_v4__${metadata.fileName}__${metadata.rowCount}__${metadata.colCount}`;
}

function readCache(metadata) {
  try {
    const raw = localStorage.getItem(getCacheKey(metadata));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(metadata, schema) {
  try {
    localStorage.setItem(getCacheKey(metadata), JSON.stringify({ ...schema, _cachedAt: Date.now() }));
  } catch {
    // Cache is optional.
  }
}

function parseJSON(text) {
  const clean = String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in model response.');
  return JSON.parse(clean.slice(start, end + 1));
}

function mergeNarrative(localSchema, hfNarrative) {
  const schema = { ...localSchema };
  ['summary', 'conclusion', 'health', 'businessDomain', 'datasetType'].forEach(field => {
    if (typeof hfNarrative[field] === 'string' && hfNarrative[field].trim()) {
      schema[field] = hfNarrative[field].trim();
    }
  });

  ['insights', 'risks', 'opportunities', 'patterns', 'forecast', 'strengths', 'weaknesses', 'relationships'].forEach(field => {
    if (Array.isArray(hfNarrative[field])) {
      schema[field] = hfNarrative[field].map(String).filter(Boolean).slice(0, 8);
    }
  });

  if (Array.isArray(hfNarrative.recommendations)) {
    schema.recommendations = hfNarrative.recommendations
      .filter(item => item && typeof item === 'object')
      .map(item => ({ title: String(item.title || ''), desc: String(item.desc || '') }))
      .filter(item => item.title || item.desc)
      .slice(0, 6);
  }

  schema._model = `${import.meta.env.VITE_HF_MODEL || 'huggingface-router'} + local-schema`;
  schema._provider = 'huggingface';
  schema.isAIUnavailable = false;
  return schema;
}

async function enrichNarrativeWithHF(schemaPayload, localSchema, onProgress) {
  const enabled = import.meta.env.VITE_HF_SCHEMA_ENABLED === 'true';
  if (!enabled || !hasHuggingFaceConfig()) {
    return {
      ...localSchema,
      isAIUnavailable: false,
      aiNotice: hasHuggingFaceConfig()
        ? 'HF schema enrichment disabled; local deterministic schema used.'
        : 'HF token not configured; local deterministic schema used.',
    };
  }

  onProgress?.('Enriching narrative with Hugging Face...');
  const prompt = `
Return ONLY JSON. Do not change any column mapping, KPI, chart, or formula.
Create concise business narrative fields from this dataset profile and local schema.

Required JSON keys:
{
  "datasetType": string,
  "businessDomain": string,
  "summary": string,
  "insights": [string],
  "recommendations": [{"title": string, "desc": string}],
  "risks": [string],
  "opportunities": [string],
  "patterns": [string],
  "forecast": [string],
  "health": string,
  "strengths": [string],
  "weaknesses": [string],
  "conclusion": string
}

Dataset profile:
${JSON.stringify(schemaPayload, null, 2)}

Local schema source of truth:
${JSON.stringify({
    columnRoles: localSchema.columnRoles,
    derivedColumns: localSchema.derivedColumns,
    kpiList: localSchema.kpiList,
    chartList: localSchema.chartList,
  }, null, 2)}
`;

  const text = await callHuggingFaceChat(
    [
      { role: 'system', content: 'You are a careful BI report writer. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 900, temperature: 0.1, responseFormat: 'json' }
  );
  return mergeNarrative(localSchema, parseJSON(text));
}

export async function runAISchemaAgent(schemaPayload, onProgress) {
  const { metadata } = schemaPayload;

  onProgress?.('Checking local schema cache...');
  const cached = readCache(metadata);
  if (cached) {
    onProgress?.('Cached schema found');
    return { ...cached, _fromCache: true };
  }

  onProgress?.('Building deterministic schema from column profiles...');
  const localSchema = buildLocalSchema(schemaPayload);
  let schema;

  try {
    schema = await enrichNarrativeWithHF(schemaPayload, localSchema, onProgress);
  } catch (error) {
    console.warn('[SchemaAgent] HF enrichment failed; using local schema:', error);
    schema = {
      ...localSchema,
      isAIUnavailable: true,
      aiNotice: 'HF enrichment failed; local deterministic schema used.',
      aiError: error?.message || 'Unknown Hugging Face error',
    };
  }

  schema._fromCache = false;
  writeCache(metadata, schema);
  onProgress?.(`Schema ready via ${schema._provider || 'local'}: "${schema.datasetType}"`);
  return schema;
}

export function clearSchemaCache(fileName, rowCount, colCount) {
  try {
    localStorage.removeItem(`dsi_schema_v4__${fileName}__${rowCount}__${colCount}`);
  } catch {
    // Silent.
  }
}
