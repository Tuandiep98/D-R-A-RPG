---
name: babylon-vfx
description: Design, implement, audit, and verify combat, mobility, elemental, and summon VFX for D-R-A-RPG's Babylon.js renderer. Use for skill effects, attack trails, elemental overlays, summon presentation, VFX assets, or VFX performance work in this repository.
---

# Babylon VFX

Build a readable, stylized, mobile-safe VFX language for every authored skill. Treat VFX as presentation driven by authoritative simulation events; never calculate hits, damage, cooldowns, summon outcomes, or movement in the renderer.

Before changing code:

1. Read `CLAUDE.md`, `docs/performance_budget.md`, and the relevant portions of `docs/plan/04_combat_elements_skills_redesign.md`.
2. Read [references/repo-contract.md](references/repo-contract.md).
3. Read [references/vfx-language.md](references/vfx-language.md) when authoring or reviewing an effect.
4. Read [references/research.md](references/research.md) only when choosing Babylon primitives, importing assets, or revisiting performance decisions.
5. Run `node tools/codex-skills/babylon-vfx/scripts/audit-vfx-coverage.mjs` before and after a multi-skill change.

## Required composition

Every player-visible action composes independent layers:

- **Gameplay silhouette:** delivery and timing remain legible without color: cast, travel/active, impact, sustain, cancel/expire.
- **Technique identity:** the Dao/faction/weapon signature, such as slash geometry, formation rune, talisman projectile, body-force shockwave, pet command, or firearm blast.
- **Natal element overlay:** a restrained Kim/Moc/Thuy/Hoa/Tho layer derived from the acting entity's element. It supplements rather than replaces technique identity.
- **Expression overlay:** Lôi, ice, or future expressions layer on top of the natal element. Never let expression coloring erase the natal element.
- **Feedback:** sound, hit flash, trail, camera response, and readable telegraph, scaled by ownership, distance, importance, and quality preset.

Basic attacks need weapon/fist trails and contact feedback. Roll, blink, jump, and Dao-specific mobility need distinct departure, path, and arrival moments. Persistent skills need start, sustain, refresh, cancel, and expire presentation.

Summons are explicit gameplay states, not ambient followers. The summon skill toggles active/inactive, emits authoritative summon/dismiss events, and keeps a bounded persistent presentation while active. Upgrades or collection may select a different summon profile, but presentation reads the profile supplied by authoritative state. Include summon gate/rune, materialization, active tether or owner mark, command feedback, dismissal, death, and respawn-ready states.

## Implementation rules

- Reuse `CombatFx` batches, ribbons, `LightningBatch`, existing Kenney CC0 media, and pooled primitives before introducing another rendering subsystem.
- Prefer a few high-contrast planes, ribbons, rings, bolts, and thin-instanced particles over dense emitters, dynamic lights, post-processing, or physics.
- Keep telegraphs visually separate from decorative VFX and visible on Low.
- Bound every collection and lifetime. Pool hot-path objects; dispose persistent resources.
- Give Low a complete readable effect with fewer layers, not a missing effect. Scale decorative density before silhouette/timing cues.
- Use entity/event element for the natal overlay and expression for the secondary overlay. Do not collapse both to one color lookup.
- Keep game data responsible for stable VFX style IDs and media IDs. Keep renderer code responsible for presentation recipes, not gameplay stats.
- New third-party media requires `SOURCE.json` and `LICENSE.txt`; never edit `originals/`. Procedural fallback textures must remain usable when media has not been built.
- Avoid React state for per-frame effects. Drive presentation from `SimEvent`, snapshots, entity anchors, and renderer-owned clocks.
- When an event cannot express a required phase, extend protocol and authoritative systems first, validate with Zod, then render it.

## Verification

For each changed effect, prove:

- cast/active/impact/cancel or expire timing follows emitted events;
- all target forms used by the skill work (self, target, point, cone, line, projectile);
- the natal element remains visible with base and Lôi expression;
- Low preserves gameplay readability and stays bounded;
- repeated casting does not leak meshes/materials/timers or grow maps without limit;
- missing media uses a procedural or approved fallback;
- relevant unit tests, `pnpm validate:data`, renderer typecheck, and an appropriate smoke preview pass.

Do not claim full VFX coverage from a build or typecheck alone. Use the coverage audit plus visual evidence across every current skill family, mobility action, basic attack type, summon lifecycle, element, and Low preset.
