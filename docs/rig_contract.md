# Rig Contract

Áp dụng cho mọi model có xương (assets plan §5). Gameplay không đọc file này; nó ràng buộc artist, pipeline và renderer.

## Quy ước chung

| Mục | Quy ước |
|---|---|
| Đơn vị | 1 unit = 1 m. Player chuẩn cao ~1.6 m sau `scale` trong appearance |
| Trục | Y-up, mặt trước +Z (sau khi glTF loader của Babylon chuyển hệ trục) |
| Pivot | Humanoid/quái: mặt đất, dưới tâm nhân vật. Prop: điểm dễ snap |
| Transform gốc | Không scale âm, không scale lệch trục (pipeline cảnh báo — `checkTransforms`) |
| Skin influences | Tối đa 4 / vertex |
| Locomotion | In-place; dịch chuyển do simulation quyết định (không root motion) |
| Định dạng runtime | GLB, meshopt (D-006), texture WebP ≤ budget theo loại (`TEXTURE_BUDGET`) |

## Rig đang dùng

| Rig id | Nguồn | Dùng cho | Ghi chú |
|---|---|---|---|
| `quaternius_rpg_v1` | RPG Characters (Warrior…) | `char_player_default` | Có `Warrior_Sword` gắn sẵn vào `Weapon.R` |
| `quaternius_quadruped_v1` | Ultimate Animated Animals | sói, hồ ly, linh lộc | Rig thú, không ép vào humanoid |
| `quaternius_spacekit_v1` | Ultimate Space Kit | robot, mech boss | Rig riêng của pack |

Rig chuẩn cho trang bị modular (assets plan §5.2, §6) **chưa chốt**. Ứng viên: Universal Base Characters + Universal Animation Library (cùng skeleton, có retarget). Khi chốt, thêm hàng `humanoid_v1` và cập nhật `sockets` của appearance tương ứng.

## Sockets

Khai báo trong `game-data/appearances/<id>.yaml` → `sockets: { <socket>: <tên bone> }`. Renderer tìm node theo tên (đã bỏ tiền tố clone) và gắn trang bị vào đó, bù scale để trang bị giữ kích thước thật theo mét.

| Socket | Ý nghĩa | `char_player_default` |
|---|---|---|
| `hand_r` | Vũ khí chính | `Weapon.R` |
| `hand_l` | Tay phụ, khiên | `Fist.L` |
| `head` | Mũ, vương miện | `Head` |
| `back` | Áo choàng, kiếm đeo lưng | — |
| `shoulder_l` / `shoulder_r` | Giáp vai | — |
| `artifact` | Pháp khí/phi kiếm (bay cạnh nhân vật) | — (placeholder bay cạnh vai) |
| `vfx_origin` | Điểm phát VFX | — |

## Phần dựng sẵn (`builtIn`)

Khi model đã có sẵn một món đồ, khai báo `builtIn.<slot> = { node, appearanceId }`. Renderer hiện node đó khi slot đang mặc đúng appearance mặc định; nếu mặc món khác thì ẩn node và gắn appearance của món mới vào socket.

## Animation roles

`idle`, `run`, `attack`, `cast` (dùng `attack` nếu không có), `hit`, `death`. Map tên clip trong appearance. `pnpm assets:build` in danh sách clip của từng model.

## Kiểm tra trước khi nhận asset

- [ ] Import vào sandbox, chạy đủ 6 role không lỗi console (`[anim] clip … not found`).
- [ ] Đứng trên mặt đất (pivot), hướng +Z, chiều cao đúng sau `scale`.
- [ ] Socket gắn vũ khí không lệch khi chạy/đánh.
- [ ] Tris trong budget (`docs/performance_budget.md`), hoặc có `budgetException` kèm lý do.
