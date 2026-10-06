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

| assetId (đã dùng trong `game-data/appearances`) | Gợi ý nguồn | Ghi chú |
|---|---|---|
| `char_player_default` | Quaternius **RPG Characters** — https://quaternius.com/packs/rpgcharacters.html | Chọn 1 nhân vật cầm kiếm, file glTF có animation |
| `mob_wolf_01` | Quaternius **Ultimate Monsters** hoặc **Animated Animals** (tìm trên quaternius.com) | Cần idle/run/attack/death |
| `mob_robot_scout_01` | Quaternius **Ultimate Space Kit** — https://quaternius.com/packs/ultimatespacekit.html | Robot có animation |
| `env_tree_01`, `env_tree_02`, `env_rock_01`, `env_bush_01` | Quaternius **Ultimate Nature** / **Stylized Nature MegaKit** (tìm trên quaternius.com) | Static mesh |

Các bước:

1. Tải pack, chỉ lấy bản **glTF/GLB**. Giải nén vào `art/third_party/<pack_id>/originals/`.
2. Copy file license của pack thành `LICENSE.txt`.
3. Tạo `SOURCE.json` theo mẫu `SOURCE.example.json`, map file → `assetId` ở bảng trên.
4. Chạy `pnpm assets:build`. Lệnh in ra tên các animation clip của từng model.
5. Sửa `game-data/appearances/<id>.yaml` cho `animations:` khớp tên clip, chỉnh `scale`/`yawOffset` nếu model to/nhỏ hoặc quay sai hướng (+Z là phía trước).
6. `pnpm validate:data`, rồi `pnpm dev` để xem.

Chỉ đặt `licenseVerified: true` sau khi đã tự kiểm tra license trên trang tác giả. `status` dùng `candidate` / `approved` / `prototype_only` / `rejected` (assets plan §4.2).
