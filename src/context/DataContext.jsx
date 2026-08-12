import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  clearBackendSession,
  getAnalysisProgress,
  getAuthSession,
  validateConnectedSource,
} from '../api/universalBackend';

const DataContext = createContext(null);
const CURRENT_ANALYSIS_VERSION = '2026-07-15-source-isolation-v8';
const ACTIVE_SESSION_KEY = 'dsi_active_analysis_session:2026-07-23-v2-no-autoload';

function createReportId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `report_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildStoredDataset(data) {
  return {
    ...data,
    rows: Array.isArray(data.rows) ? data.rows.slice(0, 500) : [],
    isPersistedRowSample: Array.isArray(data.rows) && data.rows.length > 500,
  };
}

function datasetStorageKey(workspaceId) {
  return `dsi_uploaded_data:${workspaceId}`;
}

function chatStorageKey(workspaceId) {
  return `dsi_chat_history_by_session:${workspaceId}`;
}

function parseStoredDataset(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      !parsed.fileName ||
      parsed.rowCount === undefined ||
      !Array.isArray(parsed.columns) ||
      parsed.analysisVersion !== CURRENT_ANALYSIS_VERSION
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseStoredChat(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function rememberActiveSession(sessionId) {
  try {
    if (sessionId) sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    else sessionStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // Session storage can be unavailable in private or restricted browser modes.
  }
}

function rememberedActiveSession() {
  try {
    return sessionStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function DataProvider({ children }) {
  const [uploadedData, setUploadedDataState] = useState(null);
  const [workspaceUserId, setWorkspaceUserId] = useState(null);
  const [pipelineStages, setPipelineStages] = useState([]);
  const [chatHistory, setChatHistoryState] = useState({});
  const validatedSessionRef = useRef(null);
  const progressPollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getAuthSession()
      .then(payload => {
        if (cancelled) return;
        const currentId = payload.workspaceUserId;
        const previousId = localStorage.getItem('dsi_workspace_id');
        const shouldMigrateGuest = Boolean(
          previousId &&
          previousId !== currentId &&
          previousId.startsWith('usr_') &&
          !previousId.startsWith('usr_g_') &&
          currentId.startsWith('usr_g_'),
        );

        if (shouldMigrateGuest) {
          const previousDataset = localStorage.getItem(datasetStorageKey(previousId));
          const previousChat = localStorage.getItem(chatStorageKey(previousId));
          if (previousDataset && !localStorage.getItem(datasetStorageKey(currentId))) {
            localStorage.setItem(datasetStorageKey(currentId), previousDataset);
          }
          if (previousChat && !localStorage.getItem(chatStorageKey(currentId))) {
            localStorage.setItem(chatStorageKey(currentId), previousChat);
          }
          localStorage.removeItem(datasetStorageKey(previousId));
          localStorage.removeItem(chatStorageKey(previousId));
        }

        // One-time migration from the pre-account storage format.
        const legacyDataset = localStorage.getItem('dsi_uploaded_data');
        const legacyChat = localStorage.getItem('dsi_chat_history_by_session');
        if (!localStorage.getItem(datasetStorageKey(currentId)) && legacyDataset) {
          localStorage.setItem(datasetStorageKey(currentId), legacyDataset);
        }
        if (!localStorage.getItem(chatStorageKey(currentId)) && legacyChat) {
          localStorage.setItem(chatStorageKey(currentId), legacyChat);
        }
        localStorage.removeItem('dsi_uploaded_data');
        localStorage.removeItem('dsi_chat_history_by_session');

        setWorkspaceUserId(currentId);
        const storedDataset = parseStoredDataset(localStorage.getItem(datasetStorageKey(currentId)));
        const activeSessionId = rememberedActiveSession();
        if (storedDataset && activeSessionId && storedDataset.sessionId === activeSessionId) {
          setUploadedDataState(storedDataset);
        } else {
          setUploadedDataState(null);
          localStorage.removeItem(datasetStorageKey(currentId));
        }
        setChatHistoryState(parseStoredChat(localStorage.getItem(chatStorageKey(currentId))));
        localStorage.setItem('dsi_workspace_id', currentId);
      })
      .catch(() => {
        if (!cancelled) {
          setUploadedDataState(null);
          setChatHistoryState({});
        }
      });
    return () => { cancelled = true; };
  }, []);

  const analysisSession = uploadedData ? {
    sessionId: uploadedData.sessionId,
    fileMetadata: {
      fileName: uploadedData.fileName,
      fileType: uploadedData.fileType,
      rowCount: uploadedData.rowCount,
      colCount: uploadedData.colCount,
    },
    schema: uploadedData.schema,
    tables: uploadedData.tables,
    profiles: uploadedData.tableProfiles,
    statistics: uploadedData.summaryStats,
    charts: uploadedData.charts,
    insights: uploadedData.insightObjects || uploadedData.insights,
    modelResults: uploadedData.dataScience?.modelTraining,
    report: uploadedData.report,
    chatHistory: chatHistory[uploadedData.sessionId] || [],
    analysisStatus: uploadedData.analysisStatus || 'complete',
    createdAt: uploadedData.createdAt || new Date().toISOString(),
  } : null;

  const activeWorkspaceId = () => workspaceUserId || localStorage.getItem('dsi_workspace_id');

  const persistChat = (next) => {
    setChatHistoryState(next);
    const ownerId = activeWorkspaceId();
    if (!ownerId) return;
    try {
      localStorage.setItem(chatStorageKey(ownerId), JSON.stringify(next));
    } catch (error) {
      console.warn('[DataContext] chat history persistence failed:', error);
    }
  };

  const setSessionChatHistory = (sessionId, updater) => {
    if (!sessionId) return;
    setChatHistoryState(previous => {
      const current = previous[sessionId] || [];
      const nextHistory = typeof updater === 'function' ? updater(current) : updater;
      const next = { ...previous, [sessionId]: nextHistory };
      const ownerId = activeWorkspaceId();
      try {
        if (ownerId) localStorage.setItem(chatStorageKey(ownerId), JSON.stringify(next));
      } catch (error) {
        console.warn('[DataContext] chat history persistence failed:', error);
      }
      return next;
    });
  };

  const setUploadedData = (data) => {
    const ownerId = activeWorkspaceId();
    const previousSessionId = uploadedData?.sessionId;
    const normalized = data ? {
      ...data,
      sessionId: data.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      reportId: data.reportId || createReportId(),
      createdAt: data.createdAt || new Date().toISOString(),
    } : null;
    setUploadedDataState(normalized);
    try {
      if (normalized) {
        rememberActiveSession(normalized.sessionId);
        if (previousSessionId && previousSessionId !== normalized.sessionId) {
          clearBackendSession(previousSessionId).catch(() => {});
          persistChat(Object.fromEntries(
            Object.entries(chatHistory).filter(([key]) => key === normalized.sessionId),
          ));
        }
        if (ownerId) {
          localStorage.setItem(datasetStorageKey(ownerId), JSON.stringify(buildStoredDataset(normalized)));
        }
      } else {
        rememberActiveSession(null);
        if (previousSessionId) clearBackendSession(previousSessionId).catch(() => {});
        if (ownerId) localStorage.removeItem(datasetStorageKey(ownerId));
        setPipelineStages([]);
      }
    } catch (error) {
      console.warn('[DataContext] localStorage serialization failed:', error);
    }
  };

  useEffect(() => {
    const sessionId = uploadedData?.sessionId;
    const status = uploadedData?.analysisStatus || uploadedData?.processing?.status;
    if (!sessionId || status !== 'processing') return undefined;

    let cancelled = false;
    let consecutiveErrors = 0;
    const poll = async () => {
      try {
        const result = await getAnalysisProgress(sessionId);
        if (cancelled) return;
        consecutiveErrors = 0;
        if (result.analysis && ['complete', 'failed'].includes(result.status)) {
          setUploadedData({ ...result.analysis, sessionId });
          return;
        }
        setUploadedDataState(previous => previous?.sessionId === sessionId ? {
          ...previous,
          analysisStatus: result.status,
          processing: {
            ...(previous.processing || {}),
            status: result.status,
            progress: result.progress,
            stage: result.stage,
            message: result.message,
          },
        } : previous);
        progressPollRef.current = window.setTimeout(poll, 1200);
      } catch (error) {
        if (cancelled) return;
        consecutiveErrors += 1;
        if (consecutiveErrors < 5) {
          progressPollRef.current = window.setTimeout(poll, 1800);
        } else {
          console.warn('[DataContext] background analysis progress unavailable:', error);
        }
      }
    };
    progressPollRef.current = window.setTimeout(poll, 500);
    return () => {
      cancelled = true;
      if (progressPollRef.current) window.clearTimeout(progressPollRef.current);
    };
    // Poll only while the active analysis is explicitly processing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedData?.sessionId, uploadedData?.analysisStatus, uploadedData?.processing?.status]);

  useEffect(() => {
    const source = uploadedData?.connectedSource;
    const sessionId = uploadedData?.sessionId;
    if (!source || !workspaceUserId || validatedSessionRef.current === sessionId) return undefined;
    validatedSessionRef.current = sessionId;
    let cancelled = false;
    validateConnectedSource(source)
      .then(result => {
        if (!cancelled && !result.valid) setUploadedData(null);
      })
      .catch(error => {
        console.warn('[DataContext] connected source validation unavailable:', error);
      });
    return () => { cancelled = true; };
    // Validate once whenever a workspace-scoped connected session is restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedData?.sessionId, workspaceUserId]);

  useEffect(() => {
    if (uploadedData && uploadedData.analysisVersion !== CURRENT_ANALYSIS_VERSION) {
      setUploadedData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedData?.analysisVersion]);

  return (
    <DataContext.Provider value={{
      uploadedData,
      setUploadedData,
      analysisSession,
      chatHistory,
      setSessionChatHistory,
      pipelineStages,
      setPipelineStages,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
