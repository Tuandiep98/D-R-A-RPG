import type { SimContext } from '../context';

export const MAX_SKILL_OBJECTS = 128;

/** Reserve capacity for windups too: concurrent casts cannot consume MP then overflow on impact. */
export function skillObjectLoad(ctx: SimContext, kind: 'projectile' | 'pulses'): number {
  let load = kind === 'projectile' ? ctx.skillProjectiles.length : ctx.skillPulses.length;
  for (const e of ctx.entities.values()) {
    if (!e.life.alive) continue;
    const skill = e.cast ? ctx.content.skills.get(e.cast.skillId) : undefined;
    if (
      kind === 'projectile' &&
      skill?.effects.some(
        (effect) =>
          effect.type === 'pet_attack' &&
          ctx.content.skills.get(effect.skillId)?.delivery === 'projectile',
      )
    )
      load++;
    if (kind === 'pulses' ? !!skill?.pulses : skill?.delivery === 'projectile') load++;
    if (kind === 'projectile' && e.swing?.variant.projectileSkillId && !e.swing.impacted) load++;
  }
  return load;
}
