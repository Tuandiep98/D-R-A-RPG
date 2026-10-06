# PLAN TRIỂN KHAI ASSETS, MODELS & MAPS — RPG 2.5D

Ngày lập: 06/10/2026  
Concept: Robot + Tu tiên + Võ hiệp; cày level, nhặt đồ, thay trang bị, đánh tinh anh và boss.  
Nền tảng: web/PWA trước; thiết kế để có thể đóng gói mobile sau.  
Mục đích: tài liệu giao việc cho agent lập trình và artist, từ prototype đến pipeline mở rộng.

> Đây là kế hoạch triển khai, chưa phải báo cáo assets đã tải hoặc hệ thống đã xây. Các ngân sách bên dưới là mục tiêu ban đầu để đo thử, không phải bảo đảm hiệu năng. Nguồn asset kế thừa từ thảo luận; phải kiểm tra lại trang tác giả, phiên bản tải và license trước khi đưa vào dự án.

> **Ghi chú hợp nhất (06/10/2026):** Tài liệu này đi cùng `01_tech_stack_plan.md`. Các điểm đã được quyết định khác so với bản gốc (renderer = Babylon.js, camera perspective xoay quanh player thay vì orthographic cố định, multiplayer theo kiến trúc server authoritative, Meshopt mặc định) được ghi trong `docs/decision_log.md`. Khi mâu thuẫn, decision log được ưu tiên.

## 1. Kết quả cần đạt

Xây một vertical slice có player thay trang bị, robot, quái thường, tinh anh, boss và một map hoàn chỉnh. Đồ họa phải thống nhất, đọc rõ trên màn hình điện thoại, tải theo nhu cầu và chạy ổn định trên thiết bị mục tiêu.

Deliverables:

- Art Bible: tỷ lệ, silhouette, palette, material, camera, lighting, VFX.
- Catalog assets có nguồn, license, trạng thái xử lý và thông số kỹ thuật.
- Bộ nhân vật chuẩn, skeleton, sockets, animation và trang bị modular.
- Bộ environment modular, collision, navigation và map data.
- Asset build pipeline có khả năng tái tạo từ source.
- Scene kiểm tra, công cụ xem asset/map và báo cáo hiệu năng.
- Hướng dẫn thêm nhân vật, trang bị, quái, map và biome mới.

## 2. Đầu vào cần có trước khi triển khai

| Đầu vào                     | Mặc định để bắt đầu                                                         | Khi nào cần chốt       |
| --------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| Repository và cấu trúc game | Kiểm tra repo nếu có; không tự tạo lại kiến trúc sẵn có                     | Trước tích hợp         |
| Renderer                    | Dùng engine hiện có; nếu chưa có, spike Three.js và Babylon.js rồi chọn một | Giai đoạn 0            |
| Thiết bị chuẩn              | Một Android tầm trung và một iPhone thực tế; ghi model/OS/browser           | Trước khóa budget      |
| Camera                      | Orthographic, không xoay tự do trong MVP                                    | Trước dựng asset chuẩn |
| Gameplay                    | Di chuyển trên mặt đất, combat thời gian thực, 10–20 quái cùng hiện diện    | Vertical slice         |
| Player                      | Một body prototype; hỗ trợ kiến trúc mở rộng body khác                      | MVP                    |
| Phong cách                  | Semi-mini khoảng 4.5–5.5 đầu, mục tiêu gần 5 đầu                            | Art test               |
| Trang bị                    | 3 bộ võ hiệp / tu tiên / cơ giới dùng cùng nhân vật chuẩn                   | MVP                    |
| Map đầu tiên                | Rừng và di tích môn phái có khu cơ quan cổ                                  | Blockout               |
| Animation còn thiếu         | Kiếm/đao, quyền, skill, phản ứng, chết; xác định sau audit pack             | Trước combat polish    |
| Multiplayer                 | Chưa giả định có; asset loading tách khỏi networking                        | Trước mở rộng          |

Agent tự quyết các chi tiết reversible và ghi vào decision log. Chỉ cần làm rõ khi quyết định thay đổi phạm vi hoặc tạo chi phí bên ngoài. Không tự mua asset.

## 3. Art Bible

### 3.1. Ngôn ngữ hình ảnh

- Stylized 3D low/medium-poly, semi-mini; giữ chân tương đối dài, thân gọn.
- Đầu hơi lớn; tay/chân, vai và vũ khí được phóng đại có kiểm soát.
- Vũ khí có thể lớn hơn tỷ lệ thực khoảng 20–35%; kiểm tra va chạm thị giác trong animation.
- Không ép scale toàn model theo một trục để tạo mini; chỉnh anatomy, rig và weights trong DCC.
- Mỗi nhân vật phải đọc được silhouette ở camera gameplay, không chỉ trong ảnh showroom.
- Thống nhất độ bão hòa, độ mềm cạnh, mức chi tiết và mật độ texture giữa các pack.
- Tỷ lệ semi-mini không tự làm giảm poly hay texture: phải tối ưu riêng.

| Nhóm         | Silhouette                               | Vật liệu / điểm nhấn                  |
| ------------ | ---------------------------------------- | ------------------------------------- |
| Võ hiệp      | Thân gọn, áo bào, tóc dài, kiếm/đao rõ   | Vải, da, thép, gỗ                     |
| Tu tiên      | Tay áo rộng, pháp khí, phi kiếm          | Ngọc, vàng, vải, ánh sáng linh lực    |
| Robot/cyborg | Vai, cẳng tay lớn; khớp và giáp góc cạnh | Kim loại stylized, gốm, năng lượng    |
| Ma tu        | Bất đối xứng, sừng/giáp, hình khối sắc   | Tím/đỏ có kiểm soát                   |
| Quái         | Khác biệt về hình khối và chuyển động    | Fantasy hoặc lai cơ giới              |
| Boss         | Silhouette riêng, điểm yếu rõ            | Quy mô khoảng 1.8–4 lần player để thử |
| Pet          | Có thể tiny/chibi                        | Ít chi tiết, dễ nhận biết             |

### 3.2. Bộ hình tham chiếu cần tạo

- Lineup võ hiệp, tu tiên, robot cạnh nhau cùng camera và ánh sáng.
- Player cùng 3 bộ trang bị; nhìn trước, sau, bên và góc gameplay.
- Bảng vật liệu và palette cho rừng, di tích, máy móc.
- Một ảnh combat có quái, boss, VFX và loot để kiểm tra độ rối.
- So sánh đọc silhouette ở kích thước hiển thị thực trên mobile.

### 3.3. Camera và lighting

- Thử góc nhìn xuống khoảng 35–50 độ so với mặt đất, rồi chọn góc cụ thể.
- Chuẩn hóa yaw, pitch, kích thước vùng nhìn và zoom theo aspect ratio.
- UI safe area và vật thể foreground không được che thao tác/nhân vật.
- Dùng ánh sáng nền + một nguồn chính; giới hạn shadow động theo quality tier.
- Ưu tiên lightmap/baked lighting cho khu vực tĩnh nếu pipeline phù hợp.
- Robot và tu tiên dùng chung cách shading; khác thông số material và glow.
- Bloom, outline, SSAO chỉ giữ khi có lợi rõ và đạt budget.
- Chỉ bỏ chi tiết mặt khuất sau khi xác nhận camera và chuyển động thực tế.

## 4. Nguồn asset và quy trình tuyển chọn

### 4.1. Danh sách nguồn cần audit

| Nguồn / bộ                           | Vai trò dự kiến                        | Link                                                                       |
| ------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------- |
| Quaternius Universal Base Characters | Ứng viên base/skeleton player          | https://quaternius.com/packs/universalbasecharacters.html                  |
| Modular Character Outfits Fantasy    | Tham khảo trang bị modular             | https://quaternius.com/packs/modularcharacteroutfitsfantasy.html           |
| Universal Animation Library          | Animation/retarget                     | https://quaternius.itch.io/universal-animation-library                     |
| Quaternius RPG Characters            | NPC/player prototype                   | https://quaternius.com/packs/rpgcharacters.html                            |
| Quaternius Ultimate RPG              | Quái, props và prototype               | https://quaternius.com/packs/ultimaterpg.html                              |
| Quaternius Ultimate Space Kit        | Robot, sci-fi props                    | https://quaternius.com/packs/ultimatespacekit.html                         |
| Ultimate Modular Men                 | Tham khảo modular/NPC                  | https://quaternius.com/packs/ultimatemodularcharacters.html                |
| Ultimate Modular Women               | Tham khảo modular/NPC                  | https://quaternius.com/packs/ultimatemodularwomen.html                     |
| Kenney Assets                        | Environment/props/base bổ sung         | https://kenney.nl/assets                                                   |
| Kenney Protagonists                  | Prototype nhân vật/cyborg              | https://kenney.nl/assets/animated-characters-protagonists                  |
| Kenney Survivors                     | NPC prototype                          | https://kenney.nl/assets/animated-characters-survivors                     |
| Poly Pizza                           | Tìm props/environment đồng style       | https://poly.pizza/                                                        |
| OpenGameArt LowPoly RPG Characters   | Đối chiếu nguồn; tránh nhập trùng pack | https://opengameart.org/content/lowpoly-rpg-characters                     |
| Stylized Humanoid Character YW       | Ứng viên base cần kiểm tra kỹ          | https://opengameart.org/content/base-rigged-stylized-humanoid-character-yw |
| itch.io Free CC0 RPG                 | Khám phá nguồn bổ sung                 | https://itch.io/game-assets/free/assets-cc0/genre-rpg                      |

Không mặc định mọi asset trên một website là CC0. Không mặc định các pack có humanoid rig dùng chung bone hierarchy hoặc animation trực tiếp. Kiểm tra compatibility bằng import và animation test.

### 4.2. Quy trình cho từng asset

1. Kiểm tra link, tác giả, license, phạm vi dùng và điều kiện redistribution.
2. Lưu file gốc, license, URL, ngày tải, phiên bản/checksum.
3. Import vào scene kiểm tra; thống kê tris, material, texture, bones, animations.
4. Chấm độ phù hợp silhouette, tỷ lệ, palette, phong cách, topology.
5. Ước lượng công sửa rig, outfit, UV, animation, collision và export.
6. Chọn: dùng trực tiếp / chỉnh sửa / chỉ prototype / loại.
7. Chỉ đưa asset đã được duyệt vào runtime manifest.

Ưu tiên 1–2 nguồn chính; không tải hàng chục pack trước khi kiểm chứng vertical slice.

## 5. Quy chuẩn model và rig

### 5.1. Transform và export

- Đơn vị runtime: 1 unit = 1 mét; player mẫu cao khoảng 1.6 unit làm mốc.
- World dùng Y-up; front hướng +Z theo quy ước dự án. Kiểm tra sau export từ Blender.
- Pivot humanoid ở mặt đất dưới tâm nhân vật; props có pivot thuận tiện snap.
- Apply transform hợp lý trước rig/export; không để scale âm hoặc scale không đều ngoài chủ đích.
- Giữ naming thống nhất, normals/tangents đúng; dọn mesh/material/animation thừa.
- Lưu source editable; runtime dùng GLB/glTF đã tối ưu.
- Collider và hitbox là dữ liệu riêng, không dùng mesh render chi tiết làm collision mặc định.

### 5.2. Skeleton

- Một skeleton chuẩn cho humanoid player/NPC; có version và bind pose chuẩn.
- Kiểm tra tên xương, hierarchy, orientation, rest pose, scale và root.
- Body/outfit skinned phải dùng cùng bind pose và ánh xạ xương chính xác.
- Không ép robot phi nhân hình, thú, rồng vào skeleton humanoid; dùng rig riêng.
- Giới hạn bone count/skin influences sau khi đo; baseline ưu tiên tối đa 4 influences mỗi vertex.
- Tạo test pose: giơ tay, xoay vai, ngồi, bước dài, đá, vung kiếm, chết.
- Retarget là công việc riêng; kiểm tra foot sliding, độ dài tay/chân và vị trí weapon.

### 5.3. Sockets

Chuẩn hóa hand_r, hand_l, back, head, shoulder_l/r, artifact và vfx_origin. Ghi transform local của từng attachment và offset theo loại vũ khí.

- Kiếm/đao/cung/giáp cứng: attachment theo bone/socket khi phù hợp.
- Áo bào/quần/găng mềm: skinned mesh.
- Áo choàng/tóc: animation xương đơn giản trong MVP; chưa mặc định cloth simulation.
- Body masking theo vùng để giảm xuyên áo; không chỉ ẩn toàn body.
- Hitbox gameplay và chiều dài vũ khí hình ảnh được cấu hình riêng.

## 6. Trang bị modular và item appearance

Slots chuẩn: body, head, hair, face, chest, shoulders, arms, gloves, pants, boots, main_hand, off_hand, back, artifact, aura.

- Item gameplay trỏ tới appearanceId; nhiều item có thể dùng chung appearance.
- Appearance gồm meshes, materials, variants, socket offsets, body masks và VFX.
- Common/Uncommon: tái sử dụng mesh, đổi palette/material.
- Rare: đổi texture/attachment khi cần.
- Epic: thay silhouette đáng kể.
- Legendary/Mythic: mesh/VFX riêng; animation riêng chỉ khi có giá trị và budget.
- Có compatibility matrix giữa body type, outfit và vũ khí.
- Kiểm tra hair/helmet, áo/boots, shoulder/weapon, cape/back item.
- Chuẩn bị fallback appearance khi asset chưa tải hoặc không tương thích.
- Gộp skinned parts hoặc giảm material sau khi đo; modular không đồng nghĩa một draw call.

MVP: một player, 3 outfit võ hiệp/tu tiên/cơ giới, kiếm, đại đao, quyền/gauntlet và một pháp khí/phi kiếm.

## 7. Animation và combat presentation

Baseline: idle, walk, run, turn, attack, cast, hit, death; thêm dodge nếu gameplay có.

- MVP ưu tiên in-place locomotion để controller quyết định dịch chuyển.
- Nếu dùng root motion, chỉ một hệ thống sở hữu displacement; tránh di chuyển hai lần.
- Tạo animation state machine, transition/blend và movement speed calibration.
- Tách animation event: hit window, projectile spawn, trail on/off, footstep, VFX/SFX.
- Không xác định sát thương chỉ từ VFX hoặc va chạm mesh render.
- Cho phép locomotion dùng chung; attack/cast theo weapon family.
- Quái và boss có anticipation, impact, recovery rõ; telegraph dễ đọc trên mobile.
- Flying sword có thể chạy bằng transform/procedural animation, không cần rig humanoid.
- Dùng animation LOD/update rate thấp hơn cho đối tượng xa nếu engine hỗ trợ.

## 8. Environment, map và navigation

### 8.1. Kit modular

| Nhóm       | Asset cần có                                 |
| ---------- | -------------------------------------------- |
| Ground     | Cỏ, đất, đá, đường, mép terrain              |
| Nature     | 3 cây, 2 bụi, 3 đá, cỏ cụm, vách đá          |
| Structures | Tường, cổng, bậc thang, cầu, nhà nhỏ, đền    |
| Props      | Đèn, biển, rương, thùng, tượng, đống lửa     |
| Tech       | Cột năng lượng, máy cổ, panel, cơ quan       |
| Gameplay   | Spawn marker, portal, checkpoint, boss arena |

Kit là source modular; runtime có thể batch thành chunk để giảm overhead. Không buộc toàn map thành một GLB, cũng không buộc mỗi viên đá là một draw call riêng.

### 8.2. Map đầu tiên: Rừng Cơ Quan

Các vùng: điểm xuất phát an toàn → đường rừng → bãi quái → di tích tinh anh → đấu trường boss → portal trở về.

- Blockout trước, kiểm tra khoảng trống combat rồi mới trang trí.
- Lối đi rộng đủ cho player/quái, không tạo ngõ cụt ngoài chủ đích.
- Địa hình cao thấp rõ nhưng MVP chưa yêu cầu bay tự do.
- Boss arena không bị cây/nhà che telegraph.
- Phân khu theo chunk; culling/streaming theo camera và vùng lân cận.
- Thiết kế spawn, leash, aggro, patrol, respawn và loot markers dưới dạng dữ liệu.
- Phân biệt vật cản, vùng chỉ trang trí, tương tác, nguy hiểm, vùng an toàn.

### 8.3. Navigation/collision

- Spike navmesh hoặc grid theo engine và địa hình; chọn một cho MVP.
- Tách nav data khỏi mesh render; cập nhật phiên bản khi layout thay đổi.
- Vật thể tĩnh dùng collider đơn giản; nhân vật dùng capsule/shape phù hợp.
- Kiểm tra cầu, stairs, mép vực, cửa hẹp, spawn trên vật cản và đường tới boss.
- Nếu cửa/vật cản động xuất hiện, định nghĩa cách cập nhật pathfinding.
- Click-to-move phải raycast được mặt đất; joystick không vượt collider.
- Occlusion: fade/dither vật foreground theo vùng nhỏ; không làm biến mất mọi cây.
- Seed lưu khi procedural placement; MVP ưu tiên map dựng tay và decoration có seed.

### 8.4. Map tooling

Công cụ tối thiểu: xem map, đặt/move/rotate/snap object, chọn asset, đặt spawn/portal, bật collision/nav overlay, save/load map data. Có thể dùng DCC + export nếu editor runtime chưa cần.

## 9. VFX, lighting, audio và UI liên quan

- Shared VFX library: slash, impact, projectile, aura, cast ring, loot beam, robot sparks.
- Màu class/element và màu rarity có quy tắc; tránh để glow phủ kín telegraph.
- Particle pooling; giới hạn lifetime, count, overdraw và emitters đang hoạt động.
- VFX theo quality tier; boss telegraph vẫn hiện ở cấu hình thấp.
- Giảm transparency chồng lớp, bloom lớn và đèn động từ từng projectile.
- Screen shake có giới hạn/có tùy chọn giảm.
- SFX: bước chân, weapon swing, hit, cast, robot, boss cue; pooling/voice limit khi cần.
- UI: icon item, portrait, rarity frame, skill icon, loading placeholder.
- Render thumbnail từ asset thật cùng camera/light để thống nhất.
- AI dùng được cho concept; mesh AI phải cleanup, retopo, UV, rig và test trước tích hợp.

## 10. Ngân sách hiệu năng ban đầu

### 10.1. Mục tiêu đo

- Thiết bị mục tiêu: 30 FPS ổn định, frame budget khoảng 33.3 ms; thiết bị mạnh hướng tới 60 FPS.
- Scene test: player, 10–20 quái, một boss, environment và VFX combat đại diện.
- Đo frame time percentile, CPU/GPU time nếu khả dụng, draw calls, triangles, texture/GPU memory, tải và animation cost.
- Chạy combat 10 phút và chuyển map lặp lại để phát hiện tăng memory/leak.
- Budget phải điều chỉnh từ profile thực; ghi cấu hình thiết bị, viewport và quality khi báo cáo.

| Loại                           |                   LOD0 tham khảo |
| ------------------------------ | -------------------------------: |
| Player hoàn chỉnh gồm trang bị |                 10–20k triangles |
| NPC                            |                            5–12k |
| Quái thường                    |                            3–10k |
| Tinh anh                       |                           10–20k |
| Boss                           |            20–50k tùy kích thước |
| Vũ khí riêng                   | 500–4k; vẫn tính vào tổng player |
| Prop                           |               100–5k tùy vai trò |

Baseline texture: props nhỏ 256–512; character atlas 1024; asset nổi bật tối đa 2048 khi có lý do. Đây là kích thước khởi điểm, không áp dụng máy móc cho mọi asset.

### 10.2. Tối ưu

- Profile trước; xử lý bottleneck thay vì chỉ giảm triangles.
- Texture atlas theo nhóm cần load chung; tránh atlas khổng lồ kéo cả biome không dùng.
- Atlas không tự giảm draw calls nếu vẫn nhiều meshes/materials.
- KTX2/Basis cho texture khi renderer/device hỗ trợ; chọn fallback có đo chi phí.
- Thiết lập color space đúng: base color/emissive theo sRGB; normal/roughness theo linear.
- Mipmaps và atlas padding tránh bleed; alpha cutout khi hợp lý.
- Dùng Meshopt/Draco theo pipeline đã kiểm chứng; đo decode time và tải decoder.
- LOD theo kích thước màn hình; khoảng giảm thử 100%/50%/25%, bảo toàn silhouette/rig.
- Instancing props lặp lại theo chunk; kiểm tra culling bounds.
- Skinned crowds cần giải pháp riêng, không mặc định dùng instancing như cây.
- Reuse geometry/material/textures và pools; dispose khi hết reference.
- Cap device pixel ratio theo quality tier; shadow distance/resolution có giới hạn.
- Không gộp cả map thành một batch làm mất culling.

## 11. Runtime loading và PWA

- Manifest có assetId, URL, hash/version, type, dependencies, bytes và fallback.
- Load boot essentials trước; preload vùng sắp vào, tải animation/outfit theo nhu cầu.
- Không precache toàn bộ game khi cài PWA.
- Cache theo hash; có quy tắc dọn bản cũ và dung lượng; xử lý quota exceeded.
- Khi offline: chỉ cho vào map đã có dependencies, hiển thị thiếu tải rõ ràng.
- Asset manager deduplicate requests, retry có giới hạn, cancel khi không còn cần.
- Loading progress dựa trên bytes nếu biết; không dùng phần trăm giả.
- Test MIME, CORS, HTTPS, decoder và GPU texture capabilities ở production target.
- Xử lý WebGL context lost/recovery và placeholder khi model lỗi.
- Giữ animation/core controls phản hồi trong lúc tải phụ.

## 12. Cấu trúc source và runtime

```text
art/
  references/
  art_bible/
  source/
    characters/
    equipment/
    creatures/
    environments/
    vfx/
  third_party/
    pack_id/
      originals/
      LICENSE.txt
      SOURCE.json
  exports/
assets/
  manifest/
  characters/
  equipment/
  creatures/
  environments/
  animations/
  textures/
  vfx/
  audio/
  ui/
maps/
  source/
  runtime/
  navigation/
tools/
  asset_build/
  asset_validate/
  thumbnail_render/
  map_export/
docs/
  art_bible.md
  asset_catalog.md
  rig_contract.md
  equipment_contract.md
  map_contract.md
  performance_budget.md
  decision_log.md
reports/
  asset_audit/
  performance/
  visual_review/
```

File lớn/source art dùng cơ chế lưu phù hợp repo; nếu dùng Git LFS, kiểm tra hosting/build lấy được bytes thật. Không commit decoder/build cache tùy tiện.

Naming: lowercase snake_case; ID ổn định, không dùng tên hiển thị làm khóa. Ví dụ char_humanoid_base_v1, outfit_wuxia_01, weapon_sword_iron_01, env_forest_tree_01, map_forest_mechanism_01.

## 13. Data contracts mẫu

### 13.1. Provenance

```json
{
  "assetId": "char_humanoid_base_v1",
  "author": "TO_VERIFY",
  "pack": "TO_VERIFY",
  "sourceUrl": "TO_VERIFY",
  "license": "TO_VERIFY",
  "licenseFile": "LICENSE.txt",
  "downloadedAt": null,
  "sourceHash": null,
  "modified": false,
  "status": "candidate"
}
```

### 13.2. Appearance

```json
{
  "appearanceId": "outfit_wuxia_01",
  "rigId": "humanoid_v1",
  "bodyTypes": ["regular_v1"],
  "slots": {
    "chest": { "assetId": "armor_wuxia_chest_01" },
    "main_hand": { "assetId": "weapon_sword_iron_01", "socket": "hand_r" }
  },
  "bodyMasks": ["torso"],
  "materialVariant": "default",
  "vfx": []
}
```

### 13.3. Map data

```json
{
  "mapId": "map_forest_mechanism_01",
  "schemaVersion": 1,
  "seed": 1001,
  "chunks": [
    {
      "id": "chunk_0_0",
      "bounds": { "min": [0, 0, 0], "max": [32, 12, 32] },
      "instances": [
        {
          "assetId": "env_forest_tree_01",
          "position": [4, 0, 8],
          "rotationEulerRad": [0, 0, 0],
          "scale": [1, 1, 1]
        }
      ]
    }
  ],
  "spawns": [],
  "portals": [],
  "navigationAssetId": "nav_forest_mechanism_01"
}
```

Các mẫu chỉ là contract đề xuất. Thêm schema validation, unique IDs, references và migration trước khi dùng production.

## 14. Pipeline từ source đến game

1. Audit nguồn/license và lưu originals.
2. Chọn art standard bằng lineup test.
3. Cleanup transforms, topology, normals, UV, materials.
4. Chuẩn hóa rig, weights, sockets và retarget.
5. Làm modular parts, body masks và compatibility.
6. Làm animation/events và test combat.
7. Tạo collider, LOD, thumbnails.
8. Export GLB/glTF với preset versioned.
9. Optimize texture/mesh bằng cấu hình tái tạo được.
10. Validate output; generate manifest/checksum/report.
11. Integrate vào asset viewer rồi scene gameplay.
12. Profile trên thiết bị chuẩn; điều chỉnh và ghi quyết định.

Giữ bản trước tối ưu để so sánh. Không overwrite source. Build phải báo lỗi khi thiếu license, reference, rig, texture hoặc asset vượt budget đã khóa; cho phép exception có lý do và owner.

## 15. Roadmap và phụ thuộc

| Giai đoạn           | Việc thực hiện                                  | Đầu ra / điều kiện qua                               |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| 0 — Khảo sát        | Kiểm tra repo, engine, thiết bị, audit vài pack | Decision log; chọn renderer và ứng viên base         |
| 1 — Art test        | Camera, palette, lineup 3 hệ, vật liệu          | Art Bible v0; silhouette rõ trên mobile              |
| 2 — Character spike | Base, rig, 3 outfit, 2 weapon, retarget         | Thay đồ + đi/chạy/đánh không méo nghiêm trọng        |
| 3 — Map blockout    | Layout, collision/nav, spawn, boss arena        | Chơi hết map bằng hình khối đơn giản                 |
| 4 — Vertical slice  | 3 quái, robot, tinh anh, boss, VFX/loot         | Loop di chuyển → đánh → nhặt → thay đồ → boss        |
| 5 — Asset build     | Export/optimize/validate/manifest/cache         | Tái build được; lỗi asset có fallback                |
| 6 — Tối ưu          | Profile, LOD, instancing, quality tiers         | Đạt mục tiêu FPS và loading trên thiết bị chuẩn      |
| 7 — Khóa chuẩn      | Review visual/technical; sửa lệch style         | Art Bible v1 và contracts ổn định                    |
| 8 — Mở rộng         | Biome, outfit, quái/boss mới                    | Thêm content qua pipeline mà không sửa core tùy tiện |

Không mở rộng kho asset trước khi giai đoạn 6 đạt yêu cầu. Chưa ấn định thời gian vì phụ thuộc nhân lực, asset thực tế và engine.

## 16. Backlog ưu tiên

### P0 — Bắt buộc cho vertical slice

- [ ] Kiểm tra repo và chọn renderer.
- [ ] Chốt thiết bị đo và scene benchmark.
- [ ] Audit license và chọn base/animation/environment.
- [ ] Chốt camera, tỷ lệ, lineup và palette.
- [ ] Chuẩn humanoid rig, sockets và export.
- [ ] Một player + 3 outfit có thể swap.
- [ ] Kiếm, đại đao, gauntlet và pháp khí.
- [ ] 3 quái thường, trong đó ít nhất một robot; một tinh anh và một boss.
- [ ] Một map có navigation/collision/spawn/portal.
- [ ] Animation/events cho combat chính.
- [ ] VFX/telegraph/loot và icon cơ bản.
- [ ] Asset manager, manifests, caching và fallbacks.
- [ ] Profile, tối ưu và nghiệm thu thiết bị thực.

### P1 — Sau khi slice đạt chuẩn

- [ ] Body type/nhân vật nữ bổ sung và kiểm tra lại outfit.
- [ ] Viewer trang bị, compatibility checks và thumbnail automation.
- [ ] Map tooling thuận tiện; streaming và nhiều biome.
- [ ] Thêm animation family, enemy behaviors và VFX quality tiers.
- [ ] Build validation tích hợp CI và báo cáo regression.

### P2 — Khi có nhu cầu thực tế

- [ ] Cloth/hair simulation; facial animation.
- [ ] Procedural map generation, dynamic navigation.
- [ ] Crowd animation nâng cao.
- [ ] Mythic cosmetics, cinematic boss, weather.

## 17. Nghiệm thu

### Visual

- Player võ hiệp, tu tiên và robot trông cùng một thế giới trong một scene.
- Nhân vật, weapon và enemy class đọc rõ ở camera gameplay trên mobile.
- Outfit không có clipping nghiêm trọng ở bộ pose/animation đại diện.
- Boss telegraph, player và loot không bị environment/VFX che mất.
- Lighting, texture density, rarity colors và icon nhất quán.

### Technical

- Assets hợp lệ, transforms/pivots đúng, không thiếu textures/materials.
- Rig/animation/sockets chạy đúng; không double movement hoặc foot sliding lớn.
- Trang bị swap không phá animation; body masks đúng.
- Navigation đi được tới mọi mục tiêu; không spawn trong collider.
- LOD không mất attachment, màu/material hoặc silhouette thiết yếu.
- Caching/version upgrade hoạt động; lỗi tải có fallback và thông báo.
- Chuyển map lặp lại không tăng memory không kiểm soát.
- Source → optimized assets tái tạo được và có provenance đầy đủ.

### Performance

- Đo trên Android/iPhone chuẩn với scene combat đại diện.
- Mục tiêu median 30 FPS trở lên ở quality đã chọn; báo cáo p95 frame time và các spike thay vì chỉ FPS trung bình.
- Báo cáo riêng lần tải đầu, cache warm, map transition và outfit swap.
- Nếu chưa đạt: ghi bottleneck, cấu hình giảm và việc còn tồn; không tuyên bố hoàn tất bằng desktop test.

## 18. Rủi ro và cách xử lý

| Rủi ro                                 | Cách xử lý                                              |
| -------------------------------------- | ------------------------------------------------------- |
| Pack khác style                        | Lineup test trước tích hợp, chỉnh materials/proportions |
| Rig nhìn giống nhưng không tương thích | Retarget/bind-pose audit và test animation              |
| Hàng trăm item làm bùng nổ content     | Appearance families, palette variants, rarity rules     |
| Áo bào/tóc xuyên giáp                  | Compatibility rules, body masks, pose tests             |
| Draw calls từ modular character        | Giảm material, merge có kiểm chứng, hạn chế parts       |
| VFX/bloom quá nặng                     | Pool, emitter cap, quality tiers, giữ telegraph         |
| Map load quá lớn                       | Chunk/dependency loading, atlas theo biome              |
| Atlas/merge làm mất culling            | Chia batch theo khu vực và usage                        |
| AI mesh khó rig                        | Cleanup/retopo; dùng làm concept nếu sửa quá tốn        |
| Nguồn/license không rõ                 | Quarantine asset, chỉ nhận khi có bằng chứng            |
| Web/mobile khác desktop                | Kiểm tra thiết bị thực từ sớm                           |

## 19. Chỉ dẫn cho agent triển khai

1. Đọc tài liệu này và quy tắc repo trước khi sửa.
2. Lập task list theo roadmap; ghi assumption và quyết định.
3. Bắt đầu bằng spike nhỏ, không nhập toàn bộ pack ngay.
4. Chỉ asset verified được dùng trong bản phát hành; placeholders phải gắn nhãn.
5. Không hard-code map/item appearance vào gameplay logic.
6. Không thay engine hoặc phá data contract đã có chỉ để tiện import.
7. Không tuyên bố animation tương thích khi chưa chạy test.
8. Tạo validation cho references/schema/build; kiểm thử gameplay đại diện.
9. Mỗi milestone bàn giao source, runtime output, ảnh/clip kiểm chứng và số đo.
10. Khi kết thúc, báo cáo việc đã làm, phần chưa đạt, giới hạn và bước tiếp theo.

## 20. Definition of Done tổng thể

Hoàn thành phần nền tảng khi có một map chơi được với player thay 3 outfit, robot/quái/tinh anh/boss, animation và VFX rõ ràng; assets có nguồn/license; build tái tạo được; loading/cache hoạt động; đạt mục tiêu đã đo trên thiết bị chuẩn; thêm trang bị hoặc map mới bằng dữ liệu và pipeline thay vì sửa lại core.
