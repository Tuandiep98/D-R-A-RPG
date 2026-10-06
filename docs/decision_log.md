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

## D-010 — Asset M1: Quaternius CC0
- **Ngày:** 2026-10-06
- **Quyết định:** M1 dùng model Quaternius (CC0) do user tự tải về `art/third_party/<pack>/originals/`, kèm `SOURCE.json` + `LICENSE.txt`. Trạng thái `candidate` cho tới khi license được xác minh. Khi thiếu asset, renderer dùng placeholder primitive.
