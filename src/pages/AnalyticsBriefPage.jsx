import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Lightbulb,
  LineChart,
  Search,
  Send,
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
  if (!data) return 'Upload a CSV or Excel file, or connect a data source. Your analytics answers will appear here once data is available.';

  if (/kpi|metric|key|important|main|summary|overview/i.test(q)) {
    const lines = (data.kpis || []).slice(0, 8).map(kpi => `${kpi.label}: ${kpi.value}`);
    return lines.length
      ? `Key information:\n${lines.map(line => `• ${line}`).join('\n')}`
      : `The dataset contains ${formatValue(data.rowCount)} rows and ${(data.columns || []).length} columns. No KPI summary is available yet.`;
  }

  if (/hidden|insight|pattern|finding|secret|andar|chhupi|chupi/i.test(q)) {
    return hiddenFindings.length
      ? `Hidden/key findings:\n${hiddenFindings.map((line, index) => `${index + 1}. ${line}`).join('\n')}`
      : 'No hidden patterns have been detected yet. Review the data quality and anomalies section for potential issues.';
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
    return `${data.fileName} contains ${formatValue(data.rowCount)} rows and ${(data.columns || []).length} columns.\nColumns: ${(data.columns || []).slice(0, 18).join(', ')}${(data.columns || []).length > 18 ? '...' : ''}`;
  }

  return 'Ask about key metrics, hidden insights, data quality, anomalies, missing values, duplicate rows, or columns in this analytics report.';
}

export default function AnalyticsBriefPage() {
  const { uploadedData } = useData();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Ask a short question about this analytics report.' },
  ]);

  const hiddenFindings = useMemo(() => uploadedData ? buildHiddenFindings(uploadedData) : [], [uploadedData]);

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
            <div className="analytics-empty-intro">
              <span className="premium-page-eyebrow"><Sparkles size={14} /> Analytics brief</span>
              <h1>Turn business data into a clear analytics brief</h1>
              <p>Upload a CSV or Excel file, or connect a data source to generate decision-ready metrics, quality signals, and actionable insights.</p>
            </div>
            <div className="analytics-empty-actions">
              <Link to="/dashboard"><button className="btn-primary"><FileSpreadsheet size={16} /> Upload data</button></Link>
              <Link to="/connections"><button className="btn-outline"><Database size={16} /> Connect data</button></Link>
            </div>
            <div className="analytics-empty-capabilities">
              <article>
                <LineChart size={19} />
                <div><strong>Executive metrics</strong><span>Surface the KPIs and trends that matter most.</span></div>
              </article>
              <article>
                <Lightbulb size={19} />
                <div><strong>Automated insights</strong><span>Identify patterns, anomalies, and opportunities.</span></div>
              </article>
              <article>
                <CheckCircle2 size={19} />
                <div><strong>Data quality</strong><span>Review completeness, duplicates, and risk signals.</span></div>
              </article>
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
        <section className="analytics-brief-grid">
          <article className="analytics-brief-card analytics-wide">
            <div className="analytics-card-head">
              <Lightbulb size={18} />
              <div>
                <h2>Hidden information</h2>
                <p>Patterns, insights and signals</p>
              </div>
            </div>
            <ul className="analytics-finding-list analytics-finding-lines">
              {hiddenFindings.length ? hiddenFindings.slice(0, 6).map((finding, index) => (
                <li key={`${finding}-${index}`}>{finding}</li>
              )) : <li>No hidden pattern detected yet.</li>}
            </ul>
          </article>

        </section>

        <section className="analytics-mini-chat">
          <div className="analytics-mini-chat-head">
            <Bot size={17} />
            <div>
              <strong>Analytics Q/A</strong>
              <span>Answers based only on this report</span>
            </div>
          </div>
          <div className="analytics-mini-chat-messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`analytics-mini-msg ${message.role}`}>
                {message.text}
              </div>
            ))}
          </div>
          <form className="analytics-mini-chat-input" onSubmit={event => { event.preventDefault(); askMiniBot(); }}>
            <Search size={15} />
            <input
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder="Ask anything about this report..."
            />
            <button type="submit" disabled={!question.trim()} aria-label="Ask analytics question">
              <Send size={15} />
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
