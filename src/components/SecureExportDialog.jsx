import { useState } from 'react';
import { CalendarDays, Check, Copy, Download, Eye, EyeOff, Link2, Loader2, LockKeyhole, ShieldCheck, Trash2, X } from 'lucide-react';
import { createProtectedShare, downloadProtectedPdf, revokeProtectedShare } from '../api/universalBackend';

export default function SecureExportDialog({ open, mode, data, customization = null, onClose }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultLink, setResultLink] = useState('');
  const [resultPassword, setResultPassword] = useState('');
  const [resultShareId, setResultShareId] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [copied, setCopied] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  if (!open) return null;

  const close = () => {
    if (loading) return;
    setPassword('');
    setConfirmPassword('');
    setError('');
    setResultLink('');
    setResultPassword('');
    setResultShareId('');
    setExpiresInDays(7);
    setCopied(false);
    setPasswordCopied(false);
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (mode === 'pdf') {
      if (password.length < 8) {
        setError('Password must contain at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Password and confirmation do not match.');
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === 'share') {
        const share = await createProtectedShare(data.sessionId, expiresInDays, customization, data);
        setResultShareId(share.shareId);
        setResultPassword(share.password);
        setResultLink(`${window.location.origin}/${customization ? 'custom-dashboard' : 'report'}/${share.shareId}`);
      } else {
        const { blob, fileName } = await downloadProtectedPdf(data.sessionId, password);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        close();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(resultLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const copyPassword = async () => {
    await navigator.clipboard.writeText(resultPassword);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 1800);
  };

  const revokeLink = async () => {
    setLoading(true);
    setError('');
    try {
      await revokeProtectedShare(resultShareId, data.sessionId);
      close();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="secure-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}>
      <section className="secure-dialog" role="dialog" aria-modal="true" aria-labelledby="secure-dialog-title">
        <button className="secure-dialog-close" onClick={close} aria-label="Close"><X size={18} /></button>
        <div className="secure-dialog-icon"><LockKeyhole size={22} /></div>
        <span className="section-kicker">Data privacy</span>
        <h2 id="secure-dialog-title">{mode === 'share' ? 'Create protected live link' : 'Export encrypted PDF'}</h2>
        <p>
          {mode === 'share'
            ? 'Byizon generates a strong one-time password. The link automatically expires and can be revoked at any time.'
            : 'The downloaded PDF uses AES-256 encryption and cannot be opened without this password.'}
        </p>

        {resultLink ? (
          <div className="secure-share-result">
            <ShieldCheck size={22} />
            <strong>Protected link is ready</strong>
            <span>This password is shown only once. Save it now and send it separately from the link.</span>
            <div className="one-time-share-password">
              <code>{resultPassword}</code>
              <button onClick={copyPassword}>{passwordCopied ? <Check size={16} /> : <Copy size={16} />} {passwordCopied ? 'Copied' : 'Copy password'}</button>
            </div>
            <div>
              <input value={resultLink} readOnly aria-label="Protected share link" />
              <button onClick={copyLink}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}</button>
            </div>
            <button className="revoke-share-button" onClick={revokeLink} disabled={loading}>
              <Trash2 size={15} /> Revoke link
            </button>
            {error && <div className="secure-dialog-error" role="alert">{error}</div>}
          </div>
        ) : mode === 'share' ? (
          <form onSubmit={submit}>
            <label className="share-expiry-field">
              <span><CalendarDays size={15} /> Link expiry</span>
              <select value={expiresInDays} onChange={event => setExpiresInDays(Number(event.target.value))}>
                <option value={1}>1 day</option>
                <option value={7}>7 days (recommended)</option>
                <option value={30}>30 days</option>
              </select>
            </label>
            <div className="quick-oauth-safety">
              <ShieldCheck size={18} />
              <span>Raw rows and chat history are excluded. Five failed password attempts lock the link.</span>
            </div>
            {error && <div className="secure-dialog-error" role="alert">{error}</div>}
            <button className="secure-dialog-submit" type="submit" disabled={loading}>
              {loading ? <Loader2 size={17} className="spin" /> : <Link2 size={17} />}
              {loading ? 'Securing...' : 'Generate protected link'}
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <label className="secure-password-field">
              <span>Password</span>
              <div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  autoFocus
                />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <label className="secure-password-field">
              <span>Confirm password</span>
              <div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Enter the same password again"
                />
              </div>
            </label>
            {error && <div className="secure-dialog-error" role="alert">{error}</div>}
            <button className="secure-dialog-submit" type="submit" disabled={loading}>
              {loading ? <Loader2 size={17} className="spin" /> : mode === 'share' ? <Link2 size={17} /> : <Download size={17} />}
              {loading ? 'Securing...' : mode === 'share' ? 'Create protected link' : 'Download protected PDF'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
