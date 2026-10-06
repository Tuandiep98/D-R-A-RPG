# Implementation Roadmap

Tài liệu nguồn: `01_tech_stack_plan.md`, `02_assets_models_maps_plan.md`, `../decision_log.md`.

Milestone được sắp để mỗi bước chạy được end-to-end, rồi mới mở rộng.

---

## M1 — Sandbox Slice (offline) — ĐÃ DỰNG KHUNG (06/10/2026)

Trạng thái: khung chạy được với placeholder; `pnpm smoke` pass trên cả WebGPU và WebGL2 (boot, click-to-move, click-to-attack, quái chết, không lỗi console). Pipeline asset đã test bằng GLB tự sinh (meshopt + thin instance).

Còn lại của M1:
- [ ] Tải Quaternius theo `art/third_party/README.md`, chạy `pnpm assets:build`, chỉnh tên clip trong `game-data/appearances/*.yaml`.
- [ ] Kiểm tra animation thật (idle/run/attack/death) và hướng/scale model.
- [ ] Chạy thử trên điện thoại thật (touch: tap/drag/pinch).

Ghi chú kỹ thuật phát hiện khi dựng:
- Babylon tải meshopt decoder từ CDN của Babylon; cần copy decoder về local trước khi làm PWA offline (M2).
- Cây ở foreground có thể che player → cần fade/dither foreground (assets plan §8.3) ở M2.
- Di chuyển thẳng + đẩy khỏi collider có thể kẹt sau vật cản lớn → NavMesh ở M2.
- Đang import `@babylonjs/core` từ index (bundle lớn); tối ưu import theo module khi làm performance.

**Mục tiêu:** khung chạy được với 1 nhân vật, ít quái, ít entity môi trường để test.

**Definition of Done:**
- `pnpm dev` mở được map nhỏ (1 chunk ~40×40m) có 15–30 cây/đá dùng thin instances.
- 1 player có animation idle/run/attack/death (Quaternius, có placeholder khi thiếu).
- 3–5 quái thuộc 2 loại, AI idle → aggro → chase → attack → leash/return.
- Click đất để di chuyển; click quái để tự tiếp cận + auto-attack.
- Quái chết → respawn sau N giây; player chết → respawn ở spawn point.
- Camera xoay (right-drag / drag), zoom (wheel / pinch).
- HUD React: HP player, target frame, debug overlay (FPS, tick, entity count, draw calls).
- Unit test `game-core` pass; dependency-cruiser chặn Babylon/React trong core.

**Task:**
1. Monorepo foundation: pnpm, Turborepo, TS strict, Biome, Vitest, dependency-cruiser.
2. `packages/game-core`: math, rng, tick, entity store, systems (intent, movement, combat, AI, death/respawn), `World`.
3. `packages/game-protocol`: Zod intent/snapshot/event, `PROTOCOL_VERSION`.
4. `packages/game-data` + `game-data/`: schema + YAML (`wolf_001`, `robot_scout_001`, `player_default`, `sandbox_01`), `pnpm validate:data`.
5. `packages/sim-host`: `SimHost` + `LocalSimHost`.
6. `packages/input`: `InputManager` + mouse/keyboard + touch adapters.
7. Asset pipeline: `art/third_party` provenance, `tools/asset-processor` (gltf-transform + meshopt + hash + manifest).
8. `packages/asset-runtime`: manifest, load/dedupe container, fallback placeholder.
9. `packages/babylon-renderer`: engine bootstrap, camera rig, entity views + pool + interpolation, animation controller, picking, selection ring, damage text, thin instance env.
10. `apps/game-web`: Vite + React + Zustand HUD, debug overlay, Inspector (dev).

## M2 — Navigation & Feel

- NavMesh: `tools/navmesh-builder` (recast-navigation-js), `NavQuery` trong core, path following.
- Chạy sim trong Web Worker.
- KTX2 textures, LOD đơn giản.
- 1–2 skill chủ động (cast time, cooldown, AoE nhỏ), VFX cơ bản.
- `QualityManager` cơ bản (resolution scale, shadow on/off).
- Playwright smoke test, GitHub Actions CI (lint → typecheck → test → validate data → build).

## M3 — Online

- `apps/game-server`: Colyseus room dùng chung `World`.
- `ColyseusSimHost` ở client; interpolation qua mạng; nhiều player nhìn thấy nhau.
- Dev token auth trong `onAuth`, Zod validate message, rate limit theo connection, movement validation.
- AOI zone + spatial grid (cell 30m).
- Load test với `@colyseus/loadtest`.

## M4 — Persistence & Backend

- `apps/api-server`: Fastify + Zod + pino.
- Postgres + Drizzle + drizzle-kit migration; Redis; Docker Compose.
- Auth thật: argon2id, JWT access + refresh rotation.
- Character save/load, inventory, loot, wallet + currency ledger (transaction + idempotency).
- Deploy staging (VPS/Fly + Caddy, Cloudflare Pages cho web).

## Sau M4

Tiếp tục theo Phase 3–9 của tech plan (mục 48) và roadmap asset (mục 15 assets plan): elite/boss, equipment modular 3 outfit, map "Rừng Cơ Quan", chunk streaming, optimization, economy, social, PWA/Capacitor.
