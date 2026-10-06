# Equipment Contract

Assets plan §6 + tech plan §32. Tách **gameplay** (item) khỏi **hình ảnh** (appearance).

## Item (gameplay) — `game-data/items/*.yaml`

```yaml
id: item_great_blade          # snake_case, ổn định, không đổi khi đổi tên hiển thị
name: Đại Đao Phá Sơn
kind: equipment               # equipment | consumable | material
slot: main_hand               # bắt buộc với equipment
rarity: uncommon              # common → mythic (màu hiển thị: RARITY_COLORS)
level: 3                      # cấp tối thiểu để mặc (server kiểm tra)
bonus: { attack: 22, critChance: 0.03 }   # hp, mp, attack, defense, critChance, speed
sellPrice: 60
appearanceId: equip_great_blade_01        # nhiều item có thể dùng chung appearance
```

- Equipment không stack (`maxStack: 1`, validator chặn).
- Consumable phải có hiệu ứng (`heal`), có `cooldown` dùng chung cho thuốc.
- Chỉ server cộng chỉ số: base nhân vật + `perLevel × (level-1)` + tổng `bonus` của trang bị (`recomputePlayerStats`). HP/MP giữ tỉ lệ khi thay đồ.

## Slots

`main_hand`, `off_hand`, `head`, `chest`, `gloves`, `pants`, `boots`, `back`, `artifact`. Slot có hình ảnh ở M2: `main_hand`, `off_hand`, `artifact`, `head`, `back`. Các slot còn lại hiện chỉ có chỉ số.

## Appearance (hình ảnh) — `game-data/appearances/equip_*.yaml`

```yaml
id: equip_great_blade_01
kind: equipment
modelAssetId: weapon_great_blade_01   # tuỳ chọn; thiếu → placeholder
attach: { socket: hand_r, position: [0, 0, 0], rotation: [0, 0, 0] }
placeholder: { shape: box, color: '#9aa3ad', height: 1.4, radius: 0.09 }
```

## Bộ trang bị MVP (đã có dữ liệu)

| Hệ | Vũ khí | Thân | Đầu |
|---|---|---|---|
| Võ hiệp | Thiết Kiếm, Đại Đao Phá Sơn | Võ Hiệp Bào | Khăn Võ Sĩ |
| Tu tiên | Phi Kiếm Thanh Vân (pháp khí) | Tiên Môn Đạo Bào | Ngọc Quan Tu Sĩ |
| Cơ giới | Cơ Giới Quyền Sáo | Giáp Cơ Quan | Mũ Cơ Giới |

Hình ảnh hiện tại: vũ khí và pháp khí là placeholder gắn socket. Áo, mũ dạng skinned mesh cần base character modular (xem `rig_contract.md`) — **việc của artist**.

## Quy tắc theo độ hiếm (assets plan §6)

| Rarity | Hình ảnh |
|---|---|
| common / uncommon | Dùng lại mesh, đổi palette/material |
| rare | Đổi texture hoặc attachment |
| epic | Thay silhouette đáng kể |
| legendary / mythic | Mesh/VFX riêng |

## Persistence

Mỗi món là một hàng `item_instances` (id = instanceId, UUID trên server). Món đang mặc có `equipped_slot`. Lưu nhân vật thay toàn bộ inventory trong cùng transaction với ví và sổ giao dịch.
