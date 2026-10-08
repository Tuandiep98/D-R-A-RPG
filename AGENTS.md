# Project instructions

Read and follow `CLAUDE.md` for architecture, commands and asset rules.

For every change that creates or modifies game UI, read and follow
`docs/game-ui-style.md`. The approved style is **Kenney Fantasy Glass**:
dark translucent backgrounds with backdrop blur, square Kenney Fantasy UI Borders,
white/grey fretwork, light text and restrained jade accents. Reuse the approved
source assets, existing elements, tokens and glyphs before making new ones.
Extend `apps/game-web/src/fantasy-glass.css` and the existing HUD components;
keep desktop/touch layouts, readable gameplay states and the Low/fallback styles.
The older stone/metal/brass look and the old instruction to avoid blur are superseded.

For every change that creates or modifies a map (layout, dressing, world region),
read and follow `docs/map_authoring_rules.md` (rules R1–R8 are enforced by
`tools/map-builder/map-rules.test.ts`) and the plan in `docs/plan/05_map_renovation_plan.md`.
