# Decision Log

Mỗi quyết định: ngày, bối cảnh, quyết định, hệ quả. Khi mâu thuẫn với `docs/plan/*`, file này được ưu tiên.

---

## D-001 — Renderer: Babylon.js
- **Ngày:** 2026-10-06
- **Bối cảnh:** Assets plan (mục 2) để ngỏ Three.js vs Babylon.js; tech plan đã chọn Babylon.js.
- **Quyết định:** Babylon.js, WebGPU khi hỗ trợ, fallback WebGL2.
- **Hệ quả:** Không spike Three.js. Asset pipeline nhắm tới loader glTF của Babylon.

## D-002 — Camera: perspective, xoay quanh player
- **Ngày:** 2026-10-06
- **Bối cảnh:** Tech plan (mục 25) muốn camera xoay; assets plan (mục 2) đề xuất orthographic không xoay trong MVP.
- **Quyết định:** `ArcRotateCamera` perspective, target theo player, giới hạn pitch (~35–55° so với mặt đất) và zoom (radius ~6–18m). Desktop right-drag xoay, wheel zoom; mobile drag xoay, pinch zoom.
- **Hệ quả:** Asset/environment phải đọc được từ mọi hướng yaw; không được cắt bỏ mặt sau model. Mục 3.3 và 3.1 của assets plan áp dụng với góc pitch trong khoảng trên.

## D-003 — Milestone 1 chạy offline qua `SimHost`
- **Ngày:** 2026-10-06
- **Bối cảnh:** Cần dựng khung nhanh để test nhân vật/quái/env, nhưng không muốn phải viết lại khi lên online.
- **Quyết định:** M1 dùng `LocalSimHost` chạy `game-core` trong browser với tick cố định. Client chỉ gửi intent và nhận snapshot/event, giống hệt khi có server. Intent vẫn validate bằng Zod.
- **Hệ quả:** M3 thêm `ColyseusSimHost` + game-server dùng chung `World`; client/renderer không đổi.

## D-004 — Tick cố định 20 Hz, thời gian tính bằng tick
- **Ngày:** 2026-10-06
- **Quyết định:** `TICK_RATE = 20`. Cooldown, attack interval, respawn đổi từ giây sang tick qua `secondsToTicks`. RNG seeded (mulberry32) trong `World`.
- **Hệ quả:** Combat deterministic với cùng seed + cùng chuỗi intent → test và replay được.

## D-005 — Zod cho mọi schema
- **Ngày:** 2026-10-06
- **Quyết định:** Zod cho intent/snapshot/event, game-data YAML, env config và API body.
- **Hệ quả:** Type TS suy ra từ schema (`z.infer`), không khai báo trùng.

## D-006 — Meshopt là nén mesh mặc định
- **Ngày:** 2026-10-06
- **Bối cảnh:** Cả hai plan liệt kê Meshopt + Draco.
- **Quyết định:** `EXT_meshopt_compression` mặc định (decode nhanh, nén được animation). Draco chỉ dùng khi đo thấy lợi rõ cho geometry tĩnh lớn.

## D-007 — Vị trí dữ liệu map
- **Ngày:** 2026-10-06
- **Quyết định:** Dữ liệu gameplay của map (chunks, instances, spawns, obstacles, portals) nằm ở `game-data/maps/*.yaml`. Geometry/nav runtime đã build nằm trong output asset (manifest). Map schema hợp nhất mục 39 (tech plan) và 13.3 (assets plan).

## D-008 — Navigation
- **Ngày:** 2026-10-06
- **Quyết định:** M1 di chuyển thẳng + va chạm hình tròn với obstacle tĩnh của map. M2 chuyển sang NavMesh bake bằng `@recast-navigation/*` trong `tools/navmesh-builder`, truy vấn qua interface `NavQuery` trong `game-core` để client và server dùng chung file `.nav.bin`.

## D-009 — ID và package manager
- **Ngày:** 2026-10-06
- **Quyết định:** pnpm (qua corepack) + Turborepo. ID entity runtime trong sim là số nguyên tăng dần; ID lưu DB dùng UUIDv7 (từ M4).

## D-011 — Thiết bị đo chuẩn: iPhone 13 Pro Max
- **Ngày:** 2026-10-06
- **Bối cảnh:** Assets plan §2 và §17 yêu cầu đo trên thiết bị thật, không nghiệm thu bằng desktop.
- **Quyết định:** iPhone 13 Pro Max là thiết bị chuẩn chính. Mục tiêu 60 FPS ổn định ở preset High. Test qua `pnpm dev:mobile` (HTTPS) để Safari bật WebGPU.
- **Hệ quả:** Đây là máy mạnh; budget cho preset Low chưa được kiểm chứng. Nên thêm một máy Android tầm trung trước khi khoá budget Low. Chi tiết trong `docs/performance_budget.md`.

## D-010 — Asset M1: Quaternius CC0
- **Ngày:** 2026-10-06
- **Quyết định:** M1 dùng model Quaternius (CC0) do user tự tải về `art/third_party/<pack>/originals/`, kèm `SOURCE.json` + `LICENSE.txt`. Trạng thái `candidate` cho tới khi license được xác minh. Khi thiếu asset, renderer dùng placeholder primitive.

## D-012 — Texture WebP thay cho KTX2 (tạm thời)
- **Ngày:** 2026-10-06
- **Bối cảnh:** KTX2 cần `toktx`/KTX-Software, máy build chưa có. Texture gốc Nature MegaKit ~8 MB/cây.
- **Quyết định:** `pnpm assets:build` resize theo `TEXTURE_BUDGET` (character/monster 1024, env/prop 512) và encode WebP (sharp). Cây 8.5 MB → 230 KB.
- **Hệ quả:** WebP vẫn giải nén thành RGBA trên GPU (tốn VRAM hơn KTX2). Chuyển sang KTX2/Basis khi cài KTX-Software — chỉ đổi bước `textureCompress`.

## D-013 — Environment: một batch thin-instance cho mỗi appearance
- **Ngày:** 2026-10-06
- **Bối cảnh:** Batch theo (chunk × appearance) bằng `clone()` dùng chung geometry → buffer thin instance ghi đè lẫn nhau (lỗi WebGPU).
- **Quyết định:** Một mesh + một mesh mờ (geometry riêng) cho mỗi appearance; buffer cấp đủ dung lượng một lần, khi đổi chunk/vật chắn chỉ ghi lại matrix và `thinInstanceCount`.
- **Hệ quả:** Ít draw call, ít VRAM; mất frustum culling theo từng chunk (bù bằng chunk streaming radius). Map rất lớn có thể cần lại batch theo vùng với `makeGeometryUnique()`.

## D-014 — Simulation local chạy trong Web Worker
- **Ngày:** 2026-10-06
- **Quyết định:** Chế độ offline mặc định dùng `WorkerSimHost` + `serveSimHost`; `?noworker` để debug trên main thread.

## D-015 — Snapshot mạng: delta theo entity, gửi mỗi tick
- **Ngày:** 2026-10-06
- **Quyết định:** Server serialize mỗi entity một lần/tick, mỗi client nhận entity đổi so với lần gửi trước + id bị xoá (`DeltaEncoder`). Delta rỗng vẫn gửi để client giữ nhịp tick. Không dùng Colyseus Schema.
- **Hệ quả:** Băng thông tỉ lệ với số entity thay đổi; diff theo field là tối ưu sau nếu cần.

## D-016 — PGlite cho dev/test, Postgres cho staging/prod
- **Ngày:** 2026-10-06
- **Bối cảnh:** Máy dev không có Docker.
- **Quyết định:** `@rpg/persistence` mở PGlite (in-process) khi không có `DATABASE_URL`; cùng migration drizzle-kit với Postgres.

## D-017 — Đăng nhập mới chiếm phiên cũ
- **Ngày:** 2026-10-06
- **Quyết định:** Khi một nhân vật đang online đăng nhập lại, server kick phiên cũ (4003), chờ lưu xong rồi mới cho phiên mới vào. Không bao giờ có hai bản sao cùng lúc (chống nhân bản đồ).
- **Hệ quả:** Trạng thái `online` hiện nằm trong RAM của process; khi chạy nhiều process cần chuyển sang Redis presence.

## D-018 — Bảo mật tài khoản
- **Ngày:** 2026-10-06
- **Quyết định:** argon2id; access JWT HS256 15 phút; refresh token ngẫu nhiên lưu hash, xoay vòng mỗi lần dùng, dùng lại token cũ → thu hồi cả chuỗi; GM/admin bắt buộc TOTP (RFC 6238) và mọi thao tác ghi `audit_log`.
- **Hệ quả:** Admin "tặng vật phẩm" hiện chỉ an toàn khi nhân vật offline (game server ghi đè khi lưu). Lệnh GM trực tiếp trong game là việc sau.

## D-019 — Import Babylon theo module
- **Ngày:** 2026-10-06
- **Quyết định:** Renderer chỉ import Babylon qua `packages/babylon-renderer/src/babylon.ts` (đường dẫn module + side-effect: ray picking, thin instance, shadow scene component, animatable, WebGPU extensions, loading screen). `asset-runtime` import trực tiếp từng module.
- **Hệ quả:** Chunk Babylon 7.5 MB → 4.0 MB (gzip 1.64 → 0.94 MB). Khi dùng tính năng Babylon mới, thêm import vào `babylon.ts`; smoke test WebGPU + WebGL2 bắt lỗi thiếu side-effect.

## D-020 — Party trong phạm vi một map
- **Ngày:** 2026-10-06
- **Quyết định:** Party sống trong `World` (mời/chấp nhận/rời, tối đa 5). Thành viên trong 40 m chia XP với thưởng +20%/người thêm; loot của một thành viên nhặt được cho cả nhóm. Rời map → rời nhóm.
- **Hệ quả:** Party xuyên map/phó bản cần dịch vụ party ở tầng server (Redis) — để sau.

## D-021 — NPC, quest, shop, chế tạo, cường hoá là data
- **Ngày:** 2026-10-06
- **Quyết định:** `game-data/{npcs,quests,shops,recipes,upgrades}`. Mọi thao tác kiểm tra khoảng cách tới NPC phía server; vàng đi qua ledger (`buy`, `sell`, `craft`, `upgrade`, `quest`). Cường hoá thất bại giữ nguyên cấp (không phá đồ ở MVP). Quest log và cấp cường hoá lưu DB (migration 0002).
