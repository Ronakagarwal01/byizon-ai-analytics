import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Globe2,
  HelpCircle,
  Languages,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Workflow,
} from 'lucide-react';
import { getAiWorkspaceOnboarding, saveAiWorkspaceOnboarding } from '../api/universalBackend';
import { useWorkspaceUser, workspaceInitials } from '../utils/workspaceUser';
import './PublicPages.css';

const STEPS = [
  ['Company Information', 'Completed'],
  ['Team Members', 'Completed'],
  ['Choose Your Data Source', 'Completed'],
  ['AI Assistant Setup', 'Configure preferences'],
  ["You’re All Set", 'Start exploring Byizon'],
];

const FIELD_OPTIONS = {
  businessType: ['B2B SaaS', 'CRM / Sales', 'Finance & Analytics', 'E-commerce', 'Agency / Services', 'Manufacturing', 'Other'],
  primaryDepartment: ['Sales', 'Marketing', 'Finance', 'Operations', 'Customer Support', 'Leadership', 'Product'],
  industry: ['Technology', 'Finance', 'Retail', 'Healthcare', 'Education', 'Manufacturing', 'Professional Services'],
  preferredLanguage: ['English + Hindi', 'Hindi', 'English', 'Hinglish / Roman Hindi'],
  timeZone: ['(GMT +05:30) Asia/Kolkata', '(GMT +00:00) London', '(GMT -05:00) New York', '(GMT -08:00) Los Angeles', '(GMT +04:00) Dubai'],
  currency: ['INR (₹) – Indian Rupee', 'USD ($) – US Dollar', 'EUR (€) – Euro', 'GBP (£) – British Pound', 'AED (د.إ) – UAE Dirham'],
};

const FIELD_META = [
  { key: 'businessType', label: 'Business Type', placeholder: 'Select your business type', icon: BriefcaseBusiness },
  { key: 'primaryDepartment', label: 'Primary Department', placeholder: 'Select primary department', icon: Users },
  { key: 'industry', label: 'Industry', placeholder: 'Select your industry', icon: Building2 },
  { key: 'preferredLanguage', label: 'Preferred Language', placeholder: 'Select language', icon: Languages },
  { key: 'timeZone', label: 'Time Zone', placeholder: '(GMT +05:30) Asia/Kolkata', icon: Clock3 },
  { key: 'currency', label: 'Currency', placeholder: 'INR (₹) – Indian Rupee', icon: WalletCards },
];

const CAPABILITIES = [
  ['Understand your business', BriefcaseBusiness],
  ['Analyze your data', BarChart3],
  ['Generate smart reports', FileText],
  ['Answer your questions', MessageCircleQuestion],
  ['Automate tasks', Workflow],
];

const DEFAULT_FORM = {
  businessType: '',
  primaryDepartment: '',
  industry: '',
  preferredLanguage: '',
  timeZone: '(GMT +05:30) Asia/Kolkata',
  currency: 'INR (₹) – Indian Rupee',
};

export default function OnboardingAiWorkspace() {
  const navigate = useNavigate();
  const workspaceUser = useWorkspaceUser();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const profileName = workspaceUser.displayName || 'Workspace Admin';
  const profileInitials = workspaceInitials(workspaceUser);

  useEffect(() => {
    let mounted = true;
    getAiWorkspaceOnboarding()
      .then(saved => {
        if (!mounted || !saved) return;
        setForm({
          businessType: saved.businessType || '',
          primaryDepartment: saved.primaryDepartment || '',
          industry: saved.industry || '',
          preferredLanguage: saved.preferredLanguage || '',
          timeZone: saved.timeZone || DEFAULT_FORM.timeZone,
          currency: saved.currency || DEFAULT_FORM.currency,
        });
      })
      .catch(() => {
        const cached = localStorage.getItem('byizon_onboarding_ai_workspace');
        if (cached && mounted) {
          try { setForm({ ...DEFAULT_FORM, ...JSON.parse(cached) }); } catch { /* ignore bad cache */ }
        }
      });
    return () => { mounted = false; };
  }, []);

  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setNotice(null);
  };

  const continueNext = async () => {
    if (saving) return;
    const requiredMissing = FIELD_META.filter(field => !form[field.key]).map(field => field.label);
    if (requiredMissing.length) {
      setNotice({ type: 'error', text: `${requiredMissing.join(', ')} required.` });
      return;
    }
    setSaving(true);
    try {
      localStorage.setItem('byizon_onboarding_ai_workspace', JSON.stringify(form));
      await saveAiWorkspaceOnboarding({
        businessType: form.businessType,
        primaryDepartment: form.primaryDepartment,
        industry: form.industry,
        preferredLanguage: form.preferredLanguage,
        timeZone: form.timeZone,
        currency: form.currency,
      });
      setNotice({ type: 'success', text: 'AI workspace preferences saved.' });
      window.setTimeout(() => navigate('/onboarding/complete'), 450);
    } catch {
      localStorage.setItem('byizon_onboarding_ai_workspace', JSON.stringify(form));
      setNotice({ type: 'success', text: 'AI workspace preferences saved locally.' });
      window.setTimeout(() => navigate('/onboarding/complete'), 450);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="onboarding-page onboarding-team-page onboarding-ai-workspace-page">
      <aside className="onboarding-rail onboarding-team-rail">
        <div className="onboarding-rail-art" />
        <Link className="signup-logo onboarding-logo" to="/landing">
          BYiZON
          <span>AI POWERED BUSINESS OS</span>
        </Link>

        <div className="onboarding-rail-heading compact ai-rail-heading">
          <h1>Let&apos;s personalize your workspace</h1>
          <p>Tell us a few things about your business so Byizon AI can work better for you.</p>
        </div>

        <div className="onboarding-steps">
          {STEPS.map(([title, detail], index) => {
            const active = index === 3;
            const done = index < 3;
            return (
              <article className={active ? 'active' : done ? 'done' : ''} key={title}>
                <span className="onboarding-step-number">{done ? <Check size={15} /> : index + 1}</span>
                <span className="onboarding-step-icon">
                  {index === 0 ? <BriefcaseBusiness size={16} /> : index === 1 ? <Users size={16} /> : index === 2 ? <Globe2 size={16} /> : index === 3 ? <Bot size={16} /> : <CheckCircle2 size={16} />}
                </span>
                <div><strong>{title}</strong><small>{detail}</small></div>
              </article>
            );
          })}
        </div>

        <div className="signup-security-card onboarding-security-card">
          <Sparkles size={22} />
          <div>
            <strong>Tailored AI, smarter insights.</strong>
            <span>These preferences help Byizon AI deliver accurate and relevant insights for your business.</span>
          </div>
        </div>
      </aside>

      <section className="onboarding-card-shell">
        <form className="onboarding-card onboarding-ai-card" onSubmit={event => { event.preventDefault(); continueNext(); }}>
          <div className="onboarding-topline data-source-topline">
            <div>
              <span>Step 4 of 5</span>
              <div className="onboarding-progress-bars ai-progress-bars" aria-hidden="true">
                <i className="active done" /><i className="active done" /><i className="active done" /><i className="active" /><i />
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

          <div className="ai-workspace-layout">
            <section className="ai-workspace-main">
              <div className="onboarding-title ai-workspace-title">
                <h2>Configure your AI workspace <Sparkles size={22} /></h2>
                <p>Help Byizon AI understand your business better.</p>
              </div>

              {notice && (
                <div className={`signup-notice ${notice.type}`}>
                  {notice.type === 'success' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                  <span>{notice.text}</span>
                </div>
              )}

              <div className="ai-field-stack">
                {FIELD_META.map(({ key, label, placeholder, icon: Icon }) => (
                  <label className="ai-select-field" key={key}>
                    <Icon size={20} />
                    <span>
                      <strong>{label}</strong>
                      <select value={form[key]} onChange={event => update(key, event.target.value)}>
                        <option value="">{placeholder}</option>
                        {FIELD_OPTIONS[key].map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </span>
                  </label>
                ))}
              </div>

              <section className="ai-info-note">
                <Bot size={28} />
                <p>Byizon AI will use these details to provide smarter insights, recommendations and reports that matter to your business.</p>
              </section>
            </section>

            <aside className="ai-workspace-side">
              <section className="ai-assistant-card">
                <h3>Meet Your AI Assistant <Sparkles size={15} /></h3>
                <div className="ai-orb" aria-hidden="true">
                  <div className="ai-face"><i /><i /></div>
                </div>
                <p>Byizon AI is ready to work with you 24/7</p>
                <div className="ai-capabilities">
                  {CAPABILITIES.map(([label, Icon]) => (
                    <span key={label}><Check size={13} /><Icon size={14} /> {label}</span>
                  ))}
                </div>
              </section>

              <section className="ai-privacy-card">
                <ShieldCheck size={19} />
                <strong>Your data is safe with us</strong>
                <p>We use enterprise-grade security and never share your data with anyone.</p>
                <button type="button" onClick={() => navigate('/privacy')}>Learn more <ArrowRight size={13} /></button>
              </section>
            </aside>
          </div>

          <div className="onboarding-actions ai-actions">
            <button type="button" className="onboarding-back" onClick={() => navigate('/onboarding/data-source')}><ArrowLeft size={16} /> Back</button>
            <button className="signup-primary onboarding-continue" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Continue'} <ArrowRight size={17} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
