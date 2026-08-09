import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Database,
  FileSpreadsheet,
  Lightbulb,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useData } from '../context/DataContext';

function formatValue(value) {
  if (value === undefined || value === null || value === '') return 'N/A';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

function textFromInsight(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item.title || item.description || item.summary || item.message || JSON.stringify(item);
}

function buildHiddenFindings(data) {
  const hiddenPatterns = (data.hiddenPatterns || []).map(textFromInsight);
  const insightObjects = (data.insightObjects || data.insights || []).map(textFromInsight);
  const anomalyLines = (data.anomalies || []).slice(0, 6).map(item => {
    if (typeof item === 'string') return item;
    return `${item.severity || 'Info'} ${item.type || 'Finding'}: ${item.description || item.column || 'Review required'}`;
  });
  return [...hiddenPatterns, ...insightObjects, ...anomalyLines]
    .filter(Boolean)
    .slice(0, 10);
}

function answerAnalyticsQuestion(question, data, hiddenFindings) {
  const q = question.toLowerCase();
  if (!data) return 'Pehle CSV/Excel upload ya Connect data use karo. Uske baad yahaan analytics report ke answers milenge.';

  if (/kpi|metric|key|important|main|summary|overview/i.test(q)) {
    const lines = (data.kpis || []).slice(0, 8).map(kpi => `${kpi.label}: ${kpi.value}`);
    return lines.length
      ? `Key information:\n${lines.map(line => `• ${line}`).join('\n')}`
      : `Dataset me ${formatValue(data.rowCount)} rows aur ${(data.columns || []).length} columns hain. KPI list available nahi hai.`;
  }

  if (/hidden|insight|pattern|finding|secret|andar|chhupi|chupi/i.test(q)) {
    return hiddenFindings.length
      ? `Hidden/key findings:\n${hiddenFindings.map((line, index) => `${index + 1}. ${line}`).join('\n')}`
      : 'Is dataset me abhi hidden patterns detect nahi hue. Data quality aur anomalies section check kar sakte ho.';
  }

  if (/quality|missing|duplicate|null|empty|clean|outlier|anomaly|problem|issue|risk/i.test(q)) {
    const quality = data.dataQuality || {};
    const anomalies = data.anomalies || [];
    return [
      `Quality score: ${formatValue(quality.quality)}/100`,
      `Completeness: ${formatValue(quality.completeness)}%`,
      `Missing cells: ${formatValue(quality.emptyCount || quality.missingCellCount || 0)}`,
      `Duplicates: ${formatValue(quality.duplicatesCount || 0)}`,
      `Outliers/anomalies: ${formatValue(quality.outliersCount || anomalies.length || 0)}`,
    ].join('\n');
  }

  if (/column|field|schema|structure|rows|kitne|columns/i.test(q)) {
    return `${data.fileName} me ${formatValue(data.rowCount)} rows aur ${(data.columns || []).length} columns hain.\nColumns: ${(data.columns || []).slice(0, 18).join(', ')}${(data.columns || []).length > 18 ? '...' : ''}`;
  }

  return 'Is Analytics report ke baare me pooch sakte ho: key metrics, hidden insights, data quality, anomalies, missing values, duplicate rows, ya columns.';
}

export default function AnalyticsBriefPage() {
  const { uploadedData } = useData();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Analytics report ke baare me short question poochho.' },
  ]);

  const hiddenFindings = useMemo(() => uploadedData ? buildHiddenFindings(uploadedData) : [], [uploadedData]);
  const quality = uploadedData?.dataQuality || {};
  const keyKpis = (uploadedData?.kpis || []).slice(0, 8);
  const importantColumns = (uploadedData?.columns || []).slice(0, 16);
  const anomalies = (uploadedData?.anomalies || []).slice(0, 5);

  const askMiniBot = () => {
    const clean = question.trim();
    if (!clean) return;
    const response = answerAnalyticsQuestion(clean, uploadedData, hiddenFindings);
    setMessages(previous => [...previous.slice(-5), { role: 'user', text: clean }, { role: 'ai', text: response }]);
    setQuestion('');
  };

  if (!uploadedData) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content analytics-brief-page">
          <section className="analytics-brief-empty">
            <span className="premium-page-eyebrow"><Sparkles size={14} /> Analytics brief</span>
            <h1>Analytics report ke liye data upload karo</h1>
            <p>CSV/Excel upload ke baad yahaan sirf key information, hidden insights, quality signals aur mini Q/A bot dikhega.</p>
            <div>
              <Link to="/dashboard"><button className="btn-primary"><FileSpreadsheet size={16} /> Upload data</button></Link>
              <Link to="/connections"><button className="btn-outline"><Database size={16} /> Connect data</button></Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content analytics-brief-page">
        <section className="analytics-brief-hero">
          <div>
            <span className="premium-page-eyebrow"><Sparkles size={14} /> Hidden analytics brief</span>
            <h1>Only key information</h1>
            <p>{uploadedData.fileName} · {formatValue(uploadedData.rowCount)} rows · {(uploadedData.columns || []).length} columns</p>
          </div>
          <div className="analytics-brief-score">
            <ShieldCheck size={22} />
            <span>Quality score</span>
            <strong>{formatValue(quality.quality)}/100</strong>
          </div>
        </section>

        <section className="analytics-brief-grid">
          <article className="analytics-brief-card analytics-wide">
            <div className="analytics-card-head">
              <BarChart3 size={18} />
              <div>
                <h2>Key metrics</h2>
                <p>Uploaded data ki sabse important information</p>
              </div>
            </div>
            <div className="analytics-kpi-grid">
              {keyKpis.length ? keyKpis.map(kpi => (
                <div key={kpi.label} className="analytics-kpi">
                  <span>{kpi.label}</span>
                  <strong>{kpi.value}</strong>
                  {kpi.desc && <small>{kpi.desc}</small>}
                </div>
              )) : (
                <div className="analytics-muted-state">KPI data available nahi hai.</div>
              )}
            </div>
          </article>

          <article className="analytics-brief-card">
            <div className="analytics-card-head">
              <Database size={18} />
              <div>
                <h2>Data structure</h2>
                <p>Only useful schema snapshot</p>
              </div>
            </div>
            <div className="analytics-chip-list">
              {importantColumns.map(column => <span key={column}>{column}</span>)}
            </div>
          </article>

          <article className="analytics-brief-card">
            <div className="analytics-card-head">
              <Lightbulb size={18} />
              <div>
                <h2>Hidden information</h2>
                <p>Patterns, insights and signals</p>
              </div>
            </div>
            <ol className="analytics-finding-list">
              {hiddenFindings.length ? hiddenFindings.slice(0, 6).map((finding, index) => (
                <li key={`${finding}-${index}`}>{finding}</li>
              )) : <li>No hidden pattern detected yet.</li>}
            </ol>
          </article>

          <article className="analytics-brief-card">
            <div className="analytics-card-head">
              <AlertTriangle size={18} />
              <div>
                <h2>Quality & anomalies</h2>
                <p>Risk indicators only</p>
              </div>
            </div>
            <div className="analytics-quality-list">
              <span>Completeness <strong>{formatValue(quality.completeness)}%</strong></span>
              <span>Missing cells <strong>{formatValue(quality.emptyCount || 0)}</strong></span>
              <span>Duplicates <strong>{formatValue(quality.duplicatesCount || 0)}</strong></span>
              <span>Anomalies <strong>{formatValue(anomalies.length || quality.outliersCount || 0)}</strong></span>
            </div>
          </article>
        </section>

        <section className="analytics-mini-chat">
          <div className="analytics-mini-chat-head">
            <Bot size={17} />
            <div>
              <strong>Analytics Q/A</strong>
              <span>Sirf is report ke upar jawab</span>
            </div>
          </div>
          <div className="analytics-mini-chat-messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`analytics-mini-msg ${message.role}`}>
                {message.text}
              </div>
            ))}
          </div>
          <div className="analytics-mini-chat-input">
            <Search size={15} />
            <input
              value={question}
              onChange={event => setQuestion(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') askMiniBot();
              }}
              placeholder="Example: hidden insights kya hain?"
            />
            <button onClick={askMiniBot} disabled={!question.trim()} aria-label="Ask analytics question">
              <Send size={15} />
            </button>
          </div>
          <div className="analytics-mini-suggestions">
            {['Key metrics batao', 'Hidden insights kya hain?', 'Quality summary', 'Columns kya hain?'].map(item => (
              <button key={item} onClick={() => {
                setQuestion(item);
                const response = answerAnalyticsQuestion(item, uploadedData, hiddenFindings);
                setMessages(previous => [...previous.slice(-5), { role: 'user', text: item }, { role: 'ai', text: response }]);
              }}>{item}</button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
