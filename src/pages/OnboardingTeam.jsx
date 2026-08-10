import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Crown,
  Eye,
  HelpCircle,
  Link as LinkIcon,
  Mail,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { getTeamOnboarding, saveTeamOnboarding } from '../api/universalBackend';
import './PublicPages.css';

const STEPS = [
  ['Company Information', 'Completed'],
  ['Team Members', 'Invite your team'],
  ['Connect Apps', 'Integrate your tools'],
  ['AI Assistant Setup', 'Configure preferences'],
  ["You’re All Set", 'Start exploring Byizon'],
];

const ROLES = [
  { role: 'Admin', icon: Crown, description: 'Full access to all features, settings and billing.' },
  { role: 'Manager', icon: BriefcaseBusiness, description: 'Manage team, view reports and create workflows.' },
  { role: 'Editor', icon: Sparkles, description: 'Create and edit data, manage leads and deals.' },
  { role: 'Viewer', icon: Eye, description: 'View data and reports with limited access.' },
];

const blankInvite = () => ({ id: crypto.randomUUID?.() || String(Date.now() + Math.random()), email: '', role: 'Viewer' });

export default function OnboardingTeam() {
  const navigate = useNavigate();
  const [invites, setInvites] = useState([blankInvite()]);
  const [personalMessage, setPersonalMessage] = useState('');
  const [savedInvites, setSavedInvites] = useState([]);
  const [selectedRole, setSelectedRole] = useState('Viewer');
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  const inviteEmails = useMemo(
    () => invites.map(item => item.email.trim()).filter(Boolean),
    [invites],
  );
  const validEmails = inviteEmails.every(email => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
  const canContinue = inviteEmails.length === 0 || validEmails;

  useEffect(() => {
    let mounted = true;
    getTeamOnboarding()
      .then(items => {
        if (!mounted) return;
        setSavedInvites(items);
        if (items.length) {
          setInvites(items.map(item => ({ id: item.inviteId, email: item.email, role: item.role || 'Viewer' })));
          setPersonalMessage(items[0]?.personalMessage || '');
          setSelectedRole(items[0]?.role || 'Viewer');
        }
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const updateInvite = (id, key, value) => {
    setInvites(current => current.map(item => item.id === id ? { ...item, [key]: value } : item));
    setNotice(null);
  };

  const addInvite = () => {
    setInvites(current => [...current, { ...blankInvite(), role: selectedRole }]);
  };

  const save = async (goNext = true) => {
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      const payload = await saveTeamOnboarding({
        invites: invites
          .filter(item => item.email.trim())
          .map(item => ({ email: item.email.trim(), role: item.role || selectedRole })),
        personalMessage,
      });
      setSavedInvites(payload.invites || []);
      setNotice({ type: 'success', text: inviteEmails.length ? 'Team invites saved successfully.' : 'Team step saved. You can invite members later.' });
      if (goNext) window.setTimeout(() => navigate('/onboarding/data-source'), 500);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Team invites save nahi ho paye.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="onboarding-page onboarding-team-page">
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
            const active = index === 1;
            const done = index === 0;
            return (
              <article className={active ? 'active' : done ? 'done' : ''} key={title}>
                <span className="onboarding-step-number">{done ? <Check size={15} /> : index + 1}</span>
                <span className="onboarding-step-icon">
                  {index === 0 ? <BriefcaseBusiness size={16} /> : index === 1 ? <Users size={16} /> : index === 2 ? <LinkIcon size={16} /> : index === 3 ? <Bot size={16} /> : <CheckCircle2 size={16} />}
                </span>
                <div><strong>{title}</strong><small>{detail}</small></div>
              </article>
            );
          })}
        </div>

        <div className="signup-security-card onboarding-security-card">
          <Users size={22} />
          <div>
            <strong>Team collaboration</strong>
            <span>You can add or manage members anytime from Settings.</span>
          </div>
        </div>
      </aside>

      <section className="onboarding-card-shell">
        <form className="onboarding-card onboarding-team-card" onSubmit={event => { event.preventDefault(); save(true); }}>
          <div className="onboarding-topline">
            <div>
              <span>Step 2 of 5</span>
              <div className="onboarding-progress-bars" aria-hidden="true">
                <i className="active done" /><i className="active" /><i /><i /><i />
              </div>
            </div>
            <button type="button" className="onboarding-help"><HelpCircle size={15} /> Need Help?</button>
          </div>

          <div className="team-hero">
            <div>
              <h2>Invite your team</h2>
              <p>Add your team members to start collaborating on Byizon.</p>
            </div>
            <div className="team-orbit" aria-hidden="true">
              <span className="avatar a1">RA</span>
              <span className="avatar a2">AM</span>
              <span className="avatar a3">VM</span>
              <Users size={24} />
            </div>
          </div>

          {notice && (
            <div className={`signup-notice ${notice.type}`}>
              {notice.type === 'success' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
              <span>{notice.text}</span>
            </div>
          )}

          <div className="team-layout">
            <div className="team-main">
              <section className="team-panel">
                <div className="team-section-title">
                  <h3>Invite members</h3>
                  <span>{inviteEmails.length} pending</span>
                </div>
                <div className="team-invite-list">
                  {invites.map((invite, index) => (
                    <div className="team-invite-row" key={invite.id}>
                      <div className="team-email-input">
                        <Mail size={16} />
                        <input
                          value={invite.email}
                          onChange={event => updateInvite(invite.id, 'email', event.target.value)}
                          placeholder={index === 0 ? 'Enter email address' : 'Another teammate email'}
                          type="email"
                        />
                      </div>
                      <select value={invite.role} onChange={event => updateInvite(invite.id, 'role', event.target.value)}>
                        {ROLES.map(item => <option key={item.role} value={item.role}>{item.role}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <button className="team-add-email" type="button" onClick={addInvite}>
                  <Plus size={15} /> Add another email
                </button>
              </section>

              <section className="team-panel">
                <label className="team-message">
                  <span>Personal message (Optional)</span>
                  <div>
                    <MessageSquareText size={17} />
                    <textarea
                      value={personalMessage}
                      onChange={event => setPersonalMessage(event.target.value.slice(0, 200))}
                      placeholder="Write a message to your team..."
                    />
                    <small>{personalMessage.length}/200</small>
                  </div>
                </label>
              </section>

              <section className="team-panel">
                <div className="team-section-title">
                  <h3>Roles & Permissions</h3>
                  <button type="button">Learn more</button>
                </div>
                <div className="role-grid">
                  {ROLES.map(({ role, icon: Icon, description }) => (
                    <label className={selectedRole === role ? 'active' : ''} key={role}>
                      <input type="radio" name="team-role" checked={selectedRole === role} onChange={() => {
                        setSelectedRole(role);
                        setInvites(current => current.map(item => ({ ...item, role })));
                      }} />
                      <Icon size={19} />
                      <span><strong>{role}</strong><small>{description}</small></span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="team-panel">
                <div className="team-section-title">
                  <h3>Invited Members ({savedInvites.length})</h3>
                  <button type="button" onClick={() => save(false)} disabled={saving || !canContinue}>Save list</button>
                </div>
                {savedInvites.length ? (
                  <div className="saved-invites">
                    {savedInvites.map(item => (
                      <article key={item.inviteId}>
                        <span>{item.email.slice(0, 2).toUpperCase()}</span>
                        <div><strong>{item.email}</strong><small>{item.role} · {item.status}</small></div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-invites">
                    <Users size={34} />
                    <strong>No members invited yet</strong>
                    <span>Add your team members to start collaborating and achieving more together.</span>
                  </div>
                )}
              </section>
            </div>

            <aside className="team-side">
              <section className="team-benefits">
                <h3>Why invite your team?</h3>
                <article><Users size={18} /><div><strong>Collaborate in real-time</strong><span>Work together and close deals faster.</span></div></article>
                <article><ShieldCheck size={18} /><div><strong>Secure & role-based</strong><span>Control access and keep data secure.</span></div></article>
                <article><BarChart3 size={18} /><div><strong>Increase productivity</strong><span>Automate tasks and save valuable time.</span></div></article>
              </section>

              <section className="team-testimonial">
                <Zap size={24} />
                <p>“Byizon helped our whole team stay aligned and increase productivity by 40%.”</p>
                <div><span>AM</span><strong>Arjun Mehta<small>CEO, Nexora Labs</small></strong></div>
              </section>
            </aside>
          </div>

          <div className="onboarding-actions">
            <button type="button" className="onboarding-back" onClick={() => navigate('/onboarding/company')}><ArrowLeft size={16} /> Back</button>
            <button className="signup-primary onboarding-continue" type="submit" disabled={!canContinue || saving}>
              {saving ? 'Saving...' : 'Continue'} <ArrowRight size={17} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
