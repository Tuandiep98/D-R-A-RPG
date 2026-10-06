# Map Contract

Tech plan §5–8, §23, §39; assets plan §8, §13.3.

## Nguồn và sinh map

```
maps/source/<mapId>.layout.yaml   ← sửa tay: path, clearing, zone, spawn, portal, landmark, ring, scatter
        │  pnpm maps:build   (seed cố định → kết quả tái tạo được)
        ▼
game-data/maps/<mapId>.yaml       ← GENERATED, không sửa tay (trừ map nhỏ viết tay như map_sandbox_01)
        │  pnpm nav:build
        ▼
game-data/nav/<mapId>.navmesh.bin + .json (hash nguồn)
```

`pnpm content:build` chạy cả ba bước. CI kiểm tra map sinh ra không lệch layout và navmesh không cũ (`nav:build --check`).

## Cấu trúc map runtime

| Trường                      | Ý nghĩa                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `bounds`, `chunkSize`       | Vùng chơi; chunk vuông `chunkSize` m, id `chunk_<i>_<j>` tính từ `bounds.min` |
| `playerSpawn`, `arrivals[]` | Điểm hồi sinh; điểm đến khi qua portal (`targetArrival`)                      |
| `chunks[].instances[]`      | Decoration/vật cản. `colliderRadius` có → vật cản (sim + navmesh)             |
| `spawns[]`                  | Nhóm quái: `monsterId`, `count`, `radius`, `respawnSeconds`                   |
| `portals[]`                 | `targetMapId` + `targetArrival`; server cấp ticket ký số khi dùng             |
| `zones[]`                   | `safe` (quái không aggro), `combat`, `boss_arena`, `hazard`                   |

## Quy tắc thiết kế

1. Blockout trước, trang trí sau (assets plan §8.2). Clearings giữ trống khu trại, đấu trường.
2. Lối đi rộng ≥ 5 m (đường chính 7 m). `scatter` không đặt vật cản trên `paths`.
3. Boss arena: clearing ≥ 13 m, tường đá (`rings`) có lối vào/ra; không cây che telegraph.
4. Mỗi map có ít nhất 1 portal về khu an toàn.
5. Không đặt spawn trong collider; validator kiểm tra spawn/portal/arrival trong `bounds`.
6. Decoration lặp lại → cùng appearance (thin instances, 1 draw call/material/loại).

## Runtime

- Client giữ chunk trong bán kính `chunkRadius` quanh player (Low/Medium 1 → ≤ 9 chunk, High 2).
- Vật thể chắn giữa camera và player được làm mờ (batch faded riêng).
- Server gửi entity trong AOI 60 m (lưới 30 m), tối đa 100 entity/client.
- Đường đi: Recast navmesh bake sẵn; runtime tự sinh nếu file cũ (kèm cảnh báo).

## Map hiện có

| mapId                     | Tên            | Kích thước | Chunk | Nội dung                                                                                                                      |
| ------------------------- | -------------- | ---------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| `map_sandbox_01`          | Thôn Thanh Vân | 40×40 m    | 1     | Vùng an toàn, 2 trại quái nhập môn, portal sang rừng                                                                          |
| `map_forest_mechanism_01` | Rừng Cơ Quan   | 160×96 m   | 15    | Trạm gác (safe) → Đồi Sói (sói, hồ ly) → Phế Tích Cơ Giới (robot + Linh Lộc Tinh Anh) → Đấu Trường Cơ Quan (boss) → portal về |
