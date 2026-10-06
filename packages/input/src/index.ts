/**
 * Device-agnostic input. Adapters translate browser events into GameActions;
 * game code only ever sees actions (tech plan §24).
 */
export type GameAction =
  | { type: 'SELECT'; x: number; y: number }
  | { type: 'CAMERA_ROTATE'; dx: number; dy: number }
  | { type: 'ZOOM'; delta: number }
  | { type: 'STOP' }
  | { type: 'SKILL'; index: number }
  | { type: 'INTERACT' }
  | { type: 'TARGET_NEXT' }
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

  use(adapter: InputAdapter): this {
    adapter.attach(this.target, (a) => this.emit(a));
    this.adapters.push(adapter);
    return this;
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
    for (const l of this.listeners) l(action);
  }
}

/** Pointer travel (px) under which a press counts as a click/tap. */
const CLICK_SLOP = 6;

/** Left click: select. Right drag: rotate. Wheel: zoom. S/Esc: stop. Backquote: debug. */
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
  }

  detach(): void {
    this.abort.abort();
    this.target = null;
  }

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
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const digit = /^Digit([1-8])$/.exec(e.code);
    if (digit) this.emit({ type: 'SKILL', index: Number(digit[1]) - 1 });
    else if (e.code === 'KeyS' || e.code === 'Escape') this.emit({ type: 'STOP' });
    else if (e.code === 'KeyF') this.emit({ type: 'INTERACT' });
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

/**
 * Standard-mapping gamepad: right stick rotates, triggers zoom, face buttons
 * map to skills, LB targets next, RB interacts, Start opens inventory.
 * Polled each frame by the game via poll().
 */
export class GamepadAdapter implements InputAdapter {
  private emit: ActionListener = () => {};
  private prev: boolean[] = [];

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
    const [, , rx = 0, ry = 0] = pad.axes;
    const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
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
