import type { UnitFrame } from '@rpg/babylon-renderer';
import { useUiStore } from '../store';

function Bar({ value, max, tone }: { value: number; max: number; tone: 'player' | 'enemy' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar">
      <div className={`bar-fill bar-${tone}`} style={{ width: `${pct}%` }} />
      <span className="bar-text">
        {value} / {max}
      </span>
    </div>
  );
}

function Frame({ unit, tone }: { unit: UnitFrame; tone: 'player' | 'enemy' }) {
  return (
    <div className={`frame frame-${tone}`}>
      <div className="frame-name">
        {unit.name}
        {unit.level !== null && <span className="frame-level">Lv {unit.level}</span>}
      </div>
      <Bar value={unit.hp} max={unit.maxHp} tone={tone} />
    </div>
  );
}

function DebugOverlay() {
  const debug = useUiStore((s) => s.debug);
  const show = useUiStore((s) => s.showDebug);
  if (!show || !debug) return null;
  return (
    <div className="debug">
      <div>
        {debug.engine} · {debug.fps} FPS
      </div>
      <div>tick {debug.tick}</div>
      <div>entities {debug.entities}</div>
      <div>draw calls {debug.drawCalls}</div>
      <div>active meshes {debug.activeMeshes}</div>
    </div>
  );
}

export function Hud() {
  const player = useUiStore((s) => s.player);
  const target = useUiStore((s) => s.target);
  const status = useUiStore((s) => s.status);
  const error = useUiStore((s) => s.error);

  return (
    <div className="hud">
      {status === 'loading' && <div className="center-note">Đang tải…</div>}
      {status === 'error' && <div className="center-note error">Lỗi: {error}</div>}
      {player && <Frame unit={player} tone="player" />}
      {target && <Frame unit={target} tone="enemy" />}
      {player && !player.alive && (
        <div className="center-note">Bạn đã gục ngã — đang hồi sinh…</div>
      )}
      <DebugOverlay />
      <div className="help">
        Click đất: di chuyển · Click quái: tấn công · Chuột phải kéo: xoay · Lăn: zoom · S: dừng ·
        `: debug
      </div>
    </div>
  );
}
