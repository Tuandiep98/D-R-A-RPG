# Trang bị & Tiệm Rèn — Thiên Cơ Luyện Khí

Ngày: 2026-10-09. Trạng thái: **bản triển khai đầu tiên** (data + sim authoritative + lưu DB + panel Tiệm Rèn). Thực hiện master plan §65–70 (tier Tiên/Cơ, equipment evolution, Bản Mệnh) theo yêu cầu chủ dự án. Quyết định: D-036.

## 1. Ý tưởng cốt lõi

Một món đồ **không bị thay thế mỗi vài giờ** (§68). Người chơi giữ một món và nuôi nó theo **hai tuyến song song cùng gốc**:

| Tuyến              | Ngôn ngữ                                                                                | Vật liệu chủ đạo                        |
| ------------------ | --------------------------------------------------------------------------------------- | --------------------------------------- |
| **Tu Tiên**        | Luyện khí: Phụ Linh, Khắc Trận Văn, Huyết Tế, Thiên Tài Địa Bảo, Độ Kiếp Bản Mệnh       | Yêu đan, linh châu, phù văn, linh thạch |
| **Cơ Giới**        | Kỹ thuật: Ép Xung, Khắc Vi Mạch, Liên Kết Thần Kinh, Nạp Lõi Phản Ứng, Thăng Cấp Tự Trị | Phế liệu, lõi, chip, module             |
| **Thiên Cơ (lai)** | Món mang nghi thức của **cả hai tuyến** ở ≥ 2 nhóm → cộng hưởng                         | —                                       |

Năm thao tác, mỗi thao tác chạm một tầng chỉ số khác nhau để không chồng chéo:

| Thao tác                        | Tác dụng                                                           | Tầng                                  |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| **Cường hoá** (+N)              | Tăng chỉ số thường; mốc +3/+6/+9 thức tỉnh chỉ số ẩn               | `× (1 + 0.08·N)`                      |
| **Tiến hoá** (stage)            | Tăng **chỉ số gốc**, đổi tên/tier: Phàm khí → Linh khí → Pháp bảo… | `× baseMultiplier` của stage          |
| **Khảm** (socket)               | Biến hoá: thêm đòn thứ 3 theo hệ, giáp/né/kháng, chip đạn          | Hiệu ứng combat + bonus phẳng         |
| **Luyện khí / Kỹ thuật** (rite) | Nghi thức một lần theo phẩm: % chỉ số, thêm ô khảm, khoá, Bản Mệnh | `× (1 + statMultiplier)`              |
| **Hợp thành**                   | Món chính + 2 món cùng ô cùng phẩm → **lên phẩm**                  | Đổi phẩm: hệ số, số ô, số ẩn, trần +N |
| **Sửa chữa**                    | Hồi độ bền; độ bền 0 thì món chỉ còn 50% chỉ số                    | Độ bền                                |

## 2. Phẩm cấp

| Phẩm      | Tên         | Màu       | Hệ số | Ô khảm | Chỉ số ẩn | Cường hoá tối đa | Độ bền | Mở khoá luyện khí                       |
| --------- | ----------- | --------- | ----- | ------ | --------- | ---------------- | ------ | --------------------------------------- |
| common    | Phổ thông   | trắng xám | 1.00  | 1      | 0         | +6               | 60     | —                                       |
| rare      | Quý hiếm    | xanh lam  | 1.20  | 2      | 1         | +9               | 80     | Phụ Linh / Ép Xung, Trận Văn / Vi Mạch  |
| epic      | Sử thi      | tím       | 1.45  | 3      | 2         | +12              | 100    | + Huyết Tế / Thần Kinh, Thiên Tài / Lõi |
| legendary | Huyền thoại | cam vàng  | 1.75  | 4      | 3         | +15              | 120    | + Độ Kiếp Bản Mệnh / Thăng Cấp Tự Trị   |

Phẩm khởi điểm của một món là `rarity` trong YAML (uncommon → common, mythic → legendary). Phẩm nằm trên **instance**, nên hai thanh Thiết Kiếm có thể khác phẩm.

**Chỉ số ẩn** không lưu: suy ra từ `instanceId` + phẩm bằng hash có định (không đụng RNG của World → replay không lệch). Số dòng = số ẩn của phẩm; mỗi dòng mở khi cường hoá chạm mốc `hiddenUnlockAt` (+3, +6, +9). Trước mốc, UI hiện "??? (cường hoá +N để thức tỉnh)".

## 3. Cường hoá

- 15 bước trong `game-data/forge/forge_rules.yaml` (vàng, vật liệu, tỉ lệ). Trần theo phẩm.
- Thất bại ở mức ≤ `safeLevel` (+5) không mất gì ngoài chi phí. Trên mức đó tụt 1 cấp, trừ khi có **Hộ Phù** (`item_forge_ward`, tiêu hao 1).
- Không bao giờ vỡ đồ.

## 4. Tiến hoá (chỉ số gốc)

Item có chuỗi `evolution` trong YAML. Mỗi stage có tên mới, tier hiển thị, `baseMultiplier`, yêu cầu cường hoá tối thiểu, cảnh giới, vàng, vật liệu. Tiến hoá **giữ nguyên** +N, khảm và nghi thức. Ví dụ:

- Thiết Kiếm → Thanh Phong Linh Kiếm (Linh khí) → Thanh Phong Kiếm Thai (Pháp bảo) → Thanh Phong Đạo Kiếm (Cổ bảo).
- Hoả thương H-07 → H-07 Mk II (Combat Module) → Autonomous H-07 (Reactor) → Spirit-AI H-07 (Autonomous).

## 5. Khảm

Vật phẩm khảm là item `kind: socket` với `socket.type`:

| Loại      | Tuyến | Ô hợp lệ                                      | Hiệu ứng                                                                                                                                               |
| --------- | ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `combat`  | Cơ    | vũ khí cận chiến (main_hand không phải súng)  | **Đòn thứ 3** của combo nổ thêm một chiêu theo hệ của chip (AoE trước mặt). Trùng ngũ hành bản mệnh: tầm × `natal.radius`, sát thương × `natal.damage` |
| `defense` | Cơ    | giáp (head/chest/gloves/pants/boots/off_hand) | Khiên theo % sát thương gây ra (có trần theo HP tối đa), né, giảm sát thương, kháng một hành                                                           |
| `ammo`    | Cơ    | súng (main_hand có `ranged`)                  | Tê liệt sau mỗi N viên trúng, đẩy lùi (chỉ súng hạng nặng), giảm thời gian nạp, thêm đạn, giảm nhiệt, + chí mạng                                       |
| `spirit`  | Tiên  | mọi ô                                         | Linh châu / yêu đan: bonus phẳng theo hành, tăng thêm khi trùng bản mệnh                                                                               |
| `rune`    | Tiên  | mọi ô                                         | Phù văn trận pháp: bonus phẳng (Tụ Linh: MP, Kim Cang: thủ, Tật Phong: tốc)                                                                            |

Mỗi ô nhận một vật phẩm; một món không khảm hai chip `combat` (chỉ chip đầu tiên tạo đòn thứ 3). Gỡ khảm trả vật phẩm về túi, tốn vàng. Món đã Huyết Tế/Bản Mệnh vẫn khảm được.

**Đòn thứ 3 theo hệ** (data: `skill_forge_*`): Cuồng Phong (Mộc · Lôi: xoáy gió + sét), Kim Cương Nhận (Kim: kiếm quang), Hàn Triều (Thuỷ · Băng: sóng băng), Liệt Diễm (Hoả: nổ lửa), Địa Chấn (Thổ: chấn địa). Hiển thị qua `SKILL_IMPACT` nên dùng lại lớp FX ngũ hành và sét đã có.

## 6. Nghi thức luyện khí (rite)

Mỗi nghi thức thuộc một **nhóm**; một món chỉ nhận một nghi thức mỗi nhóm, chọn tuyến Tiên **hoặc** Cơ:

| Nhóm    | Tu Tiên                   | Cơ Giới            | Phẩm tối thiểu | Tác dụng                                                                                              |
| ------- | ------------------------- | ------------------ | -------------- | ----------------------------------------------------------------------------------------------------- |
| attune  | Phụ Linh                  | Ép Xung Lõi        | rare           | +10% chỉ số món                                                                                       |
| engrave | Khắc Trận Văn             | Khắc Vi Mạch       | rare           | +1 ô khảm                                                                                             |
| bind    | Huyết Tế Luyện            | Liên Kết Thần Kinh | epic           | +15%, **khoá** (không bán/hợp thành làm nguyên liệu); Huyết Tế hiến 30% HP hiện tại                   |
| absorb  | Hấp Thụ Thiên Tài Địa Bảo | Nạp Lõi Phản Ứng   | epic           | +6% mỗi lần, tối đa 3 lần                                                                             |
| ascend  | Độ Kiếp Bản Mệnh          | Thăng Cấp Tự Trị   | legendary      | Thành **Bản Mệnh** (1 món/nhân vật): +4% mỗi cảnh giới, khoá; 60% thành công, thất bại mất 50% độ bền |

**Thiên Cơ Relic**: món có nghi thức của cả hai tuyến ở ≥ 2 nhóm nhận thêm +10% (cộng hưởng chung nguồn cội).

## 7. Hợp thành

Món chính + 2 món nguyên liệu **cùng ô trang bị, cùng phẩm**, không đang mặc, không bị khoá + vàng + Hợp Thành Thạch → lên một phẩm (tỉ lệ 100% / 80% / 60% cho rare / epic / legendary). Món chính giữ +N, stage, khảm, nghi thức; thêm ô khảm theo phẩm mới, mở thêm chỉ số ẩn. Thất bại: mất vật liệu, vàng và **1** món nguyên liệu.

## 8. Độ bền & sửa chữa

Mỗi lần chết, mọi món đang mặc mất `deathLoss` (10) điểm. Độ bền 0 → món chỉ còn 50% chỉ số (không vỡ). Sửa tại Tiệm Rèn: vàng = điểm thiếu × giá theo phẩm.

## 9. Vật liệu

| Vật liệu                   | Tuyến | Nguồn (hiện tại)       | Dùng cho                 |
| -------------------------- | ----- | ---------------------- | ------------------------ |
| Phế Liệu Cơ Giới           | Cơ    | robot                  | cường hoá thấp, kỹ thuật |
| Tinh Thiết                 | chung | quái thường, shop      | cường hoá                |
| Linh Thạch                 | Tiên  | quái tinh anh          | cường hoá cao, luyện khí |
| Yêu Đan                    | Tiên  | sói / hồ ly / tinh anh | Phụ Linh, linh châu      |
| Lõi Cơ Quan / Lõi Phản Ứng | Cơ    | Guardian, boss         | Ép Xung, Nạp Lõi         |
| Phù Văn Chu Sa             | Tiên  | shop Tiệm Rèn          | Khắc Trận Văn            |
| Vi Mạch Thiên Cơ           | Cơ    | shop Tiệm Rèn          | Khắc Vi Mạch             |
| Hợp Thành Thạch            | chung | boss                   | Hợp thành                |
| Thiên Tài Địa Bảo          | Tiên  | boss (hiếm)            | Hấp Thụ, Độ Kiếp         |
| Hộ Phù                     | chung | shop                   | chống tụt cấp cường hoá  |

**Bộ thử nghiệm**: quest "Thử Lò" của Lão Mộc (Thợ rèn) trao vàng + vật liệu + chip/linh châu + vài món nhiều phẩm để test toàn bộ tiệm rèn (yêu cầu chủ dự án). Quest dùng `grantGold` → ledger như mọi phần thưởng; khi có loot/drop thật sẽ bỏ quest này.

## 10. Kỹ thuật

- Data: `game-data/forge/forge_rules.yaml`, `game-data/forge/rites/*.yaml`, item `kind: socket` + `evolution`. Zod + validator kiểm id chéo.
- Sim: `packages/game-core/src/systems/forge.ts` — mọi thao tác chạy server-side tại NPC có `forge: true`, tiền đi qua `grantGold` với khoá idempotency, RNG của World cho tỉ lệ. Hook combat: `melee.ts` (đòn thứ 3), `combat.ts` (khiên/né/giảm/kháng), `ranged.ts` (tê liệt/đẩy lùi) và `recomputePlayerStats` (def súng sau chip).
- Protocol: `InventoryItem.forge`, intent `FORGE`, event `FORGE_RESULT`. Intent `UPGRADE` cũ chuyển sang cường hoá mới.
- DB: cột `item_instances.forge jsonb` (Zod khi đọc).
- UI: tab **Tiệm Rèn** trong NpcPanel (Fantasy Glass), màu phẩm trên ô túi đồ và tooltip.

## 11. Còn lại / bước sau

- Bản Mệnh có personality/memory/bond (§69–70) — hiện chỉ là chỉ số theo cảnh giới.
- Drop vật liệu theo vùng/boss khi có thêm map; cân bằng tỉ lệ/giá sau playtest.
- Model/VFX riêng cho stage tiến hoá (hiện dùng lại appearance).
