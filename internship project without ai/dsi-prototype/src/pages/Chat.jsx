import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart2,
  Clock3,
  Database,
  FileText,
  History,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Plus,
  Send,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useData } from '../context/DataContext';
import { askDataChat } from '../api/huggingface';
import { clearBackendChat } from '../api/universalBackend';
import { runPipeline } from '../api/pipeline';

const MAX_CONTEXT_MESSAGES = 20;

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function welcomeText(data) {
  if (!data) {
    return 'Namaste! I am Byizon AI. Aap Hindi, English, Hinglish ya Roman Hindi mein baat kar sakte hain. How can I help you today?';
  }
  return `Hello! Maine **${data.fileName}** load kar li hai — ${(data.rowCount || 0).toLocaleString()} rows aur ${(data.columns || []).length} columns. Aap is data ke baare mein Hindi ya English mein kuch bhi pooch sakte hain.`;
}

function makeMessage(role, text, extra = {}) {
  return {
    id: createId('msg'),
    role,
    text,
    timestamp: Date.now(),
    ...extra,
  };
}

function makeThread(data, migratedMessages = []) {
  const now = Date.now();
  return {
    id: createId('chat'),
    title: migratedMessages.find(message => message.role === 'user')?.text?.slice(0, 46) || 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: migratedMessages.length ? migratedMessages : [makeMessage('ai', welcomeText(data))],
  };
}

function normalizePersistedMessage(message) {
  return {
    id: message.id || createId('msg'),
    role: message.role === 'assistant' ? 'ai' : message.role,
    text: String(message.text || ''),
    timestamp: Number(message.timestamp || Date.now()) * (Number(message.timestamp) < 1e12 ? 1000 : 1),
    provider: message.provider || null,
  };
}

function TypingIndicator() {
  return (
    <div className="msg-row ai">
      <div className="msg-avatar ai">B</div>
      <div className="msg-bubble ai">
        <div className="typing-indicator">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    </div>
  );
}

export default function Chat() {
  const { pathname } = useLocation();
  const { uploadedData, setUploadedData, analysisSession } = useData();
  const isHomeChat = pathname === '/';
  const sessionId = uploadedData?.sessionId || analysisSession?.sessionId || null;
  const storageKey = `byizon_chat_threads_v2_${sessionId || 'general'}`;
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let loaded = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(parsed)) {
        loaded = parsed
          .filter(thread => thread && thread.id && Array.isArray(thread.messages))
          .map(thread => ({
            ...thread,
            messages: thread.messages.map(normalizePersistedMessage),
          }));
      }
    } catch {
      loaded = [];
    }

    if (!loaded.length) {
      const legacy = (analysisSession?.chatHistory || []).map(normalizePersistedMessage);
      loaded = [makeThread(uploadedData, legacy)];
      localStorage.setItem(storageKey, JSON.stringify(loaded));
    }
    loaded.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    setThreads(loaded);
    setActiveThreadId(loaded[0].id);
    setHistoryOpen(false);
  }, [storageKey, uploadedData, analysisSession?.chatHistory]);

  const activeThread = useMemo(
    () => threads.find(thread => thread.id === activeThreadId) || threads[0] || null,
    [threads, activeThreadId],
  );
  const messages = useMemo(() => activeThread?.messages || [], [activeThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const commitThreads = updater => {
    setThreads(previous => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch (error) {
        console.warn('[Chat] history persistence failed:', error);
      }
      return next;
    });
  };

  const updateActiveThread = updater => {
    if (!activeThreadId) return;
    commitThreads(previous => previous.map(thread => {
      if (thread.id !== activeThreadId) return thread;
      const updated = typeof updater === 'function' ? updater(thread) : updater;
      return { ...updated, updatedAt: Date.now() };
    }));
  };

  const startNewChat = () => {
    const thread = makeThread(uploadedData);
    commitThreads(previous => [thread, ...previous]);
    setActiveThreadId(thread.id);
    setInput('');
    setTyping(false);
    setHistoryOpen(false);
  };

  const uploadFile = async event => {
    const file = event.target.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setUploadNotice(`Reading ${file.name}...`);
    try {
      const result = await runPipeline(file);
      if (result.fileName !== file.name || !result.sourceProvenance?.sha256) {
        throw new Error('The selected file could not be verified.');
      }
      setUploadedData(result);
      const readyMessage = makeMessage(
        'ai',
        `**${result.fileName}** ready hai. Maine ${(result.rowCount || 0).toLocaleString()} rows aur ${(result.columns || []).length} columns analyze kar liye. Ab aap is data ke baare mein Hindi, English ya Hinglish mein kuch bhi pooch sakte hain.`,
      );
      updateActiveThread(thread => ({
        ...thread,
        messages: [...thread.messages, readyMessage],
      }));
      setUploadNotice('Analysis complete');
    } catch (error) {
      setUploadNotice(error.message || 'File analysis failed.');
      updateActiveThread(thread => ({
        ...thread,
        messages: [...thread.messages, makeMessage('ai', `Upload error: ${error.message}`)],
      }));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const clearCurrentChat = async () => {
    if (!activeThread || !window.confirm('Clear this chat? Is chat ki saari messages delete ho jayengi.')) return;
    const reset = [makeMessage('ai', welcomeText(uploadedData))];
    updateActiveThread(thread => ({ ...thread, title: 'New chat', messages: reset }));
    setInput('');
    await clearBackendChat(sessionId, activeThread.id).catch(() => {});
  };

  const sendMessage = async rawText => {
    const text = String(rawText || '').trim();
    if (!text || typing || !activeThread) return;

    const context = messages.slice(-MAX_CONTEXT_MESSAGES).map(message => ({
      role: message.role === 'ai' ? 'assistant' : 'user',
      text: message.text,
    }));
    const userMessage = makeMessage('user', text);
    updateActiveThread(thread => ({
      ...thread,
      title: thread.title === 'New chat' ? text.slice(0, 46) : thread.title,
      messages: [...thread.messages, userMessage],
    }));
    setInput('');
    setTyping(true);

    try {
      const response = await askDataChat(text, uploadedData, context, activeThread.id);
      const answer = typeof response === 'string' ? response : response.answer;
      if (typeof response === 'object' && response.analysis) {
        setUploadedData({ ...response.analysis, sessionId: response.sessionId || response.analysis.sessionId });
      } else if (typeof response === 'object' && response.clearActiveAnalysis) {
        setUploadedData(null);
      }
      const provider = typeof response === 'object' ? response.aiBoundary?.provider : null;
      updateActiveThread(thread => ({
        ...thread,
        messages: [...thread.messages, makeMessage('ai', answer, { provider })],
      }));
    } catch (error) {
      updateActiveThread(thread => ({
        ...thread,
        messages: [...thread.messages, makeMessage('ai', `Chat error: ${error.message}`)],
      }));
    } finally {
      setTyping(false);
    }
  };

  const renderText = text => String(text || '').split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part.split('\n').map((line, lineIndex, lines) => (
          <span key={`${index}-${lineIndex}`}>{line}{lineIndex < lines.length - 1 && <br />}</span>
        ))
  ));

  const hints = uploadedData
    ? ['Is data ka summary do', 'Top insights kya hain?', 'Show key metrics', 'Koi anomaly hai?']
    : ['Hindi mein baat karo', 'Help me plan my work', 'Maine abhi kya kaha?', 'Explain something simply'];

  return (
    <div className={`app-layout ${isHomeChat ? 'home-chat-layout' : ''}`}>
      <Sidebar />
      <main className={`main-content chat-page-main ${isHomeChat ? 'home-chat-main' : ''}`}>
        <div className="page-header chat-page-header">
          <div>
            <h1 className="page-title">Byizon AI Chat</h1>
            <p className="page-subtitle">
              {uploadedData
                ? `${uploadedData.fileName} · ${(uploadedData.rowCount || 0).toLocaleString()} rows · bilingual data assistant`
                : 'Human-like Hindi, English and Hinglish assistant'}
            </p>
          </div>
          <button className="btn-outline chat-history-toggle" onClick={() => setHistoryOpen(true)}>
            <History size={15} /> History
          </button>
        </div>

        <div className="chat-layout">
          <aside className={`chat-history ${historyOpen ? 'mobile-open' : ''}`}>
            <div className="chat-history-head">
              <div>
                <div className="chat-history-title">Chat history</div>
                <small>{threads.length} conversation{threads.length === 1 ? '' : 's'}</small>
              </div>
              <button className="chat-history-close" onClick={() => setHistoryOpen(false)} aria-label="Close history">
                <X size={16} />
              </button>
            </div>
            <button className="chat-new-button" onClick={startNewChat}>
              <Plus size={15} /> New chat
            </button>
            <div className="chat-history-list">
              {threads.map(thread => (
                <button
                  key={thread.id}
                  className={`chat-history-item ${thread.id === activeThread?.id ? 'active' : ''}`}
                  onClick={() => { setActiveThreadId(thread.id); setHistoryOpen(false); }}
                >
                  <MessageSquarePlus size={14} />
                  <span>
                    <span className="chat-history-item-title">{thread.title || 'New chat'}</span>
                    <span className="chat-history-item-time">
                      {new Date(thread.updatedAt || thread.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="chat-memory-note">
              <Clock3 size={14} /> Last {MAX_CONTEXT_MESSAGES} messages stay in active memory
            </div>
          </aside>

          {historyOpen && <button className="chat-history-backdrop" onClick={() => setHistoryOpen(false)} aria-label="Close history" />}

          <section className="chat-main">
            <div className="chat-top-bar">
              <div className="ai-status">
                <div className="ai-dot" />
                <div>
                  <div className="ai-name">Byizon AI</div>
                  <div className="ai-tag">{activeThread?.title || 'New chat'} · 20-message memory</div>
                </div>
              </div>
              <div className="chat-top-actions">
                <button className="btn-outline" onClick={startNewChat}><Plus size={13} /> New chat</button>
                <button className="btn-outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 size={13} className="spin" /> : <Paperclip size={13} />} Upload file
                </button>
                <button className="btn-outline chat-clear-button" onClick={clearCurrentChat}><Trash2 size={13} /> Clear chat</button>
                {uploadedData && (
                  <>
                    <Link to="/dashboard"><button className="btn-outline"><BarChart2 size={13} /> Dashboard</button></Link>
                    <Link to="/reports"><button className="btn-outline"><FileText size={13} /> Reports</button></Link>
                  </>
                )}
              </div>
            </div>

            <div className="chat-messages">
              {messages.map(message => (
                <div key={message.id} className={`msg-row ${message.role}`}>
                  <div className={`msg-avatar ${message.role}`}>{message.role === 'ai' ? 'B' : 'U'}</div>
                  <div className="chat-message-content">
                    <div className={`msg-bubble ${message.role}`}>{renderText(message.text)}</div>
                    <div className="msg-meta">
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {message.provider && message.provider !== 'deterministic' ? ` · ${message.provider}` : ''}
                    </div>
                  </div>
                </div>
              ))}
              {typing && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-wrap">
              {uploadedData && (
                <div className="chat-data-pill">
                  <Database size={13} />
                  <span>{uploadedData.fileName}</span>
                  <small>{(uploadedData.rowCount || 0).toLocaleString()} rows</small>
                </div>
              )}
              {uploadNotice && <div className="chat-upload-notice">{uploadNotice}</div>}
              <div className="chat-input-row">
                <Zap size={16} color="var(--blue-500)" />
                <button
                  className="chat-attach-btn"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label="Upload data file"
                  title="Upload data file"
                >
                  {uploading ? <Loader2 size={15} className="spin" /> : <Paperclip size={15} />}
                </button>
                <textarea
                  className="chat-input"
                  placeholder="Hindi, English ya Hinglish mein message likhiye…"
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  disabled={typing}
                  rows={1}
                />
                <button className="chat-send-btn" onClick={() => sendMessage(input)} disabled={typing || !input.trim()} aria-label="Send message">
                  <Send size={15} color="white" />
                </button>
              </div>
              <div className="chat-input-hints">
                {hints.map(hint => <button key={hint} className="chat-hint" onClick={() => sendMessage(hint)} disabled={typing}>{hint}</button>)}
              </div>
              <div className="chat-context-caption">Only this chat's last 20 messages are sent as context. New Chat starts with zero previous memory.</div>
            </div>
          </section>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={uploadFile}
          accept=".csv,.tsv,.xlsx,.xls,.json,.pdf,.txt,.log,.sql,.sqlite,.sqlite3,.db"
        />
      </main>
    </div>
  );
}
