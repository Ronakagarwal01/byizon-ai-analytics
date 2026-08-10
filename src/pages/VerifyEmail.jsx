import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BarChart3, Bot, CheckCircle2, MailCheck, Network, ShieldCheck } from 'lucide-react';
import { resendEmailOtp, verifyEmailOtp } from '../api/universalBackend';
import './PublicPages.css';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialEmail = params.get('email') || localStorage.getItem('byizon_pending_email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const cleanOtp = useMemo(() => otp.replace(/\D/g, '').slice(0, 6), [otp]);
  const canVerify = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && cleanOtp.length === 6;

  const verify = async event => {
    event.preventDefault();
    if (!canVerify || loading) return;
    setLoading(true);
    setNotice(null);
    try {
      const payload = await verifyEmailOtp({ email: email.trim(), otp: cleanOtp });
      localStorage.removeItem('byizon_pending_email');
      localStorage.removeItem('byizon_pending_user');
      localStorage.setItem('byizon_signup_user', JSON.stringify(payload.user));
      setNotice({ type: 'success', text: 'Email verified. Opening setup Step 1...' });
      window.setTimeout(() => navigate(payload.nextStep || payload.user?.onboarding?.nextStep || '/onboarding/company'), 550);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'OTP verify nahi ho paya.' });
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!email || loading) return;
    setLoading(true);
    setNotice(null);
    try {
      const payload = await resendEmailOtp({ email: email.trim() });
      const localHint = payload.delivery?.channel === 'local_outbox'
        ? ' Local testing OTP backend/data/email_outbox.jsonl me saved hai.'
        : '';
      setNotice({ type: 'success', text: `New OTP sent.${localHint}` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'OTP resend nahi ho paya.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="signup-page verify-email-page">
      <section className="signup-brand-panel login-brand-panel" aria-label="Byizon verification">
        <div className="signup-brand-overlay" />
        <div className="signup-brand-content">
          <Link className="signup-logo" to="/landing" aria-label="Byizon home">
            BYiZON
            <span>CRM</span>
          </Link>

          <div className="signup-brand-copy login-brand-copy">
            <h1>Secure setup<br />starts with<br /><em>verified email.</em></h1>
            <p>Confirm your work email before entering your Byizon workspace and onboarding flow.</p>
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
              <span>OTP verification protects every new workspace.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="signup-form-panel" aria-label="Verify email form">
        <form className="signup-card verify-email-card" onSubmit={verify}>
          <Link className="signup-back-link" to="/signup"><ArrowLeft size={15} /> Back to Signup</Link>
          <div className="verify-icon"><MailCheck size={34} /></div>
          <span className="verify-kicker">EMAIL VERIFICATION</span>
          <h1>Verify your work email</h1>
          <p>We sent a 6-digit OTP to your email. Enter it below to unlock onboarding and continue setup.</p>

          {notice && (
            <div className={`signup-notice ${notice.type}`}>
              {notice.type === 'success' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
              <span>{notice.text}</span>
            </div>
          )}

            <label className="signup-field">
              <span>Email Address</span>
              <div className="signup-input-wrap">
                <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" />
              </div>
            </label>

            <label className="signup-field">
              <span>OTP Code</span>
              <div className="signup-input-wrap verify-otp-input">
                <input
                  inputMode="numeric"
                  value={cleanOtp}
                  onChange={event => setOtp(event.target.value)}
                  placeholder="000000"
                  maxLength={6}
                />
              </div>
            </label>

            <button className="signup-primary" type="submit" disabled={!canVerify || loading}>
              {loading ? 'Verifying...' : 'Verify & Continue'} <ArrowRight size={17} />
            </button>

          <button className="verify-resend" type="button" onClick={resend} disabled={loading || !email}>
            Resend OTP
          </button>
          <p className="verify-note">Fake email use karoge to OTP receive nahi hoga, aur account onboarding tak nahi ja payega.</p>
        </form>
      </section>
    </main>
  );
}
