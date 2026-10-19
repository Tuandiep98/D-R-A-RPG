---
name: technique-vfx
description: Tạo mới hoặc làm lại / tối ưu hiệu ứng của một skill (kiếm khí, mưa kiếm, chém, trận…) trong renderer Babylon của D-R-A-RPG, rồi thêm lớp hiệu ứng ngũ hành theo bản mệnh nhân vật. Dùng khi user yêu cầu "làm lại skill X", "đổi hiệu ứng skill", "thêm hiệu ứng ngũ hành cho skill", hoặc tối ưu VFX skill.
---

# Technique VFX: hiệu ứng skill + lớp ngũ hành

Mẫu đã làm (bộ Lôi Kiếm Tu, D-037), đọc cái gần nhất trước khi viết skill mới:

| Skill | vfx | File | Kiểu |
|---|---|---|---|
| Lôi Hoàn Kiếm | `sword_rain` | `sword-rain-fx.ts` | nhiều mảnh rơi trong vùng |
| Lôi Kiếm Xuyên Tâm | `sword_qi` | `sword-qi-fx.ts` | đạn bay xuyên, vệt theo đường |
| Lôi Bộ | `phantom_step` | `phantom-step-fx.ts` | lướt + tàn ảnh (chụp pose skinned) |
| Lôi Ảnh Trảm | `giant_sword` | `giant-sword-fx.ts` | lướt + vật thể lớn rơi xuống điểm dừng |
| Lôi Vực | `thunder_domain` | `thunder-domain-fx.ts` | aura bật/tắt bám người (`sustain`) |
| Tử Điện Trảm | `long_cut` | `long-cut-fx.ts` | đường thẳng dài, sóng chạy + khe nứt |
| Cửu Thiên Lôi Kiếp | `heaven_tribulation` | `tribulation-fx.ts` | nhiều tia đánh xuống (`strikes`) |

Khối dùng chung thêm: `GroundDecals` (`ground-decals.ts`, vết cháy **đen** — sprite CombatFx là
additive nên không vẽ được màu tối), `StunFx` (sao choáng, đọc `poise` từ snapshot),
`PhantomStepFx.start()` (tàn ảnh cho mọi skill lướt).

Làm theo **đúng thứ tự** dưới đây. Lớp ngũ hành (bước 6) chỉ thêm **sau khi** hiệu ứng
kỹ thuật trung tính đã chạy và đã xem ảnh — đừng trộn màu ngũ hành vào từ đầu.

## 1. Đọc skill và gameplay

- `game-data/skills/<id>.yaml`: `targeting`, `delivery` (`circle | line | projectile | cone | support`),
  `castTime`, `range`, `effects[].radius`, `projectileSpeed`, `vfx`, `anim`, `sfx`.
- Sự kiện renderer nhận (đều trong `packages/babylon-renderer/src/game-view.ts`, `handleEvent`):
  - `CAST_START`: bắt đầu vận công (`ev.point`, `ev.radius`, `ev.endTick`, `ev.element`, `ev.expression`).
  - `SKILL_PROJECTILE`: đạn bay (`origin`, `destination` = cuối tầm, `speed`, `projectileId`).
  - `SKILL_IMPACT`: đòn trúng (`point`, `radius`, `targetId`; projectile có `projectileId`, `targetId: null` = trúng tường / hết tầm).
  - `HIT` có `skillId`: sát thương lên một thân (`thunder.hit` / `technique.hit` đặt ở đây).
- Cơ chế có sẵn trong `SkillDefSchema`: `projectilePierce`, `stun` (trên damage), `sustain` (bật/tắt,
  MP/s), `strikes` (tia đánh xuống có ưu tiên mục tiêu), `pulses`, `field`, `delivery: line|cone|circle`.
  Test mẫu: `packages/game-core/src/thunder-kit.test.ts`, `projectile-pierce.test.ts`.
- Nếu yêu cầu đổi **cơ chế** (xuyên mục tiêu, nhiều nhịp, vùng…) → sửa server trước: field mới trong
  `SkillDefSchema` (`packages/game-data/src/schemas.ts`, có default để YAML cũ hợp lệ), logic trong
  `packages/game-core/src/systems/skills.ts`, test trong `packages/game-core/src/*.test.ts`. Client
  chỉ vẽ theo event (CLAUDE.md quy tắc 2–3). Không dùng `Math.random()` trong game-core.

## 2. Hiệu ứng kỹ thuật (trung tính)

- File mới `packages/babylon-renderer/src/<ten>-fx.ts`, một class với `cast` / `launch` / `impact` /
  `update(dt)` / `dispose`. `vfx` id mới trong YAML (vd `sword_qi`); không sửa `thunder-fx.ts`.
- Khối có sẵn, tái dùng thay vì tạo mesh/material mới:
  - `CombatFx.sprite({...})`: sprite thin-instance (`glow star spark twirl trace smoke scorch zap bolt streak rune sigil shock ring blast arc slash`), `mode: billboard | flat | upright`, `vx/vy/vz`, `gravity`, `delay`, `fadeIn`, `grow`, `growH`, `roll→rollEnd`. Có `fx.sparks`, `fx.chargeGlow(node, color, s)`, `fx.quality`, `fx.density`.
  - `LightningBatch.bolt({from,to,color,width,jitter,life,delay,branches,intensity})`.
  - `BladeBatch` (`sword-blade.ts`): kiếm ánh sáng 3D thủ tục, 2 draw call cho mọi thanh. `begin()` → `add(tipPos, rot, scale, color, k)` → `end()` mỗi frame. Mũi kiếm ở gốc, chuôi theo +Y của `rot`.
- Danh sách phần tử phải **có giới hạn** (`MAX_*`), tự xoá khi hết đời; không `new Mesh` mỗi lần cast.
- Thời gian: hiệu ứng bám event (đạn bay đúng `speed` từ `origin`→`destination`), không tự tính trúng.
- Low (`fx.quality === 'low'`): vẫn đọc được skill — giảm số mảnh / bỏ vệt phụ, không tắt hẳn.

## 3. Gắn vào game-view

`game-view.ts` đang có thay đổi chưa commit của Codex → chỉ **thêm** dòng, sửa bằng script python
(assert chuỗi gốc xuất hiện đúng 1 lần), rồi `node_modules/.bin/biome check --write <file>`.
Điểm gắn: import + field + khởi tạo cạnh `this.swordRain`, `update(dt)` cạnh `this.thunder.update`,
nhánh theo `skill.vfx` trong `CAST_START` / `SKILL_PROJECTILE` / `SKILL_IMPACT` / `HIT`. Projectile
dùng hiệu ứng riêng thì bỏ qua `this.projectiles.fire` / `stopAt` / `impacts.spawn` cho vfx đó.
Rung camera: trả `Feedback {shake, kick, seconds}` và gọi `this.feedback(ev.sourceId, f, point)`.

## 4. Smoke + xem ảnh

- Cần quái thật (choáng, trúng đích): theo mẫu `tools/smoke/thunder-kit.ts` — `?noworker` để
  `window.__rpg.host.world` là World thật: học skill (`me.skills.set(id, 0)`), dựng quái bất động
  trước mặt, đặt `combat.targetId`.
- Viết `tools/smoke/<ten>.ts` theo mẫu `tools/smoke/sword-rain.ts` (offline `?debug&map=map_sandbox_01&element=…`,
  `view.send({type:'CAST_SKILL', skillId, point})`, chụp 2 thời điểm), đăng ký `smoke:<ten>` trong
  `package.json` và một dòng trong CLAUDE.md. Ảnh vào `reports/<ten>/` (không commit).
- Dev server: `npx -y pnpm@10.34.6 dev` (chạy nền), smoke: `npx -y pnpm@10.34.6 smoke:<ten> http://localhost:5173`.
- Ghép contact sheet bằng PIL rồi **Read ảnh** để tự kiểm. Lỗi hay gặp: additive chồng nhau cháy
  trắng (giảm hệ số hull/core), chuôi kiếm quá rộng nhìn như thánh giá, vệt sáng đặt sai phía,
  hiệu ứng quá xa camera, sprite cap (`MAX_PER_KIND` 64 / Low 12) nuốt mảnh.

## 5. Kiểm tra

`npx -y pnpm@10.34.6 typecheck`, `npx -y pnpm@10.34.6 validate:data`, `rtk proxy npx -y pnpm@10.34.6 test`,
`rtk proxy node_modules/.bin/biome check <files>`. Hook prettier toàn cục chạy sau Edit/Write → luôn
biome lại các file đã đụng. Không commit khi user chưa bảo; không commit thay đổi của Codex.

## 6. Lớp ngũ hành (thêm sau cùng)

Dùng `element-burst.ts`, không tự chế bảng màu mới:

- `fxKind(element, expression, level)` → `kim | moc | thuy | hoa | tho | thunder | ice | none`
  (expression Lôi/Băng thắng bản mệnh; setting = 0 → `none`).
- `ELEMENT_TONES[kind]`: `color`, `density` (nhân số mảnh), `intensity`, `scale`, `speed`, `shake`.
  Kim nhiều & gắt nhất, Mộc ít & dịu, Lôi nhanh, Thổ ít mà to/nặng, Hỏa đậm.
- `elementBusy(level, quality)` nhân số mảnh; `elementStrength(tone, level)` nhân độ sáng.
  `level` lấy từ setting "Hiệu ứng ngũ hành" (`() => this.elementAura.level` trong game-view).
- `ElementBurst`: `burst(kind, x, z, scale, k)` tại điểm chạm, `mote(kind, x, y, z, k)` rải dọc đường
  bay (mỗi ~0.3–0.5 m, Low thưa hơn), `scar(kind, x0, z0, x1, z1, k)` vệt trên đất theo đường thẳng.
  Thêm motif mới cho mọi `FxKind` cùng lúc, trong file này, để skill khác dùng lại.
- Màu `none` = ánh sáng trắng trung tính; hiệu ứng kỹ thuật vẫn phải đầy đủ ở level 0.
- Smoke chụp đủ: 7 hệ (`kim moc loi thuy bang hoa tho`), level 0 và 2, và `quality=low`.
