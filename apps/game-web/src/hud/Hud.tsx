import type { ItemView, QualityMode, SkillSlot, UnitFrame } from '@rpg/babylon-renderer';
import type { EquipSlot } from '@rpg/game-data';
import { useEffect, useState } from 'react';
import { game } from '../game';
import { useUiStore } from '../store';
import { NpcPanel } from './NpcPanel';
import { ChatBox, LeaderboardPanel, QuestTracker } from './Social';
import { SocialPanel } from './SocialPanel';

const ONLINE = new URLSearchParams(window.location.search).has('online');

const TIER_LABEL: Record<string, string> = {
  elite: 'Tinh anh',
  mini_boss: 'Tiểu boss',
  boss: 'Boss',
  world_boss: 'Boss thế giới',
};

const SLOT_LABEL: Record<EquipSlot, string> = {
  main_hand: 'Vũ khí',
  off_hand: 'Tay phụ',
  head: 'Đầu',
  chest: 'Thân',
  gloves: 'Găng',
  pants: 'Quần',
  boots: 'Giày',
  back: 'Lưng',
  artifact: 'Pháp khí',
};

function Bar({
  value,
  max,
  tone,
  label,
}: {
  value: number;
  max: number;
  tone: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bar bar-${tone}`}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      <span className="bar-text">{label ?? `${value} / ${max}`}</span>
    </div>
  );
}

function UnitPanel({ unit, className }: { unit: UnitFrame; className: string }) {
  const tier = unit.tier && unit.tier !== 'normal' ? TIER_LABEL[unit.tier] : null;
  const myId = useUiStore((s) => s.ui?.player?.id);
  const inMyParty = useUiStore((s) => s.ui?.party?.members.some((m) => m.id === unit.id) ?? false);
  const canInvite = unit.kind === 'player' && unit.id !== myId && !inMyParty;
  return (
    <div className={`frame ${className}`}>
      <div className="frame-name">
        <span>
          {unit.name} {tier && <span className={`tier tier-${unit.tier}`}>{tier}</span>}
        </span>
        {unit.level > 0 && <span className="frame-level">Lv {unit.level}</span>}
      </div>
      {unit.maxHp > 0 && <Bar value={unit.hp} max={unit.maxHp} tone="enemy" />}
      {canInvite && (
        <button
          type="button"
          className="frame-action"
          onPointerDown={(e) => {
            e.stopPropagation();
            game()?.send({ type: 'PARTY_INVITE', targetId: unit.id });
          }}
        >
          Mời vào nhóm
        </button>
      )}
      {unit.cast && (
        <div className="cast">
          <Bar
            value={Math.round(unit.cast.progress * 100)}
            max={100}
            tone="cast"
            label={unit.cast.name}
          />
        </div>
      )}
    </div>
  );
}

function PlayerPanel() {
  const ui = useUiStore((s) => s.ui);
  const p = ui?.player;
  if (!p) return null;
  return (
    <div className="frame frame-player">
      <div className="frame-name">
        <span>{p.name}</span>
        <span className="frame-level">Lv {p.level}</span>
      </div>
      <Bar value={p.hp} max={p.maxHp} tone="player" />
      <Bar value={p.mp} max={p.maxMp} tone="mp" />
      <div className="xp">
        <div
          className="xp-fill"
          style={{ width: `${p.xpToNext ? (p.xp / p.xpToNext) * 100 : 100}%` }}
        />
      </div>
      <div className="frame-meta">
        <span>🪙 {p.gold}</span>
        <span className="zone">
          {ui.mapName}
          {ui.zoneName ? ` · ${ui.zoneName}` : ''}
          {p.inSafeZone ? ' 🛡' : ''}
        </span>
      </div>
    </div>
  );
}

function SkillButton({ slot, index }: { slot: SkillSlot; index: number }) {
  const sweep = slot.remaining > 0 ? Math.min(1, slot.remaining / slot.cooldown) : 0;
  return (
    <button
      type="button"
      className={`skill ${slot.usable ? '' : 'skill-disabled'}`}
      title={`${slot.name}${slot.mpCost ? ` · ${slot.mpCost} MP` : ''}\n${slot.description}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        game()?.castSkill(index);
      }}
    >
      <span className="skill-icon">{slot.icon}</span>
      {sweep > 0 && (
        <span
          className="skill-cd"
          style={{ background: `conic-gradient(rgba(0,0,0,.65) ${sweep * 360}deg, transparent 0)` }}
        >
          {Math.ceil(slot.remaining)}
        </span>
      )}
      <span className="skill-key">{index + 1}</span>
    </button>
  );
}

function PartyFrames() {
  const party = useUiStore((s) => s.ui?.party ?? null);
  const myId = useUiStore((s) => s.ui?.player?.id);
  if (!party) return null;
  return (
    <div className="party" onPointerDown={(e) => e.stopPropagation()}>
      {party.members
        .filter((m) => m.id !== myId)
        .map((m) => (
          <div key={m.id} className="party-member">
            <span className="small">
              {m.id === party.leaderId ? '★ ' : ''}
              {m.name} · Lv {m.level}
            </span>
            <Bar value={m.hp} max={m.maxHp} tone="player" label=" " />
          </div>
        ))}
      <button
        type="button"
        className="frame-action"
        onClick={() => game()?.send({ type: 'PARTY_LEAVE' })}
      >
        Rời nhóm
      </button>
    </div>
  );
}

function InvitePrompt() {
  const invite = useUiStore((s) => s.invite);
  const setInvite = useUiStore((s) => s.setInvite);
  if (!invite) return null;
  return (
    <div className="invite" onPointerDown={(e) => e.stopPropagation()}>
      <span>
        <strong>{invite.fromName}</strong> mời bạn vào nhóm
      </span>
      <button
        type="button"
        className="frame-action"
        onClick={() => {
          game()?.send({ type: 'PARTY_ACCEPT', fromId: invite.fromId });
          setInvite(null);
        }}
      >
        Đồng ý
      </button>
      <button type="button" className="frame-action" onClick={() => setInvite(null)}>
        Từ chối
      </button>
    </div>
  );
}

function ActionBar() {
  const ui = useUiStore((s) => s.ui);
  if (!ui?.player) return null;
  return (
    <div className="actionbar">
      {ui.interact && (
        <button
          type="button"
          className="interact"
          onPointerDown={(e) => {
            e.stopPropagation();
            game()?.interact();
          }}
        >
          {ui.interact.label} <kbd>F</kbd>
        </button>
      )}
      <div className="skills">
        {ui.skills.map((s, i) => (
          <SkillButton key={s.skillId} slot={s} index={i} />
        ))}
        {ui.potion && (
          <button
            type="button"
            className={`skill potion ${ui.potion.remaining > 0 ? 'skill-disabled' : ''}`}
            title="Dùng thuốc (Q)"
            onPointerDown={(e) => {
              e.stopPropagation();
              game()?.usePotion();
            }}
          >
            <span className="skill-icon">{ui.potion.icon}</span>
            <span className="skill-count">{ui.potion.count}</span>
            {ui.potion.remaining > 0 && (
              <span className="skill-cd">{Math.ceil(ui.potion.remaining)}</span>
            )}
            <span className="skill-key">Q</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ItemTile({ item, onClick }: { item: ItemView; onClick?: () => void }) {
  return (
    <button
      type="button"
      className={`item ${item.equipped ? 'item-equipped' : ''}`}
      style={{ borderColor: item.rarityColor }}
      onClick={onClick}
      title={`${item.name}\n${item.bonus}${item.level > 1 ? `\nYêu cầu cấp ${item.level}` : ''}${item.description ? `\n${item.description}` : ''}`}
    >
      <span>{item.icon}</span>
      {item.count > 1 && <span className="item-count">{item.count}</span>}
      {item.enhance > 0 && <span className="item-enhance">+{item.enhance}</span>}
    </button>
  );
}

function InventoryPanel() {
  const ui = useUiStore((s) => s.ui);
  const close = useUiStore((s) => s.closePanel);
  const [hover, setHover] = useState<ItemView | null>(null);
  if (!ui) return null;
  const slots = Object.keys(SLOT_LABEL) as EquipSlot[];
  const empty = Math.max(0, ui.inventoryCapacity - ui.inventory.length);
  const act = (item: ItemView) => {
    if (item.kind === 'equipment') {
      if (item.equipped && item.slot) game()?.unequip(item.slot);
      else game()?.equip(item.instanceId);
    } else if (item.kind === 'consumable') game()?.useItem(item.instanceId);
  };
  return (
    <div className="panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <strong>Túi đồ & Trang bị</strong>
        <button type="button" onClick={close}>
          ✕
        </button>
      </div>
      <div className="equip">
        {slots.map((slot) => {
          const item = ui.equipment[slot];
          return (
            <div key={slot} className="equip-slot">
              <span className="equip-label">{SLOT_LABEL[slot]}</span>
              {item ? (
                <ItemTile item={item} onClick={() => game()?.unequip(slot)} />
              ) : (
                <span className="item item-empty" />
              )}
            </div>
          );
        })}
      </div>
      <div className="grid">
        {ui.inventory.map((item) => (
          <span
            key={item.instanceId}
            onPointerEnter={() => setHover(item)}
            onPointerLeave={() => setHover(null)}
          >
            <ItemTile item={item} onClick={() => act(item)} />
          </span>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: empty placeholder cells
          <span key={`e${i}`} className="item item-empty" />
        ))}
      </div>
      <div className="item-detail">
        {hover ? (
          <>
            <strong style={{ color: hover.rarityColor }}>{hover.name}</strong>
            <span>{hover.bonus}</span>
            {hover.level > 1 && <span>Yêu cầu cấp {hover.level}</span>}
          </>
        ) : (
          <span className="muted">Chạm/nhấn vào trang bị để mặc hoặc tháo, vào thuốc để dùng.</span>
        )}
      </div>
    </div>
  );
}

function CharacterPanel() {
  const ui = useUiStore((s) => s.ui);
  const close = useUiStore((s) => s.closePanel);
  const p = ui?.player;
  if (!p) return null;
  return (
    <div className="panel panel-small" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <strong>
          {p.name} · Lv {p.level}
        </strong>
        <button type="button" onClick={close}>
          ✕
        </button>
      </div>
      <dl className="stats">
        <dt>Sinh lực</dt>
        <dd>
          {p.hp} / {p.maxHp}
        </dd>
        <dt>Nội lực</dt>
        <dd>
          {p.mp} / {p.maxMp}
        </dd>
        <dt>Công</dt>
        <dd>{p.stats.attack}</dd>
        <dt>Thủ</dt>
        <dd>{p.stats.defense}</dd>
        <dt>Bạo kích</dt>
        <dd>{(p.stats.critChance * 100).toFixed(0)}%</dd>
        <dt>Tốc độ</dt>
        <dd>{p.stats.speed.toFixed(1)} m/s</dd>
        <dt>Kinh nghiệm</dt>
        <dd>
          {p.xp} / {p.xpToNext || '—'}
        </dd>
      </dl>
    </div>
  );
}

function SettingsPanel() {
  const close = useUiStore((s) => s.closePanel);
  const quality = useUiStore((s) => s.quality);
  const setQuality = useUiStore((s) => s.setQuality);
  const toggleDebug = useUiStore((s) => s.toggleDebug);
  const options: { id: QualityMode; label: string }[] = [
    { id: 'auto', label: 'Tự động' },
    { id: 'low', label: 'Thấp' },
    { id: 'medium', label: 'Trung bình' },
    { id: 'high', label: 'Cao' },
  ];
  return (
    <div className="panel panel-small" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <strong>Cài đặt</strong>
        <button type="button" onClick={close}>
          ✕
        </button>
      </div>
      <div className="setting">
        <span>Chất lượng đồ hoạ</span>
        <div className="segmented">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={quality === o.id ? 'active' : ''}
              onClick={() => {
                setQuality(o.id);
                game()?.setQuality(o.id);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="wide" onClick={toggleDebug}>
        Bật/tắt thông số debug
      </button>
    </div>
  );
}

function Notices() {
  const notices = useUiStore((s) => s.notices);
  const prune = useUiStore((s) => s.pruneNotices);
  useEffect(() => {
    const t = setInterval(() => prune(performance.now()), 300);
    return () => clearInterval(t);
  }, [prune]);
  return (
    <div className="notices">
      {notices.map((n) => (
        <div
          key={n.id}
          className={`notice notice-${n.tone}`}
          style={n.color ? { color: n.color } : undefined}
        >
          {n.text}
        </div>
      ))}
    </div>
  );
}

function DebugOverlay() {
  const debug = useUiStore((s) => s.debug);
  const show = useUiStore((s) => s.showDebug);
  const hostKind = useUiStore((s) => s.hostKind);
  if (!show || !debug) return null;
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  return (
    <div className="debug">
      <div>
        {debug.engine} · {debug.fps} FPS · {debug.quality}
      </div>
      <div>
        tick {debug.tick} · sim {hostKind}
      </div>
      <div>
        entities {debug.entities} · env {debug.envInstances}
      </div>
      <div>
        draw {debug.drawCalls} · meshes {debug.activeMeshes} · chunks {debug.chunks}
      </div>
      {debug.assets.pending > 0 && (
        <div>
          assets {mb(debug.assets.loadedBytes)}/{mb(debug.assets.totalBytes)} MB
        </div>
      )}
    </div>
  );
}

function MenuButtons() {
  const toggle = useUiStore((s) => s.togglePanel);
  return (
    <div className="menu" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" title="Túi đồ (I)" onClick={() => toggle('inventory')}>
        🎒
      </button>
      <button type="button" title="Nhân vật (C)" onClick={() => toggle('character')}>
        👤
      </button>
      {ONLINE && (
        <button type="button" title="Bảng xếp hạng" onClick={() => toggle('leaderboard')}>
          🏆
        </button>
      )}
      {ONLINE && (
        <button type="button" title="Bạn bè & Bang hội" onClick={() => toggle('social')}>
          👥
        </button>
      )}
      <button type="button" title="Cài đặt" onClick={() => toggle('settings')}>
        ⚙
      </button>
    </div>
  );
}

export function Hud() {
  const ui = useUiStore((s) => s.ui);
  const status = useUiStore((s) => s.status);
  const error = useUiStore((s) => s.error);
  const panel = useUiStore((s) => s.panel);

  return (
    <div className="hud">
      {status === 'loading' && <div className="center-note">Đang tải…</div>}
      {status === 'error' && <div className="center-note error">Lỗi: {error}</div>}
      <PlayerPanel />
      <PartyFrames />
      <InvitePrompt />
      {ui?.target && <UnitPanel unit={ui.target} className="frame-target" />}
      {ui?.boss && <UnitPanel unit={ui.boss} className="frame-boss" />}
      {ui?.player && !ui.player.alive && (
        <div className="center-note">Bạn đã gục ngã — đang hồi sinh…</div>
      )}
      <Notices />
      <DebugOverlay />
      <MenuButtons />
      <ActionBar />
      {panel === 'inventory' && <InventoryPanel />}
      {panel === 'character' && <CharacterPanel />}
      {panel === 'settings' && <SettingsPanel />}
      {panel === 'leaderboard' && <LeaderboardPanel />}
      {panel === 'social' && <SocialPanel />}
      <NpcPanel />
      <QuestTracker />
      <ChatBox />
      <div className="help">
        Click: đi/đánh/nhặt/nói chuyện · 1–5: chiêu · Q: thuốc · F: tương tác · Tab: đổi mục tiêu ·
        I: túi đồ · Enter: chat · Chuột phải: xoay
      </div>
    </div>
  );
}
