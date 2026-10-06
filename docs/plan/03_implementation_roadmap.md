# Implementation Roadmap

Tài liệu nguồn: `00_game_design_master.md` (Thiên Cơ Kỷ), `01_tech_stack_plan.md`, `02_assets_models_maps_plan.md`, `../decision_log.md`.
Cập nhật: 2026-10-06.

Ký hiệu: ✅ xong · 🟡 có nền tảng/placeholder, cần hoàn thiện · ✋ cần người làm (art, thiết bị, quyết định) · ⬜ chưa làm.

---

## Tổng quan milestone

| Milestone                                     | Trạng thái     | Kiểm chứng                                                 |
| --------------------------------------------- | -------------- | ---------------------------------------------------------- |
| M1 Sandbox slice (offline)                    | ✅             | Smoke test, model Quaternius                               |
| M2 Navigation & feel, vertical slice gameplay | ✅ (art 🟡)    | 46+ unit test, smoke offline + bản production              |
| M3 Online (Colyseus)                          | ✅             | Integration test 2 client qua WebSocket thật, smoke online |
| M4 Persistence & backend                      | ✅ (deploy ✋) | Test repository (PGlite), test API (auth, admin, 2FA)      |

## Tech plan — Phase 0–9 (mục 48)

| Phase           | Hạng mục                                                                                | Trạng thái | Ở đâu                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0 Foundation    | Monorepo, shared types, Babylon bootstrap, React HUD, Colyseus server, DB, auth, config | ✅         | pnpm/turbo, `packages/*`, `apps/*`                                                                                      |
| 1 Core movement | Spawn, camera xoay, click/tap move, NavMesh, player sync, other players, reconnect      | ✅         | `game-core`, `navigation`, `net-client` (reconnect 15 s + takeover)                                                     |
| 2 Combat        | Chọn mục tiêu, tự tiếp cận, auto attack, HP, damage, chết/hồi sinh, skill               | ✅         | 5 skill player, cooldown/MP/range server-side                                                                           |
| 3 Monster/AI    | Spawn, patrol (wander), aggro, chase, attack, leash, elite, boss                        | ✅         | Boss 3 phase + telegraph né được; elite có phase                                                                        |
| 4 RPG systems   | Inventory, equipment, item stats, loot, skill, quest; **không level** (D-024)           | ✅         | Quest kill/collect/talk, chuỗi 6 nhiệm vụ, NPC; tiến triển bằng cảnh giới + node                                        |
| 5 World         | Zone, chunk, streaming, AOI, chuyển map, dungeon instance                               | ✅         | Phó bản solo "Cơ Quan Điện" (1 instance/nhân vật)                                                                       |
| 6 Optimization  | Pool, LOD, simulation LOD, thin instances, quality runtime, nén asset, profile mobile   | 🟡         | Simulation LOD ✅, bundle Babylon 7.5→4.0 MB ✅, LOD1 environment tự động ✅ (cây cần impostor ⬜), profile thiết bị ✋ |
| 7 Economy       | Craft, upgrade, currency ledger, shop, chuẩn bị marketplace                             | ✅         | Shop mua/bán, 3 công thức, cường hoá +1…+5; marketplace ⬜                                                              |
| 8 Social        | Chat, friend, guild, party, leaderboard                                                 | ✅         | Chat, party, bạn bè, bang hội (DB + API + panel), leaderboard                                                           |
| 9 PWA/mobile    | PWA install, runtime cache, offline shell, Capacitor                                    | 🟡         | PWA ✅; Capacitor config ✅, `cap add android/ios` ✋                                                                   |

## Game design — master plan Thiên Cơ Kỷ (`00_game_design_master.md`)

| Hạng mục (§)                                                                 | Trạng thái | Ở đâu / ghi chú                                                                                       |
| ---------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| Không Character Level (§31, §119)                                            | ✅         | D-024; level/XP đã xoá khỏi mọi tầng                                                                  |
| Cảnh giới + tên Cơ Giới (§38–55)                                             | 🟡         | `game-data/realms` đủ 5 cảnh; chỉ Luyện Khí → Trúc Cơ có đột phá                                      |
| Breakthrough event, thất bại không mất tiến độ (§59–62)                      | ✅         | `game-core/systems/cultivation.ts`; VFX + thông báo; phản phệ                                         |
| Node tu luyện Tiên/Cơ/Hỗn Nguyên, Kinh mạch tải / Body load (§33–35, §71–72) | 🟡         | 10 node (8 Luyện Khí, 2 Trúc Cơ); panel Tu Luyện (phím K)                                             |
| Tri thức là progression (§73)                                                | 🟡         | Node yêu cầu quest (Kiếm Khí ← gặp Lục Viễn; Kinetic Arm ← phế liệu)                                  |
| Realm gap (§57)                                                              | ✅         | `progression_rules.yaml`; quái có `realm`                                                             |
| Realm pressure / uy áp, HUD interference (§56)                               | ⬜         |                                                                                                       |
| Skill mutation thay skill level (§37)                                        | ⬜         |                                                                                                       |
| 8 Đạo + skill web (§36)                                                      | ⬜         | Hiện chỉ trục `dao` trên node                                                                         |
| Kim Đan properties / Foundation / Frame lựa chọn (§44–49)                    | 🟡         | Kiếm Cơ, Medium Frame là node Trúc Cơ; chưa có lựa chọn loại trừ nhau                                 |
| World layer theo cảnh giới (§64)                                             | ⬜         |                                                                                                       |
| Equipment evolution, tier Tiên/Cơ (§65–68)                                   | ⬜         |                                                                                                       |
| Bản Mệnh + bond (§69–70)                                                     | ⬜         |                                                                                                       |
| Mutation trade-off (§77–78), hidden path (§76)                               | ⬜         |                                                                                                       |
| Respec soft/medium/hard (§86–88)                                             | ⬜         | Node hiện không gỡ được                                                                               |
| Boss drop đa dạng (§89)                                                      | 🟡         | Guardian X-04 rơi Lõi Cơ Quan (dùng cho node Trúc Cơ)                                                 |
| Lore: tên game, NPC, địa danh (§1–30)                                        | 🟡         | D-025; map Tân Nguyên Trấn / Phế Tích Vô Danh / Huyền Vũ Cổ Mộ; thế lực, story arc chưa có trong game |
| Map gating không dùng level (§63)                                            | ✅         | Không có yêu cầu cấp; boss khuyến nghị Trúc Cơ                                                        |

## Assets plan — backlog P0 (mục 16)

| Hạng mục                                     | Trạng thái | Ghi chú                                                                                             |
| -------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| Kiểm tra repo, chọn renderer                 | ✅         | D-001                                                                                               |
| Thiết bị đo + scene benchmark                | 🟡 ✋      | iPhone 13 Pro Max (D-011); **chưa đo trên máy**; thiếu Android tầm trung                            |
| Audit license, chọn base/animation/env       | 🟡 ✋      | 4 pack CC0 có SOURCE/LICENSE; `licenseVerified` chờ người xác nhận; `docs/asset_catalog.md` tự sinh |
| Camera, tỉ lệ, lineup, palette               | 🟡 ✋      | Camera + tỉ lệ + palette trong `art_bible.md`; lineup ảnh ✋                                        |
| Chuẩn rig humanoid, sockets, export          | 🟡 ✋      | `rig_contract.md`, sockets chạy cho Warrior; rig modular chưa chọn                                  |
| 1 player + 3 outfit swap                     | 🟡 ✋      | Dữ liệu 3 bộ + chỉ số ✅; outfit skinned cần base modular ✋                                        |
| Kiếm, đại đao, gauntlet, pháp khí            | 🟡         | Item + stat + gắn socket (placeholder mesh); model thật ✋                                          |
| 3 quái thường (≥1 robot), 1 tinh anh, 1 boss | ✅         | Sói, hồ ly, robot; Linh Lộc tinh anh; Cơ Quan Thần Tướng                                            |
| Map có nav/collision/spawn/portal            | ✅         | "Rừng Cơ Quan" sinh từ layout + navmesh bake                                                        |
| Animation/events combat                      | 🟡         | Clip theo role ✅, hit-delay ✅; trail/footstep ⬜                                                  |
| VFX/telegraph/loot/icon                      | 🟡         | Telegraph, impact, kiếm khí, cột sáng loot ✅; icon là emoji ✋                                     |
| Asset manager, manifest, cache, fallback     | ✅         | Dedupe, retry, progress theo byte, decoder local, PWA cache                                         |
| Profile, nghiệm thu thiết bị thật            | ✋         | `pnpm dev:mobile` + `docs/performance_budget.md`                                                    |

## Việc tiếp theo (tự động được)

1. Kênh chat bang hội / thì thầm bạn bè (cần presence qua Redis giữa các room).
2. Marketplace (escrow, khoá item trong giao dịch — tech plan §55.2).
3. Impostor/billboard cho cây ở xa (simplify không giảm được lá dạng quad); LOD cho quái skinned.
4. Presence `online`/takeover qua Redis khi chạy nhiều game-server process.
5. Lệnh GM trực tiếp trong game (thay cho "tặng vật phẩm" offline).
6. Party xuyên map và party trong phó bản (hiện party chỉ trong một map).
7. Tiếp tục giảm bundle (Babylon 4.0 MB → < 3 MB): tách inspector, lazy-load shadow/VFX.

## Việc cần người làm

- Xác minh license trên trang tác giả → `licenseVerified: true`.
- Chơi thử và đo trên iPhone 13 Pro Max (`pnpm dev:mobile`), bổ sung một máy Android tầm trung.
- Duyệt UAL2 và convert Ultimate Modular Ruins (OBJ/FBX); P0 Outfits/UAL1, Medieval/Fantasy Props, Sci-Fi, Animated Mech và KayKit đã tích hợp (`../asset_sourcing.md`).
- Tự làm: kit kiến trúc Đông phương, boss Guardian X-04 hai lớp vỏ, implant/visual cảnh giới (xem `../asset_sourcing.md`).
- Lineup/palette board, model boss riêng, kit kiến trúc di tích, icon.
- Hạ tầng thật: domain, VPS/Fly, Postgres managed, secret thật (`.env.example`).
