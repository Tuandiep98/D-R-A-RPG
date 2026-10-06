# RPG 2.5D Semi-Mini — Tech Stack & Technical Plan

## 1. Mục tiêu dự án

Xây dựng một game RPG online góc nhìn 2.5D, phong cách đồ hoạ semi-mini, ưu tiên chạy tốt trên Web/PWA trước, nhưng kiến trúc phải đủ sạch để có thể đóng gói hoặc chuyển dần sang Android/iOS native trong tương lai.

### Định hướng gameplay đã chốt

- Combat: click/tap chọn mục tiêu, auto-attack kiểu RPG/MMORPG cổ điển.
- Map: hỗn hợp map nhỏ và map lớn.
- Multiplayer: online, người chơi có thể nhìn thấy nhau.
- Mật độ entity client: khoảng 30–100 entity có thể tồn tại quanh khu vực người chơi, nhưng phải có cơ chế giảm tải.
- Camera: có thể xoay quanh nhân vật.
- Đồ hoạ:
  - Nhân vật 3D semi-mini.
  - Environment 3D tối ưu.
  - Có thể dùng billboard / sprite / VFX 2D cho các thành phần phù hợp.
- Combat active scale: thường dưới 10 đối tượng cùng lúc.
- Tương lai có thể bổ sung:
  - Guild.
  - Marketplace.
  - Leaderboard.
  - Gacha.
  - Battle pass.
  - IAP.
  - PvP.
  - Event.
  - World boss.

---

# 2. Tech stack đề xuất

## Client / Web

- TypeScript
- Babylon.js
- React
- Zustand
- Vite
- vite-plugin-pwa
- Workbox

## Rendering

- Babylon.js
- WebGPU khi hỗ trợ.
- WebGL2 fallback.
- glTF / GLB.
- KTX2 textures.
- Meshopt / Draco compression.

## Game Core

- Pure TypeScript.
- Không phụ thuộc React.
- Không phụ thuộc Babylon.
- Data-driven.
- Entity / Component architecture nhẹ.
- Không cần full ECS ở MVP.

## Navigation

- Recast NavMesh.
- Bake NavMesh trước.
- Không generate NavMesh runtime trên mobile nếu không cần.

## Physics

Ưu tiên logic toán học và collision đơn giản.

Chỉ sử dụng Havok cho:

- Ragdoll.
- Physics props.
- Knockback đặc biệt.
- Projectile đặc biệt.

Không dùng full physics cho combat thông thường.

## Multiplayer

- Colyseus.
- WebSocket.
- Server authoritative.
- Delta state sync.
- Client interpolation.
- Có thể bổ sung prediction khi cần.

## Backend API

- Node.js.
- Fastify.
- TypeScript.

## Database

- PostgreSQL.
- Drizzle ORM.

## Realtime / Cache

- Redis.

## Assets

- Blender.
- GLB / glTF.
- KTX2.
- Meshopt.
- Draco.
- S3 / Cloudflare R2 / object storage tương thích S3.
- CDN.

## Mobile

Giai đoạn 1:

- PWA.

Giai đoạn 2:

- Capacitor.
- Android AAB/APK.
- iOS app shell.

Giai đoạn 3 nếu thật sự cần native rendering:

- Babylon React Native / Babylon Native.
- Hoặc viết renderer native mới nhưng giữ game core/protocol.

## Build / Monorepo

- pnpm.
- Turborepo.
- Vite.

## Testing

- Vitest.
- Playwright.
- Integration tests cho game server.

## Monitoring

Có thể bổ sung dần:

- Sentry.
- OpenTelemetry.
- Prometheus.
- Grafana.

---

# 3. Kiến trúc tổng thể

```text
                    Shared Game Core
           stats / item / skill / combat
           protocol / map schema / rules
                         |
          ---------------------------------
          |                               |
      WEB/PWA                         GAME SERVER
          |                               |
  Babylon.js renderer                 Colyseus
  React UI/HUD                       Authoritative world
  Zustand                            AI / combat / AOI
  NavMesh                            movement validation
          |                               |
        PWA                           PostgreSQL
          |                               |
      Capacitor                         Redis
     Android/iOS
```

Nguyên tắc:

- Game logic quan trọng không phụ thuộc renderer.
- Server quyết định combat, loot, item, currency.
- Client chịu trách nhiệm input, animation, VFX, prediction/interpolation và rendering.

---

# 4. Nguyên tắc quan trọng nhất

## Không để Babylon object nằm trực tiếp trong Game Core

Sai:

```ts
class Player {
  mesh: BABYLON.Mesh;
  hp: number;
}
```

Nên:

```text
PlayerEntity
|
+-- TransformState
+-- CombatState
+-- MovementState
+-- StatsState
|
+-- Renderer Adapter
       |
       +-- Babylon
```

Lợi ích:

- Dễ test.
- Dễ port mobile.
- Dễ thay renderer.
- Server có thể reuse nhiều rule.
- Coding agent dễ tách module.

---

# 5. Kiến trúc map

Không tạo logic khác nhau cho map lớn và map nhỏ.

Dùng cấu trúc thống nhất:

```text
World
  |
  +-- Zone
        |
        +-- Chunk
```

Ví dụ:

```text
World: Đại Hoang

Zone: Thanh Vân Sơn
  chunk 0_0
  chunk 0_1
  chunk 1_0
  chunk 1_1

Zone: Thành Cơ Giới
  ...

Zone: Phó bản Hắc Long
  chunk 0_0
```

Map nhỏ:

- 1–4 chunk.

Map lớn:

- Nhiều chunk.

Dungeon:

- Zone instance riêng.

---

# 6. Map streaming

Client không load toàn bộ world.

Ví dụ:

```text
[ ][ ][ ]
[ ][P][ ]
[ ][ ][ ]
```

P = player.

Client chỉ giữ:

- Current chunk.
- Adjacent chunks.
- Prefetch chunk theo hướng di chuyển.

Default có thể bắt đầu:

```text
chunk radius = 1
```

=> tối đa khoảng 9 chunk active/loading.

Flow:

```text
Player gần biên chunk
        |
        v
Prefetch chunk tiếp theo
        |
        v
Load geometry/textures
        |
        v
Activate
        |
        v
Unload chunk quá xa
```

---

# 7. Entity optimization

Không chỉ "ẩn mesh ngoài camera".

Phải có nhiều lớp tối ưu.

## Layer 1 — Server AOI

AOI = Area Of Interest.

Server chỉ gửi entity có liên quan tới player.

Ví dụ:

```text
World total:
3000 monsters
800 players

Player hiện tại chỉ cần biết:
34 monsters
18 players
6 NPC
```

Server không sync toàn map.

AOI có thể tính bằng:

- Grid.
- Spatial hash.
- Quadtree.
- Zone + grid.

MVP nên dùng:

```text
Zone + spatial grid
```

đơn giản, dễ debug, hiệu quả tốt.

---

# 8. AOI gợi ý

Ví dụ grid:

```text
cellSize = 30m
```

Player subscribe:

```text
current cell
+ 8 neighboring cells
```

Có thể thêm distance filter.

Ví dụ:

```text
Network AOI radius = 60m
```

Entity ngoài AOI:

- Không gửi state.
- Client despawn.
- Object được trả về pool.

---

# 9. Client Entity Manager

Không destroy/create object liên tục.

Dùng object pool:

```text
ObjectPool<Monster>
ObjectPool<PlayerAvatar>
ObjectPool<VFX>
ObjectPool<DamageText>
ObjectPool<Loot>
ObjectPool<Projectile>
```

Entity lifecycle:

```text
Spawn network entity
      |
      v
Acquire object from pool
      |
      v
Bind model/state
      |
      v
Render/update
      |
      v
Out of AOI
      |
      v
Reset
      |
      v
Return to pool
```

---

# 10. Rendering culling

Client áp dụng:

- Frustum culling.
- Distance culling.
- LOD.
- Billboard.
- Instance / thin instance.
- Occlusion nếu thật sự hữu ích.

Ví dụ:

```text
0–15m
LOD0

15–30m
LOD1

30–50m
LOD2

>50m
billboard / simplified / hidden
```

Không nhất thiết áp dụng cùng khoảng cách cho mọi loại entity.

---

# 11. Simulation LOD

Không chỉ giảm đồ hoạ.

Giảm cả logic update.

Ví dụ:

```text
0–15m
full animation
full local logic

15–30m
reduced update frequency

30–60m
very low frequency
simple animation

>60m
client entity removed
```

Server AI cũng có thể dùng simulation tier.

Ví dụ:

```text
Active combat mob
20 Hz

Nearby idle mob
5 Hz

Far background mob
1–2 Hz

Very far mob
abstract/offline simulation
```

---

# 12. Quality Manager

Game nên có:

- Auto.
- Low.
- Medium.
- High.
- Ultra.

Default:

```text
AUTO
```

QualityManager theo dõi:

- FPS.
- Frame time.
- Device memory.
- GPU tier.
- Số entity visible.
- Particle count.
- Resolution scale.

Ví dụ:

```text
FPS < 40 trong vài giây
        |
        v
Giảm resolution scale
Giảm shadow distance
Giảm particle count
Giảm max visible entities
Giảm LOD range
```

Khi ổn định lâu:

- Tăng chất lượng nhẹ.

---

# 13. Quality preset mẫu

| Setting | Low | Medium | High |
|---|---:|---:|---:|
| Resolution scale | 0.65 | 0.8 | 1.0 |
| Visible players | 10 | 25 | 50 |
| Visible mobs | 25 | 40 | 60 |
| Shadow | Off | Player | Player + mobs |
| Shadow texture | - | 512 | 1024 |
| Particles | 30% | 65% | 100% |
| Grass | Low | Medium | High |
| VFX | Low | Medium | High |
| LOD range | Short | Medium | Long |
| Post processing | Off | Limited | Full |
| FPS target | 30 | 45/60 | 60 |

---

# 14. Static environment optimization

Cây, đá, cỏ, thùng, vật trang trí giống nhau nên dùng:

- Instances.
- Thin instances.

Ví dụ:

```text
Tree_A x 300
Rock_A x 120
Grass_A x 800
```

Không tạo hơn 1000 mesh độc lập nếu không cần.

---

# 15. Đồ hoạ semi-mini

Phong cách đề xuất:

## Character

- 3D semi-mini.
- Đầu hơi lớn hơn realistic.
- Body compact.
- Silhouette rõ.
- Weapon nhìn dễ nhận biết.
- Không quá nhiều polygon nhỏ.

## Environment

- Low/mid poly.
- Stylized material.
- Baked details.
- Một số chi tiết dùng billboard.

## VFX

- Sprite.
- Flipbook.
- GPU particle.
- Simple shader.

Mục tiêu:

> Đẹp nhờ style, lighting, composition và VFX; không dựa vào polygon cao.

---

# 16. Asset pipeline

```text
Blender
  |
  v
Master .blend
  |
  v
Export GLB
  |
  v
Mesh optimization
  |
  +-- Meshopt
  +-- Draco
  |
  v
Texture conversion
  |
  +-- KTX2
  |
  v
Generate LOD
  |
  v
Validate
  |
  v
Asset manifest
  |
  v
CDN
```

---

# 17. Texture policy

Ưu tiên:

- 256.
- 512.
- 1024.

Chỉ dùng 2048 khi thật sự cần.

Hạn chế:

- PNG/JPG resolution lớn trực tiếp trong runtime.
- Texture 4K.
- Duplicate texture.

Các texture game runtime nên chuyển KTX2 nếu phù hợp.

---

# 18. Asset manifest

Ví dụ:

```json
{
  "version": 24,
  "maps": {
    "thanh_van": {
      "geometry": "terrain.41ae23.glb",
      "texture": "terrain.a8912.ktx2",
      "navmesh": "terrain.nav.bin"
    }
  }
}
```

File asset nên hashed.

Ví dụ:

```text
tree.1aa84.glb
grass.9812a.ktx2
```

---

# 19. PWA caching

Không cache toàn bộ game lúc install.

Precache:

- index.html.
- JS core.
- CSS.
- UI cơ bản.
- Loading screen.
- Login assets.

Runtime cache:

- Maps.
- Characters.
- Monsters.
- Music.
- VFX.
- Textures.
- Environment.

---

# 20. Combat architecture

Combat đã chốt:

```text
Tap/click enemy
      |
      v
Select target
      |
      v
Check distance
      |
   +--+--+
   |     |
 out   in range
   |     |
Navigate Attack
   |
Arrive
   |
Attack loop
```

Player có thể:

- Auto attack.
- Dùng skill chủ động.
- Đổi target.
- Stop movement.
- Dùng potion.
- Interact.

---

# 21. Combat server authoritative

Client chỉ gửi intent.

Ví dụ:

```text
ATTACK_TARGET(monsterId)
CAST_SKILL(skillId, targetId)
MOVE_TO(position)
INTERACT(entityId)
```

Server kiểm tra:

- Target tồn tại.
- Player alive.
- Target alive.
- Range.
- Cooldown.
- Mana.
- Weapon.
- Skill requirement.
- Attack speed.
- Damage.
- Crit.
- Status effects.

Server quyết định kết quả.

---

# 22. Không để client quyết định

Không trust client cho:

- Damage.
- Gold.
- XP.
- Item.
- Loot.
- Currency.
- Upgrade.
- Craft.
- Cooldown.
- HP.
- Drop.

---

# 23. Navigation

Dùng Recast NavMesh.

Pipeline:

```text
map.glb
   |
   v
NavMesh builder
   |
   v
map.nav.bin
```

Runtime chỉ load nav data.

Không bake NavMesh mỗi lần user vào map.

---

# 24. Input abstraction

Không hardcode browser event trong game logic.

Dùng:

```text
InputManager
|
+-- MouseKeyboardAdapter
+-- TouchAdapter
+-- GamepadAdapter
```

Game nhận action:

```text
MOVE
SELECT
CAMERA_ROTATE
ZOOM
SKILL_1
SKILL_2
SKILL_3
INTERACT
AUTO_ATTACK
TARGET_NEXT
```

---

# 25. Camera

Camera xoay quanh player.

Desktop:

- Left click: select.
- Right drag: rotate.
- Wheel: zoom.

Mobile:

- Tap: select.
- Drag: rotate.
- Pinch: zoom.

Có thể bổ sung:

- Lock target.
- Auto target.
- Nearest target.
- Quest target.
- Boss priority.

---

# 26. AI

Không cần hệ AI phức tạp ở MVP.

Normal mob:

```text
Idle
 |
 Patrol
 |
 Detect
 |
 Chase
 |
 Attack
 |
 Return
 |
 Idle
```

Boss có thể:

```text
Phase 1
 |
Phase 2
 |
Enrage
```

AI phải data-driven.

---

# 27. Monster data

Ví dụ:

```yaml
id: wolf_001

level: 5

stats:
  hp: 220
  attack: 16
  defense: 4

combat:
  range: 1.8
  attackInterval: 1.2

ai:
  type: melee
  aggroRadius: 7
  leashRadius: 14

lootTable:
  - wolf_common
```

---

# 28. Entity hierarchy

Không tạo codebase riêng cho từng cấp quái.

Dùng cùng entity system.

```text
Monster
|
+-- Normal
+-- Elite
+-- Mini Boss
+-- Boss
+-- World Boss
```

Sự khác nhau chủ yếu nằm trong:

- Data.
- Stats.
- Skill.
- AI profile.
- Loot.
- Spawn logic.
- Event logic.

---

# 29. Multiplayer architecture

Dùng:

```text
World
 |
 Zone
 |
 Instance
```

Ví dụ:

```text
Thanh Vân Sơn
  |
  +-- Channel 1
  +-- Channel 2
  +-- Channel 3
```

Dungeon:

```text
Dungeon
 |
 +-- Instance #1234
 +-- Instance #1235
```

---

# 30. Không mặc định 1 map = 1 server

Nên abstract:

```text
World Server
 |
 +-- Zone Process
       |
       +-- Instance
```

Có thể scale dần.

MVP chưa cần distributed world phức tạp.

---

# 31. Redis

Dùng cho:

- Presence.
- Matchmaking coordination.
- Server discovery.
- Session cache.
- Rate limit.
- Leaderboard cache.
- Pub/Sub.
- Temporary world state.

Không dùng Redis làm database chính.

---

# 32. PostgreSQL schema phạm vi

Nên chuẩn bị cho:

- Account.
- Character.
- Stats.
- Inventory.
- Equipment.
- ItemInstance.
- Skill.
- Quest.
- Craft.
- Upgrade.
- Currency.
- Guild.
- Friend.
- Marketplace.
- Mail.
- Achievement.
- Transaction.

Không nhất thiết implement hết ngay.

---

# 33. Economy ledger

Không chỉ lưu:

```text
player.gold = 150000
```

Nên có:

```text
Wallet

CurrencyTransaction
```

Ví dụ:

```text
+500   MonsterDrop
-1000  Craft
+2000  MarketSell
-500   Upgrade
```

Lợi ích:

- Audit.
- Debug exploit.
- Restore dữ liệu.
- Phân tích economy.
- Chống cheat.

---

# 34. Backend boundaries

Không microservice hóa sớm.

MVP chỉ cần:

```text
API Server
Game Server
Worker
PostgreSQL
Redis
```

Không nên tách quá sớm:

- Inventory Service.
- Item Service.
- Skill Service.
- Quest Service.

Chỉ tách khi có lý do scale rõ ràng.

---

# 35. React usage

React dùng cho UI.

Ví dụ:

```text
React
 |
 +-- HUD
 +-- Inventory
 +-- Equipment
 +-- Quest
 +-- Chat
 +-- Shop
 +-- Settings
 +-- Login
```

Babylon dùng cho game world.

Không tạo mỗi monster thành một React component.

---

# 36. Zustand usage

Dùng Zustand cho:

- Selected target.
- HUD state.
- Inventory panel.
- Quest panel.
- Chat.
- Settings.
- Notifications.
- Menu.

Không dùng Zustand cho:

- Position mỗi frame.
- Particle.
- Animation update.
- Physics.
- Transform của toàn bộ mob.

---

# 37. Shared Game Core

Packages có thể chứa:

```text
game-core/
  combat/
  stats/
  items/
  skills/
  quests/
  math/
  modifiers/
  effects/
```

Game core phải:

- Deterministic càng nhiều càng tốt.
- Không phụ thuộc browser.
- Không phụ thuộc DOM.
- Không phụ thuộc Babylon.
- Có unit test.

---

# 38. Repo structure đề xuất

```text
rpg-game/
|
+-- apps/
|   |
|   +-- game-web/
|   |
|   +-- game-server/
|   |
|   +-- api-server/
|   |
|   +-- admin/
|
+-- packages/
|   |
|   +-- game-core/
|   |   +-- combat/
|   |   +-- stats/
|   |   +-- item/
|   |   +-- skill/
|   |   +-- quest/
|   |   +-- math/
|   |
|   +-- game-protocol/
|   |
|   +-- game-data/
|   |
|   +-- world/
|   |   +-- zone/
|   |   +-- chunk/
|   |   +-- spawn/
|   |
|   +-- babylon-renderer/
|   |
|   +-- game-ui/
|   |
|   +-- asset-runtime/
|   |
|   +-- audio/
|   |
|   +-- shared/
|
+-- tools/
|   |
|   +-- asset-processor/
|   +-- map-builder/
|   +-- navmesh-builder/
|   +-- texture-compressor/
|   +-- data-validator/
|
+-- assets-source/
|
+-- game-data/
|   |
|   +-- monsters/
|   +-- items/
|   +-- skills/
|   +-- quests/
|   +-- recipes/
|   +-- maps/
|
+-- infra/
    |
    +-- docker/
    +-- db/
    +-- deploy/
```

---

# 39. Map data

Ví dụ:

```yaml
id: thanh_van_01

chunks:
  - 0_0
  - 0_1
  - 1_0
  - 1_1

environment:
  biome: mountain

spawns:
  wolf:
    groups: 4

elite:
  spawnInterval: 900

boss:
  id: stone_golem
```

---

# 40. Admin tool

Nên có ngay từ MVP.

Features:

- Search player.
- Inspect character.
- Give item.
- Remove item.
- Change level.
- Inspect inventory.
- Inspect quest.
- Ban.
- Mute.
- Teleport.
- Spawn monster.
- Restart zone.
- Edit item.
- Edit loot.
- Audit currency.
- Inspect server state.

Admin có thể là React web app riêng.

---

# 41. FPS target

Mục tiêu:

```text
Desktop:
60 FPS

Mid mobile:
45–60 FPS

Low mobile:
30 FPS ổn định
```

Ưu tiên frame time ổn định hơn FPS cao nhưng giật.

---

# 42. Budget khởi đầu

## Dynamic entities

```text
Target visible:
<= 50

Hard client cap:
~100

Active combat:
<10
```

## Lighting

```text
Dynamic lights:
0–3
```

## Shadow

Low:

```text
0–1 shadow caster
```

High:

```text
5–10 dynamic shadow casters
```

## Texture

Phần lớn:

```text
256–1024
```

## Environment

Ưu tiên:

- Instance.
- Thin instance.
- Mesh merge phù hợp.
- Texture atlas khi hợp lý.

---

# 43. Mobile strategy

## Phase 1 — Web/PWA

Ưu tiên hoàn thiện:

- Touch control.
- Responsive HUD.
- Mobile quality presets.
- Runtime asset streaming.
- Offline shell.
- Background reconnect.

## Phase 2 — Capacitor

Đóng gói codebase hiện tại thành:

- Android.
- iOS.

Dùng native plugin nếu cần:

- Push notification.
- Haptic.
- File storage.
- IAP.
- Deep link.
- Share.

## Phase 3 — Native renderer

Chỉ thực hiện khi:

- WebView không còn đáp ứng performance.
- Game tăng scale mạnh.
- Có nhu cầu native-specific.

Giữ lại:

- Game core.
- Data.
- Protocol.
- Backend.
- Server.

Thay:

- Renderer.
- Input adapter.
- Platform adapter.
- UI adapter nếu cần.

---

# 44. CI/CD

Pipeline cơ bản:

```text
Commit
 |
 v
Lint
 |
 v
Typecheck
 |
 v
Unit tests
 |
 v
Game-data validation
 |
 v
Asset validation
 |
 v
Build Web
 |
 v
Build Server
 |
 v
Integration tests
 |
 v
Deploy Staging
```

---

# 45. Asset CI/CD

```text
New GLB
 |
 v
Validate
 |
 v
Optimize mesh
 |
 v
Compress
 |
 v
Generate LOD
 |
 v
Convert textures
 |
 v
Generate manifest
 |
 v
Upload CDN
```

---

# 46. Các điều nên tránh

## Không nên dùng Unity WebGL cho hướng hiện tại

Lý do:

- Bundle lớn.
- Startup nặng.
- Browser memory cao.
- PWA integration kém tự nhiên hơn.
- DOM UI khó tối ưu hơn.
- Asset streaming linh hoạt kém hơn web-native stack.

Nếu game đổi hướng sang Steam/native-first thì có thể đánh giá lại.

---

# 47. MVP đề xuất

MVP đầu tiên không nên quá lớn.

Có thể bắt đầu:

```text
1 town
3 maps
10 normal monsters
1 elite
1 boss
20 items
5 active skills
1 basic crafting flow
1 upgrade flow
online players
chat cơ bản
inventory
equipment
quest cơ bản
```

Mục tiêu MVP:

- Chứng minh game feel.
- Chứng minh multiplayer.
- Chứng minh asset pipeline.
- Chứng minh map streaming.
- Chứng minh performance mobile.
- Chứng minh backend authoritative.

---

# 48. Phase triển khai

## Phase 0 — Foundation

- Monorepo.
- Shared types.
- Babylon bootstrap.
- React HUD.
- Colyseus server.
- Basic database.
- Auth.
- Config system.

## Phase 1 — Core movement

- Player spawn.
- Camera.
- Click/tap movement.
- NavMesh.
- Player sync.
- Other player rendering.
- Reconnect.

## Phase 2 — Combat

- Target selection.
- Auto approach.
- Auto attack.
- HP.
- Damage.
- Death.
- Respawn.
- Skill system cơ bản.

## Phase 3 — Monster/AI

- Spawn.
- Patrol.
- Aggro.
- Chase.
- Attack.
- Leash.
- Elite.
- Boss.

## Phase 4 — RPG systems

- Inventory.
- Equipment.
- Item stats.
- Loot.
- XP.
- Level.
- Skill.
- Quest.

## Phase 5 — World

- Zone.
- Chunk.
- Streaming.
- AOI.
- Map transition.
- Dungeon instance.

## Phase 6 — Optimization

- Object pooling.
- LOD.
- Simulation LOD.
- Thin instances.
- Runtime quality.
- Asset compression.
- Mobile profiling.

## Phase 7 — Economy

- Craft.
- Upgrade.
- Currency ledger.
- Shop.
- Marketplace preparation.

## Phase 8 — Social

- Chat.
- Friend.
- Guild.
- Party.
- Leaderboard.

## Phase 9 — PWA/mobile release

- PWA install.
- Runtime cache.
- Offline shell.
- Capacitor.
- Android/iOS packaging.

---

# 49. Data-driven rule

Không hardcode nội dung game vào source.

Data nên nằm riêng:

```text
game-data/
```

Ví dụ:

```text
items/
monsters/
skills/
quests/
maps/
recipes/
loot/
```

Coding agent chỉ sửa logic khi thật sự cần.

Designer có thể sửa data độc lập.

---

# 50. Quy tắc dành cho coding agent

1. Không import Babylon vào `game-core`.
2. Không import React vào `game-core`.
3. Server là authoritative.
4. Client không tự cộng gold/XP/item.
5. Không hardcode monster stats trong source.
6. Không load toàn world cùng lúc.
7. Mọi entity runtime phải có lifecycle rõ.
8. Pool object nếu spawn/despawn thường xuyên.
9. Không tạo network message mỗi frame nếu không cần.
10. Không sync toàn bộ state khi chỉ một field thay đổi.
11. Không dùng full physics cho gameplay đơn giản.
12. Không sử dụng React state cho transform per-frame.
13. Tất cả data quan trọng phải validate schema.
14. Mỗi feature phải có performance impact rõ ràng.
15. Feature mới phải chạy được trên mobile profile thấp.
16. Asset mới phải đi qua asset validation.
17. Không microservice hoá khi chưa có lý do.
18. Economy transaction phải audit được.
19. Không trust client cho logic gameplay quan trọng.
20. Luôn ưu tiên stable FPS hơn visual fidelity.

---

# 51. Stack cuối cùng

```text
Language:
TypeScript

Engine:
Babylon.js

Renderer:
WebGPU
fallback WebGL2

UI:
React

UI State:
Zustand

Build:
Vite

PWA:
vite-plugin-pwa
Workbox

Navigation:
Recast NavMesh

Physics:
Simple custom collision
+ Havok selectively

Networking:
Colyseus
WebSocket

Backend:
Node.js
Fastify

Database:
PostgreSQL

ORM:
Drizzle

Cache / Realtime Infra:
Redis

Asset:
Blender
GLB/glTF
KTX2
Meshopt
Draco

Storage:
S3/R2 compatible
CDN

Monorepo:
pnpm
Turborepo

Mobile:
PWA
Capacitor
Babylon Native escape hatch

Testing:
Vitest
Playwright
Integration tests
```

---

# 52. Quyết định kiến trúc quan trọng

Tech stack này được chọn để đạt đồng thời:

- Web-first.
- PWA-first.
- Mobile-friendly.
- Online multiplayer.
- Server authoritative.
- 2.5D.
- Camera xoay.
- Semi-mini stylized graphics.
- Map nhỏ và lớn.
- Chunk streaming.
- AOI.
- 30–100 entity quanh player.
- Combat active scale thấp.
- Dễ mở rộng RPG systems.
- Dễ thêm economy/social systems.
- Có khả năng chuyển dần sang native.

Kiến trúc không cố xây một MMORPG khổng lồ ngay từ đầu, nhưng tránh các quyết định khiến sau này phải rewrite toàn bộ game khi mở rộng.

---

# 53. Bước tiếp theo nên làm

Sau file này, technical design tiếp theo nên đi sâu theo thứ tự:

1. World / Zone / Chunk schema.
2. Entity model.
3. Player state.
4. Monster state.
5. Combat state machine.
6. Movement protocol.
7. Network messages.
8. AOI implementation.
9. Inventory / Item model.
10. Skill system.
11. Loot.
12. Equipment.
13. PostgreSQL schema.
14. Colyseus room topology.
15. Asset naming/versioning rules.
16. Performance budgets.
17. Coding-agent rules.
18. MVP task breakdown.

Khi các phần trên được chốt, có thể scaffold repository và bắt đầu prototype thật.

---

# 54. Stack bổ sung (cập nhật 06/10/2026)

Các tech dưới đây lấp khoảng trống giữa các thành phần đã chọn ở mục 2 và 51.

## 54.1. Bắt buộc từ Phase 0

| Mảng | Chọn | Ghi chú |
|---|---|---|
| Schema validation | Zod | Một nguồn schema cho network message, API body, game-data YAML, env config. |
| Auth | JWT access token ngắn hạn + refresh token xoay vòng | Refresh token lưu hash trong DB, có thể thu hồi. |
| Password hashing | argon2id | Không dùng bcrypt/sha cho account mới. |
| Social login | Google / Apple OAuth (sau) | iOS bắt buộc Sign in with Apple nếu có social login khác. |
| DB migration | drizzle-kit | Migration versioned, review được trong PR. |
| Job queue / Worker | BullMQ (Redis) | Mail, phát thưởng, reset daily, leaderboard. |
| Logging | pino (JSON) | Fastify dùng sẵn. Gắn `requestId`, `accountId`, `roomId`. |
| Config / secrets | `.env` + Zod validate khi boot | Không bao giờ để secret trong biến `VITE_*`. |
| Lint / format | Biome | Một tool cho lint + format. |
| Boundary check | dependency-cruiser | Chặn `game-core` import Babylon/React/DOM (ép quy tắc mục 50.1–50.2). |
| Local env | Docker Compose | Postgres + Redis. |
| CI | GitHub Actions | Theo pipeline mục 44. |
| ID | UUIDv7 | Có thứ tự thời gian, tốt cho index và log. |
| RNG | PRNG có seed (mulberry32 / xoshiro) trong `game-core` | Loot/crit replay được, test được. |

## 54.2. Asset tooling (bổ sung cho `tools/`)

- `@gltf-transform/*`: dedup, prune, resample, meshopt, resize texture, validate.
- KTX-Software (`toktx`) hoặc basisu qua gltf-transform: KTX2/Basis.
- meshoptimizer simplifier: sinh LOD.
- `@recast-navigation/*` (recast-navigation-js): bake NavMesh trong Node; cùng file `.nav.bin` dùng được cho client và server.

## 54.3. Deploy bản đầu

| Mảng | Chọn |
|---|---|
| Game server | VPS (Hetzner/DigitalOcean) hoặc Fly.io. Không dùng serverless cho WebSocket. |
| Reverse proxy + TLS | Caddy (auto HTTPS) hoặc Nginx. |
| Web client | Cloudflare Pages; asset trên R2 + CDN. |
| Database | Postgres managed (Neon/Supabase/RDS) hoặc self-host có backup. |
| Backup | `pg_dump` theo lịch hoặc PITR. |
| Scale Colyseus | `@colyseus/redis-presence` + `@colyseus/redis-driver` khi cần nhiều process. |

## 54.4. Nên có sớm

- Sentry (client + server) từ Phase 0–1.
- Load test: `@colyseus/loadtest` hoặc k6.
- i18n: i18next, tách string ngay nếu có kế hoạch đa ngôn ngữ.
- Audio: Babylon AudioEngine v2 hoặc Howler.
- Analytics: PostHog hoặc event log trong Postgres.

---

# 55. Security baseline

Nguyên tắc: bảo mật của game này nằm ở **server authoritative + validate input + transaction cho economy + phân quyền**, không nằm ở việc tự mã hoá dữ liệu. Mã hoá chỉ cần TLS + hash mật khẩu đúng.

## 55.1. Làm ngay từ đầu

1. Production chỉ `https://` và `wss://`.
2. Join room phải có token: `onAuth` của Colyseus verify JWT, gắn `accountId`/`characterId` vào client. Không tin `playerId` do client gửi.
3. Mọi message từ client đi qua Zod: kiểu, giới hạn (toạ độ trong map, skillId tồn tại), strip field thừa. Message sai → drop + tăng violation counter.
4. Rate limit 2 lớp: API dùng `@fastify/rate-limit` + Redis; game giới hạn message/giây mỗi connection, vượt ngưỡng thì kick.
5. Movement validation trên server: tốc độ tối đa, điểm đến nằm trên NavMesh, chặn teleport.
6. Economy:
   - Mọi thay đổi tiền/item trong một DB transaction, ghi ledger cùng lúc (mục 33).
   - Idempotency key cho thao tác có thể retry/reconnect.
   - ItemInstance có ID unique, lock row khi trade (chống dupe).
   - Constraint DB, ví dụ `CHECK (balance >= 0)`.
7. Password argon2id; refresh token chỉ lưu hash; có thể revoke.
8. Admin: RBAC, bắt buộc 2FA, audit log mọi thao tác (give item, ban, teleport...). Domain riêng, giới hạn IP hoặc Cloudflare Access.
9. Secret không vào client bundle. DB user của app chỉ có quyền tối thiểu.
10. Protocol versioning: client gửi `protocolVersion` khi connect, server từ chối bản cũ (PWA hay bị cache bản cũ).

## 55.2. Làm theo phase

| Feature | Yêu cầu |
|---|---|
| IAP | Verify receipt Apple/Google ở server, không tin client. |
| Chat | Lọc từ, mute/report, rate limit riêng. |
| Marketplace / trade | Escrow, lock item trong giao dịch, phát hiện bất thường qua ledger. |
| DDoS | Cloudflare trước API/web (WebSocket proxy được). |
| Dữ liệu cá nhân | Thu thập tối thiểu; DB managed encryption at rest; endpoint xoá tài khoản (App Store bắt buộc). |

## 55.3. Không làm

- Tự mã hoá payload game trên nền TLS: client giữ key thì cheater cũng lấy được.
- Obfuscate client nặng: chỉ làm chậm, không chặn được.
- Anti-cheat client kiểu kernel/native: không khả thi trên web, không cần với server authoritative.
- E2E encryption cho chat: cản trở moderation.

---

# 56. Simulation contract

- Server (và `LocalSimHost` ở giai đoạn offline) chạy `game-core` với **tick cố định 20 Hz**.
- Cooldown, attack interval, respawn timer tính bằng **tick**, không dùng wall-clock.
- Random qua PRNG có seed của `World`, không gọi `Math.random()` trong `game-core`.
- Client giao tiếp qua interface `SimHost`:

```ts
interface SimHost {
  connect(): Promise<void>;
  sendIntent(intent: Intent): void;
  onSnapshot(cb: (s: Snapshot) => void): () => void;
  onEvents(cb: (e: SimEvent[]) => void): () => void;
  dispose(): void;
}
```

- Milestone đầu dùng `LocalSimHost` (chạy trong browser) nhưng vẫn validate intent bằng Zod như server thật. Khi lên online chỉ thay bằng `ColyseusSimHost`; client và `game-core` không đổi.

---

# 57. Hợp nhất với Assets/Models/Maps plan

Tài liệu đi kèm: `02_assets_models_maps_plan.md`. Các quyết định lệch nhau được ghi trong `docs/decision_log.md`.

Cấu trúc repo chung (gộp mục 38 với mục 12 của assets plan):

```text
apps/            game-web, game-server, api-server, admin
packages/        game-core, game-protocol, game-data, sim-host, input,
                 babylon-renderer, asset-runtime, world, game-ui, audio, shared
tools/           asset-processor, navmesh-builder, map-builder, data-validator, thumbnail-render
game-data/       monsters, characters, items, skills, quests, recipes, loot, maps (gameplay data)
art/             references, art_bible, source, third_party/<pack>/{originals,LICENSE.txt,SOURCE.json}
assets/          output runtime đã build (hashed, có manifest) — sinh ra từ art/, không sửa tay
docs/            plan, contracts, decision_log
reports/         asset_audit, performance, visual_review
infra/           docker, db, deploy
```

Quy tắc naming: lowercase `snake_case`, ID ổn định, không dùng tên hiển thị làm khoá (ví dụ `char_humanoid_base_v1`, `env_forest_tree_01`, `map_forest_mechanism_01`).
