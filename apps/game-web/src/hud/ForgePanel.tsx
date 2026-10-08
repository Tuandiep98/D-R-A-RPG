import type { ItemView, UiState } from '@rpg/babylon-renderer';
import {
  type ContentBundle,
  type ForgeCost,
  type ForgeQuality,
  forgeRules,
  QUALITY_ORDER,
  qualityRank,
} from '@rpg/game-data';
import type { Intent } from '@rpg/game-protocol';
import { useState } from 'react';
import { GameIcon } from './GameIcon';

/**
 * Tiệm Rèn (docs/plan/06_forge_equipment_plan.md). Display + intents only:
 * costs and rates shown here come from game-data; the server re-checks and
 * rolls every attempt (CLAUDE.md rule 3).
 */

type ForgeOp = Extract<Intent, { type: 'FORGE' }>['op'];
type Send = ((intent: Intent) => void) | undefined;

const OPS: { id: ForgeOp; label: string }[] = [
  { id: 'enhance', label: 'Cường hoá' },
  { id: 'evolve', label: 'Tiến hoá' },
  { id: 'socket', label: 'Khảm' },
  { id: 'rite', label: 'Luyện khí' },
  { id: 'synthesize', label: 'Hợp thành' },
  { id: 'repair', label: 'Sửa chữa' },
];

const GROUP_LABEL: Record<string, string> = {
  attune: 'Linh tính',
  engrave: 'Khắc văn',
  bind: 'Khế ước',
  absorb: 'Hấp thụ',
  ascend: 'Bản Mệnh',
};

const SOCKET_LABEL: Record<string, string> = {
  combat: 'Module chiến đấu',
  defense: 'Module phòng thủ',
  ammo: 'Chip đầu đạn',
  spirit: 'Linh châu',
  rune: 'Trận văn',
};

const count = (ui: UiState, itemId: string) =>
  ui.inventory.filter((i) => i.itemId === itemId).reduce((n, i) => n + i.count, 0);

function canPay(ui: UiState, cost: ForgeCost): boolean {
  return (
    (ui.player?.gold ?? 0) >= cost.gold &&
    cost.materials.every((m) => count(ui, m.itemId) >= m.count)
  );
}

function Cost({
  c,
  ui,
  cost,
  rate,
}: {
  c: ContentBundle;
  ui: UiState;
  cost: ForgeCost;
  rate?: number;
}) {
  const gold = ui.player?.gold ?? 0;
  return (
    <div className="small forge-cost">
      {cost.gold > 0 && <span className={gold < cost.gold ? 'missing' : ''}>{cost.gold} 🪙</span>}
      {cost.materials.map((m) => {
        const have = count(ui, m.itemId);
        return (
          <span key={m.itemId} className={have < m.count ? 'missing' : ''}>
            {c.items.get(m.itemId)?.name ?? m.itemId} {have}/{m.count}
          </span>
        );
      })}
      {rate !== undefined && <span>Tỉ lệ {Math.round(rate * 100)}%</span>}
    </div>
  );
}

/** Which socket items an item can take (server repeats the check). */
function fits(c: ContentBundle, item: ItemView, gem: ItemView): boolean {
  const def = c.items.get(item.itemId);
  const socket = c.items.get(gem.itemId)?.socket;
  if (!def || !socket || !item.forge) return false;
  if (qualityRank(item.forge.quality as ForgeQuality) < qualityRank(socket.minQuality))
    return false;
  if (socket.type === 'combat') return def.slot === 'main_hand' && !def.ranged;
  if (socket.type === 'ammo') return def.slot === 'main_hand' && !!def.ranged;
  if (socket.type === 'defense') return def.slot !== 'main_hand' && def.slot !== 'artifact';
  return true;
}

export function Forge({
  c,
  ui,
  npcEntityId,
  send,
}: {
  c: ContentBundle;
  ui: UiState;
  npcEntityId: number;
  send: Send;
}) {
  const gear = ui.inventory.filter((i) => i.kind === 'equipment' && i.forge);
  const [selected, setSelected] = useState<string | null>(null);
  const [op, setOp] = useState<ForgeOp>('enhance');
  const item = gear.find((i) => i.instanceId === selected) ?? gear[0];
  const rules = forgeRules(c);
  if (!rules) return null;
  if (!item?.forge) return <span className="muted small">Không có trang bị để rèn</span>;
  const forge = (extra: Partial<Extract<Intent, { type: 'FORGE' }>>) =>
    send?.({
      type: 'FORGE',
      npcId: npcEntityId,
      op,
      instanceId: item.instanceId,
      ...extra,
    });

  return (
    <div className="forge">
      <div className="forge-items" role="listbox" aria-label="Trang bị">
        {gear.map((g) => (
          <button
            key={g.instanceId}
            type="button"
            role="option"
            aria-selected={g.instanceId === item.instanceId}
            className={`forge-slot ${g.instanceId === item.instanceId ? 'selected' : ''}`}
            style={{ '--quality': g.rarityColor } as React.CSSProperties}
            title={g.name}
            onClick={() => setSelected(g.instanceId)}
          >
            <GameIcon icon={g.icon} image={g.iconImage} />
            {g.enhance > 0 && <span className="forge-plus">+{g.enhance}</span>}
            {g.equipped && <span className="forge-worn">E</span>}
          </button>
        ))}
      </div>
      <ItemSummary item={item} />
      <div className="segmented forge-ops">
        {OPS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={op === o.id ? 'active' : ''}
            onClick={() => setOp(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="npc-list">
        {op === 'enhance' && <Enhance c={c} ui={ui} item={item} forge={forge} />}
        {op === 'evolve' && <Evolve c={c} ui={ui} item={item} forge={forge} />}
        {op === 'socket' && (
          <Sockets c={c} ui={ui} item={item} npcEntityId={npcEntityId} send={send} />
        )}
        {op === 'rite' && <Rites c={c} ui={ui} item={item} forge={forge} />}
        {op === 'synthesize' && <Synthesis c={c} ui={ui} item={item} forge={forge} />}
        {op === 'repair' && <Repair c={c} ui={ui} item={item} forge={forge} />}
      </div>
    </div>
  );
}

function ItemSummary({ item }: { item: ItemView }) {
  const f = item.forge;
  if (!f) return null;
  const durability = f.maxDurability > 0 ? f.durability / f.maxDurability : 1;
  return (
    <div className="forge-summary">
      <div>
        <strong style={{ color: item.rarityColor }}>
          {item.name} {item.enhance > 0 && `+${item.enhance}`}
        </strong>
        <span className="muted small">
          {' '}
          · {f.qualityName}
          {f.tier && ` · ${f.tier}`}
          {f.stages > 0 && ` · Tiến hoá ${f.stage}/${f.stages}`}
        </span>
      </div>
      <div className="forge-badges small">
        {f.natal && <span className="forge-badge natal">Bản Mệnh</span>}
        {f.hybrid && <span className="forge-badge hybrid">Thiên Cơ cộng hưởng</span>}
        {f.bound && <span className="forge-badge">Đã khoá</span>}
      </div>
      <div className="small">{item.bonus}</div>
      {f.hidden.length > 0 && (
        <div className="small forge-hidden">
          {f.hidden.map((h) => (
            <span key={h.unlockAt} className={h.active ? 'reward' : 'muted'}>
              {h.active ? `Ẩn: ${h.text}` : `Ẩn: ??? (cường hoá +${h.unlockAt})`}
            </span>
          ))}
        </div>
      )}
      <div className="forge-durability small" title="Độ bền">
        <span>
          Độ bền {f.durability}/{f.maxDurability}
          {f.durability <= 0 && ' — hỏng, chỉ còn 50% chỉ số'}
        </span>
        <div className="forge-bar">
          <div style={{ width: `${Math.round(durability * 100)}%` }} />
        </div>
      </div>
      {f.rites.length > 0 && (
        <div className="small muted">
          Nghi thức: {f.rites.map((r) => `${r.name}${r.line === 'tien' ? ' ☯' : ' ⚙'}`).join(', ')}
        </div>
      )}
    </div>
  );
}

type ForgeFn = (extra: Partial<Extract<Intent, { type: 'FORGE' }>>) => void;
interface OpProps {
  c: ContentBundle;
  ui: UiState;
  item: ItemView;
  forge: ForgeFn;
}

function Enhance({ c, ui, item, forge }: OpProps) {
  const rules = forgeRules(c);
  const [ward, setWard] = useState(true);
  const f = item.forge;
  if (!rules || !f) return null;
  const cap = rules.qualities[f.quality as ForgeQuality].maxEnhance;
  const step = rules.enhance.steps[item.enhance];
  if (!step || item.enhance >= cap)
    return (
      <span className="muted small">
        Đã tới trần +{cap} của phẩm {f.qualityName}. Hợp thành để nâng trần.
      </span>
    );
  const risky = item.enhance > rules.enhance.safeLevel;
  const wards = rules.enhance.wardItemId ? count(ui, rules.enhance.wardItemId) : 0;
  return (
    <div className="npc-row">
      <div>
        <div>
          +{item.enhance} → <strong>+{item.enhance + 1}</strong>{' '}
          <span className="muted small">
            (trần +{cap}, mỗi cấp +{rules.enhance.bonusPerLevel * 100}% chỉ số thường)
          </span>
        </div>
        <Cost c={c} ui={ui} cost={step} rate={step.successRate} />
        {risky && (
          <label className="small forge-check">
            <input type="checkbox" checked={ward} onChange={(e) => setWard(e.target.checked)} />{' '}
            Dùng Hộ Phù khi thất bại (còn {wards}) — không dùng sẽ tụt 1 cấp
          </label>
        )}
      </div>
      <button
        type="button"
        className="primary"
        disabled={!canPay(ui, step)}
        onClick={() => forge({ useWard: risky && ward })}
      >
        Cường hoá
      </button>
    </div>
  );
}

function Evolve({ c, ui, item, forge }: OpProps) {
  const def = c.items.get(item.itemId);
  const f = item.forge;
  if (!def || !f) return null;
  if (def.evolution.length === 0)
    return <span className="muted small">Trang bị này không có đường tiến hoá.</span>;
  const next = def.evolution[f.stage];
  if (!next) return <span className="muted small">Đã tiến hoá tới cảnh giới cuối.</span>;
  const realmOk = !next.realm || (c.realms.get(next.realm)?.order ?? 0) <= (ui.player?.realm ?? 0);
  const ok =
    item.enhance >= next.minEnhance &&
    qualityRank(f.quality as ForgeQuality) >= qualityRank(next.minQuality) &&
    realmOk &&
    canPay(ui, next);
  return (
    <div className="npc-row">
      <div>
        <div>
          → <strong>{next.name}</strong> <span className="muted small">· {next.tier}</span>
        </div>
        <div className="small">
          Chỉ số gốc ×{next.baseMultiplier} (giữ nguyên cường hoá, khảm, nghi thức)
        </div>
        <div className="small">
          <span className={item.enhance < next.minEnhance ? 'missing' : ''}>
            Cần +{next.minEnhance}
          </span>
          {next.minQuality !== 'common' && (
            <span
              className={
                qualityRank(f.quality as ForgeQuality) < qualityRank(next.minQuality)
                  ? 'missing'
                  : ''
              }
            >
              {' '}
              · phẩm {forgeRules(c)?.qualities[next.minQuality].name}
            </span>
          )}
          {next.realm && (
            <span className={realmOk ? '' : 'missing'}>
              {' '}
              · {c.realms.get(next.realm)?.name ?? next.realm}
            </span>
          )}
        </div>
        <Cost c={c} ui={ui} cost={next} />
      </div>
      <button type="button" className="primary" disabled={!ok} onClick={() => forge({})}>
        Tiến hoá
      </button>
    </div>
  );
}

function Sockets({
  c,
  ui,
  item,
  npcEntityId,
  send,
}: {
  c: ContentBundle;
  ui: UiState;
  item: ItemView;
  npcEntityId: number;
  send: Send;
}) {
  const rules = forgeRules(c);
  const f = item.forge;
  if (!rules || !f) return null;
  const free = f.sockets.some((s) => !s.itemId);
  const gems = ui.inventory.filter((g) => g.kind === 'socket' && fits(c, item, g));
  const intent = (op: ForgeOp, extra: Partial<Extract<Intent, { type: 'FORGE' }>>) =>
    send?.({
      type: 'FORGE',
      npcId: npcEntityId,
      op,
      instanceId: item.instanceId,
      ...extra,
    });
  return (
    <>
      {f.sockets.map((s, index) => {
        const gem = s.itemId ? c.items.get(s.itemId) : undefined;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: sockets are positional
          <div key={index} className="npc-row">
            <div>
              <span className="muted small">Ô {index + 1}: </span>
              {gem ? (
                <>
                  <strong>{gem.name}</strong>
                  <div className="muted small">{gem.description}</div>
                </>
              ) : (
                <span className="muted">trống</span>
              )}
            </div>
            {gem && (
              <button
                type="button"
                disabled={!canPay(ui, rules.socketRemove)}
                onClick={() => intent('unsocket', { socketIndex: index })}
              >
                Gỡ · {rules.socketRemove.gold} 🪙
              </button>
            )}
          </div>
        );
      })}
      {gems.length === 0 && (
        <span className="muted small">
          Không có vật phẩm khảm phù hợp. Vũ khí cận chiến nhận module chiến đấu, súng nhận chip đầu
          đạn, giáp nhận module phòng thủ; linh châu và trận văn hợp mọi món.
        </span>
      )}
      {gems.map((g) => {
        const socket = c.items.get(g.itemId)?.socket;
        return (
          <div key={g.instanceId} className="npc-row">
            <div>
              <GameIcon className="inline-icon" icon={g.icon} image={g.iconImage} />{' '}
              <strong>{g.name}</strong>{' '}
              <span className="muted small">
                ×{g.count} · {SOCKET_LABEL[socket?.type ?? ''] ?? ''} ·{' '}
                {socket?.line === 'tien' ? 'Tu Tiên' : 'Cơ Giới'}
              </span>
              <div className="muted small">{g.description || g.bonus}</div>
            </div>
            <button
              type="button"
              className="primary"
              disabled={!free}
              onClick={() => intent('socket', { socketInstanceId: g.instanceId })}
            >
              Khảm
            </button>
          </div>
        );
      })}
    </>
  );
}

function Rites({ c, ui, item, forge }: OpProps) {
  const f = item.forge;
  const def = c.items.get(item.itemId);
  if (!f || !def) return null;
  const rites = [...c.rites.values()].sort(
    (a, b) =>
      Object.keys(GROUP_LABEL).indexOf(a.group) - Object.keys(GROUP_LABEL).indexOf(b.group) ||
      a.line.localeCompare(b.line),
  );
  const natalElsewhere = ui.inventory.some(
    (i) => i.instanceId !== item.instanceId && i.forge?.natal,
  );
  return (
    <>
      <span className="muted small">
        Mỗi nhóm nhận một nghi thức, tuyến Tu Tiên ☯ hoặc Cơ Giới ⚙. Có nghi thức của cả hai tuyến ở
        2 nhóm trở lên sẽ thành Thiên Cơ (+10%).
      </span>
      {rites.map((r) => {
        const applied = f.rites.filter((x) => x.id === r.id).length;
        const other = f.rites.find((x) => x.group === r.group && x.id !== r.id);
        const qualityOk = qualityRank(f.quality as ForgeQuality) >= qualityRank(r.minQuality);
        const slotOk = r.slots.length === 0 || (def.slot ? r.slots.includes(def.slot) : false);
        const done = applied >= r.maxTimes;
        const natalBlocked = r.effects.natal && natalElsewhere;
        const ok = qualityOk && slotOk && !other && !done && !natalBlocked && canPay(ui, r);
        return (
          <div
            key={r.id}
            className={`npc-row ${!qualityOk || other || natalBlocked ? 'locked' : ''}`}
          >
            <div>
              <strong>
                {r.line === 'tien' ? '☯' : '⚙'} {r.name}
              </strong>{' '}
              <span className="muted small">
                · {GROUP_LABEL[r.group]} · {forgeRules(c)?.qualities[r.minQuality].name}+
                {r.maxTimes > 1 && ` · ${applied}/${r.maxTimes}`}
              </span>
              <div className="muted small">{r.description}</div>
              {!qualityOk && (
                <div className="small missing">
                  Cần phẩm {forgeRules(c)?.qualities[r.minQuality].name}
                </div>
              )}
              {other && <div className="small missing">Nhóm đã có {other.name}</div>}
              {natalBlocked && <div className="small missing">Đã có Bản Mệnh khác</div>}
              {!done && <Cost c={c} ui={ui} cost={r} rate={r.successRate} />}
              {r.hpCost > 0 && (
                <div className="small missing">Hiến {Math.round(r.hpCost * 100)}% HP hiện tại</div>
              )}
            </div>
            <button
              type="button"
              className="primary"
              disabled={!ok}
              onClick={() => forge({ riteId: r.id })}
            >
              {done ? 'Đã luyện' : 'Luyện'}
            </button>
          </div>
        );
      })}
    </>
  );
}

function Synthesis({ c, ui, item, forge }: OpProps) {
  const rules = forgeRules(c);
  const [picked, setPicked] = useState<string[]>([]);
  const f = item.forge;
  const def = c.items.get(item.itemId);
  if (!rules || !f || !def) return null;
  const target = QUALITY_ORDER[qualityRank(f.quality as ForgeQuality) + 1] as
    | Exclude<ForgeQuality, 'common'>
    | undefined;
  if (!target) return <span className="muted small">Đã đạt phẩm cao nhất.</span>;
  const step = rules.synthesis.steps[target];
  const candidates = ui.inventory.filter(
    (i) =>
      i.instanceId !== item.instanceId &&
      i.kind === 'equipment' &&
      i.slot === def.slot &&
      i.forge?.quality === f.quality &&
      !i.equipped &&
      !i.forge.bound,
  );
  const chosen = picked.filter((id) => candidates.some((i) => i.instanceId === id));
  const toggle = (id: string) =>
    setPicked(
      chosen.includes(id)
        ? chosen.filter((x) => x !== id)
        : [...chosen, id].slice(-rules.synthesis.fodder),
    );
  const q = rules.qualities[target];
  return (
    <>
      <div className="npc-row">
        <div>
          <div>
            {f.qualityName} → <strong style={{ color: q.color }}>{q.name}</strong>
          </div>
          <div className="small">
            Chỉ số ×{q.statMultiplier}, {q.sockets} ô khảm, {q.hidden} chỉ số ẩn, trần +
            {q.maxEnhance}. Giữ cường hoá, tiến hoá, khảm, nghi thức.
          </div>
          <div className="small">
            Cần {rules.synthesis.fodder} trang bị cùng ô, cùng phẩm ({chosen.length}/
            {rules.synthesis.fodder}). Thất bại mất 1 món nguyên liệu.
          </div>
          <Cost c={c} ui={ui} cost={step} rate={step.successRate} />
        </div>
        <button
          type="button"
          className="primary"
          disabled={chosen.length !== rules.synthesis.fodder || !canPay(ui, step)}
          onClick={() => {
            forge({ fodder: chosen });
            setPicked([]);
          }}
        >
          Hợp thành
        </button>
      </div>
      {candidates.length === 0 && (
        <span className="muted small">Không có nguyên liệu phù hợp trong túi.</span>
      )}
      {candidates.map((i) => (
        <label key={i.instanceId} className="npc-row forge-check">
          <span>
            <input
              type="checkbox"
              checked={chosen.includes(i.instanceId)}
              onChange={() => toggle(i.instanceId)}
            />{' '}
            <GameIcon className="inline-icon" icon={i.icon} image={i.iconImage} />{' '}
            <span style={{ color: i.rarityColor }}>
              {i.name} {i.enhance > 0 && `+${i.enhance}`}
            </span>
          </span>
        </label>
      ))}
    </>
  );
}

function Repair({ c, ui, item, forge }: OpProps) {
  const rules = forgeRules(c);
  const f = item.forge;
  if (!rules || !f) return null;
  const missing = f.maxDurability - f.durability;
  const gold = Math.ceil(missing * rules.qualities[f.quality as ForgeQuality].repairGold);
  return (
    <div className="npc-row">
      <div>
        <div>
          Độ bền {f.durability}/{f.maxDurability}
        </div>
        <div className="muted small">
          Mỗi lần gục ngã, trang bị đang mặc mất {rules.durability.deathLoss} độ bền. Hỏng (0) chỉ
          còn {rules.durability.brokenMultiplier * 100}% chỉ số.
        </div>
        {missing > 0 && <Cost c={c} ui={ui} cost={{ gold, materials: [] }} />}
      </div>
      <button
        type="button"
        className="primary"
        disabled={missing <= 0 || (ui.player?.gold ?? 0) < gold}
        onClick={() => forge({})}
      >
        Sửa chữa
      </button>
    </div>
  );
}
