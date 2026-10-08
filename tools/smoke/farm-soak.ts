/** Wall-clock online farm soak on authored content. Writes evidence, never speeds up the clock. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../../apps/game-server/src/config';
import { startGameServer } from '../../apps/game-server/src/server';
import { ZoneRoom } from '../../apps/game-server/src/zone-room';
import type { PlayerState, Snapshot } from '../../packages/game-protocol/src';
import { ColyseusSimHost } from '../../packages/net-client/src';

const seconds = Number(process.argv.find((arg) => arg.startsWith('--seconds='))?.slice(10) ?? 1800);
if (!Number.isFinite(seconds) || seconds < 10)
  throw new Error('duration must be at least 10 seconds');
const folder = resolve('reports/farm-soak');
mkdirSync(folder, { recursive: true });
const label = process.argv.find((arg) => arg.startsWith('--label='))?.slice(8) ?? '';
const profile =
  process.argv.find((arg) => arg.startsWith('--profile='))?.slice(10) ?? 'player_phap';
if (profile !== 'player_phap' && profile !== 'player_tran')
  throw new Error('unsupported soak profile');
const nativeBasic = profile === 'player_tran' || process.argv.includes('--native-basic');
if (label && !/^[a-z0-9-]+$/.test(label)) throw new Error('invalid report label');
const reportPath = resolve(folder, `online-${seconds}s${label ? `-${label}` : ''}.json`);
const revisionFiles = [
  'packages/game-core/src/systems/farm.ts',
  'packages/game-core/src/systems/intents.ts',
  'packages/game-core/src/systems/ranged.ts',
  'packages/game-core/src/geometry.ts',
  'game-data/combat/combat_rules.yaml',
  'game-data/maps/map_forest_mechanism_01.yaml',
  'game-data/nav/map_forest_mechanism_01.navmesh.bin',
  `game-data/characters/${profile}.yaml`,
  `game-data/combos/combo_${profile === 'player_tran' ? 'tran' : 'phap'}.yaml`,
  'tools/smoke/farm-soak.ts',
  ...(profile === 'player_tran'
    ? ['game-data/skills/skill_tran_place.yaml', 'game-data/skills/skill_tran_great.yaml']
    : [
        'game-data/skills/skill_phap_arrow.yaml',
        'game-data/skills/skill_phap_seal.yaml',
        'game-data/skills/skill_phap_guard.yaml',
        'game-data/skills/skill_phap_storm.yaml',
      ]),
];
const revision = createHash('sha256');
for (const path of revisionFiles) revision.update(path).update(readFileSync(path));
const runtimeRevision = { sha256: revision.digest('hex'), files: revisionFiles };
const server = await startGameServer(
  loadConfig({
    NODE_ENV: 'test',
    PORT: '0',
    HOST: '127.0.0.1',
    PGLITE_DIR: 'memory',
    AUTH_SECRET: 'farm-soak-local-test-secret-32-characters',
    LOG_LEVEL: 'fatal',
    AUTOSAVE_SECONDS: '30',
    COMBAT_CONTENT: 'starter',
  }),
);
const { repo, tokens, navFor } = ZoneRoom.deps;
const mapId = 'map_forest_mechanism_01';
const accountId = await repo.createAccount('farm-soak', 'local-fixture');
const characterId = await repo.createCharacter({
  accountId,
  name: 'Farm Soak',
  characterDefId: profile,
  mapId,
  element: 'thuy',
  expression: 'base',
});
const stored = await repo.loadCharacter(characterId);
if (!stored) throw new Error('missing fixture');
const anchor = navFor(mapId)?.closest({ x: -10, z: 10 }) ?? { x: -10, z: 10 };
// Legal mid-game fixture: authored Trúc Cơ stats/nodes/gear, no runtime health or clock overrides.
await repo.saveCharacter(
  characterId,
  {
    ...stored.save,
    realm: 'truc_co',
    nodes: [
      'tien_khai_mach',
      ...(profile === 'player_tran'
        ? ['tien_tran_place', 'tien_tran_pulse', 'tien_tran_link', 'tien_tran_great']
        : ['tien_phap_arrow', 'tien_phap_seal', 'tien_phap_guard', 'tien_phap_storm']),
    ],
    hp: 1100,
    mp: 260,
    inventory: [
      ...(!nativeBasic ? [{ instanceId: 'soak-sword', itemId: 'item_sword_iron', count: 1 }] : []),
      { instanceId: 'soak-potions', itemId: 'item_potion_hp_small', count: 20 },
    ],
    equipment: !nativeBasic ? { main_hand: 'soak-sword' } : {},
  },
  { mapId, ...anchor },
  [],
);
const token = await tokens.signAccess({ sub: accountId, role: 'player', chr: characterId });
const host = new ColyseusSimHost({
  endpoint: `ws://127.0.0.1:${server.port}`,
  mapId,
  getToken: () => token,
});
let snapshot: Snapshot | null = null,
  state: PlayerState | null = null;
let lastSnapshotAt = 0,
  lastTick = 0,
  snapshots = 0,
  activeTicks = 0,
  kills = 0,
  casts = 0,
  damage = 0,
  maxEntities = 0,
  maxGapMs = 0;
const notices: Record<string, number> = {};
const castsBySkill: Record<string, number> = {};
const committedCastsBySkill: Record<string, number> = {};
const failures: string[] = [];
let playerId = 0;
host.onSnapshot((value) => {
  const now = performance.now();
  if (lastSnapshotAt) maxGapMs = Math.max(maxGapMs, now - lastSnapshotAt);
  if (value.tick <= lastTick) failures.push('non-monotonic snapshot');
  if (state?.farmEnabled) activeTicks += value.tick - lastTick;
  lastTick = value.tick;
  lastSnapshotAt = now;
  snapshot = value;
  snapshots++;
  maxEntities = Math.max(maxEntities, value.entities.length);
});
host.onPlayerState((value) => {
  state = value;
  if (value.hp < 0 || value.hp > value.maxHp || value.mp < 0 || value.mp > value.maxMp)
    failures.push('resource bounds');
});
host.onEvents((events) => {
  for (const event of events) {
    if (event.type === 'DEATH' && event.id !== playerId) kills++;
    if (event.type === 'DEATH' && event.id === playerId) failures.push('player death');
    if (event.type === 'CAST_START' && event.sourceId === playerId) {
      casts++;
      castsBySkill[event.skillId] = (castsBySkill[event.skillId] ?? 0) + 1;
      if (!event.continuation)
        committedCastsBySkill[event.skillId] = (committedCastsBySkill[event.skillId] ?? 0) + 1;
    }
    if (event.type === 'DAMAGE' && event.sourceId === playerId) damage++;
    if (event.type === 'NOTICE' && event.ownerId === playerId)
      notices[event.code] = (notices[event.code] ?? 0) + 1;
  }
});
let started = 0;
const report = (status: string) => {
  const current = state as PlayerState | null;
  const result = {
    status,
    runtimeRevision,
    requestedSeconds: seconds,
    elapsedSeconds: (performance.now() - started) / 1000,
    tick: lastTick,
    snapshots,
    activeTicks,
    kills,
    casts,
    castsBySkill,
    committedCastsBySkill,
    castMetric:
      'casts/castsBySkill count CAST_START events including scheduled warning continuations',
    damage,
    maxEntities,
    maxGapMs,
    notices,
    failures: [...new Set(failures)],
    heapMb: process.memoryUsage().heapUsed / 1048576,
    player: current
      ? {
          hp: current.hp,
          maxHp: current.maxHp,
          mp: current.mp,
          gold: current.gold,
          inventorySlots: current.inventory.length,
          farmEnabled: current.farmEnabled,
        }
      : null,
    characterId: profile,
    basicFixture: nativeBasic ? 'native kit' : 'iron sword',
    realm: 'truc_co',
    mapId,
    anchor,
    fixture:
      'authored content, live server clock, socket deltas/private state, normal item intents only',
  };
  writeFileSync(reportPath, JSON.stringify(result, null, 2));
  return result;
};
try {
  playerId = (await host.connect()).playerId;
  started = performance.now();
  host.sendIntent({ type: 'SET_FARM', enabled: true });
  let lastPotion = -Infinity,
    lastReport = 0;
  while (performance.now() - started < seconds * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const now = performance.now(),
      current = state as PlayerState | null;
    if (lastSnapshotAt && now - lastSnapshotAt > 5000) {
      failures.push('snapshot stream stalled');
      break;
    }
    if (current && current.hp / current.maxHp < 0.65 && now - lastPotion > 5500) {
      const potion = current.inventory.find((item) => item.itemId === 'item_potion_hp_small');
      if (potion) {
        host.sendIntent({ type: 'USE_ITEM', instanceId: potion.instanceId });
        lastPotion = now;
      }
    }
    if (
      current &&
      !current.farmEnabled &&
      current.hp / current.maxHp >= 0.5 &&
      current.inventory.length < current.inventoryCapacity
    )
      host.sendIntent({ type: 'SET_FARM', enabled: true });
    if (now - lastReport >= 60000) {
      console.log(JSON.stringify(report('running')));
      lastReport = now;
    }
  }
  if (activeTicks < seconds * 20 * 0.8)
    failures.push('farm active less than 80% of requested duration');
  if (kills < seconds / 60 || !damage || !casts) failures.push('insufficient combat activity');
  if (maxGapMs > 5000 || !snapshot) failures.push('network gap');
  host.sendIntent({ type: 'SET_FARM', enabled: false });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const result = report(failures.length ? 'failed' : 'passed');
  console.log(JSON.stringify(result));
  if (failures.length) process.exitCode = 1;
} finally {
  host.dispose();
  await server.close();
}
