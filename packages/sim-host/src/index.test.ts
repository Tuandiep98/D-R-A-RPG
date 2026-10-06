import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildContentBundle } from '@rpg/game-data';
import type { Snapshot } from '@rpg/game-protocol';
import { describe, expect, it } from 'vitest';
import { LocalSimHost } from './index';

const DATA_ROOT = join(import.meta.dirname, '../../../game-data');

function loadRealContent() {
  const files = (readdirSync(DATA_ROOT, { recursive: true }) as string[])
    .filter((p) => p.endsWith('.yaml'))
    .map((p) => ({
      path: relative(DATA_ROOT, join(DATA_ROOT, p)).replace(/\\/g, '/'),
      text: readFileSync(join(DATA_ROOT, p), 'utf8'),
    }));
  return buildContentBundle(files);
}

const makeHost = (maxIntentsPerSecond?: number) =>
  new LocalSimHost({
    content: loadRealContent(),
    mapId: 'map_sandbox_01',
    characterId: 'player_default',
    autoRun: false,
    maxIntentsPerSecond,
  });

describe('LocalSimHost', () => {
  it('joins and publishes snapshots for the sandbox map', async () => {
    const host = makeHost();
    const join = await host.connect();
    let last: Snapshot | null = null;
    host.onSnapshot((s) => {
      last = s;
    });
    host.stepOnce();
    expect(join.playerId).toBeGreaterThan(0);
    expect(last).not.toBeNull();
    const snap = last as unknown as Snapshot;
    expect(snap.entities.find((e) => e.id === join.playerId)?.kind).toBe('player');
    expect(snap.entities.filter((e) => e.kind === 'monster')).toHaveLength(5);
    host.dispose();
  });

  it('drops malformed intents instead of passing them to the world', async () => {
    const host = makeHost();
    await host.connect();
    host.sendIntent({ type: 'MOVE_TO', target: { x: 'a', z: 0 } });
    host.sendIntent({ type: 'ADD_GOLD', amount: 99999 });
    host.sendIntent(null);
    host.stepOnce();
    expect(host.debug?.droppedIntents).toBe(3);
    expect(host.debug?.rejectedIntents).toBe(0);
    host.dispose();
  });

  it('rate limits intent spam', async () => {
    const host = makeHost(5);
    await host.connect();
    for (let i = 0; i < 20; i++) host.sendIntent({ type: 'STOP' });
    expect(host.debug?.droppedIntents).toBe(15);
    host.dispose();
  });
});
