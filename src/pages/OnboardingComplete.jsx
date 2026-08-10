import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  HelpCircle,
  PlayCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import './PublicPages.css';
import { useWorkspaceUser, workspaceInitials } from '../utils/workspaceUser';
import { completeOnboarding } from '../api/universalBackend';

const STEPS = [
  ['Company Information', 'Completed'],
  ['Team Members', 'Completed'],
  ['Choose Your Data Source', 'Completed'],
  ['AI Assistant Setup', 'Completed'],
  ["You’re All Set", 'Start exploring Byizon'],
];

const READY_ITEMS = [
  {
    title: 'Company Workspace',
    detail: 'Your company workspace has been created successfully.',
    icon: BarChart3,
    className: 'workspace',
  },
  {
    title: 'Team (Optional)',
    detail: 'You can invite more members anytime from workspace settings.',
    icon: Users,
    className: 'team',
  },
  {
    title: 'Data Source',
    detail: 'Your data source is configured and ready to use.',
    icon: FileSpreadsheet,
    className: 'data',
  },
  {
    title: 'AI Assistant',
    detail: 'Byizon AI is all set to analyze your data and generate smart insights.',
    icon: Bot,
    className: 'assistant',
  },
];

const SHORTCUTS = [
  { label: 'Excel', color: 'green' },
  { label: 'CSV', color: 'mint' },
  { label: 'PDF', color: 'red' },
  { label: '+', color: 'plain' },
];

export default function OnboardingComplete() {
  const navigate = useNavigate();
  const workspaceUser = useWorkspaceUser();
  const [activating, setActivating] = useState(false);
  const [notice, setNotice] = useState(null);
  const profileName = workspaceUser.displayName || 'Workspace Admin';
  const profileInitials = workspaceInitials(workspaceUser);

  const activateAccount = async destination => {
    if (activating) return;
    setActivating(true);
    setNotice(null);
    try {
      const payload = await completeOnboarding();
      localStorage.setItem('byizon_login_user', JSON.stringify({ ...workspaceUser, onboarding: payload.onboarding }));
      navigate(destination);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Account activate nahi ho paya.' });
      setActivating(false);
    }
  };

  return (
    <main className="onboarding-page onboarding-team-page onboarding-complete-page">
      <aside className="onboarding-rail onboarding-team-rail">
        <div className="onboarding-rail-art" />
        <Link className="signup-logo onboarding-logo" to="/landing">
          BYiZON
          <span>AI POWERED BUSINESS OS</span>
        </Link>

        <div className="onboarding-rail-heading compact complete-rail-heading">
          <h1>You&apos;re all set!</h1>
          <p>Your workspace is ready. Let&apos;s explore the power of Byizon AI.</p>
        </div>

        <div className="onboarding-steps">
          {STEPS.map(([title, detail], index) => {
            const active = index === 4;
            const done = index < 4;
            return (
              <article className={active ? 'active' : done ? 'done' : ''} key={title}>
                <span className="onboarding-step-number">{done ? <Check size={15} /> : index + 1}</span>
                <span className="onboarding-step-icon">
                  {index === 0 ? <BarChart3 size={16} /> : index === 1 ? <Users size={16} /> : index === 2 ? <FileSpreadsheet size={16} /> : index === 3 ? <Bot size={16} /> : <CheckCircle2 size={16} />}
                </span>
                <div><strong>{title}</strong><small>{detail}</small></div>
              </article>
            );
          })}
        </div>

        <div className="signup-security-card onboarding-security-card">
          <Sparkles size={22} />
          <div>
            <strong>Pro Tip</strong>
            <span>Upload your first file or connect an app to unlock the full power of AI insights.</span>
          </div>
        </div>
      </aside>

      <section className="onboarding-card-shell">
        <section className="onboarding-card onboarding-complete-card">
          <div className="onboarding-topline data-source-topline">
            <div>
              <span>Step 5 of 5</span>
              <div className="onboarding-progress-bars complete-progress-bars" aria-hidden="true">
                <i className="active done" /><i className="active done" /><i className="active done" /><i className="active done" /><i className="active" />
              </div>
            </div>
            <div className="data-source-actions-top">
              <button type="button" className="onboarding-help"><HelpCircle size={15} /> Need Help?</button>
              <div className="data-source-profile" aria-label="Current workspace admin">
                <span>{profileInitials}</span>
                <strong>{profileName}<small>{workspaceUser.role || 'Super Admin'}</small></strong>
              </div>
            </div>
          </div>

          <div className="complete-success">
            <div className="success-confetti" aria-hidden="true">
              <span /><span /><span /><span /><span /><span /><span /><span />
            </div>
            <div className="success-ring">
              <Check size={54} />
            </div>
            <h2>Your Byizon workspace is ready!</h2>
            <p>Everything is set up. You can start exploring and getting AI-powered insights from your business data.</p>
          </div>

          {notice && (
            <div className={`signup-notice ${notice.type}`}>
              <ShieldCheck size={18} /><span>{notice.text}</span>
            </div>
          )}

          <section className="complete-panel">
            <h3>What&apos;s ready for you</h3>
            <div className="complete-ready-grid">
              {READY_ITEMS.map(({ title, detail, icon: Icon, className }) => (
                <article className={`complete-ready-card ${className}`} key={title}>
                  <span className="ready-icon"><Icon size={30} /></span>
                  <CheckCircle2 className="ready-check" size={18} />
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </article>
              ))}
            </div>

            <div className="complete-unlock">
              <Sparkles size={25} />
              <div>
                <strong>You&apos;re ready to unlock powerful insights!</strong>
                <p>Upload files, connect more apps, or ask Byizon AI anything about your business.</p>
              </div>
              <div className="complete-shortcuts" aria-label="Quick upload formats">
                {SHORTCUTS.map(item => (
                  <button className={item.color} key={item.label} type="button" onClick={() => navigate(item.label === '+' ? '/connections' : '/upload')}>
                    {item.label === '+' ? <Plus size={18} /> : item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="complete-actions">
              <button className="complete-back" type="button" onClick={() => navigate('/onboarding/ai-workspace')}>
                <ArrowLeft size={16} /> Back
              </button>
              <button className="signup-primary complete-dashboard" type="button" onClick={() => activateAccount('/dashboard')} disabled={activating}>
                {activating ? 'Activating account...' : 'Create Account & Open Dashboard'} <ArrowRight size={17} />
              </button>
              <button className="complete-tour" type="button" onClick={() => activateAccount('/chat')} disabled={activating}>
                <PlayCircle size={17} /> Take a Quick Tour
              </button>
            </div>
          </section>
        </section>
      </section>

      <footer className="onboarding-complete-footer">
        <article><BarChart3 size={22} /><div><strong>AI-Powered Insights</strong><span>Get intelligent insights from all your business data.</span></div></article>
        <article><Zap size={22} /><div><strong>Smart Automations</strong><span>Automate workflows and save valuable time.</span></div></article>
        <article><Upload size={22} /><div><strong>Real-time Reports</strong><span>Access real-time reports and dashboards instantly.</span></div></article>
        <article><ShieldCheck size={22} /><div><strong>Secure & Private</strong><span>Enterprise-grade security to keep your data protected.</span></div></article>
        <article><Sparkles size={22} /><div><strong>Scalable Growth</strong><span>Built to grow with your business seamlessly.</span></div></article>
      </footer>
    </main>
  );
}
