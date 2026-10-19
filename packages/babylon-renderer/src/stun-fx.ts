import { Color3 } from './babylon';
import type { CombatFx } from './combat-fx';
import type { EntityView } from './entity-view';

/**
 * Choáng: stars circling over the head of every stunned body (snapshot
 * `poise.staggerUntilTick` ahead of the current tick). Short-lived sprites
 * re-emitted along the orbit, so nothing needs pooling here.
 */

const STAR = Color3.FromHexString('#ffe27a');
const ORBIT = 0.42;
const STARS = 3;

export class StunFx {
  private time = 0;
  private due = 0;

  constructor(private readonly fx: CombatFx) {}

  update(dt: number, stunned: Iterable<EntityView>): void {
    this.time += dt;
    this.due -= dt;
    if (this.due > 0) return;
    this.due = this.fx.quality === 'low' ? 0.09 : 0.045;
    for (const view of stunned) {
      const p = view.root.position;
      const y = view.height + 0.25;
      for (let i = 0; i < STARS; i++) {
        const a = this.time * 5 + (i / STARS) * Math.PI * 2;
        this.fx.sprite({
          sprite: 'star',
          x: p.x + Math.sin(a) * ORBIT,
          y: y + Math.sin(a * 2) * 0.04,
          z: p.z + Math.cos(a) * ORBIT,
          mode: 'billboard',
          roll: a,
          w: 0.5,
          life: 0.2,
          color: STAR,
          intensity: 1.6,
        });
      }
    }
  }
}
