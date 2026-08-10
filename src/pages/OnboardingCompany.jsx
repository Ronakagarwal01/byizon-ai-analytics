import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  Globe2,
  HelpCircle,
  Link as LinkIcon,
  ShieldCheck,
  UploadCloud,
  Users,
} from 'lucide-react';
import { getCompanyOnboarding, saveCompanyOnboarding } from '../api/universalBackend';
import './PublicPages.css';

const STEPS = [
  ['Company Information', 'Basic details about your company'],
  ['Team Members', 'Invite your team to collaborate'],
  ['Connect Apps', 'Integrate your favorite tools'],
  ['AI Assistant Setup', 'Configure your AI preferences'],
  ["You’re All Set", 'Start exploring Byizon'],
];

const INDUSTRIES = [
  'SaaS / Software',
  'Finance',
  'Healthcare',
  'Retail / Ecommerce',
  'Manufacturing',
  'Education',
  'Consulting',
  'Real Estate',
  'Other',
];

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];
const CURRENCIES = [
  ['INR', '₹ Indian Rupee (INR)'],
  ['USD', '$ US Dollar (USD)'],
  ['EUR', '€ Euro (EUR)'],
  ['GBP', '£ British Pound (GBP)'],
  ['AED', 'د.إ UAE Dirham (AED)'],
];
const TIME_ZONES = [
  ['Asia/Kolkata', '(GMT +05:30) India Standard Time'],
  ['UTC', '(GMT +00:00) UTC'],
  ['America/New_York', '(GMT -05:00) Eastern Time'],
  ['Europe/London', '(GMT +00:00) London'],
  ['Asia/Dubai', '(GMT +04:00) Dubai'],
];

const initialForm = {
  companyName: '',
  industry: '',
  companySize: '',
  website: '',
  companyDescription: '',
  logoDataUrl: '',
  defaultCurrency: 'INR',
  timeZone: 'Asia/Kolkata',
  accuracyConfirmed: false,
};

function WizardField({ label, icon: Icon, children }) {
  return (
    <label className="onboarding-field">
      <span>{label}</span>
      <div className="onboarding-input-wrap">
        {Icon && <Icon size={17} aria-hidden="true" />}
        {children}
      </div>
    </label>
  );
}

export default function OnboardingCompany() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const remaining = 500 - form.companyDescription.length;

  const canContinue = useMemo(() => (
    form.companyName.trim()
    && form.industry
    && form.companySize
    && form.defaultCurrency
    && form.timeZone
    && form.accuracyConfirmed
  ), [form]);

  useEffect(() => {
    let mounted = true;
    getCompanyOnboarding()
      .then(saved => {
        if (!mounted || !saved) return;
        setForm(current => ({
          ...current,
          companyName: saved.companyName || '',
          industry: saved.industry === 'Not provided' ? '' : saved.industry || '',
          companySize: saved.companySize === 'Not provided' ? '' : saved.companySize || '',
          website: saved.website || '',
          companyDescription: saved.companyDescription || '',
          logoDataUrl: saved.logoDataUrl || '',
          defaultCurrency: saved.defaultCurrency || 'INR',
          timeZone: saved.timeZone || 'Asia/Kolkata',
          accuracyConfirmed: saved.accuracyConfirmed || false,
        }));
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setNotice(null);
  };

  const uploadLogo = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|svg\+xml|webp)$/i.test(file.type) || file.size > 2 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'Please upload PNG, JPG, SVG or WEBP logo under 2 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update('logoDataUrl', String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const submit = async event => {
    event.preventDefault();
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      await saveCompanyOnboarding({ ...form, companyDescription: form.companyDescription.slice(0, 500) });
      setNotice({ type: 'success', text: 'Company information saved. Step 2 ke liye ready.' });
      window.setTimeout(() => navigate('/onboarding/team'), 550);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Company information save nahi ho payi.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="onboarding-page">
      <aside className="onboarding-rail">
        <div className="onboarding-rail-art" />
        <Link className="signup-logo onboarding-logo" to="/landing">
          BYiZON
          <span>AI POWERED BUSINESS OS</span>
        </Link>
        <div className="onboarding-rail-heading">
          <h1>Setup Your Workspace</h1>
          <p>Complete these simple steps to get started with Byizon.</p>
        </div>

        <div className="onboarding-steps">
          {STEPS.map(([title, detail], index) => {
            const active = index === 0;
            return (
              <article className={active ? 'active' : ''} key={title}>
                <span className="onboarding-step-number">{index + 1}</span>
                <span className="onboarding-step-icon">
                  {index === 0 ? <Building2 size={16} /> : index === 1 ? <Users size={16} /> : index === 2 ? <LinkIcon size={16} /> : index === 3 ? <Bot size={16} /> : <Check size={16} />}
                </span>
                <div><strong>{title}</strong><small>{detail}</small></div>
              </article>
            );
          })}
        </div>

        <div className="signup-security-card onboarding-security-card">
          <ShieldCheck size={22} />
          <div>
            <strong>Enterprise Grade Security</strong>
            <span>Your data is protected with bank-level encryption and always stays secure.</span>
          </div>
        </div>
      </aside>

      <section className="onboarding-card-shell">
        <form className="onboarding-card" onSubmit={submit}>
          <div className="onboarding-topline">
            <div>
              <span>Step 1 of 5</span>
              <div className="onboarding-progress-bars" aria-hidden="true">
                <i className="active" /><i /><i /><i /><i />
              </div>
            </div>
            <button type="button" className="onboarding-help"><HelpCircle size={15} /> Need Help?</button>
          </div>

          <div className="onboarding-title">
            <h2>Let&apos;s get to know your company</h2>
            <p>This information will help us personalize your Byizon experience.</p>
          </div>

          {notice && (
            <div className={`signup-notice ${notice.type}`}>
              {notice.type === 'success' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
              <span>{notice.text}</span>
            </div>
          )}

          <div className="onboarding-grid">
            <WizardField icon={Building2} label="Company Name">
              <input value={form.companyName} onChange={event => update('companyName', event.target.value)} placeholder="Enter your company name" required />
            </WizardField>
            <WizardField icon={Building2} label="Industry">
              <select value={form.industry} onChange={event => update('industry', event.target.value)} required>
                <option value="">Select your industry</option>
                {INDUSTRIES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </WizardField>
            <WizardField icon={Users} label="Company Size">
              <select value={form.companySize} onChange={event => update('companySize', event.target.value)} required>
                <option value="">Select company size</option>
                {COMPANY_SIZES.map(item => <option key={item} value={item}>{item} employees</option>)}
              </select>
            </WizardField>
            <WizardField icon={Globe2} label="Website (Optional)">
              <input value={form.website} onChange={event => update('website', event.target.value)} placeholder="https://yourcompany.com" />
            </WizardField>
          </div>

          <label className="onboarding-field onboarding-wide">
            <span>Company Description (Optional)</span>
            <div className="onboarding-textarea-wrap">
              <Building2 size={17} aria-hidden="true" />
              <textarea value={form.companyDescription} onChange={event => update('companyDescription', event.target.value.slice(0, 500))} placeholder="Tell us about your company..." />
              <small>{remaining}/500</small>
            </div>
          </label>

          <div className="onboarding-logo-section">
            <div className="onboarding-upload-box">
              <UploadCloud size={32} />
              <strong>Upload your logo</strong>
              <span>PNG, JPG or SVG. Max size 2MB.</span>
              <input id="company-logo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={uploadLogo} />
              <label htmlFor="company-logo">Choose File</label>
            </div>
            <div className="onboarding-preview">
              <strong>Preview</strong>
              <div className="onboarding-preview-logo">
                {form.logoDataUrl ? <img src={form.logoDataUrl} alt="Company logo preview" /> : <span>BYiZON</span>}
              </div>
              <small>This will be your workspace identity across Byizon.</small>
            </div>
          </div>

          <div className="onboarding-grid">
            <WizardField icon={DollarSign} label="Default Currency">
              <select value={form.defaultCurrency} onChange={event => update('defaultCurrency', event.target.value)} required>
                {CURRENCIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </WizardField>
            <WizardField icon={Clock} label="Time Zone">
              <select value={form.timeZone} onChange={event => update('timeZone', event.target.value)} required>
                {TIME_ZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </WizardField>
          </div>

          <label className="signup-consent onboarding-confirm">
            <input type="checkbox" checked={form.accuracyConfirmed} onChange={event => update('accuracyConfirmed', event.target.checked)} />
            <span>I confirm that the information provided is accurate and I have the authority to set up this workspace.</span>
          </label>

          <div className="onboarding-actions">
            <button className="signup-primary onboarding-continue" type="submit" disabled={!canContinue || saving}>
              {saving ? 'Saving...' : 'Continue'} <ArrowRight size={17} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
