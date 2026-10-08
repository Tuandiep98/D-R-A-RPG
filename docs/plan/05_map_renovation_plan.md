# 05 — Plan trùng tu map, minimap & bản đồ thế giới

Nguồn: ảnh concept "Thiên Cơ Kỷ — Bản đồ thế giới" (8 vùng, thế lực, NPC chủ chốt), `00_game_design_master.md` Phần IV (§11–18), `02_assets_models_maps_plan.md` §8, `docs/game-ui-style.md`.
Quy tắc rút ra để làm map về sau: **`docs/map_authoring_rules.md`** (bắt buộc đọc trước khi làm map).
Cập nhật: 2026-10-08.

---

## 1. Đọc ảnh concept → quyết định cho game

| Ảnh concept                                                     | Trong game                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Một lục địa, 8 vùng, đường chính/phụ nối vùng, cổng dịch chuyển | `game-data/world/region_*.yaml` (shape, links, maps); bản đồ thế giới vẽ từ data                                               |
| Mỗi vùng ghi "Lv. 1–10 … Lv. 80+"                               | **Không dùng level** (D-024): vùng mở theo cảnh giới — Luyện Khí → Trúc Cơ → Kim Đan → Nguyên Anh → Hóa Thần (D-035)           |
| Tân Nguyên Trấn ở giữa: thị trấn gỗ, Phế Tích Vô Danh là dungeon đầu | Ba map hiện có đều thuộc vùng 1; Phế Tích Vô Danh = map rừng + tầng sâu (phó bản)                                          |
| Chú thích: thành phố, dungeon, boss, đường chính/phụ, cổng      | Legend trong bản đồ thế giới + tab "Khu vực"; minimap có NPC, quái, boss, cổng                                                 |
| Thanh Vân: Huyền Vũ Cổ Mộ / X-04                                | Boss X-04 đang tạm ở Phế Tích Vô Danh (map rừng + phó bản). Khi dựng Thanh Vân: dời chuỗi Huyền Vũ về đó, Phế Tích nhận boss riêng (§5) |

## 2. Hiện trạng trước trùng tu (đánh giá)

| Map                                   | Vấn đề                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `map_sandbox_01` Tân Nguyên Trấn      | 40×40 m — nhỏ hơn một quảng trường; quái đứng giữa phố an toàn; thiếu chợ / y quán / doanh trại / trạm vận chuyển theo lore §11          |
| `map_forest_mechanism_01` Phế Tích Vô Danh | Scatter rải đều toàn map, phế tích chỉ là đá thay máy móc; bãi robot nằm trong tường hợp kim; cổng phó bản nằm trong khung cửa     |
| `map_golem_sanctum_01` (tầng sâu)     | Có cây mọc trong hầm mộ; vòng đá như ngoài rừng; bãi Thạch Khôi nằm trong cửa vòm                                                        |
| Chung                                 | Không có minimap, không có bản đồ thế giới, không có rule tạo map; validator không bắt spawn/portal nằm trong collider                    |

## 3. Đợt trùng tu 1 (đã làm — 2026-10-08)

### 3.1 Công cụ và dữ liệu

- [x] `game-data/world/`: 8 vùng (shape, label, map pin, links, cảnh giới mở, highlights, boss) + validator (map thuộc đúng 1 vùng, realm/link/map tồn tại).
- [x] Map builder: `scatter.area` (dressing theo khu), `scatter.respectClearings`, `rings.orient: tangent` (hàng rào/tường chạy theo vòng).
- [x] 57 model mới từ pack KayKit đã duyệt (Dungeon, Resource Bits, Space Base, RPG Tools, Forest Nature): phế tích, đồ chợ/lò rèn/y quán, xác máy Thiên Cơ, cây/đá biến thể. Khai báo trong `SOURCE.json`, file gốc vào git qua `pnpm assets:vendor`.
- [x] Test luật map R1–R8 (`tools/map-builder/map-rules.test.ts`); đã bắt và sửa 3 lỗi cũ (bãi robot trong tường, cổng trong khung cửa, bãi Thạch Khôi trong cửa vòm).

### 3.2 Từng map

| Map                     | Đã làm                                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tân Nguyên Trấn         | 80×80 m. Quảng trường Thiên Cơ (bia trụ cổ + nền phù văn + cờ Thiên Kiếm Minh + đuốc); Lò rèn (TB, Lão Mộc), Chợ nhỏ (ĐB, 3 sạp), Y quán + vườn thuốc (ĐN, Tô Tiểu Linh), Doanh trại (TN), Trạm vận chuyển (cổng nam); hàng rào bao 4 cổng; ngoài cổng bắc: Bãi Luyện Công (Thạch Khôi) và Bãi Xác Máy (Cơ Giáp Trinh Sát), đường bắc tới Phế Tích |
| Phế Tích Vô Danh        | Giữ nguyên gameplay (đường, zone, bãi quái, cổng). Doanh trại tiền tiêu có hàng rào + kho trại; Đồi Sói có hang đá + cây khô; Hang Hồ Ly nấm/dương xỉ; Cửa Hợp Kim thành phế tích thật (tường cổ đổ, cột, xác máy Thiên Cơ, giàn khoan); Linh Lộc Đài vòng 9 cột + nền phù văn + hoa; Đài Tượng Đá thêm 4 trụ cổ và 2 tượng canh lối |
| Phế tích tầng sâu (phó bản) | Bỏ cây; mộ thất bao tường đá nứt; 4 trụ góc + nến tế + nền phù văn; rương + xu; trại khảo cổ ở cửa mộ; terminal/xác máy sau cửa hợp kim thứ hai; hai bên hành lang là tường đổ, đá khối |

### 3.3 Minimap & bản đồ thế giới

- [x] Minimap góc phải trên, khung slot Kenney như avatar: bắc ở trên, mũi tên hướng nhân vật, nón hướng camera, chấm quái (thường/tinh anh/boss nhấp nháy, viền khi đang đánh mình), NPC hình thoi, người chơi khác, loot, cổng xoáy + mũi tên ở mép khi ngoài khung; zoom 3 mức (nhớ trong localStorage); tên khu + biểu tượng vùng an toàn bên dưới.
- [x] Bấm minimap / phím **M** / nút menu → bản đồ toàn màn hình. Tab **Thế giới**: lục địa 8 vùng (bờ biển ngẫu nhiên có seed, motif theo biome), vùng mở sáng, vùng chưa mở phủ sương tối + "Cần cảnh giới …"; đường liên vùng; pin map; "Bạn ở đây"; thẻ vùng (trạng thái, biome, cảnh giới, danh sách map, điểm nổi bật, boss); chú thích. Tab **Khu vực**: cả map hiện tại với tên khu, bãi quái (tên + số lượng), NPC, cổng, vị trí bạn.
- [x] Responsive: desktop 152 px, touch 124 px, điện thoại ngang 96 px (menu dời sang trái minimap), dọc 104 px (menu xuống dưới). Low/giảm trong suốt: tắt blur.
- [x] Smoke `pnpm smoke:maps` chụp scene/minimap/world/local cho cả 3 map.

## 4. Đợt sau (chưa làm)

| Ưu tiên | Hạng mục                                                                                                                                                    | Ghi chú                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| P1      | "Đã khám phá" theo nhân vật (server lưu `discoveredMaps`, persist) → vùng đã đặt chân sáng hẳn, vùng mở theo cảnh giới nhưng chưa đến thì sáng mờ          | Cần schema persistence + protocol; hiện vùng chỉ mở theo cảnh giới              |
| P1      | Đánh dấu nhiệm vụ trên minimap (NPC có "!" / "?", mục tiêu kill/collect)                                                                                     | Dữ liệu quest đã có trong UiState                                               |
| P1      | Boss riêng cho Phế Tích Vô Danh; dời chuỗi Huyền Vũ Cổ Mộ / X-04 về Thanh Vân Sơn Mạch, đổi tên phó bản hiện tại thành "Phế Tích Vô Danh · Tầng Sâu"         | Đụng quest/loot/node Trúc Cơ → làm cùng content Thanh Vân                       |
| P2      | Kiến trúc Đông phương: mái ngói cong, đình, cổng tam quan, đèn lồng — **chưa có asset** phù hợp trong các pack đã duyệt; nhà hiện ghép từ tường KayKit Dungeon | Ghi vào `docs/asset_sourcing.md`; cần pack mới hoặc tự làm                      |
| P2      | Map đầu tiên của Thanh Vân Sơn Mạch theo rule (rừng trúc, thác, cầu đá) → cần asset trúc/thác                                                              |                                                                                 |
| P2      | Chuyển cảnh bằng bản đồ thế giới (fast travel tới trạm vận chuyển đã mở) — server-authoritative                                                             | Trạm vận chuyển đã đặt sẵn ở Tân Nguyên                                         |
| P3      | Minimap xoay theo camera (tuỳ chọn trong Cài đặt)                                                                                                            | Hiện cố định bắc lên trên + nón camera                                          |

## 5. Tham khảo đã dùng

- Định hướng minimap (cố định bắc + mũi tên xoay theo nhân vật như Zelda, icon dạng hình học đơn giản, ít rối): Game Developer — "Minimap rotation", "Where should we place the mini-map", Wikipedia "Mini-map".
- Bày trí và kể chuyện bằng môi trường (đặt đồ có chủ đích theo nghề nghiệp NPC, lối đá dẫn mắt, mỗi khu một nét riêng): Frozenbyte wiki "Level Art: Environmental Storytelling", The Level Design Book.
- Landmark và mật độ thực vật theo vai trò khu (đường đi / khám phá / giao tranh — "rừng đọc được" thay vì rừng thật): bài phỏng vấn art Crimson Desert (Inven Global).
