import type { ItemView, QualityMode, SkillSlot, UnitFrame } from '@rpg/babylon-renderer';
import { type EquipSlot, realmLadder } from '@rpg/game-data';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSfxVolume, playSfx, setSfxVolume } from '../audio';
import { sharedContent } from '../content';
import {
  type ControlScheme,
  effectiveScheme,
  fullscreenSupported,
  isFullscreen,
  isStandalone,
  type JoystickSize,
  onFullscreenChange,
  toggleFullscreen,
  useControls,
} from '../controls';
import { game } from '../game';
import {
  allowedInPosition,
  DESKTOP_POSITIONS,
  resolveLoadout,
  type SkillPosition,
  TOUCH_POSITIONS,
  useSkillLoadout,
} from '../skill-loadout';
import { useUiStore } from '../store';
import { CultivationPanel } from './CultivationPanel';
import { GameIcon } from './GameIcon';
import { NpcPanel } from './NpcPanel';
import { ChatBox, LeaderboardPanel, QuestTracker } from './Social';
import { SocialPanel } from './SocialPanel';
import { TouchJoystick } from './TouchControls';

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

const realmNameOf = (rank: number): string => realmLadder(sharedContent())[rank]?.name ?? '';

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
        {unit.realmName && <span className="frame-level">{unit.realmName}</span>}
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
        <span className="frame-level" title={p.cultivation.mechName}>
          {p.cultivation.realmName}
        </span>
      </div>
      <Bar value={p.hp} max={p.maxHp} tone="player" />
      <Bar value={p.mp} max={p.maxMp} tone="mp" />
      {p.cultivation.backlash > 0 && (
        <div className="backlash small">Phản phệ {Math.ceil(p.cultivation.backlash)}s</div>
      )}
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

function SkillButton({
  slot,
  hotkey,
  className = '',
}: {
  slot: SkillSlot;
  hotkey?: number;
  className?: string;
}) {
  const sweep = slot.remaining > 0 ? Math.min(1, slot.remaining / slot.cooldown) : 0;
  return (
    <button
      type="button"
      className={`skill ${className} ${slot.skillId.startsWith('skill_thunder_') ? 'skill-thunder' : ''} ${slot.skillId === 'skill_thunder_judgement' ? 'skill-ultimate' : ''} ${slot.usable ? '' : 'skill-disabled'}`}
      title={`${slot.name}${slot.mpCost ? ` · ${slot.mpCost} MP` : ''}\n${slot.description}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        game()?.castSkillById(slot.skillId);
      }}
    >
      <GameIcon className="skill-icon" icon={slot.icon} image={slot.iconImage} />
      {sweep > 0 && (
        <span
          className="skill-cd"
          style={{
            background: `conic-gradient(rgba(0,0,0,.65) ${sweep * 360}deg, transparent 0)`,
          }}
        >
          {Math.ceil(slot.remaining)}
        </span>
      )}
      {hotkey && <span className="skill-key">{hotkey}</span>}
    </button>
  );
}

function EmptySkillButton({
  position,
  className = '',
  hotkey,
}: {
  position: SkillPosition;
  className?: string;
  hotkey?: number;
}) {
  const open = useUiStore((s) => s.openSkillAssignment);
  return (
    <button
      type="button"
      className={`skill skill-empty ${className}`}
      title="Gán kỹ năng"
      onPointerDown={(e) => {
        e.stopPropagation();
        open(position);
      }}
      data-position={position}
    >
      +{hotkey && <span className="skill-key">{hotkey}</span>}
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
              {m.name} · {realmNameOf(m.realm)}
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

function PotionButton({ className = '' }: { className?: string }) {
  const potion = useUiStore((s) => s.ui?.potion);
  if (!potion) return null;
  return (
    <button
      type="button"
      className={`skill potion ${className} ${potion.remaining > 0 ? 'skill-disabled' : ''}`}
      title="Dùng thuốc (Q)"
      onPointerDown={(e) => {
        e.stopPropagation();
        game()?.usePotion();
      }}
    >
      <GameIcon className="skill-icon" icon={potion.icon} image={potion.iconImage} />
      <span className="skill-count">{potion.count}</span>
      {potion.remaining > 0 && <span className="skill-cd">{Math.ceil(potion.remaining)}</span>}
      <span className="skill-key">Q</span>
    </button>
  );
}

function InteractButton() {
  const interact = useUiStore((s) => s.ui?.interact);
  if (!interact) return null;
  return (
    <button
      type="button"
      className="interact"
      onPointerDown={(e) => {
        e.stopPropagation();
        game()?.interact();
      }}
    >
      {interact.label} <kbd>F</kbd>
    </button>
  );
}

const FIRE_MODE_LABEL = { auto: 'Liên thanh', semi: 'Bán tự động', burst: 'Loạt' } as const;

/**
 * Equipped gun (D-033): rounds left, fire mode, heat (amber → red), the
 * overheat cool-down and reload progress. Only shown with a ranged weapon.
 */
function AmmoPanel({ touch }: { touch: boolean }) {
  const r = useUiStore((s) => s.ui?.ranged ?? null);
  const weapons = useUiStore((s) => s.ui?.weaponCount ?? 0);
  if (!r) return null;
  const empty = r.magazine > 0 && r.ammo === 0;
  const status =
    r.overheat > 0
      ? `Quá tải ${r.overheat.toFixed(1)}s`
      : r.reload !== null
        ? 'Đang nạp đạn…'
        : empty
          ? 'Hết đạn — R để nạp'
          : FIRE_MODE_LABEL[r.fireMode];
  const bar =
    r.overheat > 0 ? (
      <div className="ammo-bar ammo-overheat" style={{ width: `${r.heat * 100}%` }} />
    ) : r.reload !== null ? (
      <div className="ammo-bar ammo-reload" style={{ width: `${r.reload * 100}%` }} />
    ) : (
      <div
        className={`ammo-bar ammo-heat ${r.heat > 0.8 ? 'hot' : ''}`}
        style={{ width: `${r.heat * 100}%` }}
      />
    );
  return (
    <div className={`ammo ${touch ? 'ammo-touch' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ammo-head">
        <span className="ammo-name">{r.name}</span>
        <span className={`ammo-count ${empty ? 'ammo-empty' : ''}`}>
          {r.magazine > 0 ? (
            <>
              <b>{r.ammo}</b>/{r.magazine}
            </>
          ) : (
            '∞'
          )}
        </span>
      </div>
      <div className="ammo-track">{bar}</div>
      <div className="ammo-foot">
        <span className={r.overheat > 0 ? 'ammo-warn' : ''}>{status}</span>
        {!touch && (
          <span className="ammo-keys">
            {r.magazine > 0 && (
              <button
                type="button"
                className="ammo-key"
                title="Nạp đạn (R)"
                onClick={() => game()?.reload()}
              >
                R
              </button>
            )}
            {weapons > 1 && (
              <button
                type="button"
                className="ammo-key"
                title="Đổi vũ khí (X)"
                onClick={() => game()?.swapWeapon()}
              >
                X
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** Desktop: four equal, assignable slots centred at the bottom. */
function DesktopActionBar({ slots }: { slots: (SkillSlot | null)[] }) {
  return (
    <div className="actionbar">
      <AmmoPanel touch={false} />
      <InteractButton />
      <div className="skills">
        {DESKTOP_POSITIONS.map((position, i) =>
          slots[i] ? (
            <SkillButton key={position} slot={slots[i]} hotkey={i + 1} />
          ) : (
            <EmptySkillButton key={position} position={position} hotkey={i + 1} />
          ),
        )}
      </div>
      <PotionButton className="desktop-potion" />
    </div>
  );
}

/**
 * Touch: three equal primary skills around the large basic attack, with a
 * smaller mobility/defense slot below them.
 */
function TouchActionBar({ slots }: { slots: (SkillSlot | null)[] }) {
  const gun = useUiStore((s) => !!s.ui?.ranged);
  const canReload = useUiStore((s) => (s.ui?.ranged?.magazine ?? 0) > 0);
  const weapons = useUiStore((s) => s.ui?.weaponCount ?? 0);
  return (
    <div className="touch-actions">
      <div className="touch-interact">
        <InteractButton />
      </div>
      <AmmoPanel touch />
      <button
        type="button"
        className={`attack-button ${gun ? 'attack-gun' : ''}`}
        title={gun ? 'Bắn (giữ để bắn liên tục)' : 'Đánh thường'}
        onPointerDown={(e) => {
          e.stopPropagation();
          // Keep receiving the release even if the thumb slides off the button.
          e.currentTarget.setPointerCapture(e.pointerId);
          game()?.attackDown();
        }}
        onPointerUp={() => game()?.attackUp()}
        onPointerCancel={() => game()?.attackUp()}
        onLostPointerCapture={() => game()?.attackUp()}
      >
        {gun ? '🎯' : '⚔'}
      </button>
      {gun && canReload && (
        <button
          type="button"
          className="skill touch-reload"
          title="Nạp đạn"
          onPointerDown={(e) => {
            e.stopPropagation();
            game()?.reload();
          }}
        >
          ⟳
        </button>
      )}
      {weapons > 1 && (
        <button
          type="button"
          className="skill touch-swap"
          title="Đổi vũ khí"
          onPointerDown={(e) => {
            e.stopPropagation();
            game()?.swapWeapon();
          }}
        >
          ⇄
        </button>
      )}
      {TOUCH_POSITIONS.map((position, i) =>
        slots[i] ? (
          <SkillButton
            key={position}
            slot={slots[i]}
            className={`touch-slot touch-slot-${i + 1}`}
          />
        ) : (
          <EmptySkillButton
            key={position}
            position={position}
            className={`touch-slot touch-slot-${i + 1}`}
          />
        ),
      )}
      <PotionButton className="touch-potion" />
    </div>
  );
}

function ActionBar() {
  const ui = useUiStore((s) => s.ui);
  const assignments = useSkillLoadout((s) => s.assignments);
  const touch = useControls((s) => effectiveScheme(s) === 'touch');
  const slots = resolveLoadout(ui?.skills ?? [], assignments, touch ? 'touch' : 'desktop');
  const bindingKey = slots.map((slot) => slot?.skillId ?? '').join('|');
  const currentGame = game();
  useEffect(() => {
    currentGame?.setSkillBindings(bindingKey.split('|').map((id) => id || null));
  }, [bindingKey, currentGame]);
  if (!ui?.player) return null;
  return touch ? <TouchActionBar slots={slots} /> : <DesktopActionBar slots={slots} />;
}

function SkillPanel() {
  const skills = useUiStore((s) => s.ui?.skills ?? []);
  const close = useUiStore((s) => s.closePanel);
  const touch = useControls((s) => effectiveScheme(s) === 'touch');
  const assignments = useSkillLoadout((s) => s.assignments);
  const assign = useSkillLoadout((s) => s.assign);
  const editedPosition = useUiStore((s) => s.skillEditPosition);
  const setPosition = useUiStore((s) => s.setSkillEditPosition);
  const position = editedPosition ?? (touch ? 'touch-1' : 'desktop-1');
  const desktopSlots = resolveLoadout(skills, assignments, 'desktop');
  const touchSlots = resolveLoadout(skills, assignments, 'touch');
  const activeSlot = position.startsWith('desktop-')
    ? desktopSlots[DESKTOP_POSITIONS.indexOf(position)]
    : touchSlots[TOUCH_POSITIONS.indexOf(position)];
  const eligible = skills.filter((slot) => allowedInPosition(slot, position));
  return (
    <div className="panel skill-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <strong>Kỹ năng</strong>
        <span className="skill-panel-actions">
          <button type="button" title="Đổi mục tiêu" onClick={() => game()?.targetNext()}>
            ◎
          </button>
          <button type="button" onClick={close}>
            ✕
          </button>
        </span>
      </div>
      <p className="muted">
        Chọn một ô, rồi chọn kỹ năng để gán. Phím 1–4 dùng bốn ô đang hiển thị.
      </p>
      <div className="loadout-group">
        <strong>Desktop · 4 ô bằng nhau</strong>
        <div className="loadout-slots">
          {DESKTOP_POSITIONS.map((id, i) => (
            <button
              key={id}
              type="button"
              className={`loadout-slot ${position === id ? 'selected' : ''}`}
              onClick={() => setPosition(id)}
              aria-pressed={position === id}
            >
              <span>{i + 1}</span>
              <span>{desktopSlots[i]?.icon ?? '+'}</span>
              <small>{desktopSlots[i]?.name ?? 'Trống'}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="loadout-group">
        <strong>Mobile · 3 chính + 1 lướt/khiên</strong>
        <div className="loadout-slots">
          {TOUCH_POSITIONS.map((id, i) => (
            <button
              key={id}
              type="button"
              className={`loadout-slot ${position === id ? 'selected' : ''}`}
              onClick={() => setPosition(id)}
              aria-pressed={position === id}
            >
              <span>{i === 3 ? '↯' : i + 1}</span>
              <span>{touchSlots[i]?.icon ?? '+'}</span>
              <small>{touchSlots[i]?.name ?? 'Trống'}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="skill-assign-heading">
        <strong>
          {position === 'touch-utility' ? 'Chọn kỹ năng lướt / khiên' : 'Chọn kỹ năng'}
        </strong>
        <button type="button" onClick={() => assign(position, null)}>
          Để trống
        </button>
      </div>
      <div className="skill-list">
        {eligible.map((slot) => (
          <div key={slot.skillId} className="skill-list-item">
            <GameIcon icon={slot.icon} image={slot.iconImage} />
            <span className="skill-list-copy">
              <strong>{slot.name}</strong>
              <small>{slot.description}</small>
            </span>
            <span className="skill-list-cost">{slot.mpCost} MP</span>
            <button
              type="button"
              className="skill-assign"
              onClick={() => assign(position, slot.skillId)}
            >
              {activeSlot?.skillId === slot.skillId ? 'Đang dùng' : 'Gán'}
            </button>
          </div>
        ))}
        {eligible.length === 0 && <p>Chưa có kỹ năng phù hợp với ô này.</p>}
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
      title={`${item.name}\n${item.bonus}${item.realmName ? `\nYêu cầu ${item.realmName}` : ''}${item.description ? `\n${item.description}` : ''}`}
    >
      <GameIcon icon={item.icon} image={item.iconImage} />
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
            {hover.realmName && <span>Yêu cầu cảnh giới {hover.realmName}</span>}
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
          {p.name} · {p.cultivation.realmName}
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
        <dt>Cảnh giới</dt>
        <dd>
          {p.cultivation.realmName} · {p.cultivation.mechName}
        </dd>
        <dt>Kinh mạch tải</dt>
        <dd>
          {p.cultivation.meridianLoad} / {p.cultivation.meridianCapacity}
        </dd>
        <dt>Body load</dt>
        <dd>
          {p.cultivation.bodyLoad} / {p.cultivation.bodyCapacity}
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
  const [sfxVolume, setSfxVolumeState] = useState(getSfxVolume);
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
      <div className="setting">
        <span>Âm lượng hiệu ứng</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sfxVolume}
          onChange={(e) => {
            setSfxVolumeState(Number(e.target.value));
            setSfxVolume(Number(e.target.value));
          }}
          onPointerUp={() => playSfx('sfx_hit_metal_01')}
        />
      </div>
      <ControlSettings />
      <TestCharacters />
      <button type="button" className="wide" onClick={toggleDebug}>
        Bật/tắt thông số debug
      </button>
    </div>
  );
}

/**
 * Offline test characters (D-033): reloads the page with `?char=<id>` — the
 * local sim spawns that character. Online characters come from the server.
 */
function TestCharacters() {
  if (ONLINE) return null;
  const params = new URLSearchParams(window.location.search);
  const current = params.get('char') ?? 'player_default';
  const characters = [...sharedContent().characters.values()];
  if (characters.length < 2) return null;
  return (
    <div className="setting">
      <span>
        Thử nghiệm <span className="muted">(offline, tải lại trang)</span>
      </span>
      <div className="segmented">
        {characters.map((c) => (
          <button
            key={c.id}
            type="button"
            className={current === c.id ? 'active' : ''}
            onClick={() => {
              const next = new URLSearchParams(window.location.search);
              if (c.id === 'player_default') next.delete('char');
              else next.set('char', c.id);
              window.location.search = next.toString();
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={value === o.id ? 'active' : ''}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SCHEMES: readonly { id: ControlScheme; label: string }[] = [
  { id: 'auto', label: 'Tự động' },
  { id: 'desktop', label: 'Phím + chuột' },
  { id: 'touch', label: 'Cảm ứng' },
];
const SIZES: readonly { id: JoystickSize; label: string }[] = [
  { id: 'small', label: 'Nhỏ' },
  { id: 'medium', label: 'Vừa' },
  { id: 'large', label: 'Lớn' },
];

function ControlSettings() {
  const c = useControls();
  const scheme = effectiveScheme(c);
  const [full, setFull] = useState(isFullscreen);
  useEffect(() => onFullscreenChange(() => setFull(isFullscreen())), []);
  return (
    <>
      <div className="setting">
        <span>
          Điều khiển{' '}
          {c.scheme === 'auto' && (
            <span className="muted">({scheme === 'touch' ? 'cảm ứng' : 'phím + chuột'})</span>
          )}
        </span>
        <Segmented value={c.scheme} options={SCHEMES} onChange={(v) => c.set({ scheme: v })} />
      </div>
      {scheme === 'touch' && (
        <>
          <div className="setting">
            <span>Joystick</span>
            <Segmented
              value={c.joystickMode}
              options={[
                { id: 'floating', label: 'Nổi (theo ngón tay)' },
                { id: 'fixed', label: 'Cố định' },
              ]}
              onChange={(v) => c.set({ joystickMode: v })}
            />
          </div>
          <div className="setting">
            <span>Joystick ở bên</span>
            <Segmented
              value={c.joystickSide}
              options={[
                { id: 'left', label: 'Trái' },
                { id: 'right', label: 'Phải' },
              ]}
              onChange={(v) => c.set({ joystickSide: v })}
            />
          </div>
          <div className="setting">
            <span>Cỡ joystick</span>
            <Segmented
              value={c.joystickSize}
              options={SIZES}
              onChange={(v) => c.set({ joystickSize: v })}
            />
          </div>
        </>
      )}
      <div className="setting">
        <span>Toàn màn hình</span>
        {fullscreenSupported() ? (
          <>
            <button type="button" className="wide" onClick={() => void toggleFullscreen()}>
              {full ? 'Thoát toàn màn hình' : 'Vào toàn màn hình'}
            </button>
            <label className="check">
              <input
                type="checkbox"
                checked={c.autoFullscreen}
                onChange={(e) => c.set({ autoFullscreen: e.target.checked })}
              />
              Tự bật khi chạm màn hình (điện thoại)
            </label>
          </>
        ) : (
          <span className="muted">
            {isStandalone()
              ? 'Đang chạy dạng ứng dụng (đã toàn màn hình).'
              : 'Trình duyệt không hỗ trợ — dùng “Thêm vào Màn hình chính” để chơi toàn màn hình.'}
          </span>
        )}
      </div>
    </>
  );
}

/**
 * Fullscreen toggle. Always offered on touch screens: where the browser has no
 * Fullscreen API (iPhone Safari) it explains "Add to Home Screen" instead.
 * Hidden when running as the installed app, which is already fullscreen.
 */
function FullscreenButton() {
  const touch = useControls((s) => effectiveScheme(s) === 'touch');
  const [full, setFull] = useState(isFullscreen);
  const [hint, setHint] = useState(false);
  useEffect(() => onFullscreenChange(() => setFull(isFullscreen())), []);
  const supported = fullscreenSupported();
  if (isStandalone() || (!supported && !touch)) return null;
  return (
    <>
      <button
        type="button"
        className="fullscreen-button"
        title={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
        onClick={() => (supported ? void toggleFullscreen() : setHint((h) => !h))}
      >
        {full ? '🗗' : '⛶'}
      </button>
      {hint &&
        // Outside the menu so its button layout (a row of icons on phones) does not squeeze it.
        createPortal(
          <button type="button" className="fullscreen-hint" onClick={() => setHint(false)}>
            <b>Chơi toàn màn hình</b>
            <span>
              Trình duyệt này (Safari trên iPhone) không cho trang web tự vào toàn màn hình. Bấm nút
              Chia sẻ → <b>Thêm vào Màn hình chính</b>, rồi mở game từ biểu tượng đó.
            </span>
            <span className="muted">Chạm để đóng</span>
          </button>,
          document.body,
        )}
    </>
  );
}

function HelpLine() {
  const touch = useControls((s) => effectiveScheme(s) === 'touch');
  if (touch) return null;
  return (
    <div className="help">
      WASD/↑↓←→: di chuyển · Click trái: đánh/chọn/nhặt/nói chuyện (súng: giữ để bắn theo chuột) ·
      Space: đánh · R: nạp đạn · X: đổi vũ khí · 1–4: chiêu · Q: thuốc · F: tương tác · Tab: đổi mục
      tiêu · I: túi đồ · K: tu luyện · Enter: chat · Chuột phải: xoay
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
      <button type="button" title="Kỹ năng" onClick={() => toggle('skills')}>
        ⚡
      </button>
      <button type="button" title="Túi đồ (I)" onClick={() => toggle('inventory')}>
        🎒
      </button>
      <button type="button" title="Nhân vật (C)" onClick={() => toggle('character')}>
        👤
      </button>
      <button type="button" title="Tu luyện & Đột phá (K)" onClick={() => toggle('cultivation')}>
        ☯
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
      <FullscreenButton />
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
      <TouchJoystick />
      <MenuButtons />
      <ActionBar />
      {panel === 'inventory' && <InventoryPanel />}
      {panel === 'skills' && <SkillPanel />}
      {panel === 'character' && <CharacterPanel />}
      {panel === 'cultivation' && <CultivationPanel />}
      {panel === 'settings' && <SettingsPanel />}
      {panel === 'leaderboard' && <LeaderboardPanel />}
      {panel === 'social' && <SocialPanel />}
      <NpcPanel />
      <QuestTracker />
      <ChatBox />
      <HelpLine />
    </div>
  );
}
