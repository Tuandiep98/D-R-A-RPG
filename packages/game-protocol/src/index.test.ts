import { describe, expect, it } from 'vitest';
import { IntentSchema, MAX_COORD } from './index';

describe('IntentSchema', () => {
  it('accepts valid intents', () => {
    expect(IntentSchema.parse({ type: 'MOVE_TO', target: { x: 1, z: -2 } })).toEqual({
      type: 'MOVE_TO',
      target: { x: 1, z: -2 },
    });
    expect(IntentSchema.safeParse({ type: 'ATTACK_TARGET', targetId: 3 }).success).toBe(true);
    expect(IntentSchema.safeParse({ type: 'STOP' }).success).toBe(true);
    expect(
      IntentSchema.safeParse({ type: 'CAST_SKILL', skillId: 'skill_heavy_slash', targetId: 2 })
        .success,
    ).toBe(true);
    expect(IntentSchema.safeParse({ type: 'EQUIP', instanceId: 'i_1' }).success).toBe(true);
    expect(IntentSchema.safeParse({ type: 'UNEQUIP', slot: 'main_hand' }).success).toBe(true);
  });

  it('rejects unknown types, extra fields and bad values', () => {
    expect(IntentSchema.safeParse({ type: 'GIVE_GOLD', amount: 1e9 }).success).toBe(false);
    expect(IntentSchema.safeParse({ type: 'STOP', damage: 9999 }).success).toBe(false);
    expect(IntentSchema.safeParse({ type: 'ATTACK_TARGET', targetId: -1 }).success).toBe(false);
    expect(IntentSchema.safeParse({ type: 'ATTACK_TARGET', targetId: 1.5 }).success).toBe(false);
    expect(
      IntentSchema.safeParse({ type: 'MOVE_TO', target: { x: Number.NaN, z: 0 } }).success,
    ).toBe(false);
    expect(
      IntentSchema.safeParse({ type: 'MOVE_TO', target: { x: MAX_COORD + 1, z: 0 } }).success,
    ).toBe(false);
    expect(IntentSchema.safeParse({ type: 'CAST_SKILL', skillId: '../../etc' }).success).toBe(
      false,
    );
    expect(IntentSchema.safeParse({ type: 'UNEQUIP', slot: 'wallet' }).success).toBe(false);
  });
});
