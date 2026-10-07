# Thiên Cơ HUD

Phong cách hiện hành: **Kenney Fantasy Glass**, theo [quy tắc Game UI](game-ui-style.md). Quy tắc này thay thế thiết kế cut stone/metal/brass cũ và yêu cầu tránh blur.

## Layout

- Desktop: player và target phía trên, menu gọn bên phải, bốn slot skill dưới màn hình. Đánh thường bằng chuột trái.
- Touch: player và menu phía trên; joystick một bên, nút đánh lớn và skill bên còn lại; menu mở khi cần.
- Inventory: trang bị, túi đồ, chi tiết item; trên mobile chọn item rồi dùng nút hành động rõ ràng.
- Settings: quality, audio, controls và playtest trong panel cuộn.

## Mở rộng

Đọc `docs/game-ui-style.md` trước khi thêm/sửa UI. Dùng token trong `hud-design.css`, element và blur trong `fantasy-glass.css`, glyph từ `HudGlyph.tsx`, icon pack đã duyệt qua `GameIcon`. Kiểm tra vùng chạm ít nhất 44 px và cả hai hướng điện thoại.
