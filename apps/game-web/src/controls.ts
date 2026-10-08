import { create } from 'zustand';

/**
 * Control scheme + screen settings (per device, localStorage).
 *
 * `auto` picks touch or desktop from the primary pointer and then follows the
 * last device actually used, so a touch laptop or a tablet with a keyboard
 * switches by itself. The effective scheme is mirrored to
 * `<html data-controls="touch|desktop" data-hand="left|right">`; CSS lays the
 * HUD out from those attributes plus orientation/size media queries, so the
 * game never locks orientation.
 */
export type ControlScheme = 'auto' | 'desktop' | 'touch';
export type JoystickMode = 'floating' | 'fixed';
export type JoystickSize = 'small' | 'medium' | 'large';

export const JOYSTICK_RADIUS: Record<JoystickSize, number> = {
  small: 44,
  medium: 56,
  large: 70,
};

export interface ControlSettings {
  scheme: ControlScheme;
  joystickMode: JoystickMode;
  /** Hand that holds the joystick; action buttons go to the other side. */
  joystickSide: 'left' | 'right';
  joystickSize: JoystickSize;
  /** Touch: enter fullscreen on the first tap (where the browser allows it). */
  autoFullscreen: boolean;
}

const KEY = 'rpg.controls';
const DEFAULTS: ControlSettings = {
  scheme: 'auto',
  joystickMode: 'floating',
  joystickSide: 'left',
  joystickSize: 'medium',
  autoFullscreen: true,
};

function read(): ControlSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ControlSettings>;
    const s = { ...DEFAULTS, ...raw };
    // Unknown values from an older build fall back to defaults.
    if (!['auto', 'desktop', 'touch'].includes(s.scheme)) s.scheme = DEFAULTS.scheme;
    if (!['floating', 'fixed'].includes(s.joystickMode)) s.joystickMode = DEFAULTS.joystickMode;
    if (!['left', 'right'].includes(s.joystickSide)) s.joystickSide = DEFAULTS.joystickSide;
    if (!(s.joystickSize in JOYSTICK_RADIUS)) s.joystickSize = DEFAULTS.joystickSize;
    s.autoFullscreen = s.autoFullscreen !== false;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

interface ControlsStore extends ControlSettings {
  /** Device last used — what `auto` resolves to. */
  detected: 'desktop' | 'touch';
  set(patch: Partial<ControlSettings>): void;
}

export const useControls = create<ControlsStore>((set) => ({
  ...read(),
  detected: coarse() ? 'touch' : 'desktop',
  set: (patch) =>
    set((s) => {
      const next = { ...s, ...patch };
      try {
        const { detected: _d, set: _s, ...persist } = next;
        localStorage.setItem(KEY, JSON.stringify(persist));
      } catch {
        // Private mode: settings last for this session only.
      }
      return next;
    }),
}));

export const effectiveScheme = (s: Pick<ControlsStore, 'scheme' | 'detected'>) =>
  s.scheme === 'auto' ? s.detected : s.scheme;

/** Reflects settings on <html> and tracks the device in use. Call once. */
export function installControls(): void {
  const root = document.documentElement;
  const apply = () => {
    const s = useControls.getState();
    root.dataset.controls = effectiveScheme(s);
    root.dataset.hand = s.joystickSide;
  };
  apply();
  useControls.subscribe(apply);

  const seen = (kind: 'desktop' | 'touch') => {
    if (useControls.getState().detected !== kind) useControls.setState({ detected: kind });
  };
  window.addEventListener(
    'pointerdown',
    (e) => seen(e.pointerType === 'mouse' ? 'desktop' : 'touch'),
    { capture: true, passive: true },
  );
  // For touch, user activation (needed by requestFullscreen) comes on pointerup, not down.
  window.addEventListener(
    'pointerup',
    (e) => {
      const s = useControls.getState();
      if (e.pointerType !== 'mouse' && s.autoFullscreen && !isFullscreen()) void enterFullscreen();
    },
    { capture: true, passive: true },
  );
  // A physical keyboard on a tablet means desktop controls (typing in chat doesn't count).
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^(Key[WASD]|Arrow)/.test(e.code)) seen('desktop');
    },
    { capture: true, passive: true },
  );
}

// ---- Fullscreen (Fullscreen API; webkit prefix for older Safari/iPad) -------

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const doc = () => document as WebkitDocument;

/** False on iPhone Safari: there the PWA ("Add to Home Screen") is fullscreen instead. */
export const fullscreenSupported = (): boolean =>
  !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);

export const isFullscreen = (): boolean =>
  !!(doc().fullscreenElement || doc().webkitFullscreenElement);

/** Must run inside a user gesture (click, tap, key press). */
export async function enterFullscreen(): Promise<void> {
  if (!fullscreenSupported() || isFullscreen()) return;
  const el = document.documentElement as WebkitElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
  } catch {
    // Denied (no gesture / browser policy): stay windowed.
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (!isFullscreen()) return enterFullscreen();
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await doc().webkitExitFullscreen?.();
  } catch {
    // Already left.
  }
}

/** Subscribes to fullscreen changes (for the HUD toggle icon). */
export function onFullscreenChange(cb: () => void): () => void {
  document.addEventListener('fullscreenchange', cb);
  document.addEventListener('webkitfullscreenchange', cb);
  return () => {
    document.removeEventListener('fullscreenchange', cb);
    document.removeEventListener('webkitfullscreenchange', cb);
  };
}

/** True when running as an installed PWA (already fullscreen/standalone). */
export const isStandalone = (): boolean =>
  typeof matchMedia !== 'undefined' &&
  (matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: standalone)').matches);
