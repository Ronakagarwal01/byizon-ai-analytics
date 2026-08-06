import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Network,
  ShieldCheck,
} from 'lucide-react';
import { loginAccount } from '../api/universalBackend';
import './PublicPages.css';

function BrandPanel() {
  return (
    <section className="signup-brand-panel login-brand-panel" aria-label="Byizon CRM">
      <div className="signup-brand-overlay" />
      <div className="signup-brand-content">
        <Link className="signup-logo" to="/landing" aria-label="Byizon home">
          BYiZON
          <span>CRM</span>
        </Link>

        <div className="signup-brand-copy login-brand-copy">
          <h1>AI Powered<br />Business<br />is Now <em>Easy.</em></h1>
          <p>Byizon CRM helps you manage leads, automate workflows, close deals and grow your business smarter.</p>
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
      </div>
    </section>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const canSubmit = emailValid && password.length > 0;

  const submit = async event => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const payload = await loginAccount({ email: email.trim(), password });
      localStorage.setItem('byizon_login_user', JSON.stringify(payload.user));
      setNotice({ type: 'success', text: 'Welcome back. Opening your Byizon workspace...' });
      window.setTimeout(() => navigate('/dashboard'), 500);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Login nahi ho paya. Email/password check karo.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="signup-page login-page">
      <BrandPanel />

      <section className="signup-form-panel" aria-label="Login form">
        <form className="signup-card login-card" onSubmit={submit}>
          <div className="signup-card-title login-card-title">
            <h2>Welcome back</h2>
            <p>Login to access your Byizon CRM dashboard.</p>
          </div>

          {notice && (
            <div className={`signup-notice ${notice.type}`}>
              {notice.type === 'success' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
              <span>{notice.text}</span>
            </div>
          )}

          <label className="signup-field">
            <span>Email Address</span>
            <div className="signup-input-wrap">
              <Mail size={17} aria-hidden="true" />
              <input
                type="email"
                value={email}
                onChange={event => {
                  setEmail(event.target.value);
                  setNotice(null);
                }}
                placeholder="Enter your email"
                autoComplete="email"
                required
              />
            </div>
          </label>

          <label className="signup-field">
            <span>Password</span>
            <div className="signup-input-wrap">
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => {
                  setPassword(event.target.value);
                  setNotice(null);
                }}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button className="signup-ghost-icon" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          <div className="login-forgot-row">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>

          <button className="signup-primary" type="submit" disabled={!canSubmit || submitting}>
            {submitting ? 'Logging in...' : 'Login to Byizon'} <ArrowRight size={17} />
          </button>

          <div className="signup-divider"><span>OR</span></div>

          <button className="signup-social" type="button" onClick={() => setNotice({ type: 'error', text: 'Google login connector Step 3 me wire karenge. Email/password login fully working hai.' })}>
            <span className="signup-google">G</span> Continue with Google
          </button>
          <button className="signup-social" type="button" onClick={() => setNotice({ type: 'error', text: 'Microsoft login connector Step 3 me wire karenge. Email/password login fully working hai.' })}>
            <span className="signup-microsoft">◆</span> Continue with Microsoft
          </button>

          <p className="signup-login-copy">Don&apos;t have an account? <Link to="/signup">Sign up</Link></p>
        </form>
      </section>

      <footer className="login-footer-strip" aria-label="Byizon product pillars">
        <div><BarChart3 size={18} /><strong>Smart Dashboards</strong><span>Real-time insights & analytics</span></div>
        <div><Bot size={18} /><strong>AI Assistants</strong><span>Automate & scale your work</span></div>
        <div><Building2 size={18} /><strong>Unified Platforms</strong><span>All your tools, one place</span></div>
        <div><ShieldCheck size={18} /><strong>Secure & Reliable</strong><span>Enterprise grade protection</span></div>
      </footer>
    </main>
  );
}
