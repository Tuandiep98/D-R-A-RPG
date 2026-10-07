import type { ItemView, QualityMode, SkillSlot, UnitFrame } from '@rpg/babylon-renderer';
import { type EquipSlot, realmLadder } from '@rpg/game-data';
import { useCallback, useEffect, useState } from 'react';
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
import { elementName } from '../elements';
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
import { HudGlyph, skillGlyph } from './HudGlyph';
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
const elementClass = (skillId: string): string => {
  const element = /^skill_(wood|fire|earth|metal|water|thunder)_/.exec(skillId)?.[1];
  return element ? `skill-element-${element}` : '';
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

/**
 * Top-left: a small avatar slot whose 3D head render pops out over the frame,
 * standing in front of the HP / MP bars. No panel, no name: the character
 * window has the rest.
 */
/**
 * The selected unit, in the player's style: avatar (3D head, or the whole
 * beast) with its tier under it, then its name over the HP bar. Realm stays
 * in the tooltip.
 */
function TargetPanel({ unit }: { unit: UnitFrame }) {
  const portrait = useUiStore((s) => s.ui?.targetPortrait ?? null);
  const tier = unit.tier && unit.tier !== 'normal' ? TIER_LABEL[unit.tier] : null;
  const myId = useUiStore((s) => s.ui?.player?.id);
  const inMyParty = useUiStore((s) => s.ui?.party?.members.some((m) => m.id === unit.id) ?? false);
  const canInvite = unit.kind === 'player' && unit.id !== myId && !inMyParty;
  return (
    <div className="target-hud">
      <div
        className="target-avatar"
        title={unit.realmName ? `${unit.name} · ${unit.realmName}` : unit.name}
      >
        {portrait ? <img src={portrait} alt="" draggable={false} /> : <HudGlyph name="target" />}
        {tier && <span className={`tier tier-${unit.tier}`}>{tier}</span>}
      </div>
      <div className="player-bars">
        <span className="target-name">{unit.name}</span>
        {unit.maxHp > 0 && <Bar value={unit.hp} max={unit.maxHp} tone="enemy" />}
        {unit.cast && (
          <Bar
            value={Math.round(unit.cast.progress * 100)}
            max={100}
            tone="cast"
            label={unit.cast.name}
          />
        )}
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
      </div>
    </div>
  );
}

function PlayerPanel() {
  const p = useUiStore((s) => s.ui?.player);
  const portrait = useUiStore((s) => s.ui?.portrait ?? null);
  if (!p) return null;
  return (
    <div className="player-hud">
      <div className="player-avatar" title={`${p.name} · ${p.cultivation.realmName}`}>
        {portrait ? <img src={portrait} alt="" draggable={false} /> : <HudGlyph name="character" />}
      </div>
      <div className="player-bars">
        <Bar value={p.hp} max={p.maxHp} tone="player" />
        <Bar value={p.mp} max={p.maxMp} tone="mp" />
        {p.cultivation.backlash > 0 && (
          <div className="backlash small">Phản phệ {Math.ceil(p.cultivation.backlash)}s</div>
        )}
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
      className={`skill ${className} ${elementClass(slot.skillId)} ${slot.skillId === 'skill_thunder_judgement' ? 'skill-ultimate' : ''} ${slot.usable ? '' : 'skill-disabled'}`}
      title={`${slot.name}${slot.mpCost ? ` · ${slot.mpCost} MP` : ''}\n${slot.description}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        game()?.castSkillById(slot.skillId);
      }}
    >
      <SkillVisual slot={slot} className="skill-icon" />
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

function SkillVisual({ slot, className = '' }: { slot: SkillSlot; className?: string }) {
  const glyph = skillGlyph(slot.skillId);
  return glyph ? (
    <HudGlyph name={glyph} className={className} />
  ) : (
    <GameIcon className={className} icon={slot.icon} image={slot.iconImage} />
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

/**
 * Names over NPCs' heads and the interact prompt over the nearest
 * interactable (NPC, loot, portal). GameView moves each element every frame
 * through bindOverhead; React only adds / removes them (10 Hz).
 */
function OverheadLayer() {
  const npcs = useUiStore((s) => s.ui?.npcs);
  const interact = useUiStore((s) => s.ui?.interact ?? null);
  const touch = useControls((s) => effectiveScheme(s) === 'touch');
  const anchors = new Map<number, string | null>((npcs ?? []).map((n) => [n.id, n.name]));
  if (interact && !anchors.has(interact.id)) anchors.set(interact.id, null);
  return (
    <div className="overhead-layer">
      {[...anchors].map(([id, name]) => (
        <Overhead
          key={id}
          id={id}
          name={name}
          prompt={interact?.id === id ? interact.verb : null}
          touch={touch}
        />
      ))}
    </div>
  );
}

function Overhead({
  id,
  name,
  prompt,
  touch,
}: {
  id: number;
  name: string | null;
  prompt: string | null;
  touch: boolean;
}) {
  const bind = useCallback((el: HTMLDivElement | null) => game()?.bindOverhead(id, el), [id]);
  return (
    // Hidden until GameView has placed it on its first frame.
    <div
      ref={bind}
      className="overhead"
      data-clamp={prompt ? '' : undefined}
      style={{ visibility: 'hidden' }}
    >
      {prompt && (
        <button
          type="button"
          className="overhead-prompt"
          onPointerDown={(e) => {
            e.stopPropagation();
            game()?.interact();
          }}
        >
          {!touch && <kbd>F</kbd>}
          <span>{prompt}</span>
        </button>
      )}
      {name && <span className="overhead-name">{name}</span>}
    </div>
  );
}

/**
 * Rounds left, sitting on the attack button's bottom edge (D-033). Amber when
 * hot, red when overheated or empty, light blue while reloading.
 */
function AmmoBadge() {
  const r = useUiStore((s) => s.ui?.ranged ?? null);
  if (!r) return null;
  const empty = r.magazine > 0 && r.ammo === 0;
  const state =
    r.overheat > 0
      ? 'over'
      : r.reload !== null
        ? 'reload'
        : empty
          ? 'empty'
          : r.heat > 0.8
            ? 'hot'
            : '';
  return (
    <span className={`ammo-badge ${state}`}>
      {r.overheat > 0
        ? `${r.overheat.toFixed(1)}s`
        : r.magazine > 0
          ? `${r.ammo}/${r.magazine}`
          : '∞'}
    </span>
  );
}

/**
 * Both control schemes share one layout: the big basic attack in the corner
 * (its weapon rendered in 3D, popping out of the frame), skills in two rows
 * running toward it — three on top, the fourth slot plus swap / reload
 * underneath — and the potion above it. Desktop keeps its hotkey labels.
 */
function ActionCluster({ slots, touch }: { slots: (SkillSlot | null)[]; touch: boolean }) {
  const ui = useUiStore((s) => s.ui);
  const gun = useUiStore((s) => !!s.ui?.ranged);
  const canReload = useUiStore((s) => (s.ui?.ranged?.magazine ?? 0) > 0);
  const weapons = useUiStore((s) => s.ui?.weaponCount ?? 0);
  const weaponImage = useUiStore((s) => s.ui?.weaponImage ?? null);
  const positions = touch ? TOUCH_POSITIONS : DESKTOP_POSITIONS;
  const [s1, s2, s3, s4] = positions.map((position, i) => {
    const className = `action-slot action-slot-${i + 1}`;
    const hotkey = touch ? undefined : i + 1;
    const assigned = slots[i];
    return assigned ? (
      <SkillButton key={position} slot={assigned} hotkey={hotkey} className={className} />
    ) : (
      <EmptySkillButton key={position} position={position} hotkey={hotkey} className={className} />
    );
  });
  return (
    <div className="action-cluster">
      <div className="action-rows">
        <button
          type="button"
          className="skill action-farm"
          aria-pressed={ui?.farmEnabled ?? false}
          onPointerDown={(e) => {
            e.stopPropagation();
            game()?.setFarm(!ui?.farmEnabled);
          }}
        >
          {' '}
          {ui?.farmEnabled ? 'Dừng auto' : 'Auto quái'}{' '}
        </button>
        <div className="action-row">
          {s1}
          {s2}
          {s3}
        </div>
        <div className="action-row action-row-mobility">
          {(['roll', 'blink', 'jump'] as const).map((action, i) => {
            const slot = ui?.skills.find((s) => s.skillId === `skill_${action}`);
            return (
              <button
                key={action}
                type="button"
                className="skill"
                title={['Lộn nhào (Shift)', 'Tốc biến (E)', 'Nhảy (V)'][i]}
                disabled={!!slot && !slot.usable}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  game()?.mobility(action);
                }}
              >
                <span>{['Lộn', 'Biến', 'Nhảy'][i]}</span>
                {slot && slot.remaining > 0 && (
                  <span className="cooldown">{Math.ceil(slot.remaining)}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="action-row action-row-utility">
          {s4}
          {weapons > 1 && (
            <button
              type="button"
              className="skill action-swap"
              title="Đổi vũ khí (X)"
              onPointerDown={(e) => {
                e.stopPropagation();
                game()?.swapWeapon();
              }}
            >
              <HudGlyph name="swap" />
              <span className="skill-key">X</span>
            </button>
          )}
          {gun && canReload && (
            <button
              type="button"
              className="skill action-reload"
              title="Nạp đạn (R)"
              onPointerDown={(e) => {
                e.stopPropagation();
                game()?.reload();
              }}
            >
              <HudGlyph name="reload" />
              <span className="skill-key">R</span>
            </button>
          )}
        </div>
      </div>
      <div className="action-main">
        <PotionButton className="action-potion" />
        <button
          type="button"
          className={`attack-button ${gun ? 'attack-gun' : ''}`}
          title={gun ? 'Bắn (giữ để bắn liên tục · Space)' : 'Đánh thường (Space)'}
          onPointerDown={(e) => {
            e.stopPropagation();
            // Keep receiving the release even if the pointer slides off the button.
            e.currentTarget.setPointerCapture(e.pointerId);
            game()?.attackDown();
          }}
          onPointerUp={() => game()?.attackUp()}
          onPointerCancel={() => game()?.attackUp()}
          onLostPointerCapture={() => game()?.attackUp()}
        >
          {weaponImage ? (
            <img className="attack-weapon" src={weaponImage} alt="" draggable={false} />
          ) : (
            <HudGlyph name={gun ? 'gun' : 'blade'} />
          )}
          <AmmoBadge />
        </button>
      </div>
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
  return <ActionCluster slots={slots} touch={touch} />;
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
            <HudGlyph name="target" />
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
              <span>{desktopSlots[i] ? <SkillVisual slot={desktopSlots[i]} /> : '+'}</span>
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
              <span>{touchSlots[i] ? <SkillVisual slot={touchSlots[i]} /> : '+'}</span>
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
            <SkillVisual slot={slot} />
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

function ItemTile({
  item,
  onClick,
  selected = false,
}: {
  item: ItemView;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className={`item ${item.equipped ? 'item-equipped' : ''} ${selected ? 'item-selected' : ''}`}
      style={{ borderColor: item.rarityColor }}
      onClick={onClick}
      aria-pressed={selected}
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const touch = useControls((s) => effectiveScheme(s) === 'touch');
  if (!ui) return null;
  const slots = Object.keys(SLOT_LABEL) as EquipSlot[];
  const empty = Math.max(0, ui.inventoryCapacity - ui.inventory.length);
  // A small preview of empty cells keeps the selected item within reach on phones.
  const visibleEmpty = touch ? Math.min(empty, Math.max(0, 10 - ui.inventory.length)) : empty;
  const selected =
    ui.inventory.find((item) => item.instanceId === selectedId) ??
    Object.values(ui.equipment).find((item) => item?.instanceId === selectedId) ??
    null;
  const detail = touch ? selected : (hover ?? selected);
  const act = (item: ItemView) => {
    if (item.kind === 'equipment') {
      if (item.equipped && item.slot) game()?.unequip(item.slot);
      else game()?.equip(item.instanceId);
    } else if (item.kind === 'consumable') game()?.useItem(item.instanceId);
  };
  return (
    <div className="panel inventory-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <strong>Hành trang</strong>
        <button type="button" aria-label="Đóng hành trang" onClick={close}>
          ✕
        </button>
      </div>
      <div className="inventory-layout">
        <section className="inventory-equipped" aria-label="Trang bị">
          <h3>Trang bị</h3>
          <div className="equip">
            {slots.map((slot) => {
              const item = ui.equipment[slot];
              return (
                <div key={slot} className="equip-slot">
                  <span className="equip-label">{SLOT_LABEL[slot]}</span>
                  {item ? (
                    <ItemTile
                      item={item}
                      selected={selectedId === item.instanceId}
                      onClick={() =>
                        touch ? setSelectedId(item.instanceId) : game()?.unequip(slot)
                      }
                    />
                  ) : (
                    <span className="item item-empty" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <section className="inventory-bag" aria-label="Túi đồ">
          <div className="inventory-bag-head">
            <h3>Túi đồ</h3>
            <span>
              {ui.inventory.length} / {ui.inventoryCapacity}
            </span>
          </div>
          <div className="grid">
            {ui.inventory.map((item) => (
              <span
                key={item.instanceId}
                onPointerEnter={() => setHover(item)}
                onPointerLeave={() => setHover(null)}
              >
                <ItemTile
                  item={item}
                  selected={selectedId === item.instanceId}
                  onClick={() => (touch ? setSelectedId(item.instanceId) : act(item))}
                />
              </span>
            ))}
            {Array.from({ length: visibleEmpty }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: empty placeholder cells
              <span key={`e${i}`} className="item item-empty" />
            ))}
          </div>
        </section>
      </div>
      <div className="item-detail">
        {detail ? (
          <>
            <strong style={{ color: detail.rarityColor }}>{detail.name}</strong>
            <span>{detail.bonus}</span>
            {detail.realmName && <span>Yêu cầu cảnh giới {detail.realmName}</span>}
            {detail.description && <span>{detail.description}</span>}
            {touch && (detail.kind === 'equipment' || detail.kind === 'consumable') && (
              <button type="button" className="inventory-use" onClick={() => act(detail)}>
                {detail.kind === 'consumable'
                  ? 'Sử dụng'
                  : detail.equipped
                    ? 'Tháo ra'
                    : 'Trang bị'}
              </button>
            )}
          </>
        ) : (
          <span className="muted">
            {touch ? 'Chạm vào một món để xem và sử dụng.' : 'Chọn vật phẩm để xem thông tin.'}
          </span>
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
        <dt>Bản mệnh</dt>
        <dd>
          {elementName(ui?.element)}
          {ui?.expression === 'thunder' ? ' · Lôi' : ui?.expression === 'ice' ? ' · Băng' : ''}
        </dd>
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
    <div className="panel settings-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <strong>Cài đặt</strong>
        <button type="button" aria-label="Đóng cài đặt" onClick={close}>
          ✕
        </button>
      </div>
      <section className="settings-group">
        <h3>Hình ảnh</h3>
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
      </section>
      <section className="settings-group">
        <h3>Âm thanh</h3>
        <div className="setting">
          <span>Âm lượng hiệu ứng · {Math.round(sfxVolume * 100)}%</span>
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
      </section>
      <ControlSettings />
      <section className="settings-group">
        <h3>Chơi thử</h3>
        <TestCharacters />
        <button type="button" className="wide" onClick={toggleDebug}>
          Bật/tắt thông số debug
        </button>
      </section>
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
      <label className="element-debug-choice">
        Ngũ hành debug
        <select
          value={params.get('element') ?? 'moc'}
          onChange={(e) => {
            const next = new URLSearchParams(window.location.search);
            next.set('element', e.target.value);
            window.location.search = next.toString();
          }}
        >
          <option value="kim">Kim</option>
          <option value="moc">Mộc / Lôi</option>
          <option value="thuy">Thủy / Băng</option>
          <option value="hoa">Hỏa</option>
          <option value="tho">Thổ</option>
        </select>
      </label>
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
    <section className="settings-group">
      <h3>Điều khiển</h3>
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
    </section>
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
        <HudGlyph name="fullscreen" />
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
  const [open, setOpen] = useState(false);
  if (touch) return null;
  return (
    <div className={`help ${open ? 'help-open' : ''}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? 'Đóng hướng dẫn' : '? Điều khiển'}
      </button>
      {open && (
        <span>
          WASD/↑↓←→: di chuyển · Click trái: đánh/chọn/nhặt/nói chuyện (súng: giữ để bắn) · Space:
          đánh · R: nạp đạn · X: đổi vũ khí · 1–4: chiêu · Q: thuốc · F: tương tác · Tab: đổi mục
          tiêu · I: túi đồ · K: tu luyện · Enter: chat · Chuột phải: xoay
        </span>
      )}
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

/** "Location discovered" banner, shown briefly whenever the map/zone name changes. */
function ZoneBanner() {
  const mapName = useUiStore((s) => s.ui?.mapName);
  const zoneName = useUiStore((s) => s.ui?.zoneName);
  const [shown, setShown] = useState<{ title: string; sub: string } | null>(null);
  useEffect(() => {
    if (!mapName) return;
    setShown(
      zoneName && zoneName !== mapName
        ? { title: zoneName, sub: mapName }
        : { title: mapName, sub: 'Tiến vào' },
    );
    const t = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(t);
  }, [mapName, zoneName]);
  if (!shown) return null;
  return (
    <div className="zone-banner" role="status" key={shown.title}>
      <small>{shown.sub}</small>
      <strong>{shown.title}</strong>
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
  const touch = useControls((s) => effectiveScheme(s) === 'touch');
  const [open, setOpen] = useState(false);
  const show = (panel: Parameters<typeof toggle>[0]) => {
    toggle(panel);
    setOpen(false);
  };
  return (
    <nav
      className={`menu ${open ? 'menu-open' : ''}`}
      aria-label="Menu trò chơi"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {touch && (
        <button
          type="button"
          className="menu-trigger"
          title="Mở menu"
          aria-label={open ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <HudGlyph name={open ? 'close' : 'menu'} />
        </button>
      )}
      <div className="menu-items">
        <button type="button" title="Kỹ năng" aria-label="Kỹ năng" onClick={() => show('skills')}>
          <HudGlyph name="skills" />
        </button>
        <button
          type="button"
          title="Túi đồ (I)"
          aria-label="Túi đồ"
          onClick={() => show('inventory')}
        >
          <HudGlyph name="pack" />
        </button>
        <button
          type="button"
          title="Nhân vật (C)"
          aria-label="Nhân vật"
          onClick={() => show('character')}
        >
          <HudGlyph name="character" />
        </button>
        <button
          type="button"
          title="Tu luyện & Đột phá (K)"
          aria-label="Tu luyện"
          onClick={() => show('cultivation')}
        >
          <HudGlyph name="cultivation" />
        </button>
        {ONLINE && (
          <button
            type="button"
            title="Bảng xếp hạng"
            aria-label="Bảng xếp hạng"
            onClick={() => show('leaderboard')}
          >
            <HudGlyph name="ranking" />
          </button>
        )}
        {ONLINE && (
          <button
            type="button"
            title="Bạn bè & Bang hội"
            aria-label="Bạn bè và bang hội"
            onClick={() => show('social')}
          >
            <HudGlyph name="social" />
          </button>
        )}
        <FullscreenButton />
        <button type="button" title="Cài đặt" aria-label="Cài đặt" onClick={() => show('settings')}>
          <HudGlyph name="settings" />
        </button>
      </div>
    </nav>
  );
}

export function Hud() {
  const ui = useUiStore((s) => s.ui);
  const status = useUiStore((s) => s.status);
  const error = useUiStore((s) => s.error);
  const panel = useUiStore((s) => s.panel);
  const npc = useUiStore((s) => s.npc);
  const quality = useUiStore((s) => s.quality);

  return (
    <div className="hud" data-quality={quality}>
      {status === 'loading' && <div className="center-note">Đang tải…</div>}
      {status === 'error' && <div className="center-note error">Lỗi: {error}</div>}
      <OverheadLayer />
      <PlayerPanel />
      <PartyFrames />
      <InvitePrompt />
      {ui?.target && <TargetPanel unit={ui.target} />}
      {ui?.boss && <UnitPanel unit={ui.boss} className="frame-boss" />}
      {ui?.player && !ui.player.alive && (
        <div className="center-note">Bạn đã gục ngã — đang hồi sinh…</div>
      )}
      <Notices />
      <ZoneBanner />
      <DebugOverlay />
      <TouchJoystick />
      <MenuButtons />
      <ActionBar />
      {(panel || npc) && <div className="panel-backdrop" aria-hidden="true" />}
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
