import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, Bot, CheckCircle2, ChevronDown, Database,
  Lightbulb, Loader2, LockKeyhole, Menu, Paperclip, Send, ShieldCheck, Sparkles,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { ProviderLogo } from '../components/QuickConnections';
import { useData } from '../context/DataContext';
import { askDataChat } from '../api/huggingface';
import { getAuthSession, getConnectors, oauthStartUrl } from '../api/universalBackend';
import { runPipeline } from '../api/pipeline';

const STARTER_PROMPTS = [
  'Summarize my connected data',
  'Show the strongest relationships',
  'Check data quality problems',
  'Find the most unusual patterns',
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
      .catch(() => {});
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
      appendMessage({ role: 'assistant', text: answer });
    } catch (error) {
      appendMessage({ role: 'assistant', text: `I could not complete that request: ${error.message}` });
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
          <div className="topbar-actions">
            <button onClick={() => {
              if (account.authenticated) navigate('/connections');
              else if (googleConnector) connectProvider(googleConnector);
              else navigate('/connections');
            }}>{account.authenticated ? 'Connect data' : 'Continue with Google'}</button>
            <span className="topbar-avatar" title={account.email || 'Guest workspace'}>{accountInitial}</span>
          </div>
        </header>

        {!conversationStarted ? (
          <div className="byizon-onboarding">
            <section className="byizon-greeting">
              <span><Sparkles size={16} /> Byizon AI</span>
              <h1>Hi {accountName}, what should we dive into today?</h1>
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

            {notice && <div className="home-notice">{uploading && <Loader2 size={14} className="spin" />}{notice}</div>}

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
                  <div>{message.text}</div>
                </div>
              ))}
              {loading && <div className="home-message assistant"><div className="home-typing"><Loader2 size={15} className="spin" /> Analyzing current data...</div></div>}
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

        <input ref={fileInputRef} type="file" hidden onChange={uploadFile} accept=".csv,.tsv,.xlsx,.xls,.json,.pdf,.txt,.log,.sql,.sqlite,.sqlite3,.db" />
      </main>
    </div>
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
