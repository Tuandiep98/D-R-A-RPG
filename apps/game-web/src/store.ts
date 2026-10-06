import type { DebugStats, Notice, QualityMode, UiState } from '@rpg/babylon-renderer';
import type { ChatMessage } from '@rpg/game-protocol';
import { create } from 'zustand';

export type Panel =
  | 'inventory'
  | 'character'
  | 'cultivation'
  | 'settings'
  | 'leaderboard'
  | 'social'
  | null;

export interface ToastNotice extends Notice {
  id: number;
  expires: number;
}

/**
 * UI-only state (tech plan §36). Fed at 10 Hz by GameView; never holds
 * transforms or anything per-frame.
 */
interface UiStore {
  ui: UiState | null;
  debug: DebugStats | null;
  notices: ToastNotice[];
  panel: Panel;
  npc: { npcEntityId: number; npcId: string } | null;
  chat: ChatMessage[];
  invite: { fromId: number; fromName: string } | null;
  /** Online character id (API social endpoints). */
  characterId: string | null;
  setCharacterId(id: string | null): void;
  setInvite(invite: { fromId: number; fromName: string } | null): void;
  openNpc(npc: { npcEntityId: number; npcId: string }): void;
  closeNpc(): void;
  pushChat(m: ChatMessage): void;
  showDebug: boolean;
  quality: QualityMode;
  hostKind: string;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  setUi(ui: UiState): void;
  setDebug(debug: DebugStats): void;
  pushNotice(n: Notice): void;
  pruneNotices(now: number): void;
  togglePanel(panel: Exclude<Panel, null>): void;
  closePanel(): void;
  toggleDebug(): void;
  setQuality(q: QualityMode): void;
  setStatus(status: UiStore['status'], error?: string): void;
  setHostKind(kind: string): void;
}

let noticeId = 0;

export const useUiStore = create<UiStore>((set) => ({
  ui: null,
  debug: null,
  notices: [],
  panel: null,
  npc: null,
  chat: [],
  invite: null,
  characterId: null,
  setCharacterId: (characterId) => set({ characterId }),
  setInvite: (invite) => set({ invite }),
  openNpc: (npc) => set({ npc, panel: null }),
  closeNpc: () => set({ npc: null }),
  pushChat: (m) => set((s) => ({ chat: [...s.chat, m].slice(-60) })),
  showDebug: true,
  quality: 'auto',
  hostKind: '',
  status: 'loading',
  error: null,
  setUi: (ui) => set({ ui }),
  setDebug: (debug) => set({ debug }),
  pushNotice: (n) =>
    set((s) => {
      // Collapse repeats (e.g. spamming a skill on cooldown).
      if (s.notices.some((x) => x.text === n.text && x.expires > performance.now() + 1500))
        return s;
      const ttl = n.tone === 'boss' ? 3500 : 2400;
      const next = [...s.notices, { ...n, id: ++noticeId, expires: performance.now() + ttl }];
      return { notices: next.slice(-5) };
    }),
  pruneNotices: (now) =>
    set((s) =>
      s.notices.some((n) => n.expires <= now)
        ? { notices: s.notices.filter((n) => n.expires > now) }
        : s,
    ),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  closePanel: () => set({ panel: null, npc: null }),
  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),
  setQuality: (quality) => set({ quality }),
  setStatus: (status, error) => set({ status, error: error ?? null }),
  setHostKind: (hostKind) => set({ hostKind }),
}));
