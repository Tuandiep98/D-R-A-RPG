import { VirtualJoystick } from '@rpg/input';
import { useEffect, useRef } from 'react';
import { effectiveScheme, JOYSTICK_RADIUS, useControls } from '../controls';
import { game } from '../game';
import { useUiStore } from '../store';

/**
 * Mounts the on-screen joystick while touch controls are active. The stick
 * itself is plain DOM driven by @rpg/input (no per-frame React renders); this
 * component only creates it, forwards setting changes and removes it again.
 */
export function TouchJoystick() {
  const layer = useRef<HTMLDivElement>(null);
  const stick = useRef<VirtualJoystick | null>(null);
  const ready = useUiStore((s) => s.status === 'ready');
  const touch = useControls((s) => effectiveScheme(s) === 'touch');
  const mode = useControls((s) => s.joystickMode);
  const side = useControls((s) => s.joystickSide);
  const size = useControls((s) => s.joystickSize);

  useEffect(() => {
    const view = game();
    const el = layer.current;
    if (!ready || !touch || !view || !el) return;
    const { joystickMode, joystickSide, joystickSize } = useControls.getState();
    const js = new VirtualJoystick(el, {
      mode: joystickMode,
      side: joystickSide,
      radius: JOYSTICK_RADIUS[joystickSize],
    });
    stick.current = js;
    const off = view.addInput(js);
    return () => {
      off();
      stick.current = null;
    };
  }, [ready, touch]);

  useEffect(() => {
    stick.current?.setOptions({ mode, side, radius: JOYSTICK_RADIUS[size] });
  }, [mode, side, size]);

  return <div ref={layer} className="joystick-layer" />;
}
