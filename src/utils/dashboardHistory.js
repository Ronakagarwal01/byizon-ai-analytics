const DB_NAME = 'byizon-dashboard-history';
const STORE_NAME = 'versions';
const DB_VERSION = 1;
const MAX_VERSIONS_PER_DATASET = 12;

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('datasetKey', 'datasetKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadDashboardHistory(datasetKey) {
  if (!datasetKey || !('indexedDB' in window)) return [];
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).index('datasetKey').getAll(datasetKey);
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function saveDashboardVersion(version) {
  if (!version?.datasetKey || !('indexedDB' in window)) return [];
  const db = await database();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(version);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  const versions = await loadDashboardHistory(version.datasetKey);
  const stale = versions.slice(MAX_VERSIONS_PER_DATASET);
  if (stale.length) {
    const cleanup = await database();
    await new Promise((resolve, reject) => {
      const transaction = cleanup.transaction(STORE_NAME, 'readwrite');
      stale.forEach(item => transaction.objectStore(STORE_NAME).delete(item.id));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    cleanup.close();
  }
  return versions.slice(0, MAX_VERSIONS_PER_DATASET);
}

export async function clearDashboardHistory(datasetKey) {
  const versions = await loadDashboardHistory(datasetKey);
  if (!versions.length) return;
  const db = await database();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    versions.forEach(item => transaction.objectStore(STORE_NAME).delete(item.id));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}
