import { describe, expect, it } from 'vitest';
import { type ActionListener, type GameAction, type InputAdapter, InputManager } from './index';

/** Adapter whose emit the test drives directly. */
class FakeAdapter implements InputAdapter {
  emit: ActionListener = () => {};
  detached = false;
  attach(_target: HTMLElement, emit: ActionListener): void {
    this.emit = emit;
  }
  detach(): void {
    this.detached = true;
  }
}

function setup() {
  const input = new InputManager({} as HTMLElement);
  const a = new FakeAdapter();
  const b = new FakeAdapter();
  input.use(a).use(b);
  const seen: GameAction[] = [];
  input.on((x) => seen.push(x));
  return { input, a, b, seen };
}

describe('InputManager movement axes', () => {
  it('re-emits per-source axes as one merged MOVE', () => {
    const { a, seen } = setup();
    a.emit({ type: 'MOVE_AXIS', source: 'keyboard', x: 0, y: 1 });
    expect(seen).toEqual([{ type: 'MOVE', x: 0, y: 1 }]);
  });

  it('clamps the sum of sources to length 1 and skips unchanged values', () => {
    const { a, b, seen } = setup();
    a.emit({ type: 'MOVE_AXIS', source: 'keyboard', x: 1, y: 0 });
    b.emit({ type: 'MOVE_AXIS', source: 'joystick', x: 1, y: 0 });
    expect(seen).toHaveLength(1);
    b.emit({ type: 'MOVE_AXIS', source: 'joystick', x: 0, y: 1 });
    const last = seen.at(-1) as { x: number; y: number };
    expect(Math.hypot(last.x, last.y)).toBeCloseTo(1);
    expect(last.x).toBeCloseTo(Math.SQRT1_2);
  });

  it('releasing one source keeps the other held', () => {
    const { a, b, seen } = setup();
    a.emit({ type: 'MOVE_AXIS', source: 'keyboard', x: -1, y: 0 });
    b.emit({ type: 'MOVE_AXIS', source: 'joystick', x: 0, y: -1 });
    a.emit({ type: 'MOVE_AXIS', source: 'keyboard', x: 0, y: 0 });
    expect(seen.at(-1)).toEqual({ type: 'MOVE', x: 0, y: -1 });
    b.emit({ type: 'MOVE_AXIS', source: 'joystick', x: 0, y: 0 });
    expect(seen.at(-1)).toEqual({ type: 'MOVE', x: 0, y: 0 });
  });

  it('remove() detaches a single adapter', () => {
    const { input, a, b } = setup();
    input.remove(b);
    expect(b.detached).toBe(true);
    expect(a.detached).toBe(false);
  });
});
