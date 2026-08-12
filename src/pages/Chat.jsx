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
  ChevronRight,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  Mail,
  MessageSquare,
  Mic,
  Paperclip,
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
import { getConnectors, oauthStartUrl } from '../api/universalBackend';
import { useData } from '../context/DataContext';
import { useWorkspaceUser, workspaceInitials } from '../utils/workspaceUser';

export default function Chat() {
  const navigate = useNavigate();
  const { chatHistory, setSessionChatHistory } = useData();
  const user = useWorkspaceUser();
  const initials = workspaceInitials(user);
  const displayName = user.displayName || 'Super Admin';

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatSessions, setChatSessions] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('byizon_chat_sessions') || '[]');
    } catch {
      return [];
    }
  });
  const [activeSessionId, setActiveSessionId] = useState('');
  const activeSessionIdRef = useRef('');
  const [historyMenu, setHistoryMenu] = useState(null);
  const [connectorCatalog, setConnectorCatalog] = useState([]);
  const [connectedApps, setConnectedApps] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const fileInputRef = useRef(null);
  const [rightPanelMode, setRightPanelMode] = useState('history'); // history, meeting, data
  const bottomRef = useRef(null);

  useEffect(() => {
    localStorage.removeItem('byizon_active_chat_session');
  }, []);

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
      setConnectorCatalog(catalog);
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

  const appShortcuts = [
    { label: 'Slack', connectorId: 'slack', icon: MessageSquare, color: '#e11d48' },
    { label: 'Gmail', connectorId: 'google-workspace', capability: 'gmail', icon: Mail, color: '#ef4444' },
    { label: 'Drive', connectorId: 'google-workspace', capability: 'drive', icon: Database, color: '#3b82f6' },
    { label: 'HubSpot', connectorId: 'hubspot', color: '#f97316' },
    { label: 'Jira', connectorId: 'jira', color: '#2563eb' },
  ];

  const isShortcutConnected = shortcut => connectedApps.some(app => app.connectorId === shortcut.connectorId);

  const connectShortcut = (shortcut) => {
    const connector = connectorCatalog.find(item => item.id === shortcut.connectorId);
    if (connector?.oauthReady) {
      window.location.assign(oauthStartUrl(shortcut.connectorId, '/chat', shortcut.capability || ''));
      return;
    }
    navigate(`/connections?connector=${encodeURIComponent(shortcut.connectorId)}`);
  };

  const handleShortcut = (shortcut) => {
    if (isShortcutConnected(shortcut)) {
      setInput(current => current || `Ask ${shortcut.label} about `);
      return;
    }
    connectShortcut(shortcut);
  };

  const handleLocalFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setInput(current => current || `Analyze uploaded file: ${file.name}`);
    event.target.value = '';
  };

  const persistSessions = (updater) => {
    setChatSessions(previous => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      localStorage.setItem('byizon_chat_sessions', JSON.stringify(next));
      return next;
    });
  };

  const upsertActiveSession = (nextMessages) => {
    const realTurns = nextMessages.filter(item => item?.text);
    if (!realTurns.length) return '';
    const firstUser = realTurns.find(item => item.role === 'user');
    const sessionId = activeSessionIdRef.current || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      id: sessionId,
      title: firstUser?.text || 'New conversation',
      time: firstUser?.time || '',
      updatedAt: new Date().toISOString(),
      messages: realTurns,
    };
    if (!activeSessionIdRef.current) {
      activeSessionIdRef.current = sessionId;
      setActiveSessionId(sessionId);
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
        upsertActiveSession(current);
        return [];
      });
      activeSessionIdRef.current = '';
      setActiveSessionId('');
      localStorage.removeItem('byizon_active_chat_session');
      setInput('');
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
    }
    localStorage.removeItem('byizon_active_chat_session');
    setHistoryMenu(null);
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (!input.trim()) return;
    
    const userMsg = input.trim();
    const newMessages = [...messages, { role: 'user', text: userMsg, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }];
    setMessages(newMessages);
    upsertActiveSession(newMessages);
    setInput('');

    // Mock specific responses based on keywords
    setTimeout(() => {
      let aiResponse = { role: 'ai', time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };

      if (userMsg.toLowerCase().includes('slack')) {
        aiResponse.type = 'slack_summary';
        setRightPanelMode('history');
      } else if (userMsg.toLowerCase().includes('schedule') || userMsg.toLowerCase().includes('meeting')) {
        aiResponse.type = 'meeting_scheduled';
        setRightPanelMode('meeting');
      } else if (userMsg.toLowerCase().includes('sales') || userMsg.toLowerCase().includes('profit') || userMsg.toLowerCase().includes('sheet')) {
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
          <div className="pdf-chat-bubble">{msg.text}</div>
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
    <div className="app-layout pdf-chat-layout">
      <Sidebar />
      <main className="pdf-chat-main">
        <header className="pdf-chat-header">
          <button className="back-btn chat-hidden-control" onClick={() => navigate('/dashboard')}><ArrowLeft size={16}/> Back to Dashboard</button>
          
          <div className="header-middle">
            <div className="bot-title">
              <div className="bot-icon"><Bot size={24}/></div>
              <div>
                <h2>Byizon AI <span className="pro-badge">Pro</span></h2>
                <p>Your AI business assistant</p>
              </div>
            </div>

            <div className="header-filters">
              <div className="workspace-selector chat-hidden-control">
                <span className="dot celebso"></span> Workspace: <strong>Celebso Group</strong> <ChevronDown size={14}/>
              </div>
              <div className="connected-apps-row">
                <span>Connected Apps:</span>
                {connectedApps.length > 0 ? connectedApps.slice(0, 4).map(app => (
                  <span className="app-icon" key={app.id} style={{ color: app.accent }}>
                    <Database size={14} /> {app.name}
                  </span>
                )) : (
                  <span className="more-apps">No connected apps</span>
                )}
                {connectedApps.length > 4 && <span className="more-apps">+ {connectedApps.length - 4} more</span>}
              </div>
            </div>
          </div>
          
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

        <div className="pdf-chat-body">
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
              <div className="input-shortcuts">
                <input
                  ref={fileInputRef}
                  className="chat-native-file-input"
                  type="file"
                  onChange={handleLocalFileSelect}
                />
                <button type="button" onClick={() => fileInputRef.current?.click()}><Paperclip size={14}/> Upload File</button>
                {appShortcuts.map(shortcut => {
                  const connected = isShortcutConnected(shortcut);
                  const Icon = shortcut.icon;
                  return (
                    <button
                      type="button"
                      key={`${shortcut.connectorId}-${shortcut.capability || shortcut.label}`}
                      className={connected ? 'shortcut-connected' : 'shortcut-connect'}
                      onClick={() => handleShortcut(shortcut)}
                      title={connected ? `${shortcut.label} connected` : `Connect ${shortcut.label}`}
                    >
                      {Icon ? <Icon size={14} color={shortcut.color} /> : <span style={{ color: shortcut.color, fontWeight: 800 }}>{shortcut.label[0]}</span>}
                      {shortcut.label}
                      {!connected && <small>Connect</small>}
                    </button>
                  );
                })}
              </div>
              
              <div className="input-field-row">
                <input 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  placeholder="Ask Byizon AI..."
                />
                <button type="button" className="mic-btn"><Mic size={18}/></button>
                <button type="submit" className="send-btn" disabled={!input.trim()}><Send size={18}/></button>
              </div>
            </form>
            <div className="input-disclaimer">Byizon AI can make mistakes. Please verify important information.</div>
          </div>
        </div>
      </main>

      <aside className="pdf-chat-right-panel">
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
                      setMessages(item.messages || []);
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

