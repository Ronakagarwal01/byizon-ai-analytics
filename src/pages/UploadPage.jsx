import { useNavigate } from 'react-router-dom';
import { BarChart3, Clock3, Database, FileCheck2, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import ExcelUploader from '../components/ExcelUploader';
import QuickConnections from '../components/QuickConnections';
import Sidebar from '../components/Sidebar';

export default function UploadPage() {
  const navigate = useNavigate();

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="upload-page-shell">
        <section className="upload-hero-card">
          <div className="upload-page-copy">
            <div className="upload-page-badge">
              <Sparkles size={14} />
              Universal Data Pipeline
            </div>
            <h1>Turn files into a live dashboard</h1>
            <p>
              Upload Excel, CSV, JSON or document exports. Byizon profiles the dataset,
              detects useful columns, and prepares dashboard-ready insights without sending
              raw rows to the assistant.
            </p>

            <div className="upload-assurance-grid" aria-label="Analysis guarantees">
              <div className="upload-assurance-item">
                <ShieldCheck size={18} />
                <div>
                  <strong>Session isolated</strong>
                  <span>New upload clears old dashboard and chat context.</span>
                </div>
              </div>
              <div className="upload-assurance-item">
                <Database size={18} />
                <div>
                  <strong>Universal parsing</strong>
                  <span>CSV, Excel, JSON, PDF, TXT, SQL, and DB exports.</span>
                </div>
              </div>
              <div className="upload-assurance-item">
                <Sparkles size={18} />
                <div>
                  <strong>Adaptive output</strong>
                  <span>Dashboard, report, charts, KPIs, and chatbot.</span>
                </div>
              </div>
            </div>

            <div className="upload-workflow-panel" aria-label="What Byizon prepares after upload">
              <div className="upload-workflow-heading">
                <Clock3 size={16} />
                <span>What happens after upload</span>
              </div>
              <div className="upload-workflow-list">
                <div className="upload-workflow-step">
                  <FileCheck2 size={18} />
                  <div>
                    <strong>Clean schema</strong>
                    <span>Columns, types, missing values, and duplicates are mapped first.</span>
                  </div>
                </div>
                <div className="upload-workflow-step">
                  <BarChart3 size={18} />
                  <div>
                    <strong>Instant visuals</strong>
                    <span>Key totals, trends, segments, and quality checks are prepared quickly.</span>
                  </div>
                </div>
                <div className="upload-workflow-step">
                  <Workflow size={18} />
                  <div>
                    <strong>Private AI context</strong>
                    <span>The chatbot receives compact evidence, not your complete file.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="upload-panel-card">
            <ExcelUploader onAnalysisComplete={() => navigate('/dashboard')} />
            <QuickConnections />
          </div>
        </section>
      </main>
    </div>
  );
}
