# Implementation Roadmap

Tài liệu nguồn: `01_tech_stack_plan.md`, `02_assets_models_maps_plan.md`, `../decision_log.md`.
Cập nhật: 2026-10-06.

Ký hiệu: ✅ xong · 🟡 có nền tảng/placeholder, cần hoàn thiện · ✋ cần người làm (art, thiết bị, quyết định) · ⬜ chưa làm.

---

## Tổng quan milestone

| Milestone | Trạng thái | Kiểm chứng |
|---|---|---|
| M1 Sandbox slice (offline) | ✅ | Smoke test, model Quaternius |
| M2 Navigation & feel, vertical slice gameplay | ✅ (art 🟡) | 46+ unit test, smoke offline + bản production |
| M3 Online (Colyseus) | ✅ | Integration test 2 client qua WebSocket thật, smoke online |
| M4 Persistence & backend | ✅ (deploy ✋) | Test repository (PGlite), test API (auth, admin, 2FA) |

## Tech plan — Phase 0–9 (mục 48)

| Phase | Hạng mục | Trạng thái | Ở đâu |
|---|---|---|---|
| 0 Foundation | Monorepo, shared types, Babylon bootstrap, React HUD, Colyseus server, DB, auth, config | ✅ | pnpm/turbo, `packages/*`, `apps/*` |
| 1 Core movement | Spawn, camera xoay, click/tap move, NavMesh, player sync, other players, reconnect | ✅ | `game-core`, `navigation`, `net-client` (reconnect 15 s + takeover) |
| 2 Combat | Chọn mục tiêu, tự tiếp cận, auto attack, HP, damage, chết/hồi sinh, skill | ✅ | 5 skill player, cooldown/MP/range server-side |
| 3 Monster/AI | Spawn, patrol (wander), aggro, chase, attack, leash, elite, boss | ✅ | Boss 3 phase + telegraph né được; elite có phase |
| 4 RPG systems | Inventory, equipment, item stats, loot, XP, level, skill, quest | 🟡 | Tất cả trừ **quest** ⬜ |
| 5 World | Zone, chunk, streaming, AOI, chuyển map, dungeon instance | 🟡 | Dungeon instance riêng ⬜ (channel tự động đã có) |
| 6 Optimization | Pool, LOD, simulation LOD, thin instances, quality runtime, nén asset, profile mobile | 🟡 | LOD mesh ⬜, simulation LOD server ⬜, profile thiết bị ✋ |
| 7 Economy | Craft, upgrade, currency ledger, shop, chuẩn bị marketplace | 🟡 | Ledger ✅; craft/upgrade/shop ⬜ |
| 8 Social | Chat, friend, guild, party, leaderboard | ⬜ | |
| 9 PWA/mobile | PWA install, runtime cache, offline shell, Capacitor | 🟡 | PWA ✅; Capacitor ⬜ |

## Assets plan — backlog P0 (mục 16)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Kiểm tra repo, chọn renderer | ✅ | D-001 |
| Thiết bị đo + scene benchmark | 🟡 ✋ | iPhone 13 Pro Max (D-011); **chưa đo trên máy**; thiếu Android tầm trung |
| Audit license, chọn base/animation/env | 🟡 ✋ | 4 pack CC0 có SOURCE/LICENSE; `licenseVerified` chờ người xác nhận; `docs/asset_catalog.md` tự sinh |
| Camera, tỉ lệ, lineup, palette | 🟡 ✋ | Camera + tỉ lệ + palette trong `art_bible.md`; lineup ảnh ✋ |
| Chuẩn rig humanoid, sockets, export | 🟡 ✋ | `rig_contract.md`, sockets chạy cho Warrior; rig modular chưa chọn |
| 1 player + 3 outfit swap | 🟡 ✋ | Dữ liệu 3 bộ + chỉ số ✅; outfit skinned cần base modular ✋ |
| Kiếm, đại đao, gauntlet, pháp khí | 🟡 | Item + stat + gắn socket (placeholder mesh); model thật ✋ |
| 3 quái thường (≥1 robot), 1 tinh anh, 1 boss | ✅ | Sói, hồ ly, robot; Linh Lộc tinh anh; Cơ Quan Thần Tướng |
| Map có nav/collision/spawn/portal | ✅ | "Rừng Cơ Quan" sinh từ layout + navmesh bake |
| Animation/events combat | 🟡 | Clip theo role ✅; event hit-window/trail/footstep ⬜ |
| VFX/telegraph/loot/icon | 🟡 | Telegraph, impact, kiếm khí, cột sáng loot ✅; icon là emoji ✋ |
| Asset manager, manifest, cache, fallback | ✅ | Dedupe, retry, progress theo byte, decoder local, PWA cache |
| Profile, nghiệm thu thiết bị thật | ✋ | `pnpm dev:mobile` + `docs/performance_budget.md` |

## Việc tiếp theo (tự động được)

1. Quest cơ bản (data-driven: kill/collect/talk) + NPC.
2. Chat (kênh map, rate limit, mute từ API) — nền móng social.
3. Shop NPC + craft/upgrade dùng ledger.
4. LOD cho skinned/static mesh trong pipeline (`simplify` theo ratio).
5. Simulation LOD phía server (tick thưa cho quái xa người chơi).
6. Animation events (hit window) để số damage khớp nhát chém.
7. Presence `online` qua Redis khi chạy nhiều game-server process.
8. Import Babylon theo module để giảm bundle (~7.5 MB → mục tiêu < 3 MB).

## Việc cần người làm

- Xác minh license trên trang tác giả → `licenseVerified: true`.
- Chơi thử và đo trên iPhone 13 Pro Max (`pnpm dev:mobile`), bổ sung một máy Android tầm trung.
- Chọn base character modular (Universal Base Characters + Animation Library hoặc tự làm) và làm 3 outfit.
- Lineup/palette board, model boss riêng, kit kiến trúc di tích, icon.
- Hạ tầng thật: domain, VPS/Fly, Postgres managed, secret thật (`.env.example`).
