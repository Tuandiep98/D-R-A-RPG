# Art Bible v0

Bản khởi đầu theo assets plan §3. **Cần artist duyệt và bổ sung hình tham chiếu** (lineup, palette board, ảnh combat) — các mục đánh dấu ✎.

## Định hướng

- Stylized 3D low-poly **chibi ~2–2.3 đầu theo KayKit** (D-027; thay mục tiêu semi-mini ~5 đầu cũ). Đầu to để đọc rõ ở góc camera 2.5D; đẹp nhờ style, màu atlas, ánh sáng và VFX — không dựa vào polygon cao.
- Chuẩn nhân vật: KayKit `Rig_Medium`, chia mảnh Head / Body / Arm / Leg / Cape / Hat → ghép chéo được để làm trang bị. Đổi màu bằng gradient atlas 1024 (xuống 128 được).
- Ba hệ cùng một thế giới: **Võ hiệp** (vải, da, thép, gỗ), **Tu tiên** (ngọc, vàng, linh quang), **Cơ giới** (kim loại stylized, gốm, năng lượng).
- Ưu tiên asset cùng hệ KayKit (Adventurers, Skeletons, Dungeon Remastered, Forest Nature, Character Animations) để thế giới đồng bộ. Quaternius/Kenney chỉ dùng khi khối dày, tròn, đồ chơi; vũ khí mảnh và súng tỉ lệ thật để `prototype_only` ✎.

## Camera và ánh sáng (đã chốt trong code)

| Mục      | Giá trị                                                                               |
| -------- | ------------------------------------------------------------------------------------- |
| Camera   | Perspective orbit quanh player, pitch 35–55°, khoảng cách 6–20 m, FOV 0.8 rad (D-002) |
| Ánh sáng | 1 hemispheric (0.55) + 1 directional (1.1), sương mù tuyến tính 45–95 m màu trời      |
| Bóng     | Theo preset: tắt / chỉ player / player + quái, map 512–1024                           |
| Vật chắn | Làm mờ còn 28% alpha khi đứng giữa camera và player                                   |

## Palette

| Vai trò          | Màu       | Dùng ở                            |
| ---------------- | --------- | --------------------------------- |
| Nền trời / sương | `#8CB8D9` | Clear color, fog                  |
| Đất rừng         | `#5B7F43` | Ground Rừng Cơ Quan               |
| Đất thôn         | `#5F8A4A` | Ground Thôn Thanh Vân             |
| Nhấn vàng        | `#FFCF5A` | HUD accent, level up, boss banner |
| Cảnh báo         | `#FF3326` | Telegraph boss, selection ring    |
| Linh lực         | `#7EF0FF` | Kiếm khí, phi kiếm                |
| Tinh anh         | `#FFD86B` | Tint tinh anh                     |
| Boss             | `#FF4A3D` | Tint boss                         |

Độ hiếm: common `#D8D8D8`, uncommon `#5FD068`, rare `#4AA3FF`, epic `#B46BFF`, legendary `#FFB02E`, mythic `#FF4F6D`.

## Tỉ lệ

| Loại              | Chiều cao mục tiêu             |
| ----------------- | ------------------------------ |
| Player (KayKit, scale 0.62) | 1.35–1.6 m (tuỳ mũ/tóc) |
| Quái thường (thú) | 0.8–1.1 m                      |
| Robot thường      | ~1.9 m                         |
| Tinh anh          | ~1.8 m, tint vàng              |
| Boss              | 3–4 m (1.8–4× player), tint đỏ |
| Cây               | 4–7 m                          |

Vũ khí: giữ **tỉ lệ gốc KayKit** (cùng scale 0.62 với nhân vật, gắn `handslot.*` không xoay) — vốn đã to, dày so với thân chibi. Đồ vật/prop: khối tròn, cạnh vát, chi tiết lớn; tránh chi tiết mảnh khó đọc ở khoảng cách 6–20 m.

## VFX

Pool có giới hạn theo preset (`vfxCap`). Telegraph boss **luôn hiện** kể cả preset thấp. Màu theo loại: chém trắng ấm, xoáy xanh nhạt, chấn địa cam, kiếm khí xanh ngọc, hồi máu xanh lá.

## Việc cần artist ✎

1. Lineup 3 hệ cạnh nhau cùng camera/ánh sáng; chốt tỉ lệ đầu/thân.
2. Bộ mảnh Á Đông trên `Rig_Medium` (đạo bào, áo võ, búi tóc, nón lá, giáp cơ giới) — kitbash từ mảnh KayKit hoặc làm mới trong Blender, giữ tên joint.
3. Kit kiến trúc "di tích + cơ quan cổ" thay đá placeholder ở Phế Tích Cơ Giới.
4. Model boss "Cơ Quan Thần Tướng" riêng (hiện dùng mech Space Kit).
5. Bộ icon skill cùng style (gợi ý: SVG game-icons.net tô màu + khung chung); icon KDRN hiện tại là placeholder vẽ tay, lệch style.
