import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BriefcaseBusiness,
  Building2,
  Check,
  Loader2,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';

const services = [
  { label: 'CRM (HubSpot)', to: '/connections?filter=CRM', icon: BriefcaseBusiness, color: '#ff7a59' },
  { label: 'ERP (Zoho)', to: '/connections', icon: Building2, color: '#22a7d6' },
  { label: 'Google Workspace', to: '/connections?source=google-workspace', icon: Sparkles, color: '#fbbc04' },
  { label: 'Integrations', to: '/connections', icon: Workflow, color: '#9a77ff' },
];

export default function AssistantStatusRail({
  operation = null,
  loading = false,
  className = '',
  collapsed = false,
  onToggle,
}) {
  const [voice, setVoice] = useState({
    status: 'idle',
    message: 'Voice assistant',
    active: false,
  });

  useEffect(() => {
    const onVoiceStatus = event => setVoice(event.detail || {
      status: 'idle',
      message: 'Voice assistant',
      active: false,
    });
    window.addEventListener('byizon:voice-status', onVoiceStatus);
    return () => window.removeEventListener('byizon:voice-status', onVoiceStatus);
  }, []);

  const voiceWorking = voice.active || ['listening', 'thinking', 'speaking'].includes(voice.status);
  const voiceTitle = voice.status === 'listening'
    ? 'Listening...'
    : voice.status === 'thinking'
      ? 'Thinking...'
      : voice.status === 'speaking'
        ? 'Speaking...'
        : operation?.title || 'Ready to help you';

  const voiceMessage = voiceWorking
    ? voice.message
    : operation
      ? operation.message || 'Your request is being processed securely.'
      : 'Make smarter decisions with connected business intelligence.';

  if (collapsed) {
    return (
      <aside
        className={`assistant-status-rail is-collapsed ${className}`.trim()}
        aria-label="Byizon AI status"
      >
        <button
          className="assistant-rail-expand"
          type="button"
          onClick={onToggle}
          aria-label="Show Byizon AI panel"
          title="Show Byizon AI panel"
        >
          <Sparkles size={18} />
          <span>AI</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className={`assistant-status-rail ${className}`.trim()} aria-label="Byizon AI status">
      <div className="assistant-status-head">
        <span><Sparkles size={16} /> Byizon AI</span>
        <button type="button" onClick={onToggle} aria-label="Hide Byizon AI panel" title="Hide Byizon AI panel">
          <X size={15} />
        </button>
      </div>

      <div className="assistant-systems-pill"><i /> All Systems Connected</div>

      <button
        className={`assistant-status-orb${loading || voiceWorking ? ' is-working' : ''}`}
        type="button"
        onClick={() => window.dispatchEvent(new Event('byizon:toggle-voice'))}
        aria-label={voiceWorking ? 'Stop voice assistant' : 'Start voice assistant'}
        title={voiceWorking ? 'Stop voice assistant' : 'Start voice assistant'}
      >
        {loading || voice.status === 'thinking'
          ? <Loader2 size={27} className="spin" />
          : <Sparkles size={28} />}
      </button>

      <div className="assistant-status-copy">
        <h2>{voiceTitle}</h2>
        <p>{voiceMessage}</p>
      </div>

      {operation?.steps?.length > 0 && (
        <div className="assistant-operation-steps">
          {operation.steps.slice(0, 4).map((step, index) => (
            <span key={`${step.label}-${index}`} className={step.status}>
              {step.status === 'running' ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
              {step.label}
            </span>
          ))}
        </div>
      )}

      <nav className="assistant-service-list" aria-label="Connected services">
        {services.map(({ label, to, icon: Icon, color }) => (
          <Link to={to} key={label}>
            <span><Icon size={14} style={{ color }} /> {label}</span>
            <small><Check size={11} /> Connected</small>
          </Link>
        ))}
      </nav>

      <div className="assistant-memory-card">
        <div><span>AI Memory</span><strong>100%</strong></div>
        <div className="assistant-memory-track"><i /></div>
        <small><i /> Updated just now</small>
      </div>
    </aside>
  );
}
