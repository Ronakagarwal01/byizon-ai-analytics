import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  HelpCircle,
  LayoutTemplate,
  MonitorSmartphone,
  Globe,
  Mail,
  MessageSquare,
  QrCode,
  Smartphone,
  ChevronDown
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useWorkspaceUser, workspaceInitials } from '../utils/workspaceUser';

const PROGRESS_STEPS = [
  { label: 'Reading Dashboard', icon: LayoutTemplate },
  { label: 'Creating Responsive Website', icon: MonitorSmartphone },
  { label: 'Optimizing for Mobile', icon: Smartphone },
  { label: 'Deploying Website', icon: Globe },
  { label: 'Live Website Ready', icon: CheckCircle2 }
];

export default function AIWebsiteGenerator() {
  const navigate = useNavigate();
  const user = useWorkspaceUser();
  const initials = workspaceInitials(user);
  const displayName = user.displayName || 'Super Admin';
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(p => {
        if (p >= 4) {
          clearInterval(timer);
          return 4;
        }
        return p + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="app-layout website-generator-layout">
      <Sidebar />
      <main className="generator-main">
        <header className="generator-header">
           <button className="back-btn" onClick={() => navigate('/dashboard')}><ArrowLeft size={16}/> Back to Dashboard</button>
           <div className="bot-title">
              <div className="bot-icon"><SparklesIcon /></div>
              <div>
                <h2>AI Website Generator</h2>
                <p>Dashboard &gt; Publish Website</p>
              </div>
            </div>
            
            <div className="header-right">
              <button className="btn-outline"><HelpCircle size={14}/> Need Help?</button>
              <div className="user-profile">
                <div className="avatar-circle">{initials}</div>
                <div>
                  <strong>{displayName}</strong>
                  <small>Super Admin</small>
                </div>
                <ChevronDown size={14}/>
              </div>
            </div>
        </header>

        <div className="generator-body">
          <div className="progress-tracker">
            {PROGRESS_STEPS.map((step, idx) => (
              <div key={idx} className={`progress-step ${idx < progress ? 'done' : idx === progress ? 'active' : ''}`}>
                 <div className="step-icon-wrap">
                   {idx < progress ? <CheckCircle2 size={24}/> : <step.icon size={24}/>}
                 </div>
                 <div>
                   <strong>{step.label}</strong>
                   <small>{idx < progress ? 'Completed' : idx === progress ? 'In progress...' : 'Pending'}</small>
                 </div>
              </div>
            ))}
          </div>

          <div className="mock-browser">
             <div className="browser-chrome">
               <div className="browser-dots"><span></span><span></span><span></span></div>
               <div className="browser-url-bar"><Globe size={14}/> https://preview.byizon.ai/workspace/analytics-84x2</div>
               <div className="browser-live-badge">LIVE</div>
               <MoreHorizontalIcon />
             </div>
             
             {/* Mock Dashboard Preview */}
             <div className="browser-content">
                <div className="preview-header">
                  <div>
                    <div className="dot celebso"></div>
                    <strong>Celebso Sales Dashboard</strong>
                  </div>
                  <span className="preview-period">Last 3 Months Overview<br/><small>1 Apr - 31 May 2026</small></span>
                </div>
                
                <div className="preview-kpi-grid">
                  <div className="kpi-card">
                    <small>Revenue</small>
                    <div><strong>₹48.2L</strong> <span className="trend up">12%</span></div>
                  </div>
                  <div className="kpi-card">
                    <small>Profit</small>
                    <div><strong>₹8.6L</strong> <span className="trend up">9%</span></div>
                  </div>
                  <div className="kpi-card">
                     <small>Loss</small>
                    <div><strong>₹1.4L</strong> <span className="trend down">18%</span></div>
                  </div>
                  <div className="kpi-card">
                     <small>Profit Margin</small>
                    <div><strong>17.8%</strong> <span className="trend up">1.2%</span></div>
                  </div>
                </div>

                <div className="preview-charts">
                   <div className="preview-chart">
                      <small>Revenue Trend</small>
                      <div className="mock-line"></div>
                   </div>
                   <div className="preview-chart">
                      <small>Sales by Region</small>
                      <div className="mock-donut"></div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </main>

      <aside className="generator-right-panel">
         {progress === 4 ? (
           <>
             <div className="success-hero">
                <CheckCircle2 size={48} color="#10b981"/>
                <h3>Website Published Successfully 🎉</h3>
                <p>Your dashboard is now live and ready to share.</p>
             </div>

             <div className="link-box">
                <div className="url-display">https://preview.byizon.ai/celebso-sales-dashboard</div>
                <button className="btn-primary w-full"><Copy size={14}/> Copy Link</button>
                <button className="btn-outline w-full"><ExternalLink size={14}/> Open Website</button>
             </div>

             <div className="share-section">
               <h4>Share via</h4>
               <div className="share-grid">
                  <div className="share-btn"><Mail color="#ef4444"/><span>Email</span></div>
                  <div className="share-btn"><MessageSquare color="#25d366"/><span>WhatsApp</span></div>
                  <div className="share-btn"><div style={{color:'#0077b5', fontWeight:800}}>in</div><span>LinkedIn</span></div>
                  <div className="share-btn"><MessageSquare color="#e11d48"/><span>Slack</span></div>
                  <div className="share-btn"><div style={{color:'#6366f1', fontWeight:800}}>T</div><span>Microsoft Teams</span></div>
                  <div className="share-btn"><div style={{color:'#475569', fontWeight:800}}>&lt;/&gt;</div><span>Copy Embed Code</span></div>
               </div>
               <button className="btn-outline w-full mt-16"><QrCode size={14}/> Generate QR Code</button>
             </div>

             <div className="details-checklist">
                <h4>Website Details</h4>
                <div className="check-grid">
                   <div><CheckCircle2 size={14} color="#10b981"/> Responsive</div>
                   <div><CheckCircle2 size={14} color="#10b981"/> AI Generated</div>
                   <div><CheckCircle2 size={14} color="#10b981"/> SEO Ready</div>
                   <div><CheckCircle2 size={14} color="#10b981"/> Public Link</div>
                   <div><CheckCircle2 size={14} color="#10b981"/> SSL Enabled</div>
                   <div><CheckCircle2 size={14} color="#10b981"/> Live & Secure</div>
                </div>
             </div>
           </>
         ) : (
           <div className="generating-state">
              <div className="loader-ring"></div>
              <h3>Generating Website...</h3>
              <p>Please wait while Byizon AI publishes your dashboard.</p>
           </div>
         )}
      </aside>
    </div>
  );
}

const SparklesIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path></svg>;
const MoreHorizontalIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>;

