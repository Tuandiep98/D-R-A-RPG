/**
 * Device-agnostic input. Adapters translate browser events into GameActions;
 * game code only ever sees actions (tech plan §24).
 */
export type GameAction =
  | { type: 'SELECT'; x: number; y: number }
  /**
   * Movement axis from one adapter (x: right, y: forward, length ≤ 1, screen /
   * camera relative). InputManager merges sources and re-emits it as MOVE.
   */
  | { type: 'MOVE_AXIS'; source: string; x: number; y: number }
  /** Merged movement axis from every source; {0,0} = released. */
  | { type: 'MOVE'; x: number; y: number }
  | { type: 'CAMERA_ROTATE'; dx: number; dy: number }
  | { type: 'ZOOM'; delta: number }
  | { type: 'STOP' }
  | { type: 'SKILL'; index: number }
  | { type: 'INTERACT' }
  | { type: 'TARGET_NEXT' }
  /** Auto-attack the selected (or nearest) hostile. */
  | { type: 'ATTACK' }
  | { type: 'USE_POTION' }
  | {
      type: 'TOGGLE_PANEL';
      panel: 'inventory' | 'character' | 'cultivation' | 'settings';
    }
  | { type: 'TOGGLE_DEBUG' };

export type ActionListener = (action: GameAction) => void;

export interface InputAdapter {
  attach(target: HTMLElement, emit: ActionListener): void;
  detach(): void;
}

export class InputManager {
  private readonly listeners = new Set<ActionListener>();
  private readonly adapters: InputAdapter[] = [];

  constructor(private readonly target: HTMLElement) {}

  private readonly axes = new Map<string, { x: number; y: number }>();
  private move = { x: 0, y: 0 };

  use(adapter: InputAdapter): this {
    adapter.attach(this.target, (a) => this.emit(a));
    this.adapters.push(adapter);
    return this;
  }

  /** Detaches one adapter (e.g. the on-screen joystick when switching to desktop controls). */
  remove(adapter: InputAdapter): void {
    const i = this.adapters.indexOf(adapter);
    if (i < 0) return;
    this.adapters.splice(i, 1);
    adapter.detach();
  }

  on(listener: ActionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    for (const a of this.adapters) a.detach();
    this.adapters.length = 0;
    this.listeners.clear();
  }

  private emit(action: GameAction): void {
    if (action.type === 'MOVE_AXIS') {
      this.mergeAxis(action.source, action.x, action.y);
      return;
    }
    for (const l of this.listeners) l(action);
  }

  /** Sum of all held sources clamped to length 1 (keyboard + stick don't double speed). */
  private mergeAxis(source: string, x: number, y: number): void {
    if (x === 0 && y === 0) this.axes.delete(source);
    else this.axes.set(source, { x, y });
    let mx = 0;
    let my = 0;
    for (const a of this.axes.values()) {
      mx += a.x;
      my += a.y;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (mx === this.move.x && my === this.move.y) return;
    this.move = { x: mx, y: my };
    for (const l of this.listeners) l({ type: 'MOVE', x: mx, y: my });
  }
}

/** Pointer travel (px) under which a press counts as a click/tap. */
const CLICK_SLOP = 6;

/** Movement keys → axis direction (x: right, y: forward). */
const MOVE_KEYS: Record<string, readonly [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/**
 * Left click: select / walk. Right drag: rotate. Wheel: zoom.
 * WASD or arrow keys: walk relative to the camera. Esc: stop. Backquote: debug.
 */
export class MouseKeyboardAdapter implements InputAdapter {
  private target: HTMLElement | null = null;
  private emit: ActionListener = () => {};
  private rotating = false;
  private down: { x: number; y: number; button: number } | null = null;
  private last = { x: 0, y: 0 };
  private readonly abort = new AbortController();

  attach(target: HTMLElement, emit: ActionListener): void {
    this.target = target;
    this.emit = emit;
    const signal = this.abort.signal;
    target.addEventListener('pointerdown', this.onDown, { signal });
    window.addEventListener('pointermove', this.onMove, { signal });
    window.addEventListener('pointerup', this.onUp, { signal });
    target.addEventListener('wheel', this.onWheel, { signal, passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault(), {
      signal,
    });
    window.addEventListener('keydown', this.onKey, { signal });
    window.addEventListener('keyup', this.onKeyUp, { signal });
    // Keys released while the tab is hidden never send keyup.
    window.addEventListener('blur', this.releaseAll, { signal });
    document.addEventListener('visibilitychange', this.releaseAll, { signal });
  }

  detach(): void {
    this.releaseAll();
    this.abort.abort();
    this.target = null;
  }

  private readonly held = new Set<string>();

  private readonly releaseAll = () => {
    if (this.held.size === 0) return;
    this.held.clear();
    this.emitAxis();
  };

  private emitAxis(): void {
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      const k = MOVE_KEYS[code];
      if (!k) continue;
      x += k[0];
      y += k[1];
    }
    const len = Math.hypot(x, y);
    this.emit({
      type: 'MOVE_AXIS',
      source: 'keyboard',
      x: len > 0 ? x / len : 0,
      y: len > 0 ? y / len : 0,
    });
  }

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (this.held.delete(e.code)) this.emitAxis();
  };

  private readonly onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    this.down = { x: e.clientX, y: e.clientY, button: e.button };
    this.last = { x: e.clientX, y: e.clientY };
    this.rotating = e.button === 2;
  };

  private readonly onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !this.rotating) return;
    this.emit({
      type: 'CAMERA_ROTATE',
      dx: e.clientX - this.last.x,
      dy: e.clientY - this.last.y,
    });
    this.last = { x: e.clientX, y: e.clientY };
  };

  private readonly onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    if (this.down.button === 0 && moved < CLICK_SLOP && this.target) {
      const rect = this.target.getBoundingClientRect();
      this.emit({
        type: 'SELECT',
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
    this.down = null;
    this.rotating = false;
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.emit({ type: 'ZOOM', delta: Math.sign(e.deltaY) });
  };

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      // Typing (chat) releases movement instead of steering.
      this.releaseAll();
      return;
    }
    if (MOVE_KEYS[e.code]) {
      e.preventDefault(); // arrows would scroll
      if (!this.held.has(e.code)) {
        this.held.add(e.code);
        this.emitAxis();
      }
      return;
    }
    if (e.repeat) return;
    const digit = /^Digit([1-8])$/.exec(e.code);
    if (digit) this.emit({ type: 'SKILL', index: Number(digit[1]) - 1 });
    else if (e.code === 'Escape') this.emit({ type: 'STOP' });
    else if (e.code === 'Space') {
      e.preventDefault();
      this.emit({ type: 'ATTACK' });
    } else if (e.code === 'KeyF') this.emit({ type: 'INTERACT' });
    else if (e.code === 'KeyQ') this.emit({ type: 'USE_POTION' });
    else if (e.code === 'KeyI' || e.code === 'KeyB')
      this.emit({ type: 'TOGGLE_PANEL', panel: 'inventory' });
    else if (e.code === 'KeyC') this.emit({ type: 'TOGGLE_PANEL', panel: 'character' });
    else if (e.code === 'KeyK') this.emit({ type: 'TOGGLE_PANEL', panel: 'cultivation' });
    else if (e.code === 'Tab') {
      e.preventDefault();
      this.emit({ type: 'TARGET_NEXT' });
    } else if (e.code === 'Backquote') this.emit({ type: 'TOGGLE_DEBUG' });
  };
}

/** Tap: select. One-finger drag: rotate. Pinch: zoom. */
export class TouchAdapter implements InputAdapter {
  private target: HTMLElement | null = null;
  private emit: ActionListener = () => {};
  private readonly touches = new Map<
    number,
    { x: number; y: number; startX: number; startY: number }
  >();
  private pinchDistance = 0;
  private dragged = false;
  private readonly abort = new AbortController();

  attach(target: HTMLElement, emit: ActionListener): void {
    this.target = target;
    this.emit = emit;
    const signal = this.abort.signal;
    target.style.touchAction = 'none';
    target.addEventListener('pointerdown', this.onDown, { signal });
    target.addEventListener('pointermove', this.onMove, { signal });
    target.addEventListener('pointerup', this.onUp, { signal });
    target.addEventListener('pointercancel', this.onUp, { signal });
  }

  detach(): void {
    this.abort.abort();
    this.touches.clear();
    this.target = null;
  }

  private readonly onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    this.touches.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
    });
    if (this.touches.size === 1) this.dragged = false;
    if (this.touches.size === 2) this.pinchDistance = this.currentPinch();
  };

  private readonly onMove = (e: PointerEvent) => {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    if (this.touches.size === 1) {
      if (Math.hypot(t.x - t.startX, t.y - t.startY) >= CLICK_SLOP) this.dragged = true;
      if (this.dragged) this.emit({ type: 'CAMERA_ROTATE', dx, dy });
    } else if (this.touches.size === 2) {
      this.dragged = true;
      const d = this.currentPinch();
      const change = this.pinchDistance - d;
      if (Math.abs(change) > 12) {
        this.emit({ type: 'ZOOM', delta: Math.sign(change) });
        this.pinchDistance = d;
      }
    }
  };

  private readonly onUp = (e: PointerEvent) => {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    this.touches.delete(e.pointerId);
    if (e.type === 'pointerup' && this.touches.size === 0 && !this.dragged && this.target) {
      const rect = this.target.getBoundingClientRect();
      this.emit({
        type: 'SELECT',
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  private currentPinch(): number {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

const q = (v: number) => Math.round(v * 20) / 20;

/**
 * Standard-mapping gamepad: left stick walks, right stick rotates, triggers zoom, face buttons
 * map to skills, LB targets next, RB interacts, Start opens inventory.
 * Polled each frame by the game via poll().
 */
export class GamepadAdapter implements InputAdapter {
  private emit: ActionListener = () => {};
  private prev: boolean[] = [];
  private stick = { x: 0, y: 0 };

  attach(_target: HTMLElement, emit: ActionListener): void {
    this.emit = emit;
  }

  detach(): void {
    this.emit = () => {};
  }

  poll(dt: number): void {
    const pad =
      typeof navigator !== 'undefined' ? navigator.getGamepads?.().find((p) => p?.connected) : null;
    if (!pad) return;
    const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
    const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    // Left stick (radial dead zone) walks; quantised so tiny drift doesn't spam.
    const mag = Math.hypot(lx, ly);
    const stick =
      mag < 0.25 ? { x: 0, y: 0 } : { x: q(lx / Math.max(mag, 1)), y: q(-ly / Math.max(mag, 1)) };
    if (stick.x !== this.stick.x || stick.y !== this.stick.y) {
      this.stick = stick;
      this.emit({ type: 'MOVE_AXIS', source: 'gamepad', ...stick });
    }
    if (dead(rx) || dead(ry))
      this.emit({
        type: 'CAMERA_ROTATE',
        dx: dead(rx) * 600 * dt,
        dy: dead(ry) * 400 * dt,
      });
    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] && !this.prev[i];
    for (const [idx, b] of [0, 1, 2, 3].entries())
      if (edge(b)) this.emit({ type: 'SKILL', index: idx });
    if (edge(4)) this.emit({ type: 'TARGET_NEXT' });
    if (edge(5)) this.emit({ type: 'INTERACT' });
    if (edge(6)) this.emit({ type: 'ZOOM', delta: -1 });
    if (edge(7)) this.emit({ type: 'ZOOM', delta: 1 });
    if (edge(9)) this.emit({ type: 'TOGGLE_PANEL', panel: 'inventory' });
    if (edge(12)) this.emit({ type: 'USE_POTION' });
    this.prev = pressed;
  }
}

export interface JoystickOptions {
  /** floating: the stick appears under the thumb; fixed: it stays at its rest spot. */
  mode: 'floating' | 'fixed';
  /** Which side of the screen the stick zone covers (handedness). */
  side: 'left' | 'right';
  /** Knob travel in CSS px. */
  radius: number;
}

/** Fraction of the radius ignored around the centre (thumb jitter). */
const JOYSTICK_DEAD = 0.18;
/** A touch shorter than this that barely moved is a tap: it selects through. */
const TAP_MS = 250;

/**
 * On-screen thumb stick for touch screens. Owns a zone element (styled by the
 * app: `.joystick-zone`, `.joystick-base`, `.joystick-knob`) inside `container`
 * and emits MOVE_AXIS like the keyboard. Taps inside the zone fall through as
 * SELECT so the zone never makes part of the world unclickable. Per-frame
 * visuals are plain style writes — never React state.
 */
export class VirtualJoystick implements InputAdapter {
  readonly zone: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private target: HTMLElement | null = null;
  private emit: ActionListener = () => {};
  private pointerId: number | null = null;
  private center = { x: 0, y: 0 };
  private start = { x: 0, y: 0, t: 0 };
  private travelled = 0;
  private readonly abort = new AbortController();

  constructor(
    private readonly container: HTMLElement,
    private opts: JoystickOptions,
  ) {
    this.zone = document.createElement('div');
    this.base = document.createElement('div');
    this.knob = document.createElement('div');
    this.base.className = 'joystick-base';
    this.knob.className = 'joystick-knob';
    this.base.append(this.knob);
    this.zone.append(this.base);
    this.applyOptions();
  }

  setOptions(opts: Partial<JoystickOptions>): void {
    this.release();
    this.opts = { ...this.opts, ...opts };
    this.applyOptions();
  }

  attach(target: HTMLElement, emit: ActionListener): void {
    this.target = target;
    this.emit = emit;
    this.container.append(this.zone);
    const signal = this.abort.signal;
    this.zone.addEventListener('pointerdown', this.onDown, { signal });
    this.zone.addEventListener('pointermove', this.onMove, { signal });
    this.zone.addEventListener('pointerup', this.onUp, { signal });
    this.zone.addEventListener('pointercancel', this.onUp, { signal });
    this.zone.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
  }

  detach(): void {
    this.release();
    this.abort.abort();
    this.zone.remove();
    this.target = null;
  }

  private applyOptions(): void {
    const { mode, side, radius } = this.opts;
    this.zone.className = `joystick-zone joystick-${mode} joystick-${side}`;
    this.zone.style.setProperty('--joystick-radius', `${radius}px`);
    this.resetVisual();
  }

  private resetVisual(): void {
    this.zone.classList.remove('joystick-active');
    // Rest spot comes from CSS; inline left/top only while a floating stick is held.
    this.base.style.left = '';
    this.base.style.top = '';
    this.knob.style.transform = '';
  }

  private readonly onDown = (e: PointerEvent) => {
    if (this.pointerId !== null) return;
    e.preventDefault();
    e.stopPropagation();
    this.pointerId = e.pointerId;
    this.zone.setPointerCapture(e.pointerId);
    this.start = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.travelled = 0;
    if (this.opts.mode === 'floating') {
      this.center = { x: e.clientX, y: e.clientY };
      this.placeBase();
    } else {
      const r = this.base.getBoundingClientRect();
      this.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    this.zone.classList.add('joystick-active');
    this.update(e.clientX, e.clientY);
  };

  private readonly onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.travelled = Math.max(
      this.travelled,
      Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y),
    );
    this.update(e.clientX, e.clientY);
  };

  private readonly onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const tap =
      e.type === 'pointerup' &&
      this.travelled < CLICK_SLOP &&
      performance.now() - this.start.t < TAP_MS;
    this.release();
    if (tap && this.target) {
      const rect = this.target.getBoundingClientRect();
      this.emit({ type: 'SELECT', x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  private release(): void {
    if (this.pointerId === null) return;
    if (this.zone.hasPointerCapture(this.pointerId))
      this.zone.releasePointerCapture(this.pointerId);
    this.pointerId = null;
    this.resetVisual();
    this.emit({ type: 'MOVE_AXIS', source: 'joystick', x: 0, y: 0 });
  }

  private placeBase(): void {
    const z = this.zone.getBoundingClientRect();
    this.base.style.left = `${this.center.x - z.left}px`;
    this.base.style.top = `${this.center.y - z.top}px`;
  }

  private update(px: number, py: number): void {
    const radius = this.opts.radius;
    let dx = px - this.center.x;
    let dy = py - this.center.y;
    let dist = Math.hypot(dx, dy);
    // Floating stick follows a thumb that overshoots, so reversing is instant.
    if (this.opts.mode === 'floating' && dist > radius) {
      const k = (dist - radius) / dist;
      this.center.x += dx * k;
      this.center.y += dy * k;
      this.placeBase();
      dx = px - this.center.x;
      dy = py - this.center.y;
      dist = radius;
    }
    const clamped = Math.min(dist, radius);
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    this.knob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
    const t = clamped / radius;
    if (t < JOYSTICK_DEAD) {
      this.emit({ type: 'MOVE_AXIS', source: 'joystick', x: 0, y: 0 });
      return;
    }
    // Screen y grows downward; the axis' y is "forward" (up on screen).
    this.emit({ type: 'MOVE_AXIS', source: 'joystick', x: nx, y: -ny });
  }
}
