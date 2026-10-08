/**
 * Thin client for the API server (M4). Access tokens stay in memory; the
 * refresh token is kept in sessionStorage so a reload does not log out but
 * closing the tab does (smaller XSS blast radius than localStorage).
 */
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const REFRESH_KEY = 'rpg.refresh';

import type { Element } from '@rpg/game-protocol';

export interface CharacterSummary {
  element: Element | null;
  expression: 'base' | 'thunder' | 'ice';
  id: string;
  name: string;
  /** Realm id (game-data/realms). */
  realm: string;
  mapId: string;
}

export interface GameSession {
  accessToken: string;
  mapId: string;
  gameServerUrl: string;
}

let accessToken: string | null = null;

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.auth && accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  let res = await doFetch();
  if (res.status === 401 && init.auth && (await refresh())) res = await doFetch();
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

function storeTokens(t: { accessToken: string; refreshToken: string }): void {
  accessToken = t.accessToken;
  try {
    sessionStorage.setItem(REFRESH_KEY, t.refreshToken);
  } catch {
    /* private mode: stay logged in for this page only */
  }
}

export async function refresh(): Promise<boolean> {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(REFRESH_KEY);
  } catch {
    token = null;
  }
  if (!token) return false;
  try {
    const t = await request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      body: { refreshToken: token },
    });
    storeTokens(t);
    return true;
  } catch {
    sessionStorage.removeItem(REFRESH_KEY);
    return false;
  }
}

export async function register(username: string, password: string): Promise<void> {
  await request('/auth/register', { body: { username, password } });
}

export async function login(username: string, password: string): Promise<void> {
  const t = await request<{
    accessToken: string;
    refreshToken: string;
    mfaRequired?: boolean;
  }>('/auth/login', {
    body: { username, password },
  });
  if (t.mfaRequired) throw new Error('Tài khoản quản trị: hãy đăng nhập qua trang admin');
  storeTokens(t);
}

export const listCharacters = () =>
  request<{ characters: CharacterSummary[] }>('/characters', { auth: true });

export const createCharacter = (
  name: string,
  element: Element = 'moc',
  expression: 'base' | 'thunder' | 'ice' = 'base',
  characterDefId = 'player_default',
) =>
  request<{ id: string }>('/characters', {
    body: { name, element, expression, characterDefId },
    auth: true,
  });
export const chooseLegacyElement = (
  id: string,
  element: Element,
  expression: 'base' | 'thunder' | 'ice',
) => request(`/characters/${id}/element`, { body: { element, expression }, auth: true });

/** Fresh session token per (re)connect: game tokens are short-lived. */
export const startSession = (characterId: string) =>
  request<GameSession>(`/characters/${characterId}/session`, {
    method: 'POST',
    body: {},
    auth: true,
  });

export const hasSession = (): boolean => accessToken !== null;

export const fetchLeaderboard = () =>
  request<{ leaderboard: { name: string; realm: string; nodes: number }[] }>('/leaderboard');

export interface SocialState {
  friends: {
    id: string;
    name: string;
    /** Realm id (game-data/realms). */
    realm: string;
    status: 'friend' | 'incoming' | 'outgoing';
  }[];
  guild: {
    id: string;
    name: string;
    leaderId: string;
    members: { id: string; name: string; realm: string; rank: string }[];
  } | null;
}

export const fetchSocial = (characterId: string) =>
  request<SocialState>(`/characters/${characterId}/social`, { auth: true });
export const addFriend = (characterId: string, name: string) =>
  request(`/characters/${characterId}/friends`, { body: { name }, auth: true });
export const acceptFriend = (characterId: string, otherId: string) =>
  request(`/characters/${characterId}/friends/${otherId}/accept`, {
    method: 'POST',
    body: {},
    auth: true,
  });
export const removeFriend = (characterId: string, otherId: string) =>
  request(`/characters/${characterId}/friends/${otherId}`, {
    method: 'DELETE',
    auth: true,
  });
export const createGuild = (characterId: string, name: string) =>
  request(`/characters/${characterId}/guild`, { body: { name }, auth: true });
export const joinGuild = (characterId: string, name: string) =>
  request(`/characters/${characterId}/guild/join`, {
    body: { name },
    auth: true,
  });
export const leaveGuild = (characterId: string) =>
  request(`/characters/${characterId}/guild/leave`, {
    method: 'POST',
    body: {},
    auth: true,
  });
