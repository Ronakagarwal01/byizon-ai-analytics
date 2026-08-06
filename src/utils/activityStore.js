export const BYIZON_ACTIVITY_KEY = 'byizon_automation_activity:v1';

function classifyActivity(task = {}) {
  const action = String(task.action || task.providerAction || '').toLowerCase();
  const title = String(task.title || '').toLowerCase();
  if (action.includes('meet') || title.includes('meet')) return 'meeting';
  if (action.includes('calendar') || title.includes('calendar')) return 'calendar';
  if (action.includes('gmail') || title.includes('email')) return 'email';
  if (action.includes('slack')) return 'slack';
  return 'automation';
}

export function getSavedAutomationActivities() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BYIZON_ACTIVITY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAutomationActivity(task, source = 'chat') {
  if (!task) return null;
  const entry = {
    id: task.activityId || `activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: classifyActivity(task),
    source,
    title: task.title || 'Automation completed',
    message: task.message || '',
    url: task.url || task.details?.meetingUrl || task.details?.calendarUrl || '',
    action: task.action || task.providerAction || '',
    details: task.details || {},
    createdAt: task.createdAt || new Date().toISOString(),
  };
  const next = [entry, ...getSavedAutomationActivities().filter(item => item.id !== entry.id)].slice(0, 80);
  try {
    localStorage.setItem(BYIZON_ACTIVITY_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('byizon:activity-saved', { detail: entry }));
  } catch {
    // Local activity history is best-effort only.
  }
  return entry;
}
