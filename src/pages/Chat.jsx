import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart2,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  Mail,
  MessageSquare,
  Mic,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  ExternalLink,
  Target,
  Trash2
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { runPipeline } from '../api/pipeline';
import { getConnectors } from '../api/universalBackend';
import { useData } from '../context/DataContext';
import { useWorkspaceUser, workspaceInitials } from '../utils/workspaceUser';

function uploadFileMeta(fileName = '') {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['xls', 'xlsx', 'xlsm'].includes(ext)) return { kind: 'excel', label: 'Spreadsheet' };
  if (ext === 'csv') return { kind: 'csv', label: 'CSV file' };
  if (['ppt', 'pptx'].includes(ext)) return { kind: 'powerpoint', label: 'Presentation' };
  if (ext === 'pdf') return { kind: 'pdf', label: 'PDF document' };
  if (['doc', 'docx'].includes(ext)) return { kind: 'word', label: 'Document' };
  if (['json'].includes(ext)) return { kind: 'json', label: 'JSON data' };
  if (['sql', 'sqlite', 'db'].includes(ext)) return { kind: 'database', label: 'Database export' };
  return { kind: 'file', label: ext ? `${ext.toUpperCase()} file` : 'Uploaded file' };
}

function normalizeChatMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const text = typeof message.text === 'string' ? message.text : '';
  const rawAttachment = message.attachment && typeof message.attachment === 'object' ? message.attachment : null;
  const attachmentName = rawAttachment?.name || '';
  const attachment = attachmentName ? {
    name: attachmentName,
    ...uploadFileMeta(attachmentName),
    ...rawAttachment,
  } : null;
  if (!text && !attachment && message.role === 'user') return null;
  return {
    ...message,
    text,
    attachment,
  };
}

function sessionAnalysisSnapshot(data) {
  if (!data) return null;
  return {
    ...data,
    // Conversation history only needs a small sample to restore dashboard context.
    // Keeping hundreds of complete spreadsheet rows here can exceed localStorage
    // during send and crash the React tree.
    rows: Array.isArray(data.rows) ? data.rows.slice(0, 50) : [],
    rawRows: undefined,
    sourceRows: undefined,
  };
}

function persistChatSessionsSafely(sessions) {
  try {
    localStorage.setItem('byizon_chat_sessions', JSON.stringify(sessions));
    return;
  } catch (error) {
    // Preserve the conversation even when a large analysis payload exceeds the
    // browser storage quota. The active dashboard remains available in DataContext.
    try {
      const lightweight = sessions.map(({ analysis, ...session }) => ({
        ...session,
        analysis: analysis ? {
          sessionId: analysis.sessionId,
          fileName: analysis.fileName,
          fileType: analysis.fileType,
          rowCount: analysis.rowCount,
          colCount: analysis.colCount,
          columns: Array.isArray(analysis.columns) ? analysis.columns.slice(0, 100) : [],
          analysisStatus: analysis.analysisStatus,
          createdAt: analysis.createdAt,
        } : null,
      }));
      localStorage.setItem('byizon_chat_sessions', JSON.stringify(lightweight));
    } catch (fallbackError) {
      console.warn('[Chat] conversation persistence failed:', fallbackError || error);
    }
  }
}

const CHAT_SESSIONS_KEY = 'byizon_chat_sessions';
const ACTIVE_CHAT_SESSION_KEY = 'byizon_active_chat_session';

function readStoredChatSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_SESSIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(session => ({
      ...session,
      messages: Array.isArray(session.messages) ? session.messages.map(normalizeChatMessage).filter(Boolean) : [],
    })) : [];
  } catch {
    return [];
  }
}

function rememberedChatSessionId() {
  return sessionStorage.getItem(ACTIVE_CHAT_SESSION_KEY) || '';
}

export default function Chat() {
  const navigate = useNavigate();
  const { uploadedData, chatHistory, setSessionChatHistory, setUploadedData, setPipelineStages } = useData();
  const user = useWorkspaceUser();
  const initials = workspaceInitials(user);
  const displayName = user.displayName || 'Super Admin';

  const initialChatState = useMemo(() => {
    const sessions = readStoredChatSessions();
    const activeId = rememberedChatSessionId();
    const activeSession = sessions.find(session => session.id === activeId);
    return {
      sessions,
      activeId: activeSession ? activeId : '',
      messages: activeSession?.messages || [],
    };
  }, []);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(initialChatState.messages);
  const [chatSessions, setChatSessions] = useState(initialChatState.sessions);
  const [activeSessionId, setActiveSessionId] = useState(initialChatState.activeId);
  const activeSessionIdRef = useRef(initialChatState.activeId);
  const [historyMenu, setHistoryMenu] = useState(null);
  const [connectedApps, setConnectedApps] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
  const [rightPanelMode, setRightPanelMode] = useState('history'); // history, meeting, data
  const [isRightPanelHidden, setIsRightPanelHidden] = useState(true);
  const bottomRef = useRef(null);
  const selectedUploadMeta = useMemo(() => uploadFileMeta(selectedUploadFile?.name), [selectedUploadFile?.name]);

  useEffect(() => {
    const closeMenu = () => setHistoryMenu(null);
    const closeMenuOnEscape = event => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('keydown', closeMenuOnEscape);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('keydown', closeMenuOnEscape);
    };
  }, []);

  const refreshConnectedApps = useCallback(() => getConnectors()
    .then(payload => {
      const catalog = payload.catalog || [];
      const catalogById = new Map(catalog.map(item => [item.id, item]));
      const activeConnections = (payload.connections || [])
        .filter(item => item.status === 'connected' && !item.requiresReconnect)
        .map(item => {
          const connector = catalogById.get(item.connectorId) || {};
          return {
            id: item.connectionId || item.connectorId,
            connectorId: item.connectorId,
            name: connector.name || item.name || item.connectorId,
            accent: connector.accent || '#9a552f',
          };
        });
      setConnectedApps(activeConnections);
    })
    .catch(() => setConnectedApps([])), []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (!cancelled) refreshConnectedApps();
    };
    refresh();
    const timer = window.setInterval(refresh, 3500);
    window.addEventListener('focus', refresh);
    window.addEventListener('byizon:connections-changed', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('byizon:connections-changed', refresh);
    };
  }, [refreshConnectedApps]);

  const realHistoryItems = useMemo(() => {
    const storedSessions = Object.entries(chatHistory || {})
      .map(([id, turns]) => {
        const firstUser = (turns || []).find(item => item.role === 'user' && item.text);
        if (!firstUser) return null;
        return {
          id,
          title: firstUser.text,
          time: firstUser.time || '',
          messages: turns,
          updatedAt: firstUser.createdAt || '',
        };
      })
      .filter(Boolean);
    const sessions = Array.from(new Map([...storedSessions, ...chatSessions]
      .map(session => [session.id, session])).values())
      .filter(session => session?.messages?.some(item => item?.text))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const query = historySearch.trim().toLowerCase();
    return (query ? sessions.filter(item => item.title.toLowerCase().includes(query)) : sessions).slice(0, 8);
  }, [chatHistory, chatSessions, historySearch]);

  const handleLocalFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    setSelectedUploadFile(file);
    setUploadError('');
    setUploadingFile(true);
    setUploadedData(null);
    setPipelineStages([]);

    try {
      const result = await runPipeline(file, (stageId, stageStatus, message) => {
        setPipelineStages(previous => ({
          ...previous,
          [stageId]: { status: stageStatus, message },
        }));
      });
      if (result.fileName !== file.name) {
        throw new Error(`Source verification failed: selected ${file.name}, but analysis returned ${result.fileName}.`);
      }
      if (!result.sourceProvenance?.sha256) {
        throw new Error('Source verification failed: the backend did not return a file fingerprint.');
      }
      setUploadedData({ ...result });
    } catch (error) {
      setUploadError(error.message || 'File upload failed. Please try another file.');
    } finally {
      setUploadingFile(false);
    }
  };

  const persistSessions = (updater) => {
    setChatSessions(previous => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      persistChatSessionsSafely(next);
      return next;
    });
  };

  const upsertActiveSession = (nextMessages, analysisOverride = uploadedData) => {
    const realTurns = nextMessages.map(normalizeChatMessage).filter(item => item?.text || item?.attachment);
    if (!realTurns.length) return '';
    const firstUser = realTurns.find(item => item.role === 'user' && (item.text || item.attachment));
    const analysis = sessionAnalysisSnapshot(analysisOverride);
    const sessionId = activeSessionIdRef.current || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      id: sessionId,
      title: firstUser?.text || firstUser?.attachment?.name || 'New conversation',
      time: firstUser?.time || '',
      updatedAt: new Date().toISOString(),
      messages: realTurns,
      analysis,
      fileName: analysis?.fileName || '',
    };
    if (!activeSessionIdRef.current) {
      activeSessionIdRef.current = sessionId;
      setActiveSessionId(sessionId);
      sessionStorage.setItem(ACTIVE_CHAT_SESSION_KEY, sessionId);
    }
    persistSessions(previous => [session, ...previous.filter(item => item.id !== sessionId)].slice(0, 40));
    return sessionId;
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const startNewChat = () => {
      setMessages(current => {
        upsertActiveSession(current, uploadedData);
        return [];
      });
      activeSessionIdRef.current = '';
      setActiveSessionId('');
      sessionStorage.removeItem(ACTIVE_CHAT_SESSION_KEY);
      setInput('');
      setSelectedUploadFile(null);
      setUploadError('');
      setUploadingFile(false);
      setUploadedData(null);
      setPipelineStages([]);
      setRightPanelMode('history');
      setHistoryMenu(null);
    };
    window.addEventListener('byizon:new-chat', startNewChat);
    return () => window.removeEventListener('byizon:new-chat', startNewChat);
    // upsertActiveSession uses refs/state setters and should only attach the global listener once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteConversation = (sessionId) => {
    persistSessions(previous => previous.filter(item => item.id !== sessionId));
    setSessionChatHistory(sessionId, []);
    if (activeSessionIdRef.current === sessionId) {
      activeSessionIdRef.current = '';
      setActiveSessionId('');
      setMessages([]);
      setInput('');
      setSelectedUploadFile(null);
      setUploadError('');
      setUploadingFile(false);
      setUploadedData(null);
      setPipelineStages([]);
    }
    sessionStorage.removeItem(ACTIVE_CHAT_SESSION_KEY);
    setHistoryMenu(null);
  };

  const handleSend = (e) => {
    e?.preventDefault();
    const uploadedFileName = selectedUploadFile?.name || '';
    const attachedFile = uploadedFileName ? {
      name: uploadedFileName,
      ...uploadFileMeta(uploadedFileName),
    } : null;
    if (!input.trim() && !attachedFile) return;
    
    const typedText = input.trim();
    const responsePrompt = typedText || (attachedFile ? `Analyze ${attachedFile.name}` : '');
    const newMessages = [...messages, {
      role: 'user',
      text: typedText,
      attachment: attachedFile,
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    }];
    setMessages(newMessages);
    upsertActiveSession(newMessages);
    setInput('');
    setSelectedUploadFile(null);
    setUploadError('');

    // Mock specific responses based on keywords
    setTimeout(() => {
      let aiResponse = { role: 'ai', time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };

      if (attachedFile && !typedText) {
        aiResponse.type = 'text';
        aiResponse.text = `File mil gayi hai. Aap ${attachedFile.name} par analysis, rows/columns, data quality, ya dashboard ke baare me pooch sakte ho.`;
      } else if (responsePrompt.toLowerCase().includes('slack')) {
        aiResponse.type = 'slack_summary';
        setRightPanelMode('history');
      } else if (responsePrompt.toLowerCase().includes('schedule') || responsePrompt.toLowerCase().includes('meeting')) {
        aiResponse.type = 'meeting_scheduled';
        setRightPanelMode('meeting');
      } else if (responsePrompt.toLowerCase().includes('sales') || responsePrompt.toLowerCase().includes('profit') || responsePrompt.toLowerCase().includes('sheet')) {
        aiResponse.type = 'sales_report';
        setRightPanelMode('data');
      } else {
        aiResponse.type = 'text';
        aiResponse.text = 'I can help with that. Could you provide more details?';
      }

      setMessages((prev) => {
        const next = [...prev, aiResponse];
        upsertActiveSession(next);
        return next;
      });
    }, 1000);
  };

  const renderMessage = (msg, i) => {
    if (msg.role === 'user') {
      return (
        <div key={i} className="pdf-chat-msg user">
          <div className="pdf-chat-bubble">
            {msg.attachment && (
              <div className={`chat-sent-attachment file-${msg.attachment.kind || 'file'}`}>
                <FileSpreadsheet size={22} />
                <div>
                  <strong>{msg.attachment.name}</strong>
                  <span>{msg.attachment.label || 'Uploaded file'}</span>
                </div>
              </div>
            )}
            {msg.text && <span>{msg.text}</span>}
          </div>
          <div className="pdf-chat-avatar">{initials}</div>
        </div>
      );
    }

    if (msg.type === 'slack_summary') {
      return (
        <div key={i} className="pdf-chat-msg ai">
          <div className="pdf-chat-avatar ai-bot-avatar"><Bot size={18} /></div>
          <div className="pdf-chat-rich-bubble">
            <div className="pdf-chat-reasoning">
              <div className="reasoning-step done"><Check size={14} /> Searching Slack...</div>
              <div className="reasoning-step done"><Check size={14} /> Reading conversation</div>
              <div className="reasoning-step done"><Check size={14} /> Finding messages from yesterday</div>
              <div className="reasoning-step done"><Check size={14} /> Summarizing discussion</div>
            </div>
            
            <div className="pdf-chat-summary-box">
              <div className="summary-header">
                <strong>Yesterday you had 14 messages with Ronak.</strong>
              </div>
              <div className="summary-body">
                <div>
                  <strong>Summary</strong>
                  <ul>
                    <li>Finalized CRM MVP timeline.</li>
                    <li>Landing page should be completed by Monday.</li>
                    <li>Ronak will design the Analytics Dashboard.</li>
                    <li>Discussion about Google Drive integration.</li>
                    <li>Pending task: Create AI Chat history screen.</li>
                  </ul>
                </div>
                <div>
                  <div style={{display: 'flex', alignItems:'center', gap:'8px', marginBottom:'12px'}}>
                    <strong>Sentiment</strong>
                    <span className="sentiment-pill positive">?? Positive</span>
                  </div>
                  <strong>Action Items</strong>
                  <ul className="action-items">
                    <li><CheckCircle2 size={14} color="#10b981"/> Follow up with Ronak</li>
                    <li><CheckCircle2 size={14} color="#10b981"/> Review Figma tomorrow</li>
                    <li><CheckCircle2 size={14} color="#10b981"/> Complete Dashboard</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === 'meeting_scheduled') {
      return (
        <div key={i} className="pdf-chat-msg ai">
          <div className="pdf-chat-avatar ai-bot-avatar"><Bot size={18} /></div>
          <div className="pdf-chat-rich-bubble">
             <div className="pdf-chat-reasoning">
              <div className="reasoning-step done"><Check size={14} /> Understanding your request</div>
              <div className="reasoning-step done"><Check size={14} /> Checking availability of Ronak</div>
              <div className="reasoning-step done"><Check size={14} /> Creating Google Meet</div>
              <div className="reasoning-step done"><Check size={14} /> Scheduling the meeting</div>
              <div className="reasoning-step done"><Check size={14} /> Sending invitations</div>
            </div>

            <div className="pdf-chat-meeting-box">
              <div className="meeting-header">
                <Calendar size={18} color="#10b981"/> Meeting Scheduled Successfully! ??
              </div>
              <p>Your meeting with Ronak has been scheduled.</p>
              
              <div className="meeting-details-grid">
                <div><span>Title</span> Meeting with Ronak</div>
                <div><span>Date</span> Friday, 30 May 2026 (3 days from now)</div>
                <div><span>Time</span> 10:00 AM - 10:30 AM (IST)</div>
                <div><span>Attendees</span> Veer Singh (You), Ronak</div>
                <div><span>Platform</span> Google Meet</div>
                <div><span>Meet Link</span> <a href="#">meet.google.com/abc-defg-hij</a></div>
              </div>

              <div className="meeting-actions">
                <button className="btn-primary"><Calendar size={14}/> Open in Calendar</button>
                <button className="btn-outline"><ExternalLink size={14}/> Join Meeting</button>
                <button className="btn-outline"><Share2 size={14}/> Share</button>
              </div>
              
              <div className="meeting-footer">
                <Mail size={14}/> Invitation sent to Ronak via email and Google Calendar.
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === 'sales_report') {
      return (
        <div key={i} className="pdf-chat-msg ai">
           <div className="pdf-chat-avatar ai-bot-avatar"><Bot size={18} /></div>
           <div className="pdf-chat-rich-bubble full-width">
              <div className="pdf-chat-reasoning">
                <div className="reasoning-step done"><Check size={14} /> Reading spreadsheet</div>
                <div className="reasoning-step done"><Check size={14} /> Comparing last 2 months</div>
                <div className="reasoning-step done"><Check size={14} /> Calculating revenue</div>
                <div className="reasoning-step done"><Check size={14} /> Detecting trends</div>
                <div className="reasoning-step done"><Check size={14} /> Finding reasons</div>
              </div>

              <div className="pdf-chat-sales-box">
                <div className="sales-header">
                  <div>
                    <FileSpreadsheet size={18} color="#10b981"/>
                    <strong>Sales Performance Report</strong>
                    <span>(Last 2 Months)</span>
                  </div>
                  <span className="sales-period">Period: 1 Apr - 31 May 2026</span>
                </div>

                <div className="sales-kpi-grid">
                  <div className="kpi-card">
                    <small>Revenue</small>
                    <div><strong>?48.2L</strong> <span className="trend up"><TrendingUp size={12}/> 12%</span></div>
                    <span className="vs">vs previous 2 months (?43.0L)</span>
                  </div>
                  <div className="kpi-card">
                    <small>Profit</small>
                    <div><strong>?8.6L</strong> <span className="trend up"><TrendingUp size={12}/> 9%</span></div>
                    <span className="vs">vs previous 2 months (?7.9L)</span>
                  </div>
                  <div className="kpi-card">
                    <small>Loss</small>
                    <div><strong>?1.4L</strong> <span className="trend down"><TrendingDown size={12}/> 18%</span></div>
                    <span className="vs">vs previous 2 months (?1.7L)</span>
                  </div>
                  <div className="kpi-card">
                    <small>Profit Margin</small>
                    <div><strong>17.8%</strong> <span className="trend up"><TrendingUp size={12}/> 1.2%</span></div>
                    <span className="vs">vs previous 2 months (16.6%)</span>
                  </div>
                </div>

                <div className="sales-analysis-grid">
                  <div>
                    <strong><Sparkles size={14} color="#10b981"/> AI Summary</strong>
                    <ul>
                      <li>Revenue increased by 12% driven by higher sales in West region.</li>
                      <li>Profit improved by ?1.1L due to better cost control and higher margins.</li>
                      <li>Delhi sales dropped by 18% due to low demand and high competition.</li>
                      <li>Marketing ROI increased by 22% with new campaign.</li>
                      <li>Returns reduced by 5% compared to previous period.</li>
                      <li><AlertCircle size={14} color="#f59e0b"/> Inventory shortage affected North region leading to lost sales.</li>
                    </ul>
                  </div>
                  <div>
                    <strong><Target size={14} color="#f43f5e"/> Root Cause Analysis</strong>
                    <ul>
                      <li>Decline in demand from Delhi region (-18%)</li>
                      <li>Low stock availability in North region</li>
                      <li>Marketing campaign performed well in West</li>
                      <li>Premium products contributed higher margin</li>
                      <li>Increase in logistics cost by 4%</li>
                    </ul>
                  </div>
                </div>

                <div className="sales-actions">
                  <button className="btn-primary" onClick={() => navigate('/dashboard')}><BarChart2 size={14}/> View Interactive Dashboard</button>
                  <button className="btn-outline"><Download size={14}/> Export Report</button>
                  <button className="btn-outline">PDF</button>
                  <button className="btn-outline">Excel</button>
                </div>
              </div>
           </div>
        </div>
      );
    }

    return (
      <div key={i} className="pdf-chat-msg ai">
        <div className="pdf-chat-avatar ai-bot-avatar"><Bot size={18} /></div>
        <div className="pdf-chat-bubble">{msg.text}</div>
      </div>
    );
  };

  return (
    <div className={`app-layout pdf-chat-layout ${isRightPanelHidden ? 'right-panel-hidden' : ''}`}>
      <Sidebar />
      <main className="pdf-chat-main">
        <header className="pdf-chat-header">
          <button className="back-btn chat-hidden-control" onClick={() => navigate('/dashboard')}><ArrowLeft size={16}/> Back to Dashboard</button>
          
          <div className="header-right">
            <button className="btn-outline"><AlertCircle size={14}/> Need Help?</button>
            <div className="user-profile">
              <div className="avatar-circle">{initials}</div>
              <div>
                <strong>{displayName}</strong>
                <small>Super Admin</small>
              </div>
              <ChevronDown size={14}/>
            </div>
          </div>
        </header>

        <div className={`pdf-chat-body ${messages.length === 0 ? 'is-empty' : 'has-messages'}`}>
          <div className="pdf-chat-messages">
            {messages.length === 0 && (
              <div className="empty-state">
                <Bot size={48} color="#d1d5db" />
                <h3>How can I help you today?</h3>
                <p>Try asking about Slack, scheduling a meeting, or analyzing sales data.</p>
              </div>
            )}
            {messages.map(renderMessage)}
            <div ref={bottomRef} />
          </div>

          <div className="pdf-chat-input-area">
            <div className="input-prompt-label">Ask anything about your business...</div>
            <form className="pdf-chat-input-box" onSubmit={handleSend}>
              <input
                ref={fileInputRef}
                className="chat-native-file-input"
                type="file"
                onChange={handleLocalFileSelect}
              />
              {selectedUploadFile && (
                <div className={`chat-upload-preview file-${selectedUploadMeta.kind} ${uploadingFile ? 'is-loading' : ''}`}>
                  <FileSpreadsheet size={22} />
                  <div>
                    <strong>{selectedUploadFile.name}</strong>
                    <span>{uploadError || (uploadingFile ? 'Uploading...' : selectedUploadMeta.label)}</span>
                  </div>
                </div>
              )}
              
              <div className="input-field-row">
                <button
                  type="button"
                  className="chat-plus-upload"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  aria-label="Upload file"
                  title="Upload file"
                >
                  <Plus size={22} />
                </button>
                <input 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  placeholder="Ask Byizon AI..."
                />
                <button type="button" className="mic-btn"><Mic size={18}/></button>
                <button type="submit" className="send-btn" disabled={!input.trim() && !selectedUploadFile}><Send size={18}/></button>
              </div>
            </form>
            <div className="input-disclaimer">Byizon AI can make mistakes. Please verify important information.</div>
          </div>
        </div>
      </main>

      {isRightPanelHidden && (
        <button
          type="button"
          className="right-panel-restore-handle"
          onClick={() => setIsRightPanelHidden(false)}
          aria-label="Show assistant panel"
          title="Show assistant panel"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      <aside className="pdf-chat-right-panel">
        <button
          type="button"
          className="right-panel-collapse-button"
          onClick={() => setIsRightPanelHidden(true)}
          aria-label="Hide assistant panel"
          title="Hide assistant panel"
        >
          <ChevronRight size={20} />
        </button>
        {rightPanelMode === 'history' && (
          <>
            <div className="panel-section">
              <h3>Conversation History</h3>
              <div className="search-box">
                <Search size={14}/>
                <input
                  value={historySearch}
                  onChange={event => setHistorySearch(event.target.value)}
                  placeholder="Search conversations..."
                />
              </div>
              
              <div className="history-group">
                <h4>Real Conversations</h4>
                {realHistoryItems.length > 0 ? realHistoryItems.map(item => (
                  <button
                    type="button"
                    className={`history-item ${item.id === activeSessionId ? 'active' : ''}`}
                    key={item.id}
                    onClick={() => {
                      setHistoryMenu(null);
                      activeSessionIdRef.current = item.id;
                      setActiveSessionId(item.id);
                      sessionStorage.setItem(ACTIVE_CHAT_SESSION_KEY, item.id);
                      setMessages(Array.isArray(item.messages) ? item.messages.map(normalizeChatMessage).filter(Boolean) : []);
                      setUploadedData(item.analysis || null);
                      setSelectedUploadFile(null);
                      setUploadError('');
                      setUploadingFile(false);
                      setPipelineStages([]);
                      setRightPanelMode('history');
                    }}
                    onContextMenu={event => {
                      event.preventDefault();
                      setHistoryMenu({
                        id: item.id,
                        x: Math.min(event.clientX, window.innerWidth - 220),
                        y: Math.min(event.clientY, window.innerHeight - 72),
                      });
                    }}
                  >
                    <span>{item.title}</span>
                    <small>{item.time || 'Now'}</small>
                  </button>
                )) : (
                  <div className="history-item empty">
                    <span>No real conversations yet</span>
                    <small>Ask Byizon first</small>
                  </div>
                )}
              </div>

              {historyMenu && (
                <div
                  className="history-context-menu"
                  role="menu"
                  style={{ left: historyMenu.x, top: historyMenu.y }}
                  onClick={event => event.stopPropagation()}
                >
                  <button type="button" role="menuitem" onClick={() => deleteConversation(historyMenu.id)}>
                    <Trash2 size={16} />
                    Delete conversation
                  </button>
                </div>
              )}

              <button className="view-all-btn">View All Conversations</button>
            </div>

            <div className="panel-section">
              <div className="section-header">
                <h3>Connected Apps</h3>
                <button type="button" onClick={() => navigate('/connections')}>Manage</button>
              </div>
              <div className="app-status-list">
                {connectedApps.length > 0 ? connectedApps.map(app => (
                  <div className="app-status" key={app.id}>
                    <Database size={14} color={app.accent} />
                    {app.name}
                    <span className="status-dot connected">Connected</span>
                  </div>
                )) : (
                  <div className="app-status more">No connected apps <ChevronRight size={14}/></div>
                )}
              </div>
            </div>

            <div className="panel-section">
              <div className="section-header">
                <h3>AI Memory</h3>
                <span>82%</span>
              </div>
              <div className="memory-bar"><div className="fill" style={{width: '82%'}}></div></div>
              <small className="updated-text"><span className="dot"></span> Memory updated just now</small>
            </div>
          </>
        )}

        {rightPanelMode === 'meeting' && (
          <div className="panel-section meeting-panel">
            <div className="success-header">
              <CheckCircle2 size={24} color="#10b981"/>
              <h3>Meeting Scheduled</h3>
            </div>
            
            <div className="meeting-card-side">
              <div className="calendar-icon-large">
                <Calendar size={32} color="#10b981"/>
              </div>
              <strong>Your meeting is confirmed!</strong>
              <p>We've scheduled it and notified everyone.</p>
              <button className="view-calendar-link">View in Google Calendar <ExternalLink size={12}/></button>
            </div>

            <div className="meeting-details-list">
              <h4>Meeting Details</h4>
              <div className="detail-row"><span className="label"><Bot size={14}/> With</span> <span className="value">Ronak</span></div>
              <div className="detail-row"><span className="label"><Calendar size={14}/> Date</span> <span className="value">Fri, 30 May 2026</span></div>
              <div className="detail-row"><span className="label"><Clock size={14}/> Time</span> <span className="value">10:00 AM (IST)</span></div>
              <div className="detail-row"><span className="label"><Clock size={14}/> Duration</span> <span className="value">30 mins</span></div>
              <div className="detail-row"><span className="label"><Bot size={14}/> Platform</span> <span className="value">Google Meet</span></div>
              <div className="detail-row"><span className="label"><CheckCircle2 size={14}/> Status</span> <span className="value success">Confirmed</span></div>
            </div>

            <div className="panel-section" style={{marginTop:'24px', borderTop:'1px solid var(--border-subtle)', paddingTop:'24px'}}>
               <div className="section-header">
                <h3>Connected Apps</h3>
                <button>Manage</button>
              </div>
              <div className="app-status-list">
                <div className="app-status"><MessageSquare size={14} color="#e11d48"/> Slack <span className="status-dot connected">Connected</span></div>
                <div className="app-status"><Calendar size={14} color="#3b82f6"/> Google Calendar <span className="status-dot connected">Connected</span></div>
              </div>
            </div>
          </div>
        )}

        {rightPanelMode === 'data' && (
          <div className="panel-section data-panel">
             <div className="section-header">
              <h3><Sparkles size={16}/> AI Insights</h3>
            </div>
            
            <div className="insight-block">
              <h4>Overall Business Health</h4>
              <div className="health-badge"><CheckCircle2 size={14}/> Healthy</div>
            </div>

            <div className="insight-block">
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}>
                <h4>Risk Score</h4>
                <span>12/100</span>
              </div>
              <div className="memory-bar risk"><div className="fill" style={{width: '12%'}}></div></div>
              <small style={{color:'var(--success)', marginTop:'4px', display:'block'}}>Low</small>
            </div>

            <div className="insight-block">
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}>
                <h4>Forecast Accuracy</h4>
                <span>96%</span>
              </div>
              <div className="memory-bar"><div className="fill" style={{width: '96%'}}></div></div>
            </div>

            <div className="insight-block next-recommendation">
              <h4><Target size={14} color="#f59e0b"/> Next Recommendation</h4>
              <p>Restock North inventory within 5 days to avoid further loss of sales.</p>
            </div>

            <div className="panel-section" style={{marginTop:'24px', borderTop:'1px solid var(--border-subtle)', paddingTop:'24px'}}>
              <h3>Data Source</h3>
              <div className="data-source-card">
                <FileSpreadsheet size={24} color="#10b981"/>
                <div>
                  <strong>Google Sheets</strong>
                  <small>Sales_Data_2026</small>
                  <div style={{fontSize:'10px', color:'var(--text-muted)', marginTop:'4px'}}>Last updated: 10:20 AM <span className="status-dot connected">Connected</span></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

