import type { GameView } from '@rpg/babylon-renderer';

/**
 * The running GameView, for HUD buttons. Kept outside Zustand on purpose:
 * it is a command interface, not UI state.
 */
let current: GameView | null = null;

export const setGame = (view: GameView | null): void => {
  current = view;
};

export const game = (): GameView | null => current;
