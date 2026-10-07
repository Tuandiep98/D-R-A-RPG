# Third-party assets

Mỗi pack nằm trong một thư mục riêng:

```
art/third_party/<pack_id>/
  SOURCE.json     # provenance + danh sách asset (commit)
  LICENSE.txt     # bản license tải kèm pack (commit)
  originals/      # file gốc .glb/.gltf (KHÔNG commit, không sửa tay)
```

`pnpm assets:build` đọc mọi `SOURCE.json`, từ chối pack thiếu `LICENSE.txt`, nén meshopt, đặt tên theo hash và ghi `apps/game-web/public/assets/assets.manifest.json`. Asset nào chưa có thì game dùng placeholder.

## Milestone 1: Quaternius (CC0, cần xác minh lại license trên trang tác giả)

Đã kiểm tra trang tác giả ngày 06/10/2026: cả 4 pack đều CC0 và có bản glTF.

| Thư mục (`packId`)            | Pack                                                          | Link                                                      | Dùng cho assetId                                           |
| ----------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| `quaternius_rpg_characters`   | RPG Characters (6 nhân vật rigged + animated)                 | https://quaternius.com/packs/rpgcharacters.html           | `char_player_default`                                      |
| `quaternius_animated_animals` | Ultimate Animated Animal Pack (12 con, mỗi con 12+ animation) | https://quaternius.com/packs/ultimateanimatedanimals.html | `mob_wolf_01`                                              |
| `quaternius_space_kit`        | Ultimate Space Kit (nhân vật/enemy animated)                  | https://quaternius.com/packs/ultimatespacekit.html        | `mob_robot_scout_01`                                       |
| `quaternius_nature_megakit`   | Stylized Nature MegaKit (bản Standard miễn phí)               | https://quaternius.com/packs/stylizednaturemegakit.html   | `env_tree_01`, `env_tree_02`, `env_rock_01`, `env_bush_01` |

Không dùng **Ultimate Nature**: pack đó không có glTF. Nếu Animated Animals không có sói, dùng Husky/Fox hoặc một con trong **Ultimate Monsters** (https://quaternius.com/packs/ultimatemonsters.html).

Giai đoạn sau (equipment modular, assets plan §6): **Universal Base Characters** + **Universal Animation Library**. Chưa tải ở M1.

Các bước:

1. Tải pack, chỉ lấy bản **glTF/GLB**. Giải nén vào `art/third_party/<pack_id>/originals/`.
2. Copy file license của pack thành `LICENSE.txt`.
3. Tạo `SOURCE.json` theo mẫu `SOURCE.example.json`, map file → `assetId` ở bảng trên.
4. Chạy `pnpm assets:build`. Lệnh in ra tên các animation clip của từng model.
5. Sửa `game-data/appearances/<id>.yaml` cho `animations:` khớp tên clip, chỉnh `scale`/`yawOffset` nếu model to/nhỏ hoặc quay sai hướng (+Z là phía trước).
6. `pnpm validate:data`, rồi `pnpm dev` để xem.

Chỉ đặt `licenseVerified: true` sau khi đã tự kiểm tra license trên trang tác giả. `status` dùng `candidate` / `approved` / `prototype_only` / `rejected` (assets plan §4.2).

## Đợt 07/10/2026: vũ khí, item, âm thanh, icon, UI, VFX (đều CC0, đã duyệt — D-025)

| Thư mục (`packId`)               | Loại       | Nội dung dùng                                                   | Link |
| -------------------------------- | ---------- | --------------------------------------------------------------- | ---- |
| `kaykit_adventurers`             | models     | 12 vũ khí/khiên/sách phép (`weapon_kk_*`, `offhand_kk_*`)       | https://kaylousberg.itch.io/kaykit-adventurers |
| `quaternius_medieval_weapons`    | models     | 18 kiếm/đao/thương/rìu/khiên (`weapon_qm_*`) — OBJ → convert    | https://quaternius.itch.io/lowpoly-medieval-weapons |
| `quaternius_ultimate_rpg_items`  | models+icons | 27 model vật phẩm + 47 icon render (`icon_item_*`)            | https://quaternius.com/packs/ultimaterpg.html |
| `quaternius_rpg_asset_pack`      | models     | gậy phép, mũ, khiên (`weapon_qa_*`, `item_qa_*`) — OBJ → convert | https://quaternius.com/packs/rpg.html |
| `quaternius_ultimate_guns`       | models     | 6 súng cho nhánh cơ giáp (`weapon_qg_*`) — OBJ → convert        | https://quaternius.com/packs/ultimategun.html |
| `kenney_blaster_kit`             | models     | 8 blaster + lựu đạn (`weapon_kb_*`)                             | https://kenney.nl/assets/blaster-kit |
| `quaternius_universal_animation` | animations | 43 clip rig UBC + hình nộm `char_ual_mannequin`                 | https://quaternius.com/packs/universalanimationlibrary.html |
| `kdrn_ability_icons`             | icons      | 18 icon skill đã chọn (130 icon trong originals/)               | https://kdrn.itch.io/ability-icons |
| `kenney_fantasy_ui_borders`      | ui         | khung 9-slice hồi văn nhuộm vàng (`ui_border*`)                 | https://kenney.nl/assets/fantasy-ui-borders |
| `kenney_particle_pack`           | vfx        | 24 sprite chém/tia/khói/lửa (`vfx_*`)                           | https://kenney.nl/assets/particle-pack |
| `kenney_rpg_audio`, `kenney_impact_sounds`, `kenney_scifi_sounds`, `kenney_interface_sounds` | audio | 56 âm thanh (`sfx_*`) | https://kenney.nl/assets/category:Audio |

Quy trình cho pack mới loại này: giải nén vào `originals/` → (OBJ thì `pnpm assets:convert`) → khai báo `assets` / `media` trong `SOURCE.json` → `pnpm assets:build` + `pnpm media:build` → tham chiếu id trong game-data → `pnpm validate:data`. Danh sách id: `docs/asset_catalog.md`, `docs/media_catalog.md`.

## Đợt 07/10/2026 (2): chuyển sang KayKit — D-027, D-028

| Thư mục (`packId`)            | Loại      | Dùng cho |
| ----------------------------- | --------- | -------- |
| `kaykit_adventurers`          | models    | Player (Rogue), NPC (Mage / Rogue Hooded / Knight / Barbarian), vũ khí `weapon_kk_*` |
| `kaykit_character_animations` | animations | 133 clip Rig_Medium (cận chiến, tầm xa, phép, né, Skeleton) + hình nộm `char_kk_mannequin` |
| `kaykit_skeletons`            | models    | Quái `mob_skeleton_*` (chưa đặt vào map) + vũ khí `weapon_ks_*` |
| `kaykit_fantasy_weapons`      | models    | 25 vũ khí `weapon_kf_*` → appearance `gear_weapon_kf_*` |
| `kaykit_dungeon`              | models    | Dungeon + thay Quaternius Medieval Village / Fantasy Props (tường, sàn, mái, hàng rào, thùng, bàn, giá vũ khí) |
| `kaykit_forest_nature`        | models    | Cây, đá, bụi, cỏ (thay Quaternius Nature, trừ hoa/nấm) |
| `kaykit_space_base`           | models    | Khu cơ quan (thay Quaternius Modular Sci-Fi) |
| `kaykit_rpg_tools`            | models    | Đe, đèn lồng, dụng cụ rơi `drop_item_kt_*` |
| `kaykit_resource_bits`        | models    | Vật liệu rơi `drop_item_kr_*` (quặng, thỏi, gỗ, đá, vải, bánh răng) |
| `kaykit_platformer`, `kaykit_city_builder`, `kaykit_block_bits` | library | Để dành, chưa dùng |

Còn thiếu file gốc (hiện placeholder): `quaternius_animated_mech` (robot trinh sát, boss mech) và `quaternius_ultimate_monsters` (Guardian vỏ đá).
