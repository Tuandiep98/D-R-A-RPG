import { mediaUrl } from './media';

/**
 * Small WebAudio SFX player (assets plan §9: pooling / voice limit).
 * Sounds come from the media manifest; unknown ids are silent. Buffers are
 * decoded once and cached. The context starts on the first user gesture
 * (browser autoplay rules).
 */
const MAX_VOICES = 12;
/** The same sound is not restarted within this window (multi-hit spam). */
const RETRIGGER_MS = 45;
const VOLUME_KEY = 'rpg.sfxVolume';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<string, number>();
let voices = 0;
let volume = readVolume();

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null ? v : 0.7;
  } catch {
    return 0.7;
  }
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

// Unlock on the first gesture; later gestures resume a suspended context (iOS).
for (const type of ['pointerdown', 'keydown'] as const)
  window.addEventListener(type, () => void ensureContext()?.resume(), { passive: true });

function load(id: string): Promise<AudioBuffer | null> {
  let p = buffers.get(id);
  if (!p) {
    const url = mediaUrl(id);
    const c = ensureContext();
    p =
      url && c
        ? fetch(url)
            .then((r) => r.arrayBuffer())
            .then((data) => c.decodeAudioData(data))
            .catch(() => null)
        : Promise.resolve(null);
    if (url) buffers.set(id, p);
  }
  return p;
}

/** Plays one of `ids` at random. `gain` 0..1 (distance falloff from the caller). */
export function playSfx(ids: string | readonly string[] | undefined, gain = 1): void {
  if (!ids || volume <= 0 || gain <= 0.02) return;
  const list = typeof ids === 'string' ? [ids] : ids;
  const id = list[Math.floor(Math.random() * list.length)];
  const c = ensureContext();
  if (!id || !c || !master || c.state !== 'running' || voices >= MAX_VOICES) return;
  const now = performance.now();
  if (now - (lastPlayed.get(id) ?? -1e9) < RETRIGGER_MS) return;
  lastPlayed.set(id, now);
  void load(id).then((buffer) => {
    if (!buffer || !ctx || !master || voices >= MAX_VOICES) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.94 + Math.random() * 0.12; // light variation
    const g = ctx.createGain();
    g.gain.value = Math.min(1, gain);
    src.connect(g).connect(master);
    voices++;
    src.onended = () => {
      voices--;
      g.disconnect();
    };
    src.start();
  });
}

export function getSfxVolume(): number {
  return volume;
}

export function setSfxVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // private mode: keep it for this session only
  }
}

/** Short UI feedback for every HUD button press (event delegation, one listener). */
export function installUiSounds(): void {
  window.addEventListener(
    'click',
    (e) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('.hud button, .panel button, .login button')) playSfx('sfx_ui_click', 0.5);
    },
    { capture: true, passive: true },
  );
}
