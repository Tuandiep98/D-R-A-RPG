import type { UiState } from '@rpg/babylon-renderer';
import type { ContentBundle } from '@rpg/game-data';
import { useMemo, useState } from 'react';
import { loadContent } from '../content';
import { game } from '../game';
import { useUiStore } from '../store';
import { GameIcon } from './GameIcon';

type Tab = 'quests' | 'shop' | 'craft' | 'upgrade';

const rankOf = (c: ContentBundle, realmId: string) => c.realms.get(realmId)?.order ?? 0;

let contentCache: ContentBundle | null = null;
const content = () => {
  contentCache ??= loadContent();
  return contentCache;
};

/** NPC dialog (quests, shop, crafting, upgrades). Every button only sends an intent. */
export function NpcPanel() {
  const npc = useUiStore((s) => s.npc);
  const ui = useUiStore((s) => s.ui);
  const close = useUiStore((s) => s.closeNpc);
  const c = content();
  const def = npc ? c.npcs.get(npc.npcId) : undefined;
  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [];
    if (def?.quests.length) t.push({ id: 'quests', label: 'Nhiệm vụ' });
    if (def?.shopId) t.push({ id: 'shop', label: 'Cửa hàng' });
    if (def?.recipes.length) t.push({ id: 'craft', label: 'Chế tạo' });
    if (def?.upgrades) t.push({ id: 'upgrade', label: 'Cường hoá' });
    return t;
  }, [def]);
  const [tab, setTab] = useState<Tab | null>(null);
  if (!npc || !def || !ui) return null;
  const active = tab && tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? null);
  const send = game()?.send.bind(game());

  return (
    <div className="panel npc-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <strong>
          {def.name}
          {def.title && <span className="muted"> · {def.title}</span>}
        </strong>
        <button type="button" onClick={close}>
          ✕
        </button>
      </div>
      {def.greeting && <p className="greeting">“{def.greeting}”</p>}
      {tabs.length > 1 && (
        <div className="segmented">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={active === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {active === 'quests' && (
        <Quests ui={ui} npcEntityId={npc.npcEntityId} quests={def.quests} send={send} />
      )}
      {active === 'shop' && def.shopId && (
        <Shop ui={ui} npcEntityId={npc.npcEntityId} shopId={def.shopId} send={send} />
      )}
      {active === 'craft' && (
        <Craft ui={ui} npcEntityId={npc.npcEntityId} recipes={def.recipes} send={send} />
      )}
      {active === 'upgrade' && <Upgrade ui={ui} npcEntityId={npc.npcEntityId} send={send} />}
      <div className="muted">🪙 {ui.player?.gold ?? 0}</div>
    </div>
  );
}

type Send =
  | ((intent: Parameters<NonNullable<ReturnType<typeof game>>['send']>[0]) => void)
  | undefined;
const count = (ui: UiState, itemId: string) =>
  ui.inventory.filter((i) => i.itemId === itemId).reduce((n, i) => n + i.count, 0);

function Quests({
  ui,
  npcEntityId,
  quests,
  send,
}: {
  ui: UiState;
  npcEntityId: number;
  quests: string[];
  send: Send;
}) {
  const c = content();
  const log = new Map(ui.quests.map((q) => [q.questId, q]));
  return (
    <div className="npc-list">
      {quests.map((id) => {
        const def = c.quests.get(id);
        if (!def) return null;
        const q = log.get(id);
        if (ui.questsDone.includes(id)) return null;
        const locked =
          !q &&
          ((def.realm !== undefined && rankOf(c, def.realm) > (ui.player?.realm ?? 0)) ||
            !def.requires.every((r) => ui.questsDone.includes(r)));
        return (
          <div key={id} className={`npc-row ${locked ? 'locked' : ''}`}>
            <div>
              <strong>{def.name}</strong>{' '}
              {def.realm && (
                <span className="muted">{c.realms.get(def.realm)?.name ?? def.realm}</span>
              )}
              <div className="muted small">{def.description}</div>
              {q && (
                <div className="small">
                  {q.objectives.map((o) => (
                    <div key={o.text}>
                      {o.text}: {Math.min(o.current, o.required)}/{o.required}
                    </div>
                  ))}
                </div>
              )}
              <div className="small reward">
                Thưởng: {def.rewards.gold > 0 && `${def.rewards.gold} vàng `}
                {def.rewards.items
                  .map((i) => `${c.items.get(i.itemId)?.name ?? i.itemId}×${i.count}`)
                  .join(', ')}
              </div>
            </div>
            {!q && !locked && (
              <button
                type="button"
                onClick={() =>
                  send?.({
                    type: 'QUEST_ACCEPT',
                    npcId: npcEntityId,
                    questId: id,
                  })
                }
              >
                Nhận
              </button>
            )}
            {q?.status === 'ready' && (
              <button
                type="button"
                className="primary"
                onClick={() =>
                  send?.({
                    type: 'QUEST_TURN_IN',
                    npcId: npcEntityId,
                    questId: id,
                  })
                }
              >
                Trả
              </button>
            )}
            {locked && <span className="muted small">Chưa mở</span>}
          </div>
        );
      })}
    </div>
  );
}

function Shop({
  ui,
  npcEntityId,
  shopId,
  send,
}: {
  ui: UiState;
  npcEntityId: number;
  shopId: string;
  send: Send;
}) {
  const c = content();
  const shop = c.shops.get(shopId);
  if (!shop) return null;
  const sellable = ui.inventory.filter(
    (i) => !i.equipped && (c.items.get(i.itemId)?.sellPrice ?? 0) > 0,
  );
  return (
    <div className="npc-columns">
      <div className="npc-list">
        <strong className="small">Mua</strong>
        {shop.items.map((entry) => {
          const item = c.items.get(entry.itemId);
          return (
            <div key={entry.itemId} className="npc-row">
              <span>
                <GameIcon className="inline-icon" icon={item?.icon} image={item?.iconImage} />{' '}
                {item?.name}
              </span>
              <button
                type="button"
                disabled={(ui.player?.gold ?? 0) < entry.price}
                onClick={() =>
                  send?.({
                    type: 'SHOP_BUY',
                    npcId: npcEntityId,
                    itemId: entry.itemId,
                    count: 1,
                  })
                }
              >
                {entry.price} 🪙
              </button>
            </div>
          );
        })}
      </div>
      <div className="npc-list">
        <strong className="small">Bán</strong>
        {sellable.length === 0 && <span className="muted small">Không có gì để bán</span>}
        {sellable.map((i) => {
          const price = Math.floor((c.items.get(i.itemId)?.sellPrice ?? 0) * shop.buybackRate);
          return (
            <div key={i.instanceId} className="npc-row">
              <span style={{ color: i.rarityColor }}>
                <GameIcon className="inline-icon" icon={i.icon} image={i.iconImage} /> {i.name}
                {i.count > 1 ? ` ×${i.count}` : ''}
              </span>
              <button
                type="button"
                onClick={() =>
                  send?.({
                    type: 'SHOP_SELL',
                    npcId: npcEntityId,
                    instanceId: i.instanceId,
                    count: i.count,
                  })
                }
              >
                +{price * i.count} 🪙
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Craft({
  ui,
  npcEntityId,
  recipes,
  send,
}: {
  ui: UiState;
  npcEntityId: number;
  recipes: string[];
  send: Send;
}) {
  const c = content();
  return (
    <div className="npc-list">
      {recipes.map((id) => {
        const r = c.recipes.get(id);
        if (!r) return null;
        const ok =
          r.materials.every((m) => count(ui, m.itemId) >= m.count) &&
          (ui.player?.gold ?? 0) >= r.gold;
        return (
          <div key={id} className="npc-row">
            <div>
              <strong>{r.name}</strong>
              <div className="small">
                {r.materials.map((m) => (
                  <span key={m.itemId} className={count(ui, m.itemId) >= m.count ? '' : 'missing'}>
                    {c.items.get(m.itemId)?.name} {count(ui, m.itemId)}/{m.count}{' '}
                  </span>
                ))}
                {r.gold > 0 && <span>· {r.gold} 🪙</span>}
              </div>
            </div>
            <button
              type="button"
              disabled={!ok}
              onClick={() => send?.({ type: 'CRAFT', npcId: npcEntityId, recipeId: id })}
            >
              Chế tạo
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Upgrade({ ui, npcEntityId, send }: { ui: UiState; npcEntityId: number; send: Send }) {
  const c = content();
  const rules = [...c.upgrades.values()][0];
  if (!rules) return null;
  const gear = ui.inventory.filter((i) => i.kind === 'equipment');
  return (
    <div className="npc-list">
      {gear.length === 0 && <span className="muted small">Không có trang bị</span>}
      {gear.map((i) => {
        const level = i.enhance ?? 0;
        const step = rules.steps[level];
        return (
          <div key={i.instanceId} className="npc-row">
            <div>
              <span style={{ color: i.rarityColor }}>
                <GameIcon className="inline-icon" icon={i.icon} image={i.iconImage} /> {i.name}{' '}
                {level > 0 && <strong>+{level}</strong>}
              </span>
              {step ? (
                <div className="small">
                  {step.gold} 🪙
                  {step.materials.map(
                    (m) => ` · ${c.items.get(m.itemId)?.name} ${count(ui, m.itemId)}/${m.count}`,
                  )}{' '}
                  · tỉ lệ {Math.round(step.successRate * 100)}%
                </div>
              ) : (
                <div className="small muted">Đã tối đa</div>
              )}
            </div>
            {step && (
              <button
                type="button"
                onClick={() =>
                  send?.({
                    type: 'UPGRADE',
                    npcId: npcEntityId,
                    instanceId: i.instanceId,
                  })
                }
              >
                +{level + 1}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
