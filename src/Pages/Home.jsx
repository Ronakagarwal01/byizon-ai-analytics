import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Bell, Bot, CalendarCheck2, CheckCircle2, ChevronDown,
  Clock3, Copy, Database, ExternalLink, Lightbulb, Loader2, LockKeyhole, Mail, Menu,
  MessageSquare, Paintbrush, Paperclip, Search, Send, ShieldCheck, Sparkles,
  Users, Video, Zap,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { ProviderLogo } from '../components/QuickConnections';
import { useData } from '../context/DataContext';
import { askDataChat } from '../api/huggingface';
import { getAuthSession, getConnectors, oauthStartUrl } from '../api/universalBackend';
import { runPipeline } from '../api/pipeline';
import { saveAutomationActivity } from '../utils/activityStore';

const STARTER_PROMPTS = [
  'Which renewal is slipping where?',
  'Summarize my connected data',
  'Create a Google Meet and send it to Slack',
  'Build a dashboard from the latest file',
];

const VALUE_ITEMS = [
  { icon: Sparkles, title: 'AI-Powered Insights', text: 'Evidence grounded in your data' },
  { icon: Bot, title: 'Natural Language', text: 'Ask in simple human language' },
  { icon: BarChart3, title: 'Adaptive Dashboards', text: 'Charts selected from your schema' },
  { icon: LockKeyhole, title: 'Secure & Private', text: 'Protected sharing and reports' },
];

const GUEST_ACCOUNT = {
  authenticated: false,
  displayName: 'there',
  email: '',
};

const ARCHITECTURE_STEPS = [
  { icon: Bot, title: 'AI Router', text: 'Detects intent, source, and action plan' },
  { icon: Database, title: 'Data Layer', text: 'CRM, ERP, HRMS, Sheets, Excel, SQL, Slack' },
  { icon: Activity, title: 'Processing Engine', text: 'Filters, aggregates, calculates KPIs' },
  { icon: ShieldCheck, title: 'Relevant JSON', text: 'Only compact evidence goes to the LLM' },
  { icon: Sparkles, title: 'LLM Explanation', text: 'Business context, insights, recommendations' },
  { icon: BarChart3, title: 'Dashboard', text: 'Adaptive charts, reports, and actions' },
];

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatHomeDate() {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

function ProcessingFlow({ activeData }) {
  const jsonPreview = activeData
    ? [
        { source: activeData.fileName || 'uploaded dataset', rows: activeData.rowCount || activeData.totalRows || activeData.rows || 'calculated' },
        { output: 'processed_json', rule: 'aggregated facts only', confidence: activeData.mappingConfidence || activeData.confidence || 'data-backed' },
      ]
    : [
        { source: 'CRM / ERP / HRMS / Sheets / Excel / DB', action: 'filter + aggregate' },
        { output: 'structured_json', rule: 'send only relevant evidence to LLM' },
      ];

  return (
    <section className="ai-processing-flow" aria-label="AI data processing architecture">
      <div className="flow-heading">
        <span><Sparkles size={15} /> AI Data Scientist Pipeline</span>
        <strong>Process first. Explain second. Never send raw noise to the model.</strong>
      </div>
      <div className="flow-track">
        {ARCHITECTURE_STEPS.map(({ icon: Icon, title, text }) => (
          <article key={title}>
            <Icon size={18} />
            <strong>{title}</strong>
            <small>{text}</small>
          </article>
        ))}
      </div>
      <pre>{JSON.stringify(jsonPreview, null, 2)}</pre>
    </section>
  );
}

function operationFromCommand(command) {
  const normalized = String(command || '').toLowerCase();
  if (/google\s+meet|meet(?:ing|ting)?\s+link|metting|video\s+meeting/.test(normalized)) {
    return {
      title: 'Scheduling a Google Meet',
      icon: Video,
      steps: [
        { label: 'Understanding request', status: 'complete' },
        { label: 'Checking Google Calendar', status: 'running' },
        { label: 'Finding available attendees', status: 'pending' },
        { label: 'Creating Google Meet', status: 'pending' },
        { label: 'Sending invitations', status: 'pending' },
      ],
    };
  }
  if (/gmail|email|mail/.test(normalized) && /send|bhejo|bhjo|bhaj/.test(normalized)) {
    return {
      title: 'Sending Gmail message',
      icon: Mail,
      steps: [
        { label: 'Understanding message', status: 'complete' },
        { label: 'Checking Gmail permission', status: 'running' },
        { label: 'Preparing recipient and content', status: 'pending' },
        { label: 'Sending email', status: 'pending' },
      ],
    };
  }
  if (/calendar|event|meeting/.test(normalized) && /create|schedule|book|banao/.test(normalized)) {
    return {
      title: 'Creating Calendar event',
      icon: CalendarCheck2,
      steps: [
        { label: 'Understanding schedule', status: 'complete' },
        { label: 'Checking Calendar permission', status: 'running' },
        { label: 'Creating event', status: 'pending' },
        { label: 'Confirming event', status: 'pending' },
      ],
    };
  }
  if (/google sheet|spreadsheet|google doc|document/.test(normalized) && /create|append|write|save|banao/.test(normalized)) {
    return { title: 'Updating Google Workspace', icon: Database };
  }
  return null;
}

function OperationTimeline({ operation, pending = false }) {
  const [copied, setCopied] = useState(false);
  if (!operation) return null;
  const Icon = operation.icon || Activity;
  const steps = operation.steps || [
    { label: 'Understanding command', status: 'complete' },
    { label: 'Checking account permission', status: pending ? 'running' : 'complete' },
    { label: 'Waiting for provider response', status: pending ? 'pending' : 'complete' },
  ];
  return (
    <div className={`automation-timeline ${pending ? 'running' : operation.status || 'complete'}`}>
      <div className="automation-timeline-label"><i /> Execution Timeline</div>
      <div className="automation-timeline-head">
        <span><Icon size={16} /></span>
        <div><strong>{operation.title}</strong><small>{pending ? 'Working securely...' : operation.message || 'Task completed'}</small></div>
        {pending ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={17} />}
      </div>
      <div className="automation-steps">
        {steps.map((step, index) => (
          <div key={`${step.label}-${index}`} className={step.status}>
            <i>{step.status === 'running' ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />}</i>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
      {operation.url && (
        <div className="automation-result-link">
          <span>{operation.url}</span>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(operation.url);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            }}
          >
            <Copy size={13} /> {copied ? 'Copied' : 'Copy link'}
          </button>
          <a href={operation.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open</a>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { uploadedData, setUploadedData, analysisSession, setSessionChatHistory } = useData();
  const [catalog, setCatalog] = useState([]);
  const [connections, setConnections] = useState([]);
  const [input, setInput] = useState('');
  const [localMessages, setLocalMessages] = useState([]);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeData, setActiveData] = useState(uploadedData);
  const [notice, setNotice] = useState('');
  const [account, setAccount] = useState(GUEST_ACCOUNT);
  const [activeOperation, setActiveOperation] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    getAuthSession()
      .then(payload => setAccount(payload.user || GUEST_ACCOUNT))
      .catch(() => {});
    getConnectors()
      .then(payload => {
        setCatalog(payload.catalog || []);
        setConnections(payload.connections || []);
      })
      .catch(error => setNotice(error.message || 'Could not load connected services.'));
  }, []);

  useEffect(() => {
    const onVoiceOperation = event => setActiveOperation(event.detail || null);
    window.addEventListener('byizon:operation', onVoiceOperation);
    return () => window.removeEventListener('byizon:operation', onVoiceOperation);
  }, []);

  useEffect(() => {
    setActiveData(uploadedData);
    const history = analysisSession?.chatHistory || [];
    if (history.length) {
      setLocalMessages(history);
      setConversationStarted(true);
    }
  }, [uploadedData, analysisSession?.chatHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages, loading]);

  useEffect(() => {
    const resetConversation = () => {
      setLocalMessages([]);
      setConversationStarted(false);
      setInput('');
      setNotice('');
      if (activeData?.sessionId) setSessionChatHistory(activeData.sessionId, []);
    };
    window.addEventListener('byizon:new-chat', resetConversation);
    return () => window.removeEventListener('byizon:new-chat', resetConversation);
  }, [activeData?.sessionId, setSessionChatHistory]);

  useEffect(() => {
    const attachFile = () => fileInputRef.current?.click();
    window.addEventListener('byizon:attach-file', attachFile);
    return () => window.removeEventListener('byizon:attach-file', attachFile);
  }, []);

  const connectedIds = useMemo(
    () => new Set(connections.filter(item => item.status === 'connected').map(item => item.connectorId)),
    [connections],
  );

  const quickConnectorLogos = useMemo(() => {
    const preferred = [
      'salesforce',
      'hubspot',
      'google-workspace',
      'slack',
      'microsoft-365',
      'jira',
      'zapier',
      'workato',
      'glean',
    ];
    const byId = new Map(catalog.map(item => [item.id, item]));
    return preferred.map(id => byId.get(id)).filter(Boolean).slice(0, 9);
  }, [catalog]);

  const appendMessage = (message) => {
    setLocalMessages(current => [...current, message]);
    if (activeData?.sessionId) {
      setSessionChatHistory(activeData.sessionId, current => [...current, message]);
    }
  };

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || uploading) return;
    setUploadedData(null);
    setActiveData(null);
    setLocalMessages([]);
    setUploading(true);
    setNotice(`Reading ${file.name}...`);
    try {
      const result = await runPipeline(file);
      if (result.fileName !== file.name || !result.sourceProvenance?.sha256) {
        throw new Error('The selected file could not be verified. Old analysis was not restored.');
      }
      setUploadedData(result);
      setActiveData(result);
      setConversationStarted(true);
      setLocalMessages([{
        role: 'assistant',
        text: `${result.fileName} is ready. I analyzed ${(result.rowCount || 0).toLocaleString()} rows and ${(result.columns || []).length} columns. What would you like to explore?`,
      }]);
      setNotice('Analysis complete');
    } catch (error) {
      setNotice(error.message || 'File analysis failed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const sendMessage = async (text = input) => {
    const question = text.trim();
    if (!question || loading) return;
    setConversationStarted(true);
    appendMessage({ role: 'user', text: question });
    setInput('');
    setLoading(true);
    const inferredOperation = operationFromCommand(question);
    setActiveOperation(inferredOperation);
    try {
      const response = await askDataChat(question, activeData, localMessages);
      const answer = typeof response === 'string' ? response : response.answer;
      if (typeof response === 'object' && response.analysis) {
        const nextData = { ...response.analysis, sessionId: response.sessionId || response.analysis.sessionId };
        setUploadedData(nextData);
        setActiveData(nextData);
        setNotice(`${response.source?.resourceName || nextData.fileName} imported from Slack`);
      } else if (typeof response === 'object' && response.clearActiveAnalysis) {
        setUploadedData(null);
        setActiveData(null);
        setNotice('Slack source is no longer available. Previous analysis cleared.');
      }
      appendMessage({
        role: 'assistant',
        text: answer,
        task: response?.task || null,
        choices: response?.choices || [],
      });
      if (response?.task) saveAutomationActivity(response.task, 'chat');
      setActiveOperation(response?.task || null);
    } catch (error) {
      appendMessage({ role: 'assistant', text: `I could not complete that request: ${error.message}` });
      setActiveOperation(null);
    } finally {
      setLoading(false);
    }
  };

  const connectProvider = (connector) => {
    if (connectedIds.has(connector.id)) {
      navigate('/connections');
      return;
    }
    if (!connector.oauthReady) {
      setNotice(`${connector.name} needs its OAuth Client ID and Client Secret before account permission can start.`);
      return;
    }
    window.location.assign(oauthStartUrl(connector.id, '/'));
  };

  const openConnectorFromLogo = (connector) => {
    if (!connector) {
      navigate('/connections');
      return;
    }
    if (connector.oauthReady) {
      window.location.assign(oauthStartUrl(
        connector.id,
        '/',
        connector.id === 'google-workspace' ? 'all' : '',
      ));
      return;
    }
    navigate(`/connections?source=${encodeURIComponent(connector.id)}&filter=${encodeURIComponent(connector.category || 'All')}`);
  };

  const accountName = account.authenticated
    ? String(account.displayName || account.email || 'there').trim().split(/\s+/)[0]
    : 'there';
  const accountInitial = account.authenticated
    ? String(account.displayName || account.email || 'G').trim().charAt(0).toUpperCase()
    : 'G';
  const googleConnector = catalog.find(item => item.id === 'google-workspace');

  return (
    <div className="app-layout byizon-shell">
      <Sidebar />
      <main className={`main-content byizon-home ${conversationStarted ? 'conversation-mode' : ''}`}>
        <header className="byizon-topbar">
          <button className="topbar-menu" aria-label="Open navigation" onClick={() => window.dispatchEvent(new Event('byizon:open-navigation'))}><Menu size={16} /></button>
          <div className="ai-os-commandbar">
            <Search size={17} />
            <input
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask Byizon something..."
              aria-label="Ask Byizon from the command bar"
            />
            <kbd>Ctrl K</kbd>
          </div>
          <div className="topbar-actions">
            <button
              className="topbar-update-ui"
              type="button"
              onClick={() => navigate(activeData ? '/studio' : '/upload')}
              title={activeData ? 'Customize the current dashboard' : 'Upload data before customizing the dashboard'}
            >
              <Paintbrush size={14} /> Update UI
            </button>
            <button onClick={() => {
              if (account.authenticated) navigate('/connections');
              else if (googleConnector) connectProvider(googleConnector);
              else navigate('/connections');
            }}>{account.authenticated ? 'Connect data' : 'Continue with Google'}</button>
            <button className="topbar-icon-button" type="button" aria-label="Notifications"><Bell size={17} /></button>
            <span className="topbar-avatar" title={account.email || 'Guest workspace'}>{accountInitial}</span>
          </div>
        </header>

        <div className="ai-os-workspace">
          <div className="ai-os-primary">
          {!conversationStarted ? (
            <div className="byizon-onboarding">
            <section className="byizon-greeting">
              <div className="byizon-ai-orb" aria-hidden="true"><Sparkles size={28} /></div>
              <span><Sparkles size={16} /> Byizon AI</span>
              <h1>{greetingForNow()}, {accountName}</h1>
              <p className="byizon-date-line">{formatHomeDate()}</p>
              <p className="byizon-greeting-subtitle">Here is what your connected business data can answer today.</p>
              <div className="starter-prompts">
                {STARTER_PROMPTS.map(prompt => <button key={prompt} onClick={() => sendMessage(prompt)}>{prompt}</button>)}
              </div>
            </section>

            <ChatComposer
              input={input}
              setInput={setInput}
              onSend={sendMessage}
              onAttach={() => fileInputRef.current?.click()}
              loading={loading || uploading}
              dataName={activeData?.fileName}
            />

            <section className="home-logo-connect-strip" aria-label="Quick connect business tools">
              <div>
                <span>Connect and analyze from</span>
                <strong>CRM, workspace, Slack, Sheets, and automation tools</strong>
              </div>
              <div className="home-logo-connect-list">
                {quickConnectorLogos.map(connector => {
                  const connected = connectedIds.has(connector.id);
                  return (
                    <button
                      type="button"
                      key={connector.id}
                      className={connected ? 'connected' : ''}
                      onClick={() => openConnectorFromLogo(connector)}
                      title={`${connected ? 'Open' : 'Connect'} ${connector.name}`}
                    >
                      <ProviderLogo connector={connector} />
                      <span>{connector.name}</span>
                      {connected && <CheckCircle2 size={12} />}
                    </button>
                  );
                })}
                <button type="button" className="more-tools" onClick={() => navigate('/connections')}>
                  <span className="quick-provider-fallback">•••</span>
                  <span>More</span>
                </button>
              </div>
            </section>

            {notice && <div className="home-notice">{uploading && <Loader2 size={14} className="spin" />}{notice}</div>}

            <ProcessingFlow activeData={activeData} />

            <section className="home-crm-panel">
              <div className="home-crm-heading">
                <div>
                  <h2>Connect your CRM to get started</h2>
                  <p>Securely authorize a business source and analyze its available data.</p>
                </div>
                <span><ShieldCheck size={13} /> Secure & encrypted</span>
              </div>
              <div className="home-crm-grid">
                {catalog.map(connector => {
                  const connected = connectedIds.has(connector.id);
                  return (
                    <button key={connector.id} onClick={() => connectProvider(connector)}>
                      <ProviderLogo connector={connector} />
                      <strong>{connector.name}</strong>
                      <small>{connected ? 'Connected' : 'Connect'}</small>
                      {connected && <CheckCircle2 size={13} />}
                    </button>
                  );
                })}
                <button onClick={() => navigate('/connections')}>
                  <span className="more-crm-icon">•••</span>
                  <strong>More sources</strong>
                  <small>View all</small>
                </button>
              </div>
              <div className="crm-security-line"><LockKeyhole size={12} /> Your provider password is never stored by Byizon.</div>
            </section>

            <section className="home-value-grid">
              {VALUE_ITEMS.map(({ icon: Icon, title, text }) => (
                <div key={title}><Icon size={17} /><span><strong>{title}</strong><small>{text}</small></span></div>
              ))}
            </section>
            </div>
        ) : (
          <section className="home-conversation" aria-label="AI conversation">
            <div className="home-conversation-header">
              <div><Bot size={18} /><span><strong>Byizon AI</strong><small>{activeData?.fileName || 'No dataset attached'}</small></span></div>
              {activeData && <button onClick={() => navigate('/dashboard')}><BarChart3 size={15} /> Open dashboard</button>}
            </div>
            <div className="home-message-list">
              {localMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`home-message ${message.role}`}>
                  <div>
                    {message.text}
                    {message.task && <OperationTimeline operation={message.task} />}
                    {message.choices?.length > 0 && (
                      <div className="provider-choice-list" aria-label="Choose a connected service">
                        {message.choices.map(choice => (
                          <button
                            type="button"
                            key={choice.id}
                            onClick={() => setInput(choice.prompt)}
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="home-message assistant">
                  <div>
                    {activeOperation
                      ? <OperationTimeline operation={activeOperation} pending />
                      : <div className="home-typing"><Loader2 size={15} className="spin" /> Analyzing current data...</div>}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="home-sticky-composer">
              <ChatComposer
                input={input}
                setInput={setInput}
                onSend={sendMessage}
                onAttach={() => fileInputRef.current?.click()}
                loading={loading || uploading}
                dataName={activeData?.fileName}
              />
              {notice && <div className="home-notice compact">{notice}</div>}
            </div>
          </section>
          )}
          </div>
          <ActionRail
            catalog={catalog}
            connectedIds={connectedIds}
            operation={activeOperation}
            activeData={activeData}
            loading={loading}
            onConnect={() => navigate('/connections')}
          />
        </div>

        <input ref={fileInputRef} type="file" hidden onChange={uploadFile} accept=".csv,.tsv,.xlsx,.xls,.json,.pdf,.txt,.log,.sql,.sqlite,.sqlite3,.db" />
      </main>
    </div>
  );
}

function ActionRail({ catalog, connectedIds, operation, activeData, loading, onConnect }) {
  const connected = catalog.filter(item => connectedIds.has(item.id)).slice(0, 5);
  const googleConnected = connectedIds.has('google-workspace');
  const slackConnected = connectedIds.has('slack');
  const ecosystem = [
    ...(googleConnected ? [
      { id: 'google-calendar', name: 'Google Calendar', icon: CalendarCheck2, tone: 'blue' },
      { id: 'google-meet', name: 'Google Meet', icon: Video, tone: 'indigo' },
      { id: 'gmail', name: 'Gmail', icon: Mail, tone: 'red' },
    ] : []),
    ...(slackConnected ? [{ id: 'slack', name: 'Slack', icon: MessageSquare, tone: 'violet' }] : []),
    ...connected.filter(item => !['google-workspace', 'slack'].includes(item.id)).map(item => ({
      id: item.id,
      name: item.name,
      connector: item,
      tone: 'blue',
    })),
  ].slice(0, 6);
  const taskSteps = operation?.steps || [];

  return (
    <aside className="ai-action-rail" aria-label="AI actions and connected services">
      <div className="action-rail-header">
        <span><Zap size={16} /></span>
        <div><strong>AI Actions Log</strong><small>Real-time automation monitoring</small></div>
        <i className={loading ? 'live' : ''} />
      </div>

      {operation ? (
        <section className="rail-operation">
          <div className="rail-section-label">Current request</div>
          <h3>{operation.title || 'Processing your request'}</h3>
          <div className="rail-task-steps">
            {(taskSteps.length ? taskSteps : [
              { label: 'Understanding request', status: 'complete' },
              { label: 'Checking permissions', status: loading ? 'running' : 'complete' },
              { label: 'Completing action', status: loading ? 'pending' : 'complete' },
            ]).map((step, index) => (
              <div key={`${step.label}-${index}`} className={step.status}>
                {step.status === 'running' ? <Loader2 size={13} className="spin" /> : <CheckCircle2 size={13} />}
                <span>{step.label}</span>
              </div>
            ))}
          </div>
          {operation.url && (
            <div className="rail-result-link">
              <span>{operation.url}</span>
              <button type="button" onClick={() => navigator.clipboard.writeText(operation.url)}><Copy size={12} /> Copy</button>
              <a href={operation.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open</a>
            </div>
          )}
        </section>
      ) : (
        <section className="rail-ready-state">
          <Sparkles size={20} />
          <h3>Ready for a request</h3>
          <p>Ask Byizon to analyze data, create a meeting, update a sheet, or send an email.</p>
        </section>
      )}

      <section className="connected-ecosystem">
        <div className="rail-section-label">Connected ecosystem</div>
        {ecosystem.length ? ecosystem.map(item => {
          const EcosystemIcon = item.icon;
          return (
          <div key={item.id}>
            {item.connector
              ? <ProviderLogo connector={item.connector} />
              : <span className={`ecosystem-service-icon ${item.tone}`}><EcosystemIcon size={16} /></span>}
            <span><strong>{item.name}</strong><small>Authorized</small></span>
            <CheckCircle2 size={15} />
          </div>
          );
        }) : (
          <button type="button" onClick={onConnect}><ShieldCheck size={16} /> Connect a secure service</button>
        )}
      </section>

      <section className="rail-insight-card">
        <Lightbulb size={18} />
        <div>
          <span>Workspace status</span>
          <strong>{activeData ? 'Dataset ready for analysis' : 'Connect or upload data'}</strong>
          <small>{activeData?.fileName || 'No active dataset'}</small>
        </div>
      </section>

      <div className="rail-efficiency">
        <span><Clock3 size={14} /> Live task visibility</span>
        <span><Users size={14} /> Permission governed</span>
      </div>
    </aside>
  );
}

function ChatComposer({ input, setInput, onSend, onAttach, loading, dataName }) {
  return (
    <div className="home-composer">
      <textarea
        value={input}
        onChange={event => setInput(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder={dataName ? `Ask about ${dataName}...` : 'Ask anything in natural language...'}
        rows={2}
        aria-label="Ask Byizon AI"
      />
      <div className="home-composer-toolbar">
        <div>
          <button onClick={onAttach} aria-label="Attach a data file" title="Attach data file"><Paperclip size={17} /></button>
          <span className="smart-mode"><Lightbulb size={15} /> Smart <ChevronDown size={13} /></span>
          {dataName && <span className="composer-data-pill"><Database size={12} />{dataName}</span>}
        </div>
        <button className="home-send-button" onClick={() => onSend()} disabled={loading || !input.trim()} aria-label="Send message">
          {loading ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
        </button>
      </div>
    </div>
  );
}
