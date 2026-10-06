import type { DebugStats, UiState } from '@rpg/babylon-renderer';
import { create } from 'zustand';

/**
 * UI-only state (tech plan §36). Fed at 10 Hz by GameView; never holds
 * transforms or anything per-frame.
 */
interface UiStore extends UiState {
  debug: DebugStats | null;
  showDebug: boolean;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  setUi(ui: UiState): void;
  setDebug(debug: DebugStats): void;
  toggleDebug(): void;
  setStatus(status: UiStore['status'], error?: string): void;
}

export const useUiStore = create<UiStore>((set) => ({
  player: null,
  target: null,
  debug: null,
  showDebug: true,
  status: 'loading',
  error: null,
  setUi: (ui) => set(ui),
  setDebug: (debug) => set({ debug }),
  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),
  setStatus: (status, error) => set({ status, error: error ?? null }),
}));
