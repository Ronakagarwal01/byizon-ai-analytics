import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { getProtectedShareMetadata, unlockProtectedShare } from '../api/universalBackend';

export default function SharedCustomDashboard() {
  const { reportId } = useParams();
  const [metadata, setMetadata] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getProtectedShareMetadata(reportId)
      .then(value => active && setMetadata(value))
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reportId]);

  const unlock = async (event) => {
    event.preventDefault();
    if (!password || unlocking) return;
    setUnlocking(true);
    setError('');
    try {
      setAnalysis(await unlockProtectedShare(reportId, password));
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUnlocking(false);
    }
  };

  if (!analysis) {
    return (
      <main className="custom-share-gate-page">
        <header><Link to="/" className="byizon-logo"><span>Byi</span><b>zon</b></Link><span><ShieldCheck size={14} /> Protected dashboard</span></header>
        <section className="protected-share-gate">
          <div className="protected-share-icon">{loading ? <Loader2 size={26} className="spin" /> : <LockKeyhole size={26} />}</div>
          <span className="section-kicker">Password-protected live dashboard</span>
          <h1>{loading ? 'Checking secure link...' : metadata?.fileName || 'Customized dashboard'}</h1>
          <p>Enter the password shared by the dashboard owner. Five incorrect attempts lock this link.</p>
          {!loading && metadata ? (
            <form onSubmit={unlock}>
              <label>
                <span>Dashboard password</span>
                <div>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" autoFocus placeholder="Enter password" />
                  <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
              </label>
              {error && <div className="secure-dialog-error" role="alert">{error}</div>}
              <button className="secure-dialog-submit" type="submit" disabled={!password || unlocking}>{unlocking ? <Loader2 size={17} className="spin" /> : <ShieldCheck size={17} />}{unlocking ? 'Unlocking...' : 'Unlock dashboard'}</button>
            </form>
          ) : !loading && <div className="secure-dialog-error">{error || 'This secure dashboard is unavailable.'}</div>}
        </section>
      </main>
    );
  }

  const customization = analysis.studioCustomization;
  return (
    <main className="custom-shared-dashboard">
      <header><div><ShieldCheck size={16} /><strong>Protected Customized Dashboard</strong></div><span>{analysis.fileName}</span></header>
      {customization?.html ? (
        <iframe title="Shared customized dashboard" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={customization.html} />
      ) : customization?.imageUrl ? (
        <img src={customization.imageUrl} alt="Shared customized dashboard" />
      ) : (
        <section className="stitch-empty-stage"><LockKeyhole /><h1>Customized dashboard output is unavailable</h1><p>Ask the owner to generate and share the Stitch dashboard again.</p></section>
      )}
    </main>
  );
}
