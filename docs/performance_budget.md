# Performance Budget

Ngân sách khởi điểm để đo thử, không phải cam kết (assets plan §10). Chỉnh lại sau mỗi lần profile trên thiết bị chuẩn và ghi vào `docs/decision_log.md`.

## Thiết bị chuẩn

| Vai trò | Thiết bị | Ghi chú |
|---|---|---|
| **Chuẩn chính (D-011)** | **iPhone 13 Pro Max** | A15 Bionic (GPU 5 nhân), RAM 6 GB, màn hình 2778×1284 @ 3x, ProMotion 120 Hz |
| Desktop dev | Máy dev Windows (Chrome) | Chỉ để phát triển; không dùng để nghiệm thu (assets plan §17) |
| Android tầm trung | *Chưa chọn* | Nên bổ sung trước khi khoá budget cho "Low mobile" |

Khi báo cáo số đo, ghi kèm: phiên bản iOS và Safari, chế độ PWA hay tab trình duyệt, engine (WebGPU/WebGL2), quality preset, pin/sạc, nhiệt độ máy sau 10 phút.

### Lưu ý riêng cho iPhone

- **WebGPU cần HTTPS.** Mở bằng `http://<ip-LAN>` thì Safari không bật WebGPU (không phải secure context) và game tự chuyển sang WebGL2. Dùng `pnpm dev:mobile` (HTTPS tự ký) khi test.
- **120 Hz:** Safari thường giới hạn requestAnimationFrame ở 60 Hz. Mục tiêu render là **60 FPS ổn định**, không nhắm 120.
- **Độ phân giải:** devicePixelRatio = 3. Engine đang giới hạn ở 2 (`maxPixelRatio`), tức render khoảng 1852×856 ở chế độ ngang. Quality "High" có thể thử 2.5–3 sau khi đo.
- **Bộ nhớ:** Safari có thể kill tab khi dùng quá nhiều bộ nhớ (thực tế thường quanh 1–1.5 GB cho một tab, tuỳ máy). Đây là giới hạn dễ chạm nhất, quan trọng hơn GPU.
- **Nhiệt:** A15 hạ xung khi nóng. Luôn đo sau 10 phút combat liên tục, không chỉ lúc mới mở.

## Mục tiêu trên iPhone 13 Pro Max

| Chỉ số | Mục tiêu | Ngưỡng cảnh báo |
|---|---|---|
| FPS (median, scene combat chuẩn) | 60 | < 50 |
| Frame time p95 | ≤ 20 ms | > 25 ms |
| Frame time p99 / spike | ≤ 33 ms | > 50 ms |
| Lần tải đầu (cache lạnh, Wi-Fi) tới lúc điều khiển được | ≤ 8 s | > 15 s |
| Tải lại (cache ấm) | ≤ 3 s | > 6 s |
| Bộ nhớ JS heap | ≤ 300 MB | > 500 MB |
| Texture + geometry GPU ước tính | ≤ 400 MB | > 600 MB |
| Tổng dung lượng tải cho 1 map | ≤ 40 MB | > 80 MB |

Vì iPhone 13 Pro Max là máy mạnh, các mục tiêu trên dùng cho preset **High**. Preset **Low** vẫn phải giữ 30 FPS ổn định trên một máy Android tầm trung khi đã chọn được máy đó.

## Scene benchmark chuẩn

Theo assets plan §10.1:
- Map `map_sandbox_01` (sau này là map "Rừng Cơ Quan"), player, 10–20 quái, 1 boss khi có, VFX combat đại diện.
- Combat liên tục 10 phút; rồi chuyển map/reload 5 lần để kiểm tra rò rỉ bộ nhớ.
- Ghi: FPS median, frame time p95/p99, draw calls, số tam giác, số mesh active, JS heap, thời gian tải.

## Ngân sách scene (khởi điểm)

| Hạng mục | Budget |
|---|---|
| Draw calls | ≤ 150 |
| Tam giác hiển thị | ≤ 300k |
| Entity động hiển thị | ≤ 50 (tối đa ~100) |
| Đèn động | 1 directional + 1 hemispheric |
| Shadow map | 1024, chỉ player + mob gần |
| Particle hoạt động | ≤ 2000 |

## Ngân sách asset (LOD0, assets plan §10.1)

| Loại | Tam giác | Texture |
|---|---|---|
| Player kèm trang bị | 10–20k | atlas 1024 |
| Quái thường | 3–10k | 512–1024 |
| Tinh anh | 10–20k | 1024 |
| Boss | 20–50k | 1024–2048 |
| Prop / environment | 100–5k | 256–512 |

## Số đo hiện tại

| Ngày | Thiết bị | Engine | Scene | FPS | Ghi chú |
|---|---|---|---|---|---|
| 2026-10-06 | Desktop Chrome headless | WebGPU / WebGL2 | sandbox, 6 entity, model Quaternius | 60 | Chỉ là smoke test, chưa phải nghiệm thu |
| 2026-10-06 | Desktop Chrome headless | WebGPU | Rừng Cơ Quan, 21 entity, 102 env instance, preset High | 56–57 | 83 draw calls, 9/15 chunk active |
| — | iPhone 13 Pro Max | — | — | — | **Chưa đo** |

Kích thước tải (bản build 2026-10-06):

| Phần | Kích thước | gzip |
|---|---|---|
| Babylon chunk | 7.5 MB | 1.6 MB |
| Recast (wasm compat) | 0.76 MB | 0.23 MB |
| React + Zustand | 0.22 MB | 0.07 MB |
| App code | 0.33 MB | 0.10 MB |
| Toàn bộ model + texture (12 asset) | ~3.0 MB | (đã nén meshopt + WebP) |

Vấn đề đã biết trước khi đo trên iPhone:
- ~~Texture cây 8 MB~~ → đã resize + WebP (230 KB/cây). KTX2 vẫn là bước tiếp theo để giảm VRAM.
- Bundle đang import toàn bộ `@babylonjs/core` (7.5 MB).
- ~~Meshopt decoder từ CDN~~ → đã đóng gói cùng asset.
