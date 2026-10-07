# D-R-A-RPG — Thiên Cơ Kỷ

RPG online 2.5D semi-mini (Tu Tiên × Cơ Giới). Web/PWA trước, mobile sau. **Không có Character Level**: nhân vật mạnh lên bằng cảnh giới, node tu luyện và đột phá.

Tài liệu chính:

- `docs/plan/00_game_design_master.md` — master plan: lore, thế lực, NPC, progression không level, cảnh giới, breakthrough
- `docs/plan/01_tech_stack_plan.md` — tech stack, kiến trúc, security baseline (mục 54–57)
- `docs/plan/02_assets_models_maps_plan.md` — art bible, rig, equipment, map, asset pipeline
- `docs/plan/03_implementation_roadmap.md` — trạng thái từng phase/hạng mục, việc tiếp theo
- `docs/plan/04_combat_elements_skills_redesign.md` — plan combat RPG × MOBA, ngũ hành, skill tám Đạo, migration Lôi/súng và auto farm (nền tảng/combat slice đã triển khai; kit tám Đạo còn trong roadmap)
- `docs/asset_sourcing.md` — pack asset/model/map đề xuất theo lore mới, khoảng trống phải tự làm
- `docs/game-ui-style.md` — quy tắc UI bắt buộc: Kenney Fantasy Glass, source/element, blur và fallback
- `docs/decision_log.md` — quyết định đã chốt (ưu tiên khi mâu thuẫn với plan)
- Contracts: `docs/rig_contract.md`, `docs/equipment_contract.md`, `docs/map_contract.md`, `docs/art_bible.md`, `docs/performance_budget.md`, `docs/asset_catalog.md` (tự sinh)

## Lệnh

```bash
pnpm install
pnpm dev                 # web client offline (sim trong Web Worker)
pnpm dev:mobile          # HTTPS trên LAN (WebGPU trên Safari iOS)
pnpm dev:game-server     # Colyseus :2567 (đọc ../../.env)
pnpm dev:api             # Fastify :3000
pnpm dev:admin           # trang quản trị :5190
pnpm dev:stack           # API + game server trong 1 process (dùng chung PGlite) — dev không Docker
pnpm test                # Vitest toàn repo (gồm integration server/API)
pnpm typecheck && pnpm lint && pnpm depcruise
pnpm content:build       # maps:build → nav:build → validate:data
pnpm assets:build        # art/third_party → apps/game-web/public/assets + docs/asset_catalog.md
pnpm assets:convert      # pack chỉ có OBJ/FBX → <pack>/converted/*.glb (chạy trước assets:build)
pnpm assets:vendor       # sinh art/third_party/.gitignore: commit đúng các file game dùng (--check trong CI)
pnpm assets:fantasy-ui   # tô màu sprite Kenney Fantasy UI → apps/game-web/src/assets/fantasy-ui
pnpm media:build         # icon / khung UI / âm thanh / sprite VFX → public/media + docs/media_catalog.md
pnpm assets:inspect <f>  # kích thước, tris, clip của glTF; --json để dùng trong script
pnpm assets:sheet <out> <dir>  # ảnh ghép có nhãn để chọn icon/khung bằng mắt
pnpm smoke:gear [url]    # chụp cận nhân vật (hình nộm UAL) để căn socket/xoay vũ khí
pnpm smoke [url]         # headless Chrome smoke test against a running dev/preview server
pnpm smoke:controls [url] # WASD desktop + joystick điện thoại dọc/ngang (touch thật qua CDP)
pnpm smoke:responsive [url] # 9 kích thước desktop/tablet/phone: tràn màn, đè nhau, vùng chạm <44px, chữ <11px
pnpm smoke:login [url]   # đăng ký → tạo nhân vật → vào game → bang hội → chat (cần dev:stack)
pnpm db:generate         # drizzle-kit migration sau khi sửa packages/persistence/src/schema.ts
```

URL flags của web client: `?webgl`, `?noworker`, `?map=<id>`, `?quality=low|medium|high`, `?element=kim|moc|thuy|hoa|tho` (chọn bản mệnh offline), `?debug` (bật `window.__rpg` ở bản build), `?player=<appearanceId>` (vẽ player bằng appearance khác, chỉ phía client — vd `char_kk_knight`), `?mannequin` (hình nộm KayKit Mannequin_Medium), `?online` (đăng nhập qua API), `?online&dev=<tên>` (đăng nhập dev thẳng vào game server, cần `ALLOW_DEV_LOGIN=true`).

Điều khiển (D-030): setting "Điều khiển" Tự động/Phím + chuột/Cảm ứng → `<html data-controls data-hand>` (CSS bố trí HUD theo đó, không khoá hướng màn hình). Di chuyển trực tiếp qua intent `MOVE_DIR` (WASD/mũi tên, joystick ảo, cần trái gamepad); click-to-move vẫn dùng được. Phím: Esc dừng, Space đánh, F tương tác; Shift lộn, E tốc biến, V nhảy. Auto quái bật/tắt ở HUD, thao tác tay ngắt auto.

Lưu ý môi trường: hook `rtk` có thể làm sai output của biome/grep — dùng `rtk proxy npx biome check .` và kiểm tra exit code.

## Cấu trúc

```
apps/game-web/             Vite + React HUD + Babylon; worker sim; online login
apps/game-server/          Colyseus: zone room / AOI / delta snapshot / auth / save
apps/api-server/           Fastify: auth, characters, admin (RBAC + TOTP + audit)
apps/admin/                Trang quản trị (React)
packages/game-core/        TS thuần: World, systems (AI, skill, combat, loot, inventory…), AOI
packages/game-protocol/    Zod: intents, snapshot, events, player state; /net: delta codec
packages/game-data/        Zod schema + content bundle; /node: đọc từ thư mục
packages/sim-host/         SimHost interface, LocalSimHost, WorkerSimHost
packages/net-client/       ColyseusSimHost
packages/navigation/       Recast navmesh (bake/load/query)
packages/persistence/      Drizzle schema + migrations + GameRepository (Postgres/PGlite)
packages/auth/             JWT, ticket, argon2id, refresh token, TOTP
packages/input/            InputManager + mouse/keyboard, touch, gamepad
packages/asset-runtime/    manifest, load/dedupe/retry GLB, decoder local
packages/babylon-renderer/ engine, camera, environment, entity views, VFX, quality, GameView
game-data/                 YAML content + nav/ (navmesh đã bake)
maps/source/               layout map (đầu vào map-builder)
art/third_party/<pack>/    originals/ (không commit) + LICENSE.txt + SOURCE.json
tools/                     asset-processor, map-builder, navmesh-builder, data-validator, smoke
infra/                     docker (compose, Dockerfiles), deploy (Caddyfile)
```

## Quy tắc bắt buộc

1. Không import Babylon, React hay DOM vào `game-core`, `game-protocol`, `game-data`, `sim-host` (depcruise chặn).
2. Server (hoặc `LocalSimHost`) là authoritative. Client chỉ gửi intent qua `SimHost`.
3. Client không tự tính damage/gold/item/loot/cooldown/HP/kết quả đột phá.
4. Không hardcode stats quái, item, skill, map, cảnh giới, node tu luyện trong source — để trong `game-data/` (`realms/`, `cultivation/`, `progression/`).
   4b. Không thêm Character Level/XP. Sức mạnh đến từ cảnh giới, node, trang bị; mọi thứ data-driven (D-024).
5. Thời gian trong sim tính bằng tick (`TICK_RATE = 20`). Không dùng `Math.random()` hay `Date.now()` trong `game-core`; dùng RNG của `World`.
6. Mọi data quan trọng (intent, snapshot, YAML, env, API body) phải validate bằng Zod.
7. Không đưa transform/per-frame state vào React state hay Zustand. UI cập nhật 10 Hz.
8. Không tạo React component cho từng monster.
9. Entity runtime phải có lifecycle rõ; spawn/despawn thường xuyên thì dùng pool.
10. Không gửi message mỗi frame nếu không cần; snapshot mạng là delta.
11. Không dùng full physics cho gameplay đơn giản.
12. Không load toàn world cùng lúc (chunk streaming + AOI).
13. Mọi thay đổi vàng đi qua `grantGold` → ledger có idempotency key; lưu trong một transaction.
14. Không microservice hoá khi chưa có lý do.
15. Ưu tiên frame time ổn định hơn chất lượng hình ảnh; feature mới phải chạy được ở preset Low.
16. Thao tác GM/admin phải có RBAC + TOTP và ghi `audit_log`.

## Quy tắc asset

- Chỉ asset có `SOURCE.json` + `LICENSE.txt` mới vào pipeline. Placeholder phải gắn nhãn.
- Không sửa file trong `originals/`; output build sinh lại được từ source.
- 1 unit = 1 mét, Y-up, +Z phía trước, player ~1.6m, pivot ở chân.
- Vượt budget tam giác phải có `budgetException` (lý do + owner).
- ID dạng `snake_case` ổn định.
- Không tuyên bố animation tương thích khi chưa chạy thử.
- Output build (`apps/game-web/public/assets/`, `public/media/`) không commit.
- File gốc pack **có trong git, nhưng chỉ những file game dùng**: `art/third_party/.gitignore` do `pnpm assets:vendor` sinh từ các `SOURCE.json` đã duyệt (model, `.bin`, texture, animation, media, GLB trong `converted/`). Sửa `SOURCE.json` xong phải chạy lại `pnpm assets:vendor` (CI kiểm `--check`). Máy mới chỉ cần clone → `pnpm assets:build && pnpm media:build`.
- Pack chỉ có âm thanh/icon/UI/VFX dùng `kind` + `media` trong `SOURCE.json`; game-data trỏ tới media bằng `iconImage` / `sfx` (validator kiểm tra id).
- Nhân vật chuẩn: KayKit `Rig_Medium` (chibi, scale 0.62, D-027). Vũ khí KayKit gắn `handslot.*` không xoay, `scale: 0.62`; vũ khí nguồn khác ghi rõ "NOT fitted" tới khi kiểm bằng `pnpm smoke:gear --player=char_kk_rogue`.
- Pack chỉ có FBX/OBJ: thêm vào `FBX_PACKS`/`OBJ_PACKS` trong `tools/asset-processor/convert.ts`, chạy `pnpm assets:convert`, khai báo file trong `converted/`.

## Game UI style (bắt buộc)

Mọi UI game mới/sửa phải theo `docs/game-ui-style.md`: Kenney Fantasy UI Borders, nền xanh đen trong suốt có backdrop blur, khung góc vuông trắng/xám, chữ sáng và accent ngọc nhạt. Tái sử dụng element/source đã duyệt, token trong `hud-design.css` và khung/blur trong `fantasy-glass.css`. Quy tắc này thay thế look stone/metal/brass và yêu cầu tránh blur cũ. Giữ fallback nền đậm và tắt blur cho Low.
