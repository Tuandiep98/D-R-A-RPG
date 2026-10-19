# VFX language

## Shape before color

At gameplay camera distance, identify an action by silhouette and motion first:

- slash: one dominant crescent aligned to the weapon path, a hot narrow core, short trailing sparks;
- thrust/projectile: narrow directional trace, readable head, restrained wake, distinct contact burst;
- circle/field: ground rune boundary, centre pulse, vertical accents; never cover the telegraph boundary;
- support: inward or upward motion around the recipient, stable body outline, gentle sustain;
- shield: enclosing arc or shell with a clear gain/absorb/expire rhythm;
- summon: gate/rune opens, profile-shaped energy gathers, creature materializes, owner mark settles;
- dismissal: tether retracts and creature dissolves back toward the gate/owner; do not reuse death impact;
- mobility: departure silhouette, directional path, arrival punctuation.

Use anticipation → action → recovery. Cast charge should converge; release should expand or travel; impact should peak quickly; residue should fade without obscuring the next action.

## Technique identities

- Base sword: ivory/jade arc, crisp star contact, few angular sparks.
- Ảnh: narrow dark-violet afterimage, delayed duplicate arc, low smoke; fast and quiet.
- Pháp: geometric rune, orb/arrow head, ordered orbiting motes; controlled and precise.
- Trận: layered square/circular seals, links between nodes, persistent boundary rhythm.
- Thể: body-centred shock, dust/rock, short broad shapes; mass over sparkle.
- Thú: claw/fang sweep, owner-pet link, command ping, creature-origin effects.
- Lôi Kiếm: blue-white bolt skeleton, violet accent for ultimate, sword-shaped core rather than generic lightning noise.
- Firearm/robot: muzzle star, tracer, heat/smoke, mechanical timing; elemental overlay remains secondary.

## Natal element overlay

Keep the overlay recognizable but subordinate—roughly one ground/body cue plus a small particle motif:

- Kim `#e7edf4`: angular shards, four-point stars, hard radial lines.
- Mộc `#72d69b`: leaf/seed motes, rising spiral, branching or petal rhythm.
- Thủy `#75ceff`: curved ribbons, droplets, outward ripple.
- Hỏa `#ff8750`: embers, sharp expanding burst, upward lift.
- Thổ `#c8ac77`: square/hex fragments, dust, low ground pulse.

Lôi expression adds blue-white branching bolts and rapid secondary flashes while retaining a visible natal motif. Ice may add pale shards/rime while retaining the natal motif.

## Mobility grammar

- Roll: low dust/element wake at feet, short body streak, small landing puff. No teleport flash.
- Blink: collapse at departure, discontinuous gap, expansion at arrival; use paired glyphs so distance is readable.
- Jump: launch ring and downward motes, sparse airborne trail, landing compression/ring. Ground-low avoidance must remain a gameplay fact from simulation.
- Technique dash/leap: inherit the relevant technique identity plus natal overlay; do not render it as generic roll/blink/jump.

## Quality tiers

- Low: one main silhouette layer, one natal cue, telegraph, essential hit/contact. No blade ribbon, body crackle, dense smoke, or decorative orbiters.
- Medium: add secondary core, modest motes/sparks, short trail.
- High: add the authored accent layers and richer residue, still bounded and readable.

Large transparent quads and stacked additive layers are often more expensive than a few small particles. Reduce screen coverage and overlap before merely reducing object count.

## Review questions

1. Can the action be identified in grayscale at the gameplay camera distance?
2. Can its timing and dangerous area be read with effects set to Low?
3. Is the technique identity still dominant after adding the natal element?
4. Is the natal element still visible when expression is Lôi?
5. Does cancel/expire remove every persistent layer without hiding authoritative state?
6. Does repeated use keep pool/map/timer sizes bounded?
