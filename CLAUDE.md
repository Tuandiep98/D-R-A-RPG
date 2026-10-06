# D-R-A-RPG

RPG online 2.5D semi-mini (Robot + Tu tiên + Võ hiệp). Web/PWA trước, mobile sau.

Tài liệu chính:
- `docs/plan/01_tech_stack_plan.md` — tech stack, kiến trúc, security baseline (mục 54–57)
- `docs/plan/02_assets_models_maps_plan.md` — art bible, rig, equipment, map, asset pipeline
- `docs/plan/03_implementation_roadmap.md` — trạng thái từng phase/hạng mục, việc tiếp theo
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
pnpm smoke [url]         # headless Chrome smoke test against a running dev/preview server
pnpm smoke:login [url]   # đăng ký → tạo nhân vật → vào game → bang hội → chat (cần dev:stack)
pnpm db:generate         # drizzle-kit migration sau khi sửa packages/persistence/src/schema.ts
```

URL flags của web client: `?webgl`, `?noworker`, `?map=<id>`, `?quality=low|medium|high`, `?debug` (bật `window.__rpg` ở bản build), `?online` (đăng nhập qua API), `?online&dev=<tên>` (đăng nhập dev thẳng vào game server, cần `ALLOW_DEV_LOGIN=true`).

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
3. Client không tự tính damage/gold/XP/item/loot/cooldown/HP.
4. Không hardcode stats quái, item, skill, map trong source — để trong `game-data/`.
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
- Output build (`apps/game-web/public/assets/`) không commit.
