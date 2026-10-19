# Repository VFX contract

## Authoritative flow

The simulation owns results. Presentation currently consumes:

- `ATTACK` and `DAMAGE` for basic swings, ranged shots, hit timing, and contact feedback.
- `CAST_START` for wind-up, facing, charge, telegraph, and mobility departure.
- `SKILL_PROJECTILE` for authoritative projectile origin/destination/speed.
- `SKILL_IMPACT` for arrival, impact point, radius, line, target, element, and expression.
- `ACTION_CANCEL`, `DEATH`, `SPAWN`, and `DESPAWN` for cleanup and lifecycle.

Do not infer a successful impact from elapsed client time. Delayed cosmetic sub-moments may use renderer time only after an authoritative phase has started.

## Existing renderer pieces

- `packages/babylon-renderer/src/combat-fx.ts`: thin-instanced additive sprites, pooled blade ribbons, basic attack arcs/impacts, procedural texture fallback, quality density.
- `packages/babylon-renderer/src/thunder-fx.ts`: dedicated Lôi recipes and delayed bolts.
- `packages/babylon-renderer/src/lightning.ts`: bounded lightning batches.
- `packages/babylon-renderer/src/vfx.ts`: telegraphs, generic impact/projectile pools, loot beams.
- `packages/babylon-renderer/src/elements.ts`: natal element palette. Use `ELEMENT_COLOR[element]` for the natal layer; `elementColor(element, expression)` is the combined expression color and must not be the only layer.
- `packages/babylon-renderer/src/game-view.ts`: event routing and quality application.
- `packages/babylon-renderer/src/quality.ts`: Low/Medium/High caps.

`CombatFx` is the primary reusable compositor. Add a focused recipe class when a family has multi-phase behavior or persistent state; do not grow `GameView` into a list of particle instructions.

## Current gameplay gaps relevant to VFX

- Mobility skills use the shared `mobility` VFX id even though roll, blink, and jump need different shapes and phases.
- Generic skill IDs such as `slash`, `projectile`, `burst`, and `heal` cover many Dao skills without sufficient technique identity.
- Lôi recipes exist, but the combined color helper replaces the natal element color instead of layering it.
- Companion code currently ensures an owned pet automatically and makes it follow the owner. The requested summon design instead requires an explicit toggle skill and authoritative active/inactive state. Do not fake this only in the renderer.
- Protocol has generic `SPAWN`/`DESPAWN`, but a complete summon presentation may require a reason/profile/owner phase or dedicated validated events so summon, death, transfer, and ordinary AOI despawn are distinguishable.

## Full-flow target

Maintain coverage for:

- basic melee combo variants, unarmed attacks, bows/guns, heavy attacks, crits, misses, blocks, and deaths;
- every `game-data/skills/*.yaml` skill, including monster and pet skills;
- roll, blink, jump, dash/leap/pursuit and interruption;
- field placement, pulses, shields, healing, cloak, formations, projectiles, lines, cones, circles, and ultimates;
- summon start, materialization, active sustain, commands, upgrade/profile swap, cancel/dismiss, death, and recovery;
- Kim, Moc, Thuy, Hoa, Tho overlays plus Lôi and future expressions;
- offline/online event parity, desktop/touch, WebGL/WebGPU, missing-media fallback, and Low.

## Recommended implementation sequence

1. Establish elemental overlay and distinct mobility phases on existing events.
2. Introduce data-driven recipe/style IDs and coverage validation for all current skills.
3. Complete Dao-specific recipes and basic-attack slash language.
4. Change companion gameplay to explicit summon toggle with validated state/events.
5. Add summon profiles/collection/upgrades and their presentation variants.
6. Run full visual and performance coverage; keep the audit honest until every row is verified.
