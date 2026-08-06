import { askBackendChat, createProtectedShare } from '../api/universalBackend';

const PAGE_PATHS = {
  home: '/', upload: '/upload', dashboard: '/dashboard', chat: '/chat', reports: '/reports', connections: '/connections',
};

export async function executeVoiceTools(toolCalls, navigate, context = {}) {
  const results = [];
  for (const call of Array.isArray(toolCalls) ? toolCalls : []) {
    const args = call?.arguments || {};
    switch (call?.name) {
      case 'navigate':
        if (!PAGE_PATHS[args.page]) throw new Error('Voice navigation target is not allowed.');
        navigate(PAGE_PATHS[args.page]);
        break;
      case 'open_dashboard': navigate('/dashboard'); break;
      case 'open_reports': navigate('/reports'); break;
      case 'open_connections': navigate('/connections'); break;
      case 'create_protected_share': {
        if (!context.sessionId) throw new Error('Upload and analyze a dataset before creating a live link.');
        const share = await createProtectedShare(context.sessionId, 7);
        results.push({
          name: call.name,
          ok: true,
          share: { ...share, link: `${window.location.origin}/report/${share.shareId}` },
        });
        continue;
      }
      case 'run_connected_command': {
        const command = String(args.command || '').trim();
        if (!command) throw new Error('Connected app command is empty.');
        window.dispatchEvent(new CustomEvent('byizon:operation', {
          detail: { title: 'Running connected app command', status: 'running' },
        }));
        const response = await askBackendChat(command, context.analysis || null, []);
        if (response.task) {
          window.dispatchEvent(new CustomEvent('byizon:operation', { detail: response.task }));
        }
        results.push({ name: call.name, ok: true, response });
        continue;
      }
      case 'go_back': window.history.back(); break;
      case 'refresh_page': window.location.reload(); break;
      case 'attach_dataset':
        if (window.location.pathname !== '/') navigate('/');
        window.setTimeout(() => window.dispatchEvent(new Event('byizon:attach-file')), 250);
        break;
      case 'new_chat':
        if (window.location.pathname !== '/') navigate('/');
        window.setTimeout(() => window.dispatchEvent(new Event('byizon:new-chat')), 100);
        break;
      case 'scroll_page': {
        const direction = args.direction || 'down';
        if (direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
        else if (direction === 'bottom') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        else window.scrollBy({ top: direction === 'up' ? -window.innerHeight * 0.75 : window.innerHeight * 0.75, behavior: 'smooth' });
        break;
      }
      default:
        throw new Error(`Unsupported voice tool: ${call?.name || 'unknown'}`);
    }
    results.push({ name: call.name, ok: true });
  }
  return results;
}
