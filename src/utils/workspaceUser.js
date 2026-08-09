import { useEffect, useMemo, useState } from 'react';
import { getAuthSession } from '../api/universalBackend';

const STORAGE_KEYS = [
  'byizon_signup_user',
  'byizon_login_user',
  'byizon_pending_user',
];

export const GUEST_WORKSPACE_USER = {
  authenticated: false,
  displayName: 'Guest Workspace',
  firstName: 'Guest',
  lastName: '',
  email: 'Private browser workspace',
  role: 'Super Admin',
};

function safeParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeWorkspaceUser(user) {
  const source = user && typeof user === 'object' ? user : {};
  const firstName = String(source.firstName || source.first_name || '').trim();
  const lastName = String(source.lastName || source.last_name || '').trim();
  const email = String(source.email || source.workEmail || source.work_email || '').trim();
  const displayName = String(
    source.displayName || source.display_name || [firstName, lastName].filter(Boolean).join(' ') || email || GUEST_WORKSPACE_USER.displayName,
  ).trim();
  const shortName = firstName || displayName.split(/\s+/)[0] || 'Guest';

  return {
    ...GUEST_WORKSPACE_USER,
    ...source,
    authenticated: Boolean(source.authenticated ?? source.workspaceUserId ?? source.userId ?? source.emailVerified),
    displayName,
    firstName: shortName,
    lastName,
    email: email || source.email || GUEST_WORKSPACE_USER.email,
    role: source.role || 'Super Admin',
  };
}

export function isGuestWorkspaceUser(user) {
  const normalized = normalizeWorkspaceUser(user);
  return !normalized.authenticated
    && !String(user?.firstName || user?.first_name || '').trim()
    && !String(user?.lastName || user?.last_name || '').trim()
    && (normalized.displayName === GUEST_WORKSPACE_USER.displayName || !normalized.email);
}

export function getStoredWorkspaceUser() {
  for (const key of STORAGE_KEYS) {
    const user = safeParse(globalThis.localStorage?.getItem(key));
    if (user) return normalizeWorkspaceUser(user);
  }
  return GUEST_WORKSPACE_USER;
}

export function workspaceInitials(user) {
  const normalized = normalizeWorkspaceUser(user);
  const parts = normalized.displayName.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : normalized.displayName.slice(0, 2)).toUpperCase();
}

export function useWorkspaceUser() {
  const [user, setUser] = useState(() => getStoredWorkspaceUser());

  useEffect(() => {
    let mounted = true;
    getAuthSession()
      .then(payload => {
        if (!mounted) return;
        if (!payload.user || isGuestWorkspaceUser(payload.user)) {
          setUser(getStoredWorkspaceUser());
          return;
        }
        const normalized = normalizeWorkspaceUser(payload.user);
        setUser(normalized);
        if (payload.user) {
          localStorage.setItem('byizon_login_user', JSON.stringify(payload.user));
        }
      })
      .catch(() => {
        if (mounted) setUser(getStoredWorkspaceUser());
      });
    return () => {
      mounted = false;
    };
  }, []);

  return useMemo(() => user, [user]);
}
