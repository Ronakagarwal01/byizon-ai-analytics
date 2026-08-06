import { useNavigate } from 'react-router-dom';
import { Database, ShieldCheck, Sparkles } from 'lucide-react';
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
              Universal AI Data Scientist Workflow
            </div>
            <h1>Upload your dataset for automatic analysis</h1>
            <p>
              Validate, parse, profile, visualize, discover patterns, check ML readiness,
              and prepare a professional report from one uploaded file.
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
