import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CloudUpload,
  Database,
  FileSpreadsheet,
  HelpCircle,
  Link as LinkIcon,
  PlugZap,
  Sparkles,
  UploadCloud,
  Zap,
} from 'lucide-react';
import './PublicPages.css';
import './OnboardingOverrides.css';
import { useWorkspaceUser, workspaceInitials } from '../utils/workspaceUser';
import { saveDataSourceOnboarding } from '../api/universalBackend';

const STEPS = [
  ['Company Information', 'Completed'],
  ['Team Members', 'Completed'],
  ['Choose Your Data Source', 'Upload files or connect your apps'],
  ['AI Assistant Setup', 'Configure preferences'],
  ["You’re All Set", 'Start exploring Byizon'],
];

const SOURCES = [
  {
    id: 'upload',
    title: 'Upload Files',
    badge: 'Quick Start',
    icon: CloudUpload,
    description: 'Upload your business files and get AI insights instantly.',
    chips: ['Excel', 'CSV', 'PDF', 'Word'],
    bullets: ['Get insights in 30 seconds', 'Perfect for one-time analysis', 'No setup required'],
    cta: 'Upload Files',
  },
  {
    id: 'apps',
    title: 'Connect Apps',
    icon: LinkIcon,
    description: 'Connect your favorite apps for real-time data sync.',
    chips: ['HubSpot', 'Gmail', 'Slack', 'Sheets'],
    bullets: ['Real-time data sync', 'Automatic updates', 'More powerful insights'],
    cta: 'Connect Apps',
  },
  {
    id: 'database',
    title: 'Connect Database',
    icon: Database,
    description: 'Connect your database for live business data.',
    chips: ['MySQL', 'Postgres', 'SQL Server', 'More'],
    bullets: ['Live data connection', 'Custom SQL queries', 'Enterprise ready'],
    cta: 'Connect Database',
  },
];

export default function OnboardingDataSource() {
  const navigate = useNavigate();
  const workspaceUser = useWorkspaceUser();
  const [selectedSource, setSelectedSource] = useState('upload');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const profileName = workspaceUser.displayName || 'Workspace Admin';
  const profileInitials = workspaceInitials(workspaceUser);

  const openSource = (sourceId) => {
    localStorage.setItem('byizon_onboarding_data_source', sourceId);
    setSelectedSource(sourceId);
    setNotice({ type: 'success', text: 'Data source selected. Continue to save this choice.' });
  };

  const continueNext = async () => {
    if (!selectedSource || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      await saveDataSourceOnboarding(selectedSource);
      localStorage.setItem('byizon_onboarding_data_source', selectedSource);
      navigate('/onboarding/ai-workspace');
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Data source save nahi ho paya.' });
    } finally {
      setSaving(false);
    }
  };

  const skipForNow = async () => {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      await saveDataSourceOnboarding('later');
      localStorage.setItem('byizon_onboarding_data_source', 'later');
      navigate('/onboarding/ai-workspace');
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Step skip nahi ho paya.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="onboarding-page onboarding-team-page onboarding-data-source-page">
      <aside className="onboarding-rail onboarding-team-rail">
        <div className="onboarding-rail-art" />
        <Link className="signup-logo onboarding-logo" to="/landing">
          BYiZON
          <span>AI POWERED BUSINESS OS</span>
        </Link>

        <div className="onboarding-rail-heading compact">
          <h1>Let&apos;s set up your workspace</h1>
          <p>Follow these simple steps to get started with Byizon.</p>
        </div>

        <div className="onboarding-steps">
          {STEPS.map(([title, detail], index) => {
            const active = index === 2;
            const done = index < 2;
            return (
              <article className={active ? 'active' : done ? 'done' : ''} key={title}>
                <span className="onboarding-step-number">{done ? <Check size={15} /> : index + 1}</span>
                <span className="onboarding-step-icon">
                  {index === 0 ? <FileSpreadsheet size={16} /> : index === 1 ? <PlugZap size={16} /> : index === 2 ? <UploadCloud size={16} /> : index === 3 ? <Bot size={16} /> : <CheckCircle2 size={16} />}
                </span>
                <div><strong>{title}</strong><small>{detail}</small></div>
              </article>
            );
          })}
        </div>

        <div className="signup-security-card onboarding-security-card">
          <Zap size={22} />
          <div>
            <strong>Always flexible</strong>
            <span>You can connect more sources anytime from Integrations.</span>
          </div>
        </div>
      </aside>

      <section className="onboarding-card-shell">
        <form className="onboarding-card onboarding-data-source-card" onSubmit={event => { event.preventDefault(); continueNext(); }}>
          <div className="onboarding-topline data-source-topline">
            <div>
              <span>Step 3 of 5</span>
              <div className="onboarding-progress-bars" aria-hidden="true">
                <i className="active done" /><i className="active done" /><i className="active" /><i /><i />
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

          <div className="onboarding-title data-source-title">
            <h2>Choose how you want to bring your data</h2>
            <p>Start with any option. You can connect more apps or upload files later anytime.</p>
          </div>

          {notice && (
            <div className={`signup-notice ${notice.type}`}>
              <CheckCircle2 size={18} /><span>{notice.text}</span>
            </div>
          )}

          <div className="data-source-grid" role="radiogroup" aria-label="Choose your data source">
            {SOURCES.map(source => {
              const Icon = source.icon;
              const selected = selectedSource === source.id;
              return (
                <button
                  aria-checked={selected}
                  className={`data-source-option ${selected ? 'selected' : ''}`}
                  key={source.id}
                  onClick={(event) => {
                    setSelectedSource(source.id);
                    if (event.target.closest('.data-source-card-cta')) {
                      openSource(source.id);
                    }
                  }}
                  role="radio"
                  type="button"
                >
                  <span className="data-source-icon"><Icon size={26} /></span>
                  <span className="data-source-heading">
                    <strong>{source.title}</strong>
                    {source.badge && <em>{source.badge}</em>}
                  </span>
                  <span className="data-source-description">{source.description}</span>
                  <span className="data-source-chips">
                    {source.chips.map(chip => <small key={chip}>{chip}</small>)}
                  </span>
                  <span className="data-source-bullets">
                    {source.bullets.map(item => (
                      <span key={item}><Check size={13} /> {item}</span>
                    ))}
                  </span>
                  <span className="data-source-card-cta">{source.cta}</span>
                  {source.id === 'upload' && <span className="data-source-recommend">Recommended for quick start</span>}
                </button>
              );
            })}
          </div>

          <section className="data-source-note">
            <Sparkles size={24} />
            <div>
              <strong>Not sure which one to choose?</strong>
              <p>No worries! You can start with Upload Files for quick insights and connect apps or databases anytime later from Integrations.</p>
            </div>
            <button type="button" onClick={() => openSource('apps')}>Choose apps <ArrowRight size={14} /></button>
          </section>

          <div className="onboarding-actions data-source-bottom-actions">
            <button type="button" className="onboarding-back" onClick={() => navigate('/onboarding/team')}><ArrowLeft size={16} /> Back</button>
            <button type="button" className="onboarding-skip" onClick={skipForNow} disabled={saving}>Skip for now</button>
            <button className="signup-primary onboarding-continue" type="submit" disabled={saving || !selectedSource}>
              {saving ? 'Saving...' : 'Continue'} <ArrowRight size={17} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
