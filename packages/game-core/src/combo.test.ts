import { ComboDefSchema } from '@rpg/game-data';
import { describe, expect, it } from 'vitest';
import { makeContent } from './test-fixtures';
import { World } from './world';

describe('basic attack combo', () => {
  it('swings without a target and chains a buffered press into the next step', () => {
    const base = makeContent();
    const combo = ComboDefSchema.parse({
      id: 'test_combo',
      name: 'Two strikes',
      resetAfter: 1,
      steps: [
        {
          variants: [
            {
              id: 'first',
              name: 'First',
              clip: 'attack',
              windup: 0.1,
              recovery: 0.1,
              damage: 1,
              reach: 1.5,
              arc: 120,
              moveMultiplier: 0.5,
              trail: { shape: 'slash' },
            },
          ],
        },
        {
          variants: [
            {
              id: 'second',
              name: 'Second',
              clip: 'attack',
              windup: 0.1,
              recovery: 0.1,
              damage: 2,
              reach: 1.5,
              arc: 120,
              moveMultiplier: 0.5,
              trail: { shape: 'slash' },
            },
          ],
        },
      ],
    });
    const world = new World({
      content: { ...base, combos: new Map([[combo.id, combo]]) },
      mapId: 'test_map',
    });
    const id = world.spawnPlayer('hero');
    world.enqueueIntent(id, { type: 'BASIC_ATTACK' });
    const start = world.step();
    expect(start).toContainEqual(
      expect.objectContaining({
        type: 'ATTACK',
        sourceId: id,
        targetId: null,
        combo: expect.objectContaining({ step: 0, variantId: 'first' }),
      }),
    );
    world.enqueueIntent(id, { type: 'BASIC_ATTACK' });
    const events = world.step();
    expect(events.some((e) => e.type === 'ATTACK' && e.combo?.step === 1)).toBe(false);
    const later = [...events];
    for (let i = 0; i < 5; i++) later.push(...world.step());
    expect(later.some((e) => e.type === 'ATTACK' && e.combo?.step === 1)).toBe(true);
  });
});
