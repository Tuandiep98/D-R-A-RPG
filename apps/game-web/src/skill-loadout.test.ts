import type { SkillSlot } from '@rpg/babylon-renderer';
import { describe, expect, it } from 'vitest';
import { readCharacterLoadout, resolveLoadout, writeCharacterLoadout } from './skill-loadout';

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
  it('migrates the global layout once, remaps Lôi Bộ and isolates characters', () => {
    const values = new Map([
      [
        'rpg.skill-loadout.v1',
        JSON.stringify({ 'desktop-1': 'skill_thunder_step', 'desktop-2': 'arc', 'touch-1': null }),
      ],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    expect(readCharacterLoadout(storage, 'character-a')).toEqual({
      'desktop-1': 'skill_roll',
      'desktop-2': 'arc',
      'touch-1': null,
    });
    expect(readCharacterLoadout(storage, 'character-b')).toEqual({});
    writeCharacterLoadout(storage, 'character-b', { 'desktop-2': 'field' });
    expect(readCharacterLoadout(storage, 'character-a')['desktop-2']).toBe('arc');
    expect(readCharacterLoadout(storage, 'character-b')['desktop-2']).toBe('field');
  });
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
