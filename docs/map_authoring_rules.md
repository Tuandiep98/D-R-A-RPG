# Quy tắc tạo map (Map Authoring Rules)

Đọc file này **trước khi** tạo hoặc sửa bất kỳ map nào. Đi kèm: `docs/map_contract.md` (định dạng dữ liệu, pipeline), `docs/art_bible.md`, `docs/performance_budget.md`, plan trùng tu `docs/plan/05_map_renovation_plan.md`.
Quy tắc có mã **R…** được kiểm bằng test `tools/map-builder/map-rules.test.ts` (`pnpm test`); quy tắc **G…** là hướng dẫn thiết kế, reviewer kiểm bằng mắt qua `pnpm smoke:maps`.

---

## 1. Mạch game quyết định map

Thiên Cơ Kỷ là RPG Tu Tiên × Cơ Giới **không có level** (D-024). Thế giới là một lục địa chia 8 vùng, mỗi vùng mở theo **cảnh giới**:

| #   | Vùng (`game-data/world/`) | Cảnh giới mở | Phong cách (art + lore)                                       |
| --- | ------------------------- | ------------ | ------------------------------------------------------------- |
| 1   | Tân Nguyên Trấn           | Luyện Khí    | Thị trấn biên giới gỗ/đá, đồng cỏ, phế tích cổ lẫn xác máy    |
| 2   | Thanh Vân Sơn Mạch        | Trúc Cơ      | Núi cao, rừng trúc, thác, cầu đá, môn phái, linh thú          |
| 3   | Cơ Thành Thiên Môn        | Trúc Cơ      | Đông phương cổ × máy móc: mái ngói, tháp, rail năng lượng     |
| 4   | Hoang Vực Xích Sa         | Kim Đan      | Sa mạc đỏ, phế tích, xác máy, xương khổng lồ, bão Nguyên Khí  |
| 5   | U Minh Lâm                | Kim Đan      | Rừng tối, cây phát sáng tím, sương độc, robot bị cây xuyên    |
| 6   | Vân Hải Cổ Vực            | Nguyên Anh   | Đảo nổi, mây, cầu linh khí, động cơ phản trọng lực cổ         |
| 7   | Thiên Liệt Chi Địa        | Nguyên Anh   | Chiến trường cổ, trọng lực méo, kiếm/robot khổng lồ gãy       |
| 8   | Thiên Tâm Thâm Tầng       | Hóa Thần     | Kiến trúc máy khổng lồ + sinh học, sông năng lượng            |

Mỗi map **phải** kể được một đoạn của mạch này: vùng nào, cảnh giới nào, Tiên hay Cơ chiếm ưu thế, dấu vết Thiên Liệt ra sao.

## 2. Quy tắc bắt buộc (kiểm bằng test)

| Mã  | Quy tắc                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------- |
| R1  | Mỗi map thuộc **đúng một** vùng: thêm `{ mapId, at }` vào `maps` của file vùng trong `game-data/world/`.  |
| R2  | Tâm bãi quái không nằm trong collider (cách mép ≥ 0,4 m).                                                 |
| R3  | Không đặt bãi quái trong vùng `safe` (tính cả `radius` của bãi).                                          |
| R4  | `playerSpawn`, mọi `arrival`, mọi `portal` đứng trên nền trống (cách collider ≥ 0,3 m).                   |
| R5  | Đấu trường boss: 70 % bán kính trong cùng không có collider (telegraph phải nhìn thấy, né được).          |
| R6  | Có đường về chỗ an toàn: map có vùng `safe` hoặc portal.                                                  |
| R7  | ≤ 400 instance mỗi chunk (performance budget); vượt thì giảm scatter, không tăng chunk.                   |
| R8  | File layout mở đầu bằng khối comment: tên vùng, vai trò, thứ tự khu vực theo hướng đi (+Z = bắc).         |

Validator (`pnpm validate:data`) bắt thêm: map không thuộc vùng nào, map thuộc 2 vùng, realm/link/map không tồn tại, portal trỏ arrival không có.

## 3. Bố cục (blockout trước, trang trí sau)

- **G1 Trục chính**: một đường chính rộng 7 m nối điểm vào → các khu → boss → lối ra; nhánh phụ 4–5 m tới bãi phụ. Người chơi nhìn đường đất là biết hướng.
- **G2 Nhịp khu vực**: an toàn → giao tranh nhẹ → tinh anh → boss → lối tắt về. Mỗi khu là một clearing có tên (`zones`) và một **landmark** riêng nhìn thấy từ xa: trụ đá, cổng hợp kim, giàn khoan, vòng cột.
- **G3 Thị trấn**: quảng trường ở giữa (landmark + NPC chính), các khu chức năng (lò rèn, chợ, y quán, doanh trại, trạm vận chuyển) chia theo góc; hàng rào/tường bao, mở cổng đúng ở đầu đường; NPC đứng **cạnh đồ nghề của mình** (thợ rèn cạnh đe, dược sư cạnh kệ thuốc).
- **G4 Đọc được trên minimap**: đường đi, mảng đất trại (`ground.paint.patches`), vòng tường đấu trường phải tạo hình rõ khi nhìn từ trên xuống — minimap vẽ thẳng từ dữ liệu này.
- **G5 Quái ở ngoài khu an toàn**: bãi luyện công/tutorial đặt ngay ngoài cổng, không đặt giữa phố.

## 4. Trang trí theo phong cách vùng (dressing)

Nguyên tắc chung, đúc kết từ cách các game RPG bày cảnh ("đặt có chủ đích" — mỗi cụm đồ kể một câu chuyện; mật độ theo vai trò khu: đường đi thưa, khu khám phá vừa, mép map rậm):

- **G6 Cụm, không rải đều**: dùng `prefabs` cho cụm đồ có ý nghĩa (sạp hàng + sọt + ghế; đe + đá mài + giá binh khí + củi). `scatter` chỉ dành cho thiên nhiên và đá vụn. Dùng `area` của scatter để mỗi khu có bộ đồ riêng.
- **G7 Ba lớp**: (1) landmark cao, 1–2 cái/khu; (2) cụm đồ tầm trung quanh NPC/bãi quái; (3) chi tiết thấp không collider (cỏ, hoa, nấm, đá cuội) — lớp 3 không bao giờ chắn đường.
- **G8 Không che gameplay**: không cây/đồ cao trong đấu trường boss; không collider trên `paths`; vật thể chắn camera tự làm mờ nhưng vẫn tránh đặt sát lối chính.
- **G9 Kể chuyện Tiên × Cơ**: vùng đầu game, phần "Tiên" (trụ đá, phù văn, nến tế) nằm trên, phần "Cơ" (khoang máy, phế liệu, cửa hợp kim) lộ ra dưới. Càng vào sâu, tỉ lệ máy móc càng tăng.

Bảng chọn asset theo vùng (asset đã có trong repo; vùng chưa có asset → ghi vào §6 của plan 05, **không** đặt asset sai phong cách):

| Vùng / khu                   | Landmark                                                 | Cụm đồ                                                                       | Thiên nhiên                                          |
| ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Thị trấn (Tân Nguyên)        | `env_ruin_pillar_01` + `env_floor_rune_01`, cờ `prop_banner_green_01` | sạp `prop_market_stall_01`, `prop_textiles_01`, `prop_coins_01`; lò rèn `prop_anvil_01`, `prop_grindstone_01`, `prop_iron_bars_01`; y quán `prop_shelves_01`, `prop_bottle_01`; trạm `env_scifi_door_01`, `prop_tech_cargo_01` | `env_tree_05/07`, `env_bush_02`, hoa ở vườn thuốc    |
| Phế tích cổ (Tiên)           | `env_ruin_pillar_01`, vòng `env_ruin_column_01`          | `ruin_wall` (tường vỡ + cột + đá vụn), nến `prop_candles_01`                  | cây khô, đá `env_rock_04/05`, hoa ở đất thiêng       |
| Xác máy Thiên Cơ (Cơ)        | `env_tech_drill_01`, cửa hợp kim (`alloy_gate`)          | `tech_wreck` (khoang + phế liệu + thùng Nguyên Khí), `prop_tech_panel_01`     | không cây trong bán kính 10 m, đá vụn                |
| Rừng / đồi thú               | hang đá lớn (`env_rock_05` ôm ổ)                         | —                                                                            | cây rậm ở mép, dương xỉ + nấm ở hang hồ ly           |
| Doanh trại / tiền đồn        | cờ khiên `prop_banner_shield_01`, hàng rào ring tangent  | `camp_store` (giá binh khí, củi, rương, đuốc)                                 | cây ngoài hàng rào                                   |
| Hầm mộ / phó bản             | trụ cổ 4 góc mộ thất, nền phù văn                        | trại khảo cổ ở cửa (bàn, bản vẽ, dây, đuốc), rương + xu ở mộ thất            | **không** cây; đá khối, tường đổ, nền vỡ             |

## 5. Công cụ của layout (`maps/source/*.layout.yaml`)

- `prefabs` + `prefabPlacements` (xoay cả cụm). Offset tính theo hướng prefab: cửa nhà ở `z: -2` → `rotationY: 0` quay cửa về nam, `3.14159` về bắc, `-1.5708` về đông, `1.5708` về tây.
- `rings`: `orient: tangent` cho hàng rào/tường (trục X model chạy theo vòng), `random` cho đá. `gapAngles` (radian, 0 = đông, π/2 = bắc) mở cổng.
- `scatter.area`: `{ center, radius }` hoặc `{ min, max }` giới hạn khu; `respectClearings: false` khi cần rải trong clearing (chỉ đồ không collider).
- `groundCovers` cho nền lát (quảng trường, sân phế tích). Không lát bằng tile có khối nổi lớn (vd. `env_village_floor_redbrick_01`) vì nhìn như đá lổn nhổn.

## 6. Quy trình

1. Viết/đổi layout → `pnpm content:build` (maps:build → nav:build → validate:data).
2. Asset mới: khai báo trong `SOURCE.json` của pack + `game-data/appearances/<id>.yaml` (placeholder `color` chính là màu trên minimap) → `pnpm assets:vendor` → `pnpm assets:build`. Pack phải `approved`; file gốc phải được commit qua allowlist để máy khác `git pull` là chạy.
3. `pnpm test` (rules R1–R8, navigation) → `pnpm dev` + `pnpm smoke:maps` → xem `reports/maps/*-scene|minimap|world|local.png`.
4. Cập nhật bảng map trong `docs/map_contract.md` và trạng thái trong plan 05.

## 7. Minimap & bản đồ thế giới

- Minimap (góc phải trên, khung slot như avatar) vẽ từ `MapDef`: nền + đường + mảng đất + floor + collider (màu = `placeholder.color`) + tán cây; quái/NPC/người chơi lấy từ `GameView.radar()`. Bắc luôn ở trên; mũi tên = hướng nhân vật, nón sáng = hướng camera; cổng ngoài khung hiện mũi tên ở mép.
- Bản đồ thế giới (phím **M** hoặc chạm minimap): vùng sáng khi cảnh giới người chơi ≥ `realm` của vùng và vùng đã có map; còn lại phủ sương tối. Tab "Khu vực" vẽ cả map hiện tại với tên khu, bãi quái, NPC, cổng.
- Thêm vùng mới: tạo `game-data/world/region_<id>.yaml` (shape là đa giác trên canvas 1000×640, `links` cho đường liên vùng). Không cần sửa code.
