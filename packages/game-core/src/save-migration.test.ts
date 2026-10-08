import { expect, it } from 'vitest';
import { makeContent } from './test-fixtures';
import { World } from './world';

const content = makeContent({
  character: { skills: ['slash'], prototypeSkills: ['slash', 'whirl', 'mend'] },
});

it('grants the starter kit to new characters and gates the full kit behind prototype content', () => {
  const starter = new World({ content, mapId: 'test_map', combatContent: 'starter' });
  const id = starter.spawnPlayer('hero');
  expect(starter.playerState(id)?.skills.map((s) => s.skillId)).toEqual(['slash']);
  starter.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'whirl' });
  expect(starter.step().some((e) => e.type === 'NOTICE' && e.code === 'invalid')).toBe(true);
  const prototype = new World({ content, mapId: 'test_map', combatContent: 'prototype' });
  const debug = prototype.spawnPlayer('hero');
  expect(prototype.playerState(debug)?.skills.map((s) => s.skillId)).toEqual([
    'slash',
    'whirl',
    'mend',
  ]);
});

it('upgrades a version-one prototype save and keeps its unlocks and cooldowns through starter transfer', () => {
  const original = new World({ content, mapId: 'test_map' });
  const id = original.spawnPlayer('hero');
  const exported = original.exportPlayer(id);
  if (!exported) throw new Error('missing fixture save');
  const legacy = { ...exported, saveVersion: 1, learnedSkills: undefined, cooldowns: { whirl: 4 } };
  const upgraded = new World({ content, mapId: 'test_map', combatContent: 'starter' });
  const next = upgraded.spawnPlayer('hero', { save: legacy });
  const save = upgraded.exportPlayer(next);
  expect(save).toMatchObject({
    saveVersion: 2,
    learnedSkills: ['slash', 'whirl', 'mend'],
    cooldowns: { whirl: 4 },
  });
  const destination = new World({ content, mapId: 'test_map', combatContent: 'starter' });
  const transferred = destination.spawnPlayer('hero', { save: save ?? undefined });
  expect(destination.exportPlayer(transferred)).toMatchObject({
    saveVersion: 2,
    learnedSkills: ['slash', 'whirl', 'mend'],
    cooldowns: { whirl: 4 },
  });
  expect(destination.entities.get(transferred)).toMatchObject({
    cast: null,
    swing: null,
    pending: null,
  });
});

it('rejects future or malformed save versions before spawning an actor', () => {
  const world = new World({ content, mapId: 'test_map' });
  const save = world.exportPlayer(world.spawnPlayer('hero'));
  if (!save) throw new Error('missing save');
  for (const saveVersion of [0, -1, 3, NaN, Infinity]) {
    expect(() => world.spawnPlayer('hero', { save: { ...save, saveVersion } })).toThrow();
  }
});

it('rollback and portal reload preserve affinity, revision, unlocks and costs while clearing transient actions', () => {
  const original = new World({ content, mapId: 'test_map', combatRuleset: 'elements_v1' });
  const id = original.spawnPlayer('hero', { element: 'moc', expression: 'thunder' });
  original.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'slash', targetId: 1 });
  original.step();
  const actor = original.entities.get(id);
  if (!actor?.player) throw new Error('missing actor');
  actor.actionBuffer = { expiresTick: original.tick + 4, intent: { type: 'BASIC_ATTACK' } };
  actor.player.trigger.held = true;
  actor.skills.set('slash', original.tick + 80);
  const save = original.exportPlayer(id);
  if (!save) throw new Error('missing save');
  original.removeEntity(id);
  const rolledBack = new World({ content, mapId: 'test_map', combatRuleset: 'classic' });
  const next = rolledBack.spawnPlayer('hero', { save });
  expect(rolledBack.exportPlayer(next)).toMatchObject({
    saveVersion: save.saveVersion,
    element: save.element,
    expression: save.expression,
    elementRevision: save.elementRevision,
    learnedSkills: save.learnedSkills,
    cooldowns: save.cooldowns,
    mp: save.mp,
  });
  expect(rolledBack.entities.get(next)).toMatchObject({
    cast: null,
    swing: null,
    pending: null,
    actionState: null,
    actionBuffer: null,
    player: { trigger: { held: false, queued: false, windup: null, reload: null } },
  });
  expect(
    Array.from({ length: 10 }, () => rolledBack.step())
      .flat()
      .some((event) => event.type === 'ATTACK' && event.sourceId === next),
  ).toBe(false);
});
