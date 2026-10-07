import type { SkillSlot } from '@rpg/babylon-renderer';
import { describe, expect, it } from 'vitest';
import { resolveLoadout } from './skill-loadout';

const slot = (skillId: string, barRole: SkillSlot['barRole'] = 'primary'): SkillSlot => ({
  skillId,
  barRole,
  name: skillId,
  icon: '⚡',
  iconImage: null,
  description: '',
  cooldown: 1,
  remaining: 0,
  mpCost: 0,
  usable: true,
});

describe('skill loadout', () => {
  const skills = [
    slot('dash', 'utility'),
    slot('leap', 'utility'),
    slot('arc'),
    slot('field'),
    slot('pierce'),
    slot('ultimate'),
  ];

  it('fills desktop with four skills and mobile with three primary skills plus one utility', () => {
    expect(resolveLoadout(skills, {}, 'desktop').map((s) => s?.skillId)).toEqual([
      'dash',
      'leap',
      'arc',
      'field',
    ]);
    expect(resolveLoadout(skills, {}, 'touch').map((s) => s?.skillId)).toEqual([
      'arc',
      'field',
      'pierce',
      'dash',
    ]);
  });

  it('keeps assignments stable by ID and does not repeat a skill in one bar', () => {
    expect(
      resolveLoadout(skills, { 'desktop-2': 'ultimate' }, 'desktop').map((s) => s?.skillId),
    ).toEqual(['dash', 'ultimate', 'leap', 'arc']);
    expect(
      resolveLoadout(skills, { 'touch-2': 'arc', 'touch-utility': 'leap' }, 'touch').map(
        (s) => s?.skillId,
      ),
    ).toEqual(['field', 'arc', 'pierce', 'leap']);
  });

  it('leaves cleared slots empty and replaces unavailable assignments with valid defaults', () => {
    expect(
      resolveLoadout(skills, { 'touch-1': null, 'touch-utility': 'arc' }, 'touch').map(
        (s) => s?.skillId ?? null,
      ),
    ).toEqual([null, 'arc', 'field', 'dash']);
  });
});
