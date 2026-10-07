# Game UI style — Kenney Fantasy Glass

**Quy tắc đã chốt với chủ dự án ngày 07/10/2026.** Mọi UI game mới hoặc được sửa phải theo phong cách này. Quy tắc này thay thế phần stone/metal/brass và yêu cầu tránh blur trong `docs/hud-field-kit.md`. Không áp dụng bảng màu HUD lên model, môi trường hoặc VFX 3D.

## Hình thức bắt buộc

- Nền xanh đen trong suốt, nhìn được cảnh phía sau; blur nền phía sau bằng `backdrop-filter`, có bản `-webkit-` cho Safari. Không blur chữ, icon hoặc toàn bộ game trong lúc chiến đấu.
- Panel, khung HP/MP, ô skill, inventory, nút, tooltip, quest, NPC, chat, settings, tu luyện và các màn liên quan dùng cùng một hệ khung **Kenney Fantasy UI Borders**: góc vuông, họa tiết hồi văn. Như ảnh `Sample.png` của pack: panel dùng sprite *Panel* (có fill) tô gần đen, viền hồi văn tối + khe 2 px nhìn xuyên cảnh; ô slot/nút phụ viền xám; trắng chỉ dành cho slot đang chọn và nút chính.
- Sprite vẽ trên lưới 2 px, góc 16 px: `border-image-width` chỉ dùng 8 / 16 / 32 px (16 cho cửa sổ, 8 cho widget HUD, slot, nút). Kích thước lẻ như 6 hoặc 12 px làm vỡ họa tiết. Không quay lại khung bo góc bất đối xứng, viền vàng dày hoặc mặt kim loại chéo.
- Font HUD: **League Spartan** (OFL, kiểu Futura như mẫu Kenney, đủ dấu tiếng Việt), bundle trong `apps/game-web/src/assets/fonts/league-spartan/`. Không dùng Jost (thiếu dải U+1EA0–1EF9).
- Banner vào vùng/bản đồ (`.zone-banner`): dải nền tối mờ hai đầu, `divider.png` (Divider Fade) hai bên, hiện ~3 s rồi tắt; không blur.
- Chữ chính trắng ngà, chữ phụ xanh xám, heading/selection xanh ngọc nhạt. Màu HP/MP, hệ skill và độ hiếm item giữ vai trò thông tin; không nhuộm toàn bộ HUD theo một hệ skill.
- Khi mở cửa sổ inventory/skill/character/NPC/settings, có lớp nền tối với blur nhẹ để tách cửa sổ khỏi cảnh. Không dùng animation trang trí liên tục.
- Joystick giữ hình tròn để biểu đạt thao tác kéo; dùng màu và độ trong suốt cùng HUD. Nút đánh/skill dùng khung Kenney, vùng chạm tối thiểu 44 px.

## Source và element chuẩn

| Mục                         | Source / file chuẩn                                                        | Cách dùng                                                                                           |
| --------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bộ khung                    | https://kenney.nl/assets/fantasy-ui-borders                                | Fantasy UI Borders 1.0, CC0; source chính, không vẽ lại bằng CSS khi có element tương ứng           |
| Panel / khung HUD           | `PNG/Default/Panel/panel-000.png` tô tối → `panel.png`                     | `border-image: … 16 fill / 16px` (cửa sổ) hoặc `/ 8px` (HUD)                                        |
| Ô skill/item                | `PNG/Default/Transparent center/panel-transparent-center-011.png`          | xám → `slot.png`, trắng → `slot-active.png`                                                         |
| Nút                         | `Transparent center/…-009.png` (phụ), `Panel/panel-009.png` (chính, `.primary`) | `button.png`, `button-primary.png`; sinh bằng `pnpm assets:fantasy-ui`                          |
| Asset luôn có khi khởi động | `apps/game-web/src/assets/fantasy-ui/`                                     | Sprite tô màu bằng `pnpm assets:fantasy-ui` (chỉ đổi palette); Vite bundle, không phụ thuộc manifest tải bất đồng bộ |
| Provenance pipeline         | `art/third_party/kenney_fantasy_ui_borders/SOURCE.json` + `LICENSE.txt`    | Thêm element mới tại đây; originals giữ nguyên, không sửa tay                                       |
| Token và responsive         | `apps/game-web/src/hud-design.css`                                         | Dùng chung token; không hardcode palette khác trong từng component                                  |
| Hình thức khung/blur        | `apps/game-web/src/fantasy-glass.css`                                      | Import cuối cùng; nơi mở rộng giao diện chuẩn                                                       |
| Icon skill                  | `art/third_party/kdrn_ability_icons/` — https://kdrn.itch.io/ability-icons | Ưu tiên icon đã có qua `GameIcon` / media ID                                                        |
| Icon item                   | `art/third_party/quaternius_ultimate_rpg_items/`                           | Dùng icon vật phẩm đã có; đồng bộ với khung slot                                                    |
| Ký hiệu chức năng           | `apps/game-web/src/hud/HudGlyph.tsx`                                       | Icon tự vẽ kiểu Kenney: khối đặc `currentColor`, khoét lỗ evenodd, góc mềm; không dùng icon nét mảnh |

Trước khi tự tạo element: tìm trong source Kenney và các pack đã duyệt. Nếu thiếu, ghép element hiện có hoặc mở rộng glyph/token theo cùng hệ. Pack mới cần provenance và license theo `CLAUDE.md`; không trộn một bộ UI có phong cách khác vào game chỉ vì có sẵn.

## Token tham chiếu

- Nền HUD: `rgba(12, 21, 27, 0.76)`; nền panel: `rgba(9, 17, 23, 0.74)`.
- Chữ: `#f3f5f2`; chữ phụ: `#b6c6cc`; accent: `#c4d58c`.
- Blur HUD/panel: 12 px; nút/joystick: 8 px; lớp sau cửa sổ: 5 px.
- Trạng thái bắt buộc: normal, hover, pressed, selected, disabled, empty, focus-visible và cooldown. Selected có outline riêng; không chỉ đổi màu chữ.

Các giá trị có thể tinh chỉnh trong token để bảo đảm độ đọc, nhưng không đổi định hướng hình thức nếu chưa có yêu cầu của chủ dự án.

## Bố cục HUD chính

- Góc trái trên: ô avatar (khung slot) với ảnh đầu nhân vật render 3D nổi lên trên khung, đứng trước thanh HP/MP. Không panel, không tên; tên/cảnh giới ở cửa sổ Nhân vật.
- Cụm hành động (cảm ứng và phím + chuột dùng chung vị trí): nút đánh thường lớn ở góc, hình vũ khí đang cầm render 3D tràn lên trên khung. Kỹ năng xếp thành hai hàng hướng về nút đánh: hàng trên 3 kỹ năng chính, hàng dưới lướt/khiên + đổi vũ khí + nạp đạn. Thuốc nằm trên nút đánh. Không xếp vòng tròn.
- Mục tiêu: cùng kiểu avatar với người chơi (đầu 3D, quái không có xương đầu thì cả thân), badge Tinh anh/Boss dưới avatar, chỉ thanh HP; tên và cảnh giới để trong tooltip.
- Tên NPC hiện trên đầu (chữ trắng đậm + bóng, không khung). Nhắc tương tác (`F` + Nói chuyện / Nhặt / Vào) nằm ngay trên tên, bám theo entity bằng `GameView.bindOverhead`; khi mục tiêu ra ngoài màn hình thì trượt về mép để vẫn bấm được. Không dùng hộp tương tác cố định ở đáy màn hình.
- Desktop giữ nhãn phím (1–4, Q, R, X, F) và 4 ô kỹ năng bằng nhau; cảm ứng ẩn nhãn phím, ô thứ 4 nhỏ hơn, đảo bên theo tay cầm.
- Súng: chỉ hiện số đạn (chữ số + bóng đổ, không khung) đè lên cạnh dưới nút đánh; không còn khung tên súng/thanh nhiệt.
- Ảnh 3D cho HUD do `Snapshots` (`packages/babylon-renderer/src/snapshot.ts`) chụp một lần khi ngoại hình/trang bị đổi, không render mỗi frame.

## Hiệu năng và kiểm tra

- Preset Low tắt blur và tăng độ đậm nền. `prefers-reduced-transparency` và browser thiếu `backdrop-filter` dùng nền đậm thay thế.
- Không làm mờ canvas/gameplay bằng post-process chỉ để mô phỏng UI mẫu.
- Giữ safe area, desktop, điện thoại dọc/ngang; không để khung mới che nội dung hoặc làm mất vùng chạm.
- Chạy `pnpm smoke:responsive` (cần `pnpm dev`) sau mỗi thay đổi bố cục; phải ra `responsive audit OK`.
- Kiểm tra bằng mắt trên nền sáng và tối: thanh HP/MP, skill/cooldown, inventory và ít nhất một panel. Kiểm tra build/typecheck, đường dẫn asset ở subpath deployment và trạng thái Low.
