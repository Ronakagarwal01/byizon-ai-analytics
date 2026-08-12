import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Network,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { oauthStartUrl, signUpAccount } from '../api/universalBackend';
import './PublicPages.css';
import './SignupOverrides.css';

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+61', label: '🇦🇺 +61' },
  { code: '+971', label: '🇦🇪 +971' },
];

const initialForm = {
  firstName: '',
  lastName: '',
  workEmail: '',
  companyName: '',
  phoneCountryCode: '+91',
  phoneNumber: '',
  password: '',
  confirmPassword: '',
  termsAccepted: false,
};

function passwordChecks(password) {
  return [
    { key: 'length', label: 'Min. 8 characters', ok: password.length >= 8 },
    { key: 'upper', label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { key: 'lower', label: 'Lowercase letter', ok: /[a-z]/.test(password) },
    { key: 'number', label: 'Number', ok: /\d/.test(password) },
    { key: 'special', label: 'Special character', ok: /[^A-Za-z0-9]/.test(password) },
  ];
}

function Field({ icon: Icon, label, children }) {
  return (
    <label className="signup-field">
      <span>{label}</span>
      <div className="signup-input-wrap">
        {Icon && <Icon size={17} aria-hidden="true" />}
        {children}
      </div>
    </label>
  );
}

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);

  const checks = useMemo(() => passwordChecks(form.password), [form.password]);
  const passwordScore = checks.filter(item => item.ok).length;
  const passwordsMatch = form.confirmPassword && form.password === form.confirmPassword;
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.workEmail);
  const canSubmit = Boolean(
    form.firstName.trim()
    && form.lastName.trim()
    && emailValid
    && form.companyName.trim()
    && form.phoneNumber.replace(/\D/g, '').length >= 7
    && passwordScore === checks.length
    && passwordsMatch
    && form.termsAccepted
  );

  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setNotice(null);
  };

  const submit = async event => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const payload = await signUpAccount({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        workEmail: form.workEmail.trim(),
        companyName: form.companyName.trim(),
        phoneCountryCode: form.phoneCountryCode,
        phoneNumber: form.phoneNumber.trim(),
        password: form.password,
        termsAccepted: form.termsAccepted,
      });
      if (!payload.requiresOtp) {
        localStorage.removeItem('byizon_pending_email');
        localStorage.removeItem('byizon_pending_user');
        localStorage.setItem('byizon_login_user', JSON.stringify(payload.user));
        setNotice({ type: 'success', text: 'Account ready. Opening your workspace...' });
        window.setTimeout(() => navigate(payload.nextStep || '/dashboard'), 350);
        return;
      }
      localStorage.setItem('byizon_pending_email', payload.email || form.workEmail.trim());
      localStorage.setItem('byizon_pending_user', JSON.stringify({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: payload.email || form.workEmail.trim(),
      }));
      setNotice({ type: 'success', text: 'Account details saved. Verify your email to begin the 5-step setup.' });
      window.setTimeout(() => navigate(`/verify-email?email=${encodeURIComponent(payload.email || form.workEmail.trim())}`), 450);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Account create nahi ho paya.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="signup-page">
      <section className="signup-brand-panel" aria-label="Byizon benefits">
        <div className="signup-brand-overlay" />
        <div className="signup-brand-content">
          <Link className="signup-logo" to="/landing" aria-label="Byizon home">
            BYiZON
            <span>AI POWERED BUSINESS OS</span>
          </Link>

          <div className="signup-brand-copy">
            <h1>Create Account.<br />Transform <em>Business.</em></h1>
            <p>Join Byizon CRM and experience the power of AI to automate, manage and grow your business effortlessly.</p>
          </div>

          <div className="signup-feature-list">
            <article>
              <BarChart3 size={20} />
              <div><strong>Smart Analytics</strong><span>Real-time insights & reports</span></div>
            </article>
            <article>
              <Bot size={20} />
              <div><strong>AI Assistants</strong><span>Automate & scale your work</span></div>
            </article>
            <article>
              <Network size={20} />
              <div><strong>Unified Platform</strong><span>All your tools in one place</span></div>
            </article>
            <article>
              <ShieldCheck size={20} />
              <div><strong>Secure & Reliable</strong><span>Enterprise grade security</span></div>
            </article>
          </div>

          <div className="signup-security-card">
            <ShieldCheck size={22} />
            <div>
              <strong>Enterprise Grade Security</strong>
              <span>Your data is protected with bank-level encryption.</span>
            </div>
          </div>

          <p className="signup-brand-copyright">
            © 2025 Byizon Technologies Pvt. Ltd.<br />
            All rights reserved.
          </p>
        </div>
      </section>

      <section className="signup-form-panel" aria-label="Create account form">
        <form className="signup-card" onSubmit={submit}>
          <Link className="signup-back-link" to="/login">
            <ArrowLeft size={15} /> Back to Login
          </Link>

          <div className="signup-card-title">
            <h2>Create your account</h2>
            <p>Fill in the details below to get started with Byizon.</p>
          </div>

          {notice && (
            <div className={`signup-notice ${notice.type}`}>
              {notice.type === 'success' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
              <span>{notice.text}</span>
            </div>
          )}

          <div className="signup-two-col">
            <Field icon={User} label="First Name">
              <input value={form.firstName} onChange={event => update('firstName', event.target.value)} placeholder="Enter first name" autoComplete="given-name" required />
            </Field>
            <Field icon={User} label="Last Name">
              <input value={form.lastName} onChange={event => update('lastName', event.target.value)} placeholder="Enter last name" autoComplete="family-name" required />
            </Field>
          </div>

          <Field icon={Mail} label="Work Email">
            <input type="email" value={form.workEmail} onChange={event => update('workEmail', event.target.value)} placeholder="Enter your work email" autoComplete="email" required />
          </Field>

          <Field icon={Building2} label="Company Name">
            <input value={form.companyName} onChange={event => update('companyName', event.target.value)} placeholder="Enter your company name" autoComplete="organization" required />
          </Field>

          <label className="signup-field">
            <span>Phone Number</span>
            <div className="signup-phone-row">
              <select value={form.phoneCountryCode} onChange={event => update('phoneCountryCode', event.target.value)} aria-label="Country code">
                {COUNTRY_CODES.map(country => <option key={country.code} value={country.code}>{country.label}</option>)}
              </select>
              <div className="signup-input-wrap">
                <Phone size={17} aria-hidden="true" />
                <input type="tel" value={form.phoneNumber} onChange={event => update('phoneNumber', event.target.value)} placeholder="Enter your phone number" autoComplete="tel-national" required />
              </div>
            </div>
          </label>

          <Field icon={LockKeyhole} label="Password">
            <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={event => update('password', event.target.value)} placeholder="Create a strong password" autoComplete="new-password" required />
            <button className="signup-ghost-icon" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </Field>

          <div className="signup-strength" aria-label="Password strength">
            <div className="signup-strength-bars">
              {[1, 2, 3, 4, 5].map(step => <span key={step} className={passwordScore >= step ? 'active' : ''} />)}
            </div>
            <div className="signup-checks">
              <span className={passwordScore === checks.length ? 'ok' : ''}>
                <Check size={12} /> Min. 8 characters with upper, lower, number & special character
              </span>
            </div>
          </div>

          <Field icon={LockKeyhole} label="Confirm Password">
            <input type={showConfirm ? 'text' : 'password'} value={form.confirmPassword} onChange={event => update('confirmPassword', event.target.value)} placeholder="Confirm your password" autoComplete="new-password" required />
            <button className="signup-ghost-icon" type="button" onClick={() => setShowConfirm(value => !value)} aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}>
              {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </Field>

          <label className="signup-consent">
            <input type="checkbox" checked={form.termsAccepted} onChange={event => update('termsAccepted', event.target.checked)} required />
            <span>I agree to the <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link></span>
          </label>

          <button className="signup-primary" type="submit" disabled={!canSubmit || submitting}>
            {submitting ? 'Creating account...' : 'Create Account'} <ArrowRight size={17} />
          </button>

          <div className="signup-divider"><span>OR</span></div>

          <button className="signup-social" type="button" onClick={() => window.location.assign(oauthStartUrl('google-workspace', '/onboarding/company', 'login'))}>
            <span className="signup-google">G</span> Sign up with Google
          </button>

          <p className="signup-login-copy">Already have an account? <Link to="/login">Login</Link></p>
        </form>
      </section>
    </main>
  );
}
