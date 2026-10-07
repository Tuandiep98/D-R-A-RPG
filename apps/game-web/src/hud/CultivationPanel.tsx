import type { CultivationView, UiState } from '@rpg/babylon-renderer';
import {
  type CultivationNodeDef,
  type CultivationPath,
  type RealmDef,
  realmLadder,
} from '@rpg/game-data';
import { sharedContent } from '../content';
import { game } from '../game';
import { useUiStore } from '../store';
import { GameIcon } from './GameIcon';

const PATHS: { id: CultivationPath; label: string; hint: string }[] = [
  { id: 'tien', label: 'Tiên Đạo', hint: 'Kinh mạch · luyện thể · công pháp' },
  { id: 'co', label: 'Cơ Đạo', hint: 'Core · augmentation · module' },
  {
    id: 'hon_nguyen',
    label: 'Hỗn Nguyên',
    hint: 'Dùng cả kinh mạch lẫn body load',
  },
];

const AXIS_LABEL: Record<CultivationNodeDef['axis'], string> = {
  than: 'Thân',
  nang_luong: 'Năng lượng',
  than_thuc: 'Thần thức',
  dao: 'Đạo',
};

type Inventory = UiState['inventory'];

const owned = (inv: Inventory, itemId: string) =>
  inv.filter((i) => i.itemId === itemId).reduce((n, i) => n + i.count, 0);

/**
 * Display-only hint of why a node is locked. The server re-checks everything
 * (CLAUDE.md rule 2); this only greys out buttons.
 */
function nodeHint(
  node: CultivationNodeDef,
  cv: CultivationView,
  ladder: RealmDef[],
  inv: Inventory,
  gold: number,
  questsDone: string[],
): string | null {
  const c = sharedContent();
  const rank = ladder.findIndex((r) => r.id === cv.realmId);
  const need = ladder.findIndex((r) => r.id === node.realm);
  if (need > rank) return `Cần ${ladder[need]?.name ?? node.realm}`;
  const missingNode = node.requires.find((r) => !cv.nodes.includes(r));
  if (missingNode) return `Cần mở ${c.cultivation.get(missingNode)?.name ?? missingNode}`;
  const missingQuest = node.quests.find((q) => !questsDone.includes(q));
  if (missingQuest) return `Cần hoàn thành “${c.quests.get(missingQuest)?.name ?? missingQuest}”`;
  if (
    cv.meridianLoad + node.meridian > cv.meridianCapacity ||
    cv.bodyLoad + node.body > cv.bodyCapacity
  )
    return 'Không đủ chỗ (tải)';
  if (node.cost.materials.some((m) => owned(inv, m.itemId) < m.count)) return 'Thiếu nguyên liệu';
  if (gold < node.cost.gold) return 'Thiếu vàng';
  return null;
}

function Cost({
  gold,
  materials,
  inv,
}: {
  gold: number;
  materials: { itemId: string; count: number }[];
  inv: Inventory;
}) {
  const c = sharedContent();
  return (
    <span className="small muted">
      {materials.map((m) => {
        const have = owned(inv, m.itemId);
        const item = c.items.get(m.itemId);
        return (
          <span key={m.itemId} className={have >= m.count ? '' : 'lacking'}>
            <GameIcon className="inline-icon" icon={item?.icon} image={item?.iconImage} />{' '}
            {item?.name ?? m.itemId} {have}/{m.count}{' '}
          </span>
        );
      })}
      {gold > 0 && <span>🪙 {gold}</span>}
    </span>
  );
}

/**
 * Tu luyện (master plan §31–62): no levels — open nodes within the realm's
 * capacity, then break through. Every button only sends an intent.
 */
export function CultivationPanel() {
  const ui = useUiStore((s) => s.ui);
  const close = useUiStore((s) => s.closePanel);
  const p = ui?.player;
  if (!ui || !p) return null;
  const c = sharedContent();
  const ladder = realmLadder(c);
  const cv = p.cultivation;
  const rank = ladder.findIndex((r) => r.id === cv.realmId);
  const next = ladder[rank + 1];
  const bt = next?.breakthrough;
  const realmOrder = (id: string) => c.realms.get(id)?.order ?? 0;
  const nodes = [...c.cultivation.values()].sort(
    (x, y) => realmOrder(x.realm) - realmOrder(y.realm) || x.requires.length - y.requires.length,
  );
  const send = (intent: Parameters<NonNullable<ReturnType<typeof game>>['send']>[0]) =>
    game()?.send(intent);

  return (
    <div className="panel npc-panel cultivation" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <strong>
          ☯ Tu Luyện · {cv.realmName} <span className="muted">/ {cv.mechName}</span>
        </strong>
        <button type="button" onClick={close}>
          ✕
        </button>
      </div>
      <div className="realm-ladder small">
        {ladder.map((r, i) => (
          <span key={r.id} className={i === rank ? 'current' : i < rank ? 'passed' : ''}>
            {r.name}
          </span>
        ))}
      </div>
      <div className="loads small">
        <span>
          Kinh mạch {cv.meridianLoad}/{cv.meridianCapacity}
        </span>
        <span>
          Body load {cv.bodyLoad}/{cv.bodyCapacity}
        </span>
      </div>
      <div className="npc-columns cultivation-paths">
        {PATHS.map((path) => (
          <div key={path.id} className="npc-list">
            <strong>
              {path.label} <span className="muted small">{path.hint}</span>
            </strong>
            {nodes
              .filter((n) => n.path === path.id)
              .map((n) => {
                const open = cv.nodes.includes(n.id);
                const hint = open
                  ? null
                  : nodeHint(n, cv, ladder, ui.inventory, p.gold, ui.questsDone);
                const skill = n.skillId ? c.skills.get(n.skillId) : undefined;
                return (
                  <div
                    key={n.id}
                    className={`npc-row node ${open ? 'node-open' : hint ? 'locked' : ''}`}
                  >
                    <div>
                      <div>
                        {n.icon} {n.name}{' '}
                        <span className="muted small">
                          {AXIS_LABEL[n.axis]}
                          {n.meridian > 0 && ` · mạch ${n.meridian}`}
                          {n.body > 0 && ` · tải ${n.body}`}
                        </span>
                      </div>
                      <div className="small muted">{n.description}</div>
                      {skill && (
                        <div className="small reward">
                          Mở kỹ năng:{' '}
                          <GameIcon
                            className="inline-icon"
                            icon={skill.icon}
                            image={skill.iconImage}
                          />{' '}
                          {skill.name}
                        </div>
                      )}
                      {!open && (
                        <Cost gold={n.cost.gold} materials={n.cost.materials} inv={ui.inventory} />
                      )}
                    </div>
                    {open ? (
                      <span className="small reward">✓ Đã mở</span>
                    ) : (
                      <div className="node-action">
                        {hint && <span className="small lacking">{hint}</span>}
                        <button
                          type="button"
                          className="primary"
                          disabled={!!hint}
                          onClick={() => send({ type: 'OPEN_NODE', nodeId: n.id })}
                        >
                          Khai mở
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      <div className="breakthrough">
        {next && bt ? (
          <>
            <strong>
              Đột phá {next.name} <span className="muted">/ {next.mechName}</span>
            </strong>
            <p className="small muted">{next.description}</p>
            <div className="small">
              Nền móng: {cv.nodes.length}/{bt.minNodes} node
              {bt.quests.map((q) => (
                <span key={q} className={ui.questsDone.includes(q) ? '' : 'lacking'}>
                  {' '}
                  · Thử thách “{c.quests.get(q)?.name ?? q}”
                </span>
              ))}
            </div>
            <Cost gold={bt.gold} materials={bt.materials} inv={ui.inventory} />
            <div className="small">
              Tỉ lệ thành công: <strong>{Math.round(cv.breakthroughChance * 100)}%</strong>
              <span className="muted">
                {' '}
                (mỗi node vượt mức +{Math.round(bt.chancePerExtraNode * 100)}%). Thất bại: mất
                nguyên liệu, phản phệ {bt.backlashSeconds}s — không mất cảnh giới hay node.
              </span>
            </div>
            <button
              type="button"
              className="primary wide"
              disabled={cv.backlash > 0 || !p.inSafeZone || cv.nodes.length < bt.minNodes}
              onClick={() => send({ type: 'BREAKTHROUGH' })}
            >
              {cv.backlash > 0
                ? `Phản phệ — chờ ${Math.ceil(cv.backlash)}s`
                : p.inSafeZone
                  ? 'Đột phá'
                  : 'Về vùng an toàn để đột phá'}
            </button>
          </>
        ) : (
          <span className="muted small">
            {next
              ? `${next.name} chưa mở trong phiên bản này.`
              : 'Đã ở cảnh giới cao nhất hiện có.'}
          </span>
        )}
      </div>
    </div>
  );
}
