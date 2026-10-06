# D-R-A-RPG

RPG online 2.5D semi-mini (Robot + Tu tiên + Võ hiệp). Web/PWA trước, mobile sau.

Tài liệu chính:
- `docs/plan/01_tech_stack_plan.md` — tech stack, kiến trúc, security baseline (mục 54–57)
- `docs/plan/02_assets_models_maps_plan.md` — art bible, rig, equipment, map, asset pipeline
- `docs/plan/03_implementation_roadmap.md` — milestone hiện tại và tiếp theo
- `docs/decision_log.md` — quyết định đã chốt (ưu tiên khi mâu thuẫn với plan)

## Lệnh

```bash
corepack enable          # lần đầu, để có pnpm
pnpm install
pnpm dev                 # chạy game-web (Vite)
pnpm test                # Vitest toàn repo
pnpm typecheck
pnpm lint                # Biome
pnpm depcruise           # kiểm tra ranh giới package
pnpm validate:data       # validate game-data/*.yaml bằng Zod
pnpm assets:build        # art/third_party → apps/game-web/public/assets + manifest
```

## Cấu trúc

```
apps/game-web/             Vite + React HUD + mount Babylon
packages/game-core/        TS thuần: math, rng, tick, entity, systems, World
packages/game-protocol/    Zod: intents, snapshot, events, PROTOCOL_VERSION
packages/game-data/        Zod schema + loader cho game-data/
packages/sim-host/         SimHost interface + LocalSimHost
packages/input/            InputManager + adapters → actions
packages/asset-runtime/    manifest, load/dedupe GLB, fallback
packages/babylon-renderer/ engine, camera, entity views, animation, picking
game-data/                 YAML: characters, monsters, maps
art/third_party/<pack>/    originals/ + LICENSE.txt + SOURCE.json
tools/asset-processor/     gltf-transform pipeline
```

## Quy tắc bắt buộc

1. Không import Babylon, React hay DOM vào `game-core`, `game-protocol`, `game-data`, `sim-host`.
2. Server (hoặc `LocalSimHost`) là authoritative. Client chỉ gửi intent qua `SimHost`.
3. Client không tự tính damage/gold/XP/item/loot/cooldown/HP.
4. Không hardcode stats quái, item, map trong source — để trong `game-data/`.
5. Thời gian trong sim tính bằng tick (`TICK_RATE = 20`). Không dùng `Math.random()` hay `Date.now()` trong `game-core`; dùng RNG của `World`.
6. Mọi data quan trọng (intent, snapshot, YAML, env) phải validate bằng Zod.
7. Không đưa transform/per-frame state vào React state hay Zustand. Zustand chỉ cho UI state (target, HP throttle, panel, settings).
8. Không tạo React component cho từng monster.
9. Entity runtime phải có lifecycle rõ; spawn/despawn thường xuyên thì dùng pool.
10. Không gửi message mỗi frame nếu không cần; không sync toàn state khi chỉ một field đổi.
11. Không dùng full physics cho gameplay đơn giản.
12. Không load toàn world cùng lúc.
13. Economy transaction phải audit được (ledger).
14. Không microservice hoá khi chưa có lý do.
15. Ưu tiên frame time ổn định hơn chất lượng hình ảnh; feature mới phải chạy được ở mobile profile thấp.

## Quy tắc asset

- Chỉ asset có `SOURCE.json` + `LICENSE.txt` mới vào pipeline. Placeholder phải gắn nhãn.
- Không sửa file trong `originals/`; output build sinh lại được từ source.
- 1 unit = 1 mét, Y-up, player ~1.6m, pivot ở chân.
- ID dạng `snake_case` ổn định (`char_player_default`, `env_tree_01`).
- Không tuyên bố animation tương thích khi chưa chạy thử.
- Output build (`apps/game-web/public/assets/`) không commit.
