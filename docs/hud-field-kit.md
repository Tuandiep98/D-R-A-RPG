# Thiên Cơ field kit

The game HUD uses cut stone and metal planes so the controls remain legible over both bright grass and dark dungeons. Brass marks frames and navigation; the currently equipped skill's element supplies the combat accent. This keeps the default thunder sword kit distinct without making the whole interface dependent on one element.

## Layout

- Desktop: player and target frames at the top, a compact menu rail at the right, and four equal assignable skill slots at the bottom. Basic attack remains the left mouse button.
- Touch: player frame and one menu trigger at the top; joystick on the left; three equal primary skills around a larger basic attack button on the right; a smaller mobility or defense slot below. The menu expands only on demand.
- Inventory: equipped gear, bag, and selected item detail. Tapping a mobile item selects it first; the visible action button equips, removes, or uses it.
- Settings: visual quality, audio, controls, and playtest options are grouped in one scrollable panel.

## Extending the look

- `apps/game-web/src/hud-design.css` owns the visual tokens and responsive rules. Keep surfaces opaque enough for the 3D scene and avoid blur or continuously animated decoration.
- `apps/game-web/src/hud/HudGlyph.tsx` owns the lightweight SVG icon family. Add a glyph and map a skill ID there when a new combat style needs its own silhouette.
- `elementClass()` in `apps/game-web/src/hud/Hud.tsx` maps skill IDs to `skill-element-*` classes. Add the matching accent in the CSS when a new element arrives. Thunder is the first complete style; wood, fire, earth, metal, and water already have accent hooks.
- Keep touch hit areas at least 44 CSS pixels, account for safe areas, and check both phone orientations before shipping new controls.
