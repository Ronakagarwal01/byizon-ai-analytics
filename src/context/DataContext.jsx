import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { clearBackendSession, getAuthSession, validateConnectedSource } from '../api/universalBackend';

const DataContext = createContext(null);
const CURRENT_ANALYSIS_VERSION = '2026-07-15-source-isolation-v8';

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

export function DataProvider({ children }) {
  const [uploadedData, setUploadedDataState] = useState(null);
  const [workspaceUserId, setWorkspaceUserId] = useState(null);
  const [pipelineStages, setPipelineStages] = useState([]);
  const [chatHistory, setChatHistoryState] = useState({});
  const validatedSessionRef = useRef(null);

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
        setUploadedDataState(parseStoredDataset(localStorage.getItem(datasetStorageKey(currentId))));
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
    analysisStatus: 'complete',
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
        if (previousSessionId) clearBackendSession(previousSessionId).catch(() => {});
        if (ownerId) localStorage.removeItem(datasetStorageKey(ownerId));
        setPipelineStages([]);
      }
    } catch (error) {
      console.warn('[DataContext] localStorage serialization failed:', error);
    }
  };

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
