# Asset Sourcing — Thiên Cơ Kỷ

Kế hoạch nguồn asset theo master plan (`plan/00_game_design_master.md`) và D-024/D-025. Cập nhật: 2026-10-06.
Mọi pack vào `art/third_party/<pack>/` kèm `SOURCE.json` + `LICENSE.txt` (CLAUDE.md, quy tắc asset). Ưu tiên CC0; pack trả phí/CC-BY phải ghi rõ trong `SOURCE.json` và kiểm tra điều khoản web/redistribution trước khi dùng.

## Nguyên tắc chọn

1. **Một họ style chính: Quaternius.** Cùng tác giả → cùng tỉ lệ, palette, mật độ poly. Hạn chế trộn KayKit/Kenney trong cùng khung hình.
2. **Một skeleton cho mọi humanoid.** Universal Base Characters + Modular Outfits + Universal Animation Library dùng chung skeleton 65 joint kiểu UE5 → thay rig riêng của "RPG Characters" (giải quyết việc ✋ "chọn base modular" trong roadmap).
3. **Lore 3 lớp (§5):** bề mặt fantasy → giữa "có gì đó sai" → sâu là công nghệ Thiên Cơ. Mỗi map cần cả kit **cổ/đá** lẫn kit **hợp kim/terminal**.
4. **Ngoại hình phản ánh progression (§79):** cần attachment theo socket (implant, reactor glow, phi kiếm lơ lửng) — phần lớn phải tự làm, pack chỉ cho nền.
5. Pack chỉ có FBX/OBJ/Blend → convert sang glTF trước khi vào `assets:build`; hiện dùng KayKit glTF làm fallback để build không phụ thuộc Blender.

## Danh sách đề xuất

### P0 — thay ngay (khớp map/nhân vật đang có)

| Pack                                                                                                                                                                | License | Định dạng    | Dùng cho                                                                                                             | Thay thế                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [Universal Base Characters](https://quaternius.itch.io/universal-base-characters)                                                                                   | CC0     | glTF/FBX     | Player (Du Hành Giả) + toàn bộ NPC: 6 base, 20 kiểu tóc, màu da/mắt                                                  | `quaternius_rpg_characters`       |
| [Modular Character Outfits – Fantasy](https://quaternius.itch.io/modular-character-outfits-fantasy)                                                                 | CC0     | glTF/FBX     | 12 outfit / 62 mảnh: Võ hiệp, đạo bào, giáp nhẹ; 3 bộ màu mỗi outfit                                                 | outfit swap (equipment_contract)  |
| [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) + [UAL 2](https://opengameart.org/content/universal-animation-library-2) | CC0     | glTF/FBX     | 250+ clip: locomotion, combat, cast, hit, death, emote                                                               | clip theo role hiện tại           |
| [Medieval Village MegaKit](https://quaternius.com/packs/medievalvillagemegakit.html)                                                                                | CC0     | glTF/FBX/OBJ | Tân Nguyên Trấn: tường/mái modular, cầu thang → quảng trường, lò rèn, y quán, doanh trại                             | `map_sandbox_01` placeholder      |
| [Fantasy Props MegaKit](https://quaternius.itch.io/fantasy-props-megakit)                                                                                           | CC0     | glTF/FBX/OBJ | 200+ props (4 texture set): sạp chợ, rương, bình thuốc, đe, vũ khí → Chợ nhỏ, Y quán, Lò rèn; nguồn render icon item | icon emoji, `equip_*` placeholder |
| [Modular Sci-Fi MegaKit](https://quaternius.itch.io/modular-sci-fi-megakit)                                                                                         | CC0     | glTF/FBX/OBJ | 270+ mảnh: cửa, cột, sàn, tường, props → **tầng sâu** Phế Tích Vô Danh (cửa hợp kim, terminal) và Mộ Thất Hợp Kim    | đá placeholder ở "Cửa Hợp Kim"    |
| [Animated Mech Pack](https://quaternius.com/packs/animatedmech.html)                                                                                                | CC0     | glTF/FBX     | 4 mech có animation → Cơ Giáp Trinh Sát, lính gác Thiên Cơ                                                           | bổ sung `quaternius_space_kit`    |

### P1 — mở rộng quái và dungeon

| Pack                                                                                  | License                          | Dùng cho                                                                       | Ghi chú                                                        |
| ------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html)               | CC0, 50 model có animation, glTF | Linh thú biến dị, sinh vật "Thiên Tâm leakage" (U Minh Lâm), quái Linh Thú Cốc | Chưa xem danh sách từng model — duyệt trước khi gán            |
| [Ultimate Modular Ruins Pack](https://quaternius.com/packs/ultimatemodularruins.html) | CC0, 90 model                    | Lớp bề mặt Phế Tích Vô Danh / Huyền Vũ Cổ Mộ: hang, tượng đá, cột cổ           | **Không có glTF** (FBX/OBJ/Blend) → convert bằng Blender       |
| Sci-Fi Essentials Kit (Quaternius)                                                    | Chưa xác minh                    | Enemy cơ giới có animation, props sci-fi                                       | Kiểm tra license/giá trước khi tải                             |
| Bestiary – Dungeon Monsters Kit (Quaternius)                                          | Chưa xác minh                    | Quái dungeon có vũ khí, 3 biến thể màu, retarget được                          | Kiểm tra license/giá                                           |
| [KayKit Dungeon Remastered](https://kaylousberg.itch.io/kaykit-dungeon-remastered)    | CC0, 200+                        | Phương án B cho nội thất Huyền Vũ Cổ Mộ                                        | Style KayKit khác Quaternius — chỉ dùng nếu kit Ruins không đủ |
| [Kenney Particle Pack](https://kenney.nl/assets/particle-pack)                        | CC0                              | Sprite VFX: linh quang, tia lửa, khói, nổ reactor                              | Thay VFX primitive                                             |

### P2 — map sau (Thanh Vân Sơn, Xích Sa, U Minh Lâm, Vân Hải)

- **Đã có:** Stylized Nature MegaKit (rừng, đá, bụi) cho Thanh Vân Sơn / U Minh Lâm.
- **Thiếu:** rừng trúc, thác nước, sa mạc đỏ, xác máy khổng lồ, đảo nổi. Chưa thấy pack CC0 phù hợp → tự làm hoặc tìm sau, khi tới phase map đó.

## Khoảng trống phải tự làm / đặt làm (không có pack CC0 phù hợp)

| Hạng mục                                                                                                   | Lý do                                                                                                                                                                                                      | Gợi ý                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Kiến trúc Đông phương** (mái ngói cong, đình, cổng tam quan, đèn lồng, tháp)                             | Không tìm thấy kit CC0 modular, cùng style. Pack trên itch/Sketchfab là CC-BY, poly quá cao (VD: Low Poly Chinese Temple trên Sketchfab, CC-BY, 68.6k tris), hoặc trả phí với điều khoản cấm phân phối lại | Tự làm kit mái/cổng/đèn lồng trong Blender theo grid của Medieval Village MegaKit (dùng chung tường/sàn) — ~15–25 mảnh là đủ cho Tân Nguyên Trấn |
| **Boss Huyền Vũ · Guardian X-04**                                                                          | Rùa đá → lộ cơ giáp: phải khớp 2 phase (§12)                                                                                                                                                               | Model riêng, 2 mesh shell (đá / cơ giáp) ẩn hiện theo phase; tạm dùng mech Space Kit                                                             |
| **Implant & visual cảnh giới** (Kinetic Arm, Optical Assist, reactor glow, phi kiếm lơ lửng, aura Trúc Cơ) | Đặc thù game                                                                                                                                                                                               | Attachment nhỏ theo `rig_contract` sockets + shader emissive; ít poly                                                                            |
| **Linh hạc Hạc Cửu, robot K-17**                                                                           | NPC đặc thù lore                                                                                                                                                                                           | K-17: base Universal Character + mảnh Sci-Fi MegaKit; Hạc Cửu: model riêng                                                                       |
| **Icon item/skill**                                                                                        | Đang là emoji                                                                                                                                                                                              | Render từ Fantasy Props MegaKit + vẽ thêm cho node tu luyện                                                                                      |

## Map ↔ asset

| Map (game-data id)                           | Lớp bề mặt                                                        | Lớp sâu (công nghệ Thiên Cơ)               | Quái                                                        |
| -------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Tân Nguyên Trấn (`map_sandbox_01`)           | Medieval Village MegaKit + kit Đông phương tự làm + Fantasy Props | —                                          | —                                                           |
| Phế Tích Vô Danh (`map_forest_mechanism_01`) | Stylized Nature + Ultimate Modular Ruins (tượng đá, phù văn)      | Modular Sci-Fi MegaKit quanh "Cửa Hợp Kim" | Animated Animals (sói, hồ ly, linh lộc), Animated Mech Pack |
| Huyền Vũ Cổ Mộ (`map_golem_sanctum_01`)      | Ruins / KayKit Dungeon (đá, kiếm trận)                            | Sci-Fi MegaKit ở Mộ Thất Hợp Kim           | Boss Guardian X-04 (tự làm)                                 |

## Trạng thái tích hợp

- ✅ Đã đăng ký provenance/license và build 37 asset từ Modular Outfits, UAL1, Medieval Village, Fantasy Props, Modular Sci-Fi, Animated Mech, Ultimate Monsters và KayKit Dungeon.
- ✅ Player/NPC đã chuyển sang `humanoid_v1`; pipeline ghép clip UAL vào outfit theo tên joint và chỉ giữ 6 clip gameplay cần thiết cho player.
- ✅ Phế Tích Vô Danh và Huyền Vũ Cổ Mộ đã dùng prefab modular cho sạp tiền tiêu, cửa hợp kim và hành lang mộ.
- ⬜ Chuyển Ultimate Modular Ruins từ OBJ/FBX sang glTF; hiện KayKit là lớp đá fallback.
- ⬜ Duyệt UAL2, làm kit kiến trúc Đông phương, boss hai lớp vỏ, attachment implant và icon thật.
- ⬜ Smoke test hình ảnh và đo trên iPhone 13 Pro Max/Android tầm trung.
