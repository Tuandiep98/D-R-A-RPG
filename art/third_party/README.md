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
