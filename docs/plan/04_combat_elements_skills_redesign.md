# Combat RPG × MOBA — Ngũ hành và skill toàn bộ Đạo

Ngày: 2026-10-08. Trạng thái: **P0 đã nghiệm thu local; P1–P2 đang triển khai; Pháp/Thể/Trận/Ảnh/Ngự Thú có prototype chơi được**. Goal tạm dừng theo yêu cầu chủ dự án; snapshot này là mốc tiếp tục gần nhất.

### Snapshot tạm dừng — 2026-10-08

- Tiến độ ước tính: **78% toàn goal** (P1 ~95%, P2 ~85%, năm kit ~70%; đây là ước tính theo checklist, không phải phần trăm test).
- Đã nghiệm thu: P1 combat slice, chọn hành/API/DB, mobility, quái melee/ranged, projectile; P2 combo/timing/cancel, swept hitbox, farm takeover/leash/LOS/range hysteresis, auto aim Pháp có giới hạn, auto setup Trận quanh anchor; model/animation theo kit và online Low/reconnect.
- Evidence chính: full regression **321 test/33 file**; validate **417 YAML**; production web build; online smoke từng profile; farm soak Pháp native basic **1800.55s, 258 kills, failures rỗng**; farm soak Trận native basic **1800.82s, 248 kills, failures rỗng**. Hai soak đếm CAST_START continuation warning riêng với committed casts.
- Thể đã có poise core: pressure/threshold, Kình Thể tăng threshold, break 0.3s, immunity/decay, cancel windup giữ nguyên cost/cooldown; snapshot qua Zod. HUD poise và smoke Worker có chủ ý cần chạy/đọc lại sau khi tiếp tục.
- Còn lại khi resume: hoàn thiện HUD/cue poise và Worker smoke; cân bằng/passive/counterplay năm kit; kiểm auto aim và Trận trên revision cuối; xử lý hai nguồn robot thiếu để build asset strict; full regression/online matrix cuối. Chưa đánh dấu P1–P2/P3 hoàn tất, chưa benchmark thiết bị thật, chưa có stagger/poise đầy đủ cho toàn bộ quái/boss.

Yêu cầu của chủ dự án là nền tảng của tài liệu này. Các con số cân bằng, cách gán Lôi và mốc late game dưới đây là đề xuất để playtest; không xem là số liệu đã nghiệm thu. Phạm vi bao gồm tám Đạo trong master plan, bảy skill Lôi hiện có, năm loại súng, nhân vật mới/cũ, quái và auto farm.

## Tiếp tục P1–P2 và các kit — 2026-10-08

- Kiếm starter giữ Hoàn Kiếm/Xuyên Tâm. Node Khai Mạch → Lôi Ảnh → Lôi Vực mở E và biến thể vùng; Trúc Cơ + Kiếm Cơ mở Tử Điện và Cửu Thiên, có quest/vật liệu/capacity. Lôi Bộ vẫn alias roll chung. Integration test dùng YAML thật kiểm tra reject không mất chi phí, học đủ skill, không reset cooldown và giữ unlock qua reload.
- Pháp prototype: basic pháp cầu ba nhịp (nhịp ba rộng hơn), Linh Tiễn, Pháp Ấn, Hộ Pháp, Thiên Tượng. Projectile basic có tốc độ hữu hạn và swept collision như skill; không homing hoặc instant hit. Thiên Tượng có ba lần impact cố định, mỗi lần telegraph và hit test riêng, tổng damage chia trong YAML.
- Thể prototype: combo quyền hiện có, Phá Sơn, Cường Thể, Chấn Địa, Bá Thể. Chấn Địa/Bá Thể groundLow nên jump tránh được sóng thấp. Khiên tính theo max HP tại impact, thay thế thay vì cộng dồn, có hạn tick, không lưu qua chết/transfer/takeover; HUD báo amount và thời gian còn lại.
- Trận prototype: Đặt Trận/Đại Trận khóa vị trí, mỗi chủ tối đa hai trận chung, có lịch pulse và hạn tồn tại cứng. Kích Trận chỉ kích vùng của chính mình trong range/LOS; Liên Trận chỉ tạo khiên khi còn trận hợp lệ. Basic phù ba nhịp, nhịp ba gia cố trận nhưng không vượt hạn tồn tại. Reset controller/transfer xóa trận; không lưu trận vào save. Q/W/E/R đều có node cho nhân vật cũ học.
- Ảnh prototype: basic đâm/cắt/kết liễu, thưởng back/flank hữu hạn 1.4/1.15 trong combo YAML. Ảnh Nhận là projectile hẹp, không homing. Màn Ảnh 3 giây làm quái bỏ truy đuổi nhưng vẫn có hurtbox, đòn đã phát vẫn resolve; tấn công hoặc nhận đòn phá cloak. Cloak hết theo tick, xóa khi chết/reset/transfer, không lưu save; model mờ và HUD có thời gian còn lại. Truy Ảnh khóa hướng/điểm tới trước thân mục tiêu, travel theo tick chặn nav/tường rồi chém nón ngắn; mục tiêu có thể rời nón. Vô Ảnh báo capsule đường cố định dài 7 mét, ba impact cách nhau 0.25 giây dùng offense/origin/yaw lúc commit, có LOS từng mục tiêu và mỗi pulse kiểm hitbox lại. Line warning vẽ capsule dùng pool có sẵn, không recolor một circle rồi gọi là đường chém.
- Các profile thử `?char=player_phap` / `?char=player_the` / `?char=player_tran` / `?char=player_anh` / `?char=player_thu` mở kit đầy đủ offline. Online có chọn bộ khởi đầu Kiếm/Pháp/Thể/Trận/Ảnh/Ngự Thú khi tạo nhân vật; room starter chỉ mở Q/W, E/R qua node/quest/cảnh giới. Test reload không tự mở E/R. Các skill mới cũng có node để nhân vật hiện tại học; test nhân vật Kiếm học đủ Trận/Ảnh/Ngự Thú, trả đúng gold/material và reload giữ skill/cooldown cũ. Không thêm cấp nhân vật. Hành vẫn chọn độc lập và do DB khóa.
- Auto farm bỏ mục tiêu và threat khuất LOS/không hostile/vào safe zone; stop HP/inventory và về leash xóa followup, pending approach, path và held fire. Strike đã commit giữ cost và impact. Range hysteresis và stuck policy chuyển vào YAML. Đường đi không tiến triển đủ 8 giây thì dừng, báo lý do; idle hoặc đang cast không tính là kẹt. Guard chỉ sau reaction delay và giữ MP reserve, đã có test visible/early/wall/reserve. Thông báo pool combat riêng với capacity tu luyện.
- Protocol v11 bổ sung shield/cloak, capsule line warning, warning continuation và ACTION_CANCEL. Cảnh báo dùng action ID riêng nên các đợt impact không xóa nhầm vùng của cast khác. Capacity tính cả windup đã nhận, reject trước tiêu MP/cooldown khi 128 projectile/scheduled action được dành chỗ. Vite dev theo dõi add/unlink YAML ngoài root, đã xác minh node mới vào eager glob mà không restart.
- Bằng chứng hiện có: 193 test/29 file regression qua trước khi bổ sung 4 test starter/unlock (6 test progression sau bổ sung đều qua); typecheck 20 workspace, validate 334 YAML, depcruise và production build qua. Replay Kiếm/Pháp/Thể/Trận qua Colyseus handler/socket/AOI/private state/dedupe thật; smoke production Worker/WebGL Low desktop 1440 và mobile 390 cho ba kit, basic + bốn skill + shield HUD, không page error. Đã đọc ảnh Trận mobile. API test xác nhận bốn profile và bản mệnh chọn được lưu đúng DB; form creation qua 9 kích thước. Smoke phát hiện minimap che menu cảm ứng, đã sửa specificity và chạy lại bằng tap thật. Chưa dùng các test này để kết luận latency/FPS thiết bị thật.
- Mốc Ảnh: regression toàn workspace 234 test/31 file qua; typecheck 20 workspace, validate 401 YAML, depcruise 181 modules/603 dependencies, build web qua. Replay socket thêm Ảnh kiểm cloak qua AOI delta và ba impact ultimate; core kiểm cloak expiry/break/committed monster hitbox/reset, dash hit/move/wall và line fixed origin/move/wall. Smoke production Low Worker/WebGL 1440 và 390 qua basic + bốn skill, có đi tới quái rồi dash thật; đã đọc ảnh cloak/HUD mobile. API tạo 5 profile dùng account riêng để giữ cap 4 nhân vật/account. Navigation và host transfer tests được cập nhật cho town layout mới; transfer test kiểm thêm inventory và bản mệnh. Đây là kết quả trong môi trường local, không phải benchmark thiết bị thật.
- Ngự Thú prototype: một Linh Lang thuộc chủ, có hurtbox/HP 660, follow 1.5m/leash 12m và hồi sinh sau 20s. Di chuyển dùng nav/collider, không teleport khi vượt leash. Q Thú Kích ra lệnh lao cắn theo tick, W Đồng Tâm heal/khiên pet còn sống, E Hợp Kích có hai nón kiểm hitbox ở hai impact, R Bầy Thú phát wave hữu hạn tốc độ từ pet. Cú cắn có warning nón tại landing hợp lệ; wave báo capsule đường bay. Pet không tấn công trong safe zone; lệnh reject trước chi phí nếu pet chết/bận/quá xa/khuất LOS. Tấn công pet ghi damage contribution cho chủ để quest/gold/loot không mất hoặc nhân đôi; pet chết không rơi loot. Basic Ngự Phù ba nhịp dùng projectile và clip có sẵn; model/FX/animation đang reuse asset được duyệt, chưa phải art riêng hoàn thiện.
- Ngự Thú có profile `?char=player_thu`, chọn online trong form tạo nhân vật, starter Q/W và bốn node cho nhân vật hiện tại; node Thú Kích cấp khế ước pet. Protocol v12 thêm kind pet/ownerId, private companion HP/recovery và cone warning. Migration 0010 thêm companion jsonb; save/reload/transfer/takeover bảo toàn HP/thời gian hồi sinh, không lưu entityId/khiên/cast pet. HUD thêm thanh HP pet hoặc đếm giây hồi sinh, dùng khung hiện có.
- Mốc Ngự Thú: regression 245 test/31 file qua trước khi thêm test portal và wave/cone/quota cuối; typecheck 20 workspace, validate 414 YAML và depcruise 182 modules/613 dependencies qua ở mốc đó. 28 test authored kits hiện qua, bao gồm hit/move/wall cho cú cắn/wave, Hợp Kích hai impact, HP/recovery reload, kill credit/no loot, leash/LOS và 129 command cạnh tranh quota 128. Repository test chạy migration thật và roundtrip HP/recovery, reject state ngoài giới hạn mà không ghi đè save. Replay socket sáu kit qua; sáu test portal → save → relogin qua giữ skills/affinity/inventory/cooldown, pet không sót ở room cũ và giữ HP ở room mới. Smoke Ngự Thú Worker/WebGL Low desktop 1440/mobile 390 qua basic + Q/W/E/R + HP pet/khiên/wave, đã đọc ảnh HUD mobile; responsive audit 9 kích thước và form chọn sáu kit qua. Debug FPS có cảnh báo font 10px baseline, không có lỗi bố cục HUD.
- Kiểm tra sau basic Ngự Phù/test portal: 256 test/32 file qua, validate 417 YAML, depcruise 182 modules/626 dependencies, typecheck 20 workspace và web build qua. Smoke Ngự Thú hai viewport chạy lại qua. Sau mốc này đã bổ sung chủ vào combat khi pet đánh/nhận đòn, phá cloak chủ khi pet gây damage và ngắt pet tự tìm mục tiêu khi chủ cloak; 28 test authored kits chạy lại qua và diff check sạch.
- Farm soak: harness `tools/smoke/farm-soak.ts` dùng server 20Hz thời gian thật, socket AOI/private state, autosave 30s, Pháp Trúc Cơ với node/gear authored và item intents bình thường; không sửa HP/clock runtime. Lượt harness 30s qua (612 snapshot, 5 kill). Lượt 1800s đã terminal passed; kết quả baseline và lượt sau sửa range được ghi riêng ở mốc phía dưới.
- Audit P2 tiếp tục: range hysteresis có state theo target, đi vào tiếp cận ở ngưỡng ngoài và chỉ dừng khi tới ngưỡng trong; đổi/mất target xóa state cũ. 13 lệnh tay (gồm nhặt/tương tác/nạp/đổi trang bị) ngắt farm trước bước buffer/validation, xóa approach và followup/held/burst, giữ luật hủy của đòn đang phát. Súng finish một windup đã nhận dù farm/followup ngắt, sau đó aim mới không lấy windup cũ. 60 test/3 file core timeline/ranged/elements qua ở mốc này. Lượt soak hiện tại ghi riêng `reports/farm-soak/online-1800s-p2-range.json`, có SHA256 các file runtime/rules/map/nav liên quan; lượt trước dùng code trước sửa range nên giữ làm baseline, không thay cho lượt mới.
- Gate P1 authored mob: sáu test `apps/game-server/src/combat-slice.test.ts` qua với AI/YAML thật: sói nón windup 0.55s và robot laser point-lock 0.8s → projectile 16m/s, hit/đi ngang/tường. Robot giữ cooldown spawn 40 tick; test chờ cast thực tế, đặt tường giữa vị trí caster lúc cast và target, kiểm DAMAGE đúng skill để không nhầm đòn melee. Regression hiện tại 277 test/33 file qua, typecheck 20 workspace và web build qua sau range/takeover; depcruise 184 modules/637 dependencies qua sau thêm tool audit. Đây chưa phải bằng chứng timing clip hoặc latency thiết bị thật.
- Lệnh kiểm tra đã hoạt động lại sau lỗi hạn mức phê duyệt trước đó. `assets:inspect` đọc GLB meshopt runtime thành công, JSON trả 40 clip với thời lượng keyframe nguyên bản. `tools/smoke/skill-animation-poses.ts` xuất 21 pose keyframe trước/tại/sau impact của bảy skill Lôi, loại blend-in khi seek; đây là audit art, không thay cho playback event online. Đã xem ảnh và phát hiện Tử Điện Trảm impact ở pose giơ kiếm; tăng castSpeed 2.4 → 3.2 để pose chém xuống ở clip time 0.96s trùng impact 0.30s. Validate 417 YAML qua. Smoke production Low năm súng qua SHOT, reload tự động, overheat, damage lên mob và hold/release cảm ứng; chưa dùng kết quả đó để khẳng định mọi contact frame đã khớp.
- Farm baseline `online-1800s.json` terminal passed ở 1801s, 36001 snapshot, 266 kill, không failure; baseline dùng code trước sửa range. Lượt code mới `online-1800s-p2-range.json` terminal passed ở 1800.91s, 36019 snapshot/36014 active tick, 266 kill, 623 cast, 574 damage event, gap lớn nhất 183.18ms, không failure. Report có SHA256 các file farm/intents/ranged/geometry/rules/map/nav. Đây là một trường hợp Pháp Trúc Cơ online trên map authored; không đại diện cho mọi kit/thiết bị hoặc offline farm.
- Timing Lôi: Tử Điện Trảm 3.2; Hồ Quang 1.75; Lôi Ảnh Trảm dùng reverse horizontal 2.125 để chém tại landing 0.40s; Xuyên Tâm 1.7 để phóng lúc thrust; roll shared 1.3333 để clip 0.40s hoàn tất trong duration 0.30s. Cửu Thiên dùng Chop 0.54545 để gồng/chém tại 1.10s, bỏ restart clip impact trên từng target AoE. Đã xem pose keyframe sau sửa. `tools/smoke/thunder-timing.ts` chạy cast bằng intents thật trong Worker/production WebGL Low, không seek/pause: cả bảy qua, sai lệch frame quy đổi 8–50ms trong lượt đo (gate 75ms). Build và typecheck 20 workspace qua; đây chưa phải chứng minh latency thiết bị thật hoặc mạng online.
- Cancel presentation: ACTION_CANCEL đúng actionId dừng attack/cast clip, bỏ delayed swing arc/impact và warning melee; actionId cũ không cắt action mới. Death/despawn xóa presentation state. `tools/smoke/action-cancel.ts` qua cả dev và production Low với BASIC_ATTACK → roll thật, không stale arc/impact; inject cancel cũ sau roll không cắt roll. Hiệu ứng damage đã commit vẫn được hiển thị theo event, không bị bỏ vì hủy followup.
- Passive Thể đã có Kình Thể trên combo quyền: mỗi swing trúng cấp một tầng +4 defense, tối đa ba tầng/3 giây, không nhân tầng theo số target. Hụt/tường/dodge không cấp tầng; hụt làm đứt thế, chain quá `resetAfter` mất tầng khi khởi đòn mới. Main-hand equip/unequip, death/reset/takeover/transfer xóa; save/reload không mang buff. Defense đọc tại impact, base stats không bị ghi đè. Đây là guard theo nối đòn, chưa phải hệ stagger/poise/CC mới. Snapshot optional `guardChain` đi qua Zod/delta; HUD 10Hz hiện tầng/+thủ/thời gian bằng status style có sẵn.
- Fix auto tiếp cận: `basicReach` lấy reach của variant đầu tiên ở nhịp combo kế tiếp và clamp bằng character combat range; melee preparation/chase dùng cùng ngưỡng. Thể không dừng ở range 1.3m rồi đấm hụt vì punch reach 1.1m. Test authored auto tại mép range qua và tích ba tầng. Regression sau sửa 283 test/33 file qua; 34 test authored kits gồm passive/damage mitigation/expiry/miss/wall/dodge/save/reset/auto. Smoke `tools/smoke/the-guard.ts` dùng ATTACK_TARGET thật, không sửa HP/clock/buff, kiếm ba tầng và kiểm HUD desktop 1440/mobile 390 qua; đã đọc ảnh mobile. Responsive chín kích thước qua, chỉ có warning debug font 10px baseline. Depcruise 187 modules/644 dependencies qua trước lần kiểm cuối.
- Timing năm súng: `tools/smoke/gun-timing.ts` qua trên production Low; pistol/carbine/shotgun/sniper recoil lead 14–27ms, carbine kiểm burst cadence theo 20Hz; rifle 12 shot có phase drift tối đa 39ms. Đọc frame của track đang chạy để không đo nhầm root track bị pause. Report `reports/gun-timing/live.json`; đây là một desktop headless, không phải benchmark thiết bị thật.
- Audit clip các kit: sửa 7 tham chiếu `Ranged_Magic_Spellcasting_Short` thành `Ranged_Magic_Spellcasting` và 3 tham chiếu `Spellcast_Shoot` thành `Ranged_Magic_Shoot`. `pnpm smoke:kit-clips` đọc animation names trực tiếp từ GLB mà manifest đang ship, kiểm 96 tham chiếu explicit của 6 profile, không dựa vào fallback renderer. Validate 417 YAML, 34 test authored kits và depcruise 190 modules/658 dependencies qua; production build qua.
- Online smoke phát hiện pet tự cắn liên tục khiến lệnh chủ chỉ được nhận đúng tick giữa hai đòn. Recovery của basic pet giờ cho lệnh chủ thay thế sau khi damage đã resolve; windup/đòn pet đang phát vẫn reject trước cost, recovery của mob thường không đổi. Ba test authored Thú Kích/Hợp Kích/Bầy Thú kiểm nhận lệnh trong recovery, damage cú cắn chỉ một lần và ACTION_CANCEL đúng actionId. 37 test kit, regression 286 test/33 file, typecheck 20 workspace và production build qua.
- Demo Low online tổng hợp: `pnpm smoke:online-kits http://127.0.0.1:5175` terminal passed cả sáu profile trên build production mới. Harness dùng HTTP login/session/refresh thật, DB PGlite riêng và Colyseus thật; starter server với save Trúc Cơ đã học kit. Kiểm event basic + roll/blink/jump + bốn skill, không page error; reload/rejoin giữ skills/bản mệnh và cooldown tuyệt kỹ vẫn còn, không tăng. Ngự Thú viewport 390×844, đã đọc ảnh HUD mobile. Tiếp cận pet ngoài tầm bằng MOVE_TO thật, không sửa runtime clock/stats/cost. Kết quả `reports/online-kits/results.json`. Gate browser local đã qua; latency/FPS trên thiết bị thật chưa nghiệm thu.
- Polish animation năm kit: bổ sung explicit cast clip cho 13 skill trước dùng role mặc định. Thể dùng Punch/Block/Jump_Chop_InPlace (nện xuống ở clip time 0.96s), Pháp/Trận dùng Spellcasting/Raise, Hợp Kích dùng horizontal slice. Truy Ảnh speed 1.05 đưa thrust 0.42s về landing 0.40s; Vô Ảnh 0.923 đưa slice 0.60s về nhát đầu 0.65s. `skill-animation-poses.ts ... kits` xuất 60 pose đúng model không cầm kiếm; đã đọc các pose quyền/đỡ/nện/khiên/Vô Ảnh. Đây là clip được duyệt reuse có lựa chọn theo kit, chưa phải asset animation mới. Audit GLB qua 109 named references; 417 YAML, 37 test kit và build qua. Harness online đã bổ sung first-impact frame, event delivery delta và playback drift; có một lượt Tử Điện online fail 82ms, diagnostic rerun qua 16–48ms, chưa dùng rerun đó để kết luận timing trên mọi mạng/thiết bị.
- Timing online phát hiện thêm Truy Ảnh drift 81ms/playback drift 100ms dưới đòn melee: cosmetic hit-stop làm chậm clip cast nhưng sim không dừng. `ModelVisual.freeze` giờ giữ tốc độ khi one-shot role cast (kể cả mobility), vẫn giữ FX/knock/shake của damage và hit-stop attack/hit bình thường. Harness ghi số melee hit trong lúc cast và speedRatio tại impact. Lượt build sau sửa: Tử Điện nhận melee lúc gồng nhưng clip giữ 3.2, drift 18ms. Renderer typecheck và build qua. Lượt tổng hợp cuối terminal passed sáu profile/24 first-impact clip: max drift từng profile Kiếm 17.7ms, Pháp 17.4ms, Thể 33.3ms, Trận 16.8ms, Ảnh 33.2ms, Ngự Thú 17.1ms; speedRatio đúng YAML. Có tổng bảy melee hit trong lúc cast của Kiếm/Pháp/Thể/Ảnh. Reload/rejoin vẫn giữ skill/bản mệnh/cooldown. `reports/online-kits/results.json` là report lượt này; chỉ chứng minh môi trường local/headless Low này.
- Phá Sơn hoàn thiện delivery theo kit matrix: capsule khóa origin/yaw dài 2.4m, radius 0.35m, warning trước 0.30s; movement/tường/biên thân quái kiểm tại impact. `SKILL_IMPACT.line` optional qua Zod và renderer dùng flash capsule có hai đầu tròn từ pool (không ellipse/circle thay thế), gồm cả các pulse Vô Ảnh. Self line impact point dùng origin đã commit để FX không chạy theo caster. Auto self cone/line dùng impactRange/range thay effect radius; ngắm vị trí quan sát hiện tại, khôi phục yaw nếu cast reject, không bảo đảm hit. Bảy test hit/move/wall/side/end/outside/origin và ba test auto hit/move/MP reserve qua. 47 test kit, regression 296 test/33 file, typecheck 20 workspace, validate 417 YAML, depcruise 191 modules/661 dependencies, build qua. Worker production Low desktop 1440/mobile 390 đo warning và impact cùng bounds 0.7×3.1m, không page error; đã đọc ảnh mobile.
- Thể online sau capsule: API/Colyseus Low terminal passed bốn skill + basic/mobility + reload; Phá Sơn impact nhận `line` đúng từ server, drift 16.7ms dù chịu một melee hit lúc cast. Report riêng `reports/online-kits/results-player_the.json`. Harness chạy một profile giờ ghi report riêng để không thay report tổng hợp. Sau đó lượt tổng hợp cả sáu profile trên build capsule mới terminal passed, gồm 24 first-impact clip, basic/mobility và refresh/rejoin giữ cooldown; report tổng hợp `reports/online-kits/results.json` đã cập nhật revision này.
- Farm soak sau đổi directional reach/aim: `tools/smoke/farm-soak.ts --seconds=1800 --label=p2-capsule` terminal passed sau 1801.08 giây clock thật, 36022 snapshot/tick, 266 kills và 623 casts, failures rỗng. Report `reports/farm-soak/online-1800s-p2-capsule.json`, revision SHA256 13b89c036c7159bc52756f72fed93e432ca05f36775d1036202774b42e9f65e5. Lượt Pháp Trúc Cơ với fixture kiếm kiểm stability của farm revision này; các case directional được kiểm riêng bằng authored test. Không suy thành soak toàn bộ kit hoặc benchmark latency/FPS thiết bị.
- Basic Pháp/Trận/Ngự Thú: nhịp ba đổi Spellcasting_Long/1.7 (clip gần 1.49s so với action 0.75s) sang Spellcasting/0.857142857 (contact clip time 0.30s trùng release 0.35s; clip 0.778s). Hai nhịp đầu giữ 1.5/0.20s. Pose audit thêm `combos` và `magic` để kiểm gesture/clip duration. Production phát hiện basic đầu lệch 78–90ms dù model đã render: Babylon khởi clock ở lần animate đầu, bỏ thời gian từ event đến render. ModelVisual đồng bộ một lần bằng goToFrame trong onBeforeAnimationsObservable, token chặn callback cũ và dispose dọn observer; playback/hit-stop sau đó bình thường. `pnpm smoke:kit-basics` production Low qua 9 release thật/step đúng/projectile finite/clip duration không vượt action quá 50ms. Bảy Lôi/roll live timing qua 9–25ms, action-cancel/stale callback qua; renderer typecheck, validate 417 YAML, 109 clip refs, build và depcruise 192 modules/664 dependencies qua. Đây là calibration sau 12 frame render model trong town, không là cold-load/device FPS benchmark; online tổng hợp sau clock fix đang chạy.
- Phần còn lại của các kit: Pháp/Thể/Trận/Ảnh/Ngự Thú còn cần passive hoàn chỉnh, polish/cân bằng và animation riêng. Không đánh dấu toàn bộ P1/P2/P3 hoàn tất từ prototype này.

### Model theo kit và gate cuối — 2026-10-08

- Pháp/Trận dùng Mage, Thể dùng Barbarian, Ngự Thú dùng Ranger, Ảnh giữ Rogue. Mage/Barbarian bổ sung cùng 40 clip Rig_Medium từ pack đã duyệt trong SOURCE.json; không sửa originals. `assets:vendor` sinh lại allowlist. Audit GLB thực tế qua 109 clip references của sáu profile, production build và validate 417 YAML qua. `skill-animation-poses.ts` chọn profile sở hữu skill/combo, xuất 60 pose của năm kit; đã đọc pose Phá Sơn/Linh Tiễn/Hợp Kích, model và portrait đúng theo profile.
- Online production Low với model mới terminal passed sáu profile/24 first-impact clip, basic/mobility và HTTP refresh/rejoin giữ skill/bản mệnh/cooldown. Max drift lần lượt Kiếm 29.9ms, Pháp 15.3ms, Thể 17.2ms, Trận 22.9ms, Ảnh 22.8ms, Ngự Thú 35.7ms; report `reports/online-kits/results.json`. Đây là kiểm chứng browser local, không thay benchmark thiết bị thật.
- Một lượt basic chạy đồng thời ba smoke browser fail Trận nhịp đầu 121.3ms; chưa đủ số đo để kết luận nguyên nhân. Harness đã bổ sung deliveryDeltaSeconds/renderAgeSeconds và giữ samples/errors của profile fail trong report. Lượt chạy riêng sau đó terminal passed cả 9 basic release trên model mới; không tăng tolerance 75ms. Chưa nghiệm thu performance khi tải đồng thời.
- `assets:build --allow-missing` terminal passed 263 assets với hai warning placeholder: nguồn Leela.gltf/George.gltf của robot/mech chưa có. Build strict vẫn chưa qua. Keyset manifest trước/sau model mới bằng nhau; không có entry runtime bị mất do thay Mage/Barbarian. Hai nguồn thiếu là việc asset riêng cần hoàn tất để nghiệm thu build strict.
- Các mục tiếp theo vẫn là poise Thể thực sự (guard-chain hiện chỉ cộng defense), auto aim Pháp theo vận tốc quan sát, policy Trận gần anchor, cân bằng/passive từng kit và audit đầy đủ gates P1–P2. Không coi các smoke xanh là toàn bộ mục tiêu đã hoàn thành.

### Auto setup Trận — 2026-10-08

- Đặt Trận/Đại Trận khai báo `autoAnchorRadius: 3` trong YAML. Farm chọn tâm gần quái quan sát được nhưng giới hạn trong 3m quanh điểm bật farm; chỉ cast khi vùng còn phủ hurtbox quái, tâm trong tầm caster, ngoài safe zone và LOS caster→tâm→quái thông suốt. Tâm khóa lúc commit; quái vẫn né được. Cast tay giữ tầm/điểm chọn cũ. Khi đã đủ hai owned fields, auto bỏ qua đặt mới trước chi phí/cooldown/pending; Kích Trận và basic tiếp tục theo policy hiện có.
- Tám test authored mới qua: đặt gần anchor/hit, quái chạy ra trước impact, target ngoài vùng hữu ích, tường chỉ chặn caster→tâm, ngoài tầm, giữ MP reserve, cast tay ngoài radius auto, Đại Trận và shared cap hai trận. Tổng authored kits 55 test qua; core typecheck, server typecheck, validate 417 YAML, production build và diff check qua.
- Harness soak bổ sung `--profile=player_tran`, native basic không trang bị kiếm, nodes Trúc Cơ authored và thống kê castsBySkill. Lượt `--seconds=1800 --profile=player_tran --label=p2-tran-anchor` đã bắt đầu với API/server/socket thật; report `reports/farm-soak/online-1800s-p2-tran-anchor.json`. Chưa nghiệm thu lượt này trước terminal passed. Soak Pháp trước thay policy là bằng chứng của revision cũ, không thay lượt Trận mới.
- Regression sau policy Trận terminal passed 304 test/33 file. Browser production Low riêng Trận passed basic/mobility/bốn skill + refresh/rejoin. Lượt soak đang chạy tiếp, không restart. Audit metric phát hiện `casts`/`castsBySkill` đếm CAST_START gồm cả continuation warning của pulse, không phải số lần tiêu MP/cooldown; 623 ở report Pháp cũ cũng là số event này. Harness cho các lượt tiếp theo đã bổ sung `committedCastsBySkill` chỉ đếm event không continuation; lượt Trận đang chạy giữ metric gốc và phải đọc theo định nghĩa event.

### Auto aim Pháp theo quan sát — 2026-10-08

- Linh Tiễn khai báo `autoAim: { maxSeconds: 0.5, maxDistance: 1.5, weight: 0.65 }`. Farm lấy chênh lệch vị trí mục tiêu đã quan sát ở các nhịp think, không đọc movement.dir/path/intent tương lai. Chỉ dùng mẫu cùng target, tuổi không quá hai think interval, clamp vận tốc bởi movement speed và độ đón bởi YAML; tầm/LOS predicted point không hợp lệ thì giữ hướng tới vị trí quan sát hiện tại. Mẫu đầu không tự đoán vận tốc. Cast tay giữ point do người chơi chọn; projectile khóa hướng như trước, không homing hoặc bảo đảm hit.
- Sáu test authored kiểm chuyển động thật qua tick: đi đều trúng, đảo hướng sau commit hụt, tường chặn điểm đón thì fallback, mẫu cũ/target khác không đón, mẫu đầu/manual không đọc steering. Test projectile kiểm heading vẫn theo point đã commit. Hai test lifecycle kiểm manual/reset xóa mẫu và save/reload không lưu lịch sử quan sát. Typecheck core, validate 417 YAML, production build qua; regression và smoke online riêng Pháp đang chạy.
- Lượt soak mới `--seconds=1800 --profile=player_phap --native-basic --label=p2-phap-aim` đã khởi chạy, report `reports/farm-soak/online-1800s-p2-phap-aim.json`; fixture dùng basic pháp cầu và nodes authored, không dùng kiếm. Fingerprint mới gồm character/combo/skill và source harness. `committedCastsBySkill` tách cast mới khỏi continuation warning. Chưa nghiệm thu trước terminal passed. Lượt Trận đang chạy giữ revision trước Pháp auto aim, không restart hoặc dùng nó để chứng minh behavior auto aim mới.
- Sau bổ sung lifecycle gates: regression terminal passed 312 test/33 file; browser production Low riêng Pháp passed basic/mobility/bốn skill và refresh/rejoin. Report `reports/online-kits/results-player_phap.json` không thay report tổng hợp sáu kit. Đây là smoke thao tác skill bằng tay; behavior auto aim được chứng minh riêng bởi authored tests, soak kiểm stability ở revision mới và vẫn đang chạy.

### Poise phòng thủ Thể — core đầu tiên, 2026-10-08

- Thể khai báo poise trong character combat YAML: threshold 24, break 0.3s, miễn tích áp lực 2s sau break, decay 3s không nhận áp lực. Kình Thể thêm `poisePerStack: 6`, nâng ngưỡng tối đa 42 tại ba tầng còn hạn; defense hiện có giữ nguyên. Sói Rừng khai báo basic `poiseDamage: 12`. Chỉ hit có áp lực được khai báo mới tích poise; heavy không tự chuyển thành stun. Chưa gán poise cho quái/boss hoặc áp lực cho mọi skill/loại damage.
- Resolver áp dụng sau hit/né và shield: phải có HP damage thực sự, target còn sống và poise config. Roll/jump tags bảo vệ damage thì không tích áp lực; shield hấp thụ toàn bộ cũng không tích. Đủ ngưỡng xóa pressure, ngắt windup bằng ACTION_CANCEL mà không refund cost/cooldown, xóa pending/buffer và khóa di chuyển/khởi skill/basic/mobility/ranged/farm trong sáu tick. Active travel và projectile đã phát không bị xóa. Immunity ngăn break nối liên tục; pressure không lưu vào save, lifecycle reset xóa. Snapshot optional poise qua Zod để HUD có thể đọc; chưa có HUD poise riêng.
- Chín test mới qua: threshold thường/ba tầng/decay/full shield/hit không khai báo áp lực, interruption/cost/cooldown/reset/save, cú cắn sói theo windup thực tế và snapshot Zod, roll i-frame, projectile đã phát. Full regression terminal passed 321 test/33 file; sau thêm assertion snapshot, 72 authored kit test chạy lại qua. Core/server typecheck, validate 417 YAML, production build, diff check qua. Online Low Thể basic/mobility/bốn skill và refresh/rejoin terminal passed (`reports/online-kits/results-player_the.json`); smoke này không thay test có chủ ý break poise.
- Cần tiếp tục HUD/cue áp lực và khựng, Worker/online break smoke có chủ ý, kiểm cân bằng với threat khác. Hai soak Trận/Pháp đang chạy vẫn dùng revision trước poise core này; giữ nguyên tiến trình và ghi đúng scope, không dùng để nghiệm thu toàn bộ code poise mới.


## Bản triển khai đầu tiên — 2026-10-08

Đã có luật khắc chế trong `game-data/combat/combat_rules.yaml`; character/monster affinity, phân tỉ lệ damage cơ bản/skill; súng dùng bản mệnh người cầm và giữ falloff theo khoảng cách. Protocol v9 đưa hành/biểu hiện, mobility, projectile và windup sang client. Core vẫn là TS thuần, sim authoritative 20 Hz.

Tạo nhân vật online chọn hành, DB khóa bản mệnh qua save thường; API chọn một lần cho nhân vật cũ chưa có hành. Migration 0008 lưu cooldown còn lại (giây, đóng băng khi offline) để chuyển map/reconnect không reset. Migration 0006 giữ nhân vật `player_default` đã chơi là Mộc/Lôi; 0007 kiểm tra giá trị/biểu hiện. Migration được áp dụng khi API/game server mở DB. Debug offline: `?element=kim|moc|thuy|hoa|tho` hoặc Cài đặt → Ngũ hành debug. Khi không có flag, dùng mặc định YAML; cờ không đổi nhân vật online.

Lộn (Shift, 5 s), tốc biến (E, 14 s), nhảy (V, 3 s) là action dùng chung, có nút cảm ứng và cooldown server. Roll có cửa sổ né, jump chỉ né đòn `groundLow`, blink không có i-frame. Đi theo tick, nav và circle obstacles; không xuyên tường. Nhảy hiện nâng model với clip Dodge có sẵn: **placeholder animation**, cần clip jump chuẩn khi polish.

Combo cơ bản giữ ba nhát, finisher dùng variant đầu để dễ đoán; buffer 0.2 s. Vệt kiếm/đạn/impact đổi màu theo hành; Lôi reuse VFX điện. Bốn hành còn lại dùng VFX recolor ban đầu, chưa phải bốn bộ asset riêng. Bảy ID skill Lôi được giữ: Xuyên Tâm là projectile thật; Hoàn Kiếm/Trảm/Lôi Nhảy dùng cone/circle; Vực/Thiên Phạt khóa vùng có telegraph; Lôi Bộ alias roll chung. Lôi Nhảy vẫn dùng dash tức thời của skill cũ, chưa chuyển thành timeline travel đầy đủ.

Quái đánh thường khóa hướng, có windup và cảnh báo cone trước damage; laser/kiếm khí đã chuyển projectile; damage kiểm tra hitbox sau di chuyển, LOS và va chạm swept projectile. `player_gunner` debug có ba skill Lôi để thử cùng năm súng và kiếm.

Auto quái chạy trong core qua intent SET_FARM; giới hạn quanh điểm bật, phản ứng sau thời gian cấu hình, dùng skill/basic/reload bình thường và giữ MP dự phòng. HP thấp/túi đầy thì dừng, thao tác tay ngắt auto. Đây là auto cơ bản: chưa có bộ tùy chọn farm, ưu tiên mục tiêu, tự dùng thuốc, stuck recovery hoặc màn lý do dừng.

Còn lại: action timeline hợp nhất; đổi hành late game bằng chi phí/transaction; starter unlock theo progression; kit tám Đạo; balance/proc cap; VFX riêng, animation jump chuẩn và đánh giá cảm giác trên thiết bị thật. Bản này **không nghiệm thu toàn bộ P0–P5**.

Kiểm chứng: unit/integration test core/API/persistence; typecheck các workspace; data validator; depcruise; build web; responsive audit trên 9 kích thước. Test sim bao gồm đủ 25 cặp hành, projectile hit/miss/tường, roll/jump, quái windup, save affinity và auto.

## Bản tiếp tục P0 — contract damage chung

`DamageSpecSchema` đã có trong game-data: multiplier, flat, elementalShare, critBonus và canCrit. Effect damage của skill kế thừa schema này; YAML cũ giữ nguyên ID/field và vẫn validate. Skill dùng tỷ lệ hành ở effect nếu có, sau đó tới skill và combat rules. `canCrit: false` chuẩn bị contract cho damage định kỳ; chưa có runtime DOT/status mới.

Kiếm, súng, skill và đánh thường quái dùng cùng resolver: attack × multiplier + flat → distance/position → phần vật lý/nguyên tố và defense → variance/crit → realm/backlash → làm tròn một lần cuối. Graze/falloff và back/flank là hệ số độc lập. Sát thương có thể lệch 1 đơn vị so với cách làm tròn hai lần cũ; cần playtest cân bằng tiếp.

Mỗi swing, windup quái, cast và shot lưu bản chụp attack/crit/realm/backlash/hành/biểu hiện lúc bắt đầu. Projectile giữ bản chụp này tới impact; đổi trang bị hoặc buff trong lúc đạn bay không thay đòn đã phát. Defense, hành và trạng thái né của mục tiêu vẫn đọc ở lúc chạm. Projectile skill có nhiều effect damage chỉ phát một đạn, mỗi payload áp một lần khi trúng.

P0 **chưa hoàn tất**; phần timeline và travel đã được tiếp tục ở bản dưới. Starter/unlock giữ trong rollout P1, đồng thời migration P0 phải bảo toàn unlock cũ. Kit tám Đạo, đổi hành late game, DOT/proc cap và nghiệm thu thiết bị giữ ở roadmap.

Kiểm chứng bản tiếp tục: 137 test trên 22 file qua (17 test contract/snapshot mới, gồm đạn súng, skill, melee, live defense và multi-effect); typecheck cả 20 workspace qua; 291 file game-data validate; depcruise không có vi phạm. Biome qua trên 9 file code thay đổi; lint toàn repo còn 106 lỗi baseline ngoài phần này (chủ yếu định dạng). Chưa đo lại cảm giác/cân bằng trên thiết bị thật.

## Bản tiếp tục P0 — timeline và cờ combat

`ActionTimingSchema` khai báo windup/active/recovery, luật hủy windup và mốc hủy recovery theo giây; sim lượng tử hóa 20 Hz. `ActionState` dùng chung cho skill, melee, mobility, windup quái và súng; snapshot đưa ID/tick/hướng sang client. Protocol v10; event ra đòn, projectile, impact và damage giữ `actionId` của cùng đòn, kể cả khi đạn chạm sau recovery.

Lôi Ảnh Trảm dùng YAML: gồng 0.1 s, travel 0.3 s, recovery 0.2 s, hủy recovery từ 0.1 s. Di chuyển theo tick, khóa hướng, chặn nav/tường và gây damage một lần tại điểm dừng thật. Hủy windup không hoàn MP/cooldown. Melee vẫn cho vừa đi vừa đánh; steering xóa buffer combo/tiếp cận, giữ hướng swing. Pending cast kiểm tra lại MP/cooldown khi vào tầm. Súng chụp offense/hướng ngay từ lúc nâng nòng.

`COMBAT_RULESET=elements_v1|classic` được validate lúc server boot, cố định trong mỗi World/room và thông báo trong join/metadata. `classic` tắt hệ số khắc chế; vẫn giữ bản mệnh/biểu hiện trong DB/save. Cờ này chỉ rollback luật khắc chế, chưa rollback content/delivery/timeline. LocalSimHost nhận cùng option và giữ qua chuyển map. Server không đọc cờ combat từ intent hoặc URL của client.

Audit P0 cuối (cập nhật sau các mốc triển khai):

Kiểm chứng mốc này: 145 test trên 23 file qua; typecheck 20 workspace; 291 YAML validate; depcruise 160 module/526 dependency không vi phạm; Biome trên code thay đổi và `git diff --check` qua. Test mới chứng minh leap đi nhiều tick/khóa hướng/impact một lần/chặn tường, windup cancel không refund, recovery lock, counter cycle hợp lệ, classic giữ affinity và súng giữ offense/actionId qua nâng nòng→impact. Chưa nghiệm thu toàn bộ P0 hoặc kiểm chứng visual tạo nhân vật mới.

| Yêu cầu P0 | Bằng chứng nghiệm thu | Kết luận |
| --- | --- | --- |
| Mapping/ma trận/schema | `elements-combat.test.ts`: đủ 25 cặp, partial share, neutral, biểu hiện và chu kỳ đủ 5 hành; `schemas.ts`/`bundle.ts` và validator qua 291 YAML; core/API dùng mapping YAML | Đạt; đổi mapping về sau cần data + DB migration tương ứng |
| DamageSpec | `damage.test.ts`: resolver chung, một lần làm tròn, variance/crit/realm/backlash, snapshot offense/live defense, projectile nhiều payload; melee/súng/quái/skill dùng chung resolver | Đạt |
| Action timeline | `action-timeline.test.ts`/`ranged.test.ts`/`elements-combat.test.ts`: prepare→movement→collision; lunge, blink và dash đi ở phase movement; six-tick leap; hướng khóa; cancel không refund; TTL một buffer/approach; mobility thay basic windup; relative swept bullet/hitscan cuối tick; death/takeover/portal reset | Đạt |
| Migration | SQL 0006–0009 + `combat-migration.test.ts` áp migration thật lên DB trước bản mệnh, giữ node/quest/gear/wallet/CD/unlock, audit revision và chọn gunner một lần; `save-migration.test.ts` giữ save v2 qua transfer/classic; `skill-loadout.test.ts` giữ alias và tách layout theo nhân vật | Đạt |
| Feature flag | `config.test.ts`: default/enum/production guard; immutable World/room flags, join/metadata mang cùng modes; `save-migration.test.ts`/`elements-combat.test.ts` giữ affinity/revision/unlock/cost khi chuyển classic | Đạt; classic chỉ tắt multiplier khắc chế, không giả lập lại toàn bộ timing cũ |
| Protocol/replay | Protocol v10, action/projectile/event IDs; `net.test.ts` chống trùng từng event, không gộp multi-effect; `sim-host/index.test.ts` replay 200 tick cả classic/elements_v1 qua local/Worker; `combat-replay.test.ts` replay 160 tick qua socket Colyseus thật, AOI delta/private state/events và thử gửi event trùng; `server.test.ts` takeover/portal/reconnect | Đạt |
| Preview tạo nhân vật/HUD | `element-preview.ts`: đủ 5 hành/Lôi/Băng, kiếm/súng, basic/roll/blink/jump, 63 ảnh/9 kích thước, vùng chạm ≥44 px và Low/reduced motion; `responsive.ts`: 9 kích thước → responsive audit OK; đã đọc ảnh phone/desktop | Đạt preview thiết kế P0; 3D/VFX riêng và thiết bị thật thuộc các phase sau |

## Bản tiếp tục P0 — migration, content và preview

Migration 0009 nâng save format lên v2, thêm revision bản mệnh và unlock đã học. Nhân vật `player_default` đã chơi giữ bảy ID Lôi; gunner đã chơi giữ bốn ID cũ nhưng vẫn phải chọn hành nếu chưa có. Nhân vật mới không nhận unlock prototype. Migration ghi `character.combat.migrate`; lựa chọn hành cũ ghi `character.element.choose` cùng transaction, regular save không ghi đè affinity/revision. Không chạy down migration khi rollback gameplay.

YAML tách hai starter skill (Hoàn Kiếm/Xuyên Tâm) khỏi `prototypeSkills`; node cũ và learned skills hợp lệ vẫn giữ. `COMBAT_CONTENT=starter|prototype` cố định trong World/room, production không cho prototype. Offline mặc định prototype để thử kit đầy đủ; server mặc định starter. Save v1 được nâng khi load, giữ prototype grant và cooldown; version tương lai bị từ chối. Layout v1 chỉ được nhận bởi nhân vật chọn đầu tiên, ghi envelope v2 một lần; các nhân vật sau có preference riêng. Alias `skill_thunder_step` remap sang `skill_roll` (nút mobility chung), cooldown alias vẫn khôi phục vào roll.

Kiểm chứng mốc này: full suite 153 test/25 file qua trước các test flag/mapping bổ sung; các gate config/content/mapping/transfer/persistence bổ sung 28 test/5 file qua; audit DB legacy và audit history qua. Typecheck 20 workspace, 291 YAML, build web và responsive HUD chín kích thước qua. `tools/smoke/element-preview.ts` dùng API fixture chỉ để nghiệm thu giao diện, không ghi tài khoản người chơi; đã chụp 63 ảnh, kiểm đủ năm hành/Lôi/Băng/bốn động tác/kiếm/súng/vùng chạm/Low. Đã đọc ảnh desktop và phone 360 px. P0 vẫn chưa nghiệm thu cho đến khi pipeline và replay/transient-state gates còn lại hoàn tất.

## Bản tiếp tục P0 — phase skill/melee và timeout tiếp cận

Skill bắt đầu ở phase chuẩn bị, sát thương instant cũng chờ tới sau di chuyển. Dash không còn di chuyển trong resolver damage; travel 0.3 s dùng đúng sáu tick active. Skill ngoài tầm chỉ tiếp cận trong TTL `bufferSeconds` (150–200 ms), hết hạn xóa goal/target, không trừ MP hoặc bắt đầu cooldown. Tiếp cận xa bằng auto-attack vẫn là lệnh riêng; cần bấm skill lại khi đã vào tầm.

Melee tự bắt đầu trước movement; lunge được xử lý trước mọi skill/projectile collision. Payload swing hết recovery được dọn trước intent/buffer; request basic trực tiếp cũng dùng buffer action chung thay vì một queue combo riêng. Test tiếp cận cũ giữ lệnh năm giây được thay bằng tiếp cận gần trong TTL, đồng thời thêm regression cho lệnh xa hết hạn và instant skill trượt khi mục tiêu đã di chuyển khỏi tầm.

Kiểm chứng: toàn repo 158 test/26 file qua; typecheck core qua sau thay đổi fixture; Biome năm file phase/contract và `git diff --check` qua; depcruise 166 module/544 dependency không vi phạm. P0 vẫn còn phase chuẩn bị súng/quái, relative swept collision súng và replay/reset gates; chưa nghiệm thu toàn bộ.

## Nghiệm thu P0 — pipeline, reset và replay cuối

`World.step()` chuẩn bị input/auto/AI và các windup trước movement; ordinary movement, mobility, skill travel và melee lunge hoàn tất trước phase collision. Đạn súng dùng chuyển động tương đối giữa vị trí đầu/cuối tick của mục tiêu; hitscan dùng vị trí cuối tick. `SHOT.lens` cũng lấy ở collision để VFX không dừng tại vị trí cũ của mục tiêu. Không phát damage lúc bắt đầu instant cast hoặc di chuyển dash trong damage resolver.

`resetController` xóa input chưa xử lý và transient action khi takeover/transfer; server ngừng nhận intent từ session kicked/leaving trước khi chờ save. Death xóa trigger held/burst/reload, action/buffer/approach ngay khi chết; save/new spawn không mang các trạng thái này. Cooldown và MP đã tiêu vẫn giữ. Replay Colyseus dùng đồng hồ cố định chỉ trong test, nhưng chạy handler, socket, AOI delta decoder và private-state delivery thật; không dùng kết quả đó để kết luận latency hoặc performance production.

Mỗi `World.emit` cấp `eventId` tăng dần riêng cho từng payload, ngoài `actionId`/`projectileId`. Worker và Colyseus validate events bằng Zod, chống phát FX/feedback trùng trong cửa sổ 2048 ID, reset cửa sổ theo join. Payload damage thứ hai của cùng action không bị gộp; fixture legacy chưa có ID vẫn được đọc nguyên vẹn. Prediction/reconcile vị trí vẫn là phase riêng, HP/cooldown luôn authoritative.

Gates cuối tại local: **172 test/27 file**, **20 workspace typecheck**, **291 YAML validate**, **depcruise 167 module/553 dependency không vi phạm**, **build web/PWA qua**, **Biome 55 file thay đổi và git diff --check qua**. Smoke năm súng trên WebGL Low và cảm ứng qua: SHOT, damage quái thật, reload/overheat, đổi sang kiếm, giữ/nhả nút và không có page error. Preview 9 kích thước và responsive 9 kích thước chạy lại đều qua. Artifact ảnh nằm trong `reports/element-preview`, `reports/responsive`, `reports/smoke`, không đưa vào asset runtime đã commit.

`pnpm lint` toàn repo vẫn có **90 lỗi định dạng, 3 warning và 1 info baseline ở file ngoài thay đổi P0**; không tuyên bố global lint/CI xanh. Đây không phải phần gameplay còn thiếu của P0. Đã hoàn tất các contract và gate P0 trong bảng trên; P1–P5, balance/playtest, full eight kits, late-game đổi hành, status/CC mới và performance thiết bị thật vẫn theo scope gốc.

## 1. Mục tiêu và ràng buộc

- Combat trực tiếp mang cảm giác RPG lai MOBA: đánh theo hướng, giữ khoảng cách, né hitbox, combo và dùng skill đúng thời điểm; vẫn có click/tap chọn mục tiêu và tự tiếp cận.
- Mỗi nhân vật có một bản mệnh Kim/Mộc/Thủy/Hỏa/Thổ từ khi tạo; khóa đến late game. Đổi vũ khí, Đạo hoặc node không đổi bản mệnh. Debug được chọn hành.
- Mọi phái và súng đều tham gia cùng luật ngũ hành. Đánh thường mang hiệu ứng hành ngay từ đầu; Lôi có điện trên thân/vệt di chuyển/vệt kiếm/impact tương tự prototype đang có.
- Lộn nhào, tốc biến và nhảy là kỹ năng chung, không bị khóa bởi phái. Phần biểu hiện đổi theo hành nhưng độ an toàn và chi phí cơ bản tương đương.
- Mỗi bộ skill có tối đa một đòn damage khóa mục tiêu đáng tin cậy; phần còn lại phải có đường né bằng hitbox. Đòn định hướng vẫn có thể hụt. Hiểu cụm “định hướng … trúng” trong yêu cầu là nhu cầu có một ít kỹ năng dễ dùng, không biến mọi skillshot thành damage bảo đảm.
- Auto là cách điều khiển cùng nhân vật trong cùng sim, không được bỏ qua va chạm, cooldown, MP hoặc tầm đánh. Cho treo farm quái thường; boss/dungeon khó vẫn khuyến khích đánh tay.
- Giữ progression cảnh giới/node/mutation, **không thêm Character Level/XP** (D-024). Giữ server authoritative, sim 20 Hz, Zod, seed RNG, delta snapshot và preset Low.

Đọc cùng: [master](00_game_design_master.md), [tech](01_tech_stack_plan.md), [assets](02_assets_models_maps_plan.md), [roadmap](03_implementation_roadmap.md), [decision log](../decision_log.md), [UI](../game-ui-style.md), [performance](../performance_budget.md), rig/equipment/map contracts và art bible. Ưu tiên yêu cầu mới này khi mô tả combat cũ còn ghi auto attack kiểu MMORPG; các phần lore/economy/architecture khác vẫn áp dụng.

## 2. Audit source: tái sử dụng và khoảng trống

| Nền hiện tại                                                        | Evidence trong source                                                          | Hướng xử lý                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Combo 3 nhịp, buffer, nón đánh, lunge, grazing, thưởng hông/lưng    | `game-core/src/systems/melee.ts`, `game-data/combos`, `combo.test.ts`          | Tái sử dụng; tinh chỉnh timing và chuyển hình học dùng chung                                   |
| Nhịp 3 chọn variant ngẫu nhiên bằng RNG                             | `startSwing`/`pickVariant`, `combo_blade.yaml`                                 | Giữ biến thể hình ảnh; cùng reach/timing/damage gameplay để người chơi đoán được nhịp kết thúc |
| Năm kiểu súng, đạn, burst, reload/heat, ray/đạn bay, falloff        | `systems/ranged.ts`, `game-data/ranged`, `ranged.test.ts`                      | Tái sử dụng cadence và va chạm; thêm hành vào từng phát đạn                                    |
| Skill chỉ có `self/point/target`; effect dash/damage vòng tròn/heal | `game-data/src/schemas.ts`, `systems/skills.ts`                                | Thêm delivery/hit shape/time/status; tách chọn mục tiêu khỏi trúng đòn                         |
| Lôi Xuyên Tâm là target damage; projectile là biểu hiện             | `skill_thunder_pierce.yaml`, `resolveCast`, `thunder-fx.ts`                    | Chuyển sang đạn sim thật, không áp damage ở cuối cast                                          |
| Lôi Vực/tuyệt kỹ damage một lần                                     | YAML Lôi và D-032                                                              | Giữ burst trong slice đầu; chỉ làm field nhiều tick khi có lịch hit rõ                         |
| Quái đánh thường áp damage ngay khi đủ tầm                          | `combatSystem` trong `systems/combat.ts`                                       | Thêm windup/khóa hướng/impact shape như player; boss đã có point telegraph                     |
| Lôi Bộ/Lôi Ảnh Trảm hiện là dash tức thì có kiểm tra đường          | `systems/skills.ts`, `thunder-skills.test.ts`                                  | Tách roll/blink/jump dùng chung khỏi skill tấn công của Kiếm                                   |
| Hit-stop, sparks, camera, phản ứng đã có                            | D-031, `game-view.ts::presentMeleeHit`, `combat-fx.ts`                         | Hiệu chỉnh; `freeze`/`knock` hiển thị không phải stagger/knockback sim                         |
| Nhân vật mặc định có cả bảy skill Lôi                               | `game-data/characters/player_default.yaml`                                     | Trở thành kit debug; production mở skill dần bằng quest/node                                   |
| Tạo nhân vật chưa có hành                                           | `apps/api-server/src/app.ts` POST `/characters`, persistence schema/repository | Thêm bản mệnh xuyên API→DB→save→sim→snapshot                                                   |
| Loadout hiện là client localStorage, desktop/touch bốn slot         | `apps/game-web/src/skill-loadout.ts`                                           | Giữ preference bố trí; server xác nhận loadout combat, slot utility và unlock                  |
| Tám Đạo mới là thiết kế, chưa có tám hệ runtime hoàn chỉnh          | master §36; runtime hiện player_default/player_gunner                          | Không ghi là toàn bộ phái đã triển khai; rollout theo kit template                             |

Đường dẫn package trong bảng là tương đối với `packages/`. Không thêm full physics hoặc đưa Babylon vào core. Nav/circle obstacles hiện có chưa tự bảo đảm mọi skill bị tường chặn: phải khai báo và kiểm thử riêng.

## 3. Ba trục build, giữ đúng năm hành

`Build = bản mệnh ngũ hành × Đạo/weapon × biểu hiện/mutation`.

Ví dụ: Mộc + Kiếm + Lôi = Lôi Kiếm Tu; Thủy + Cơ + Băng = Băng Xạ Thủ; Hỏa + Trận = trận nhiệt/plasma. Lôi, Băng, Phong, Âm/Dương trong lore không tự tạo thêm hàng/cột khắc chế.

**Giả định thiết kế để tiếp tục:** Lôi là biểu hiện Mộc; Băng là biểu hiện Thủy. Đây là quy ước gameplay được đề xuất, không phải kết luận từ các nguồn kỹ thuật hoặc yêu cầu đã chốt của người dùng. Nếu Lôi được chọn thuộc Kim, chỉ đổi mapping data và migration; không đổi engine. Khí Hải/Reactor dùng cùng hành dù một bên gọi là linh khí, bên kia là lõi/đạn nguyên khí.

### 3.1. Khắc chế

Chu kỳ: **Kim khắc Mộc → Mộc khắc Thổ → Thổ khắc Thủy → Thủy khắc Hỏa → Hỏa khắc Kim**. Không áp dụng hai lần trên cùng đòn.

Ma trận đề xuất cho phần damage nguyên tố; hàng là hành đòn đánh, cột là bản mệnh mục tiêu:

| Tấn công ↓ / phòng thủ → |  Kim |  Mộc | Thủy |  Hỏa |  Thổ |
| ------------------------ | ---: | ---: | ---: | ---: | ---: |
| Kim                      | 1.00 | 1.15 | 1.00 | 0.90 | 1.00 |
| Mộc                      | 0.90 | 1.00 | 1.00 | 1.00 | 1.15 |
| Thủy                     | 1.00 | 1.00 | 1.00 | 1.15 | 0.90 |
| Hỏa                      | 1.15 | 1.00 | 0.90 | 1.00 | 1.00 |
| Thổ                      | 1.00 | 0.90 | 1.15 | 1.00 | 1.00 |

Neutral chỉ dùng cho vật thể/đòn không nguyên tố được chỉ định, không phải lựa chọn tạo nhân vật. Cùng hành không miễn nhiễm. Chưa thêm tương sinh giữa mọi cặp hoặc chuỗi phản ứng nguyên tố; số tổ hợp này làm onboarding và cân bằng phình ra.

### 3.2. Damage và khoảng cách

Một hit hợp lệ mới đi qua công thức:

`B = (attack × skillScale + flat) × distanceFactor × positionFactor`

`D = B × [(1 − elementalShare) × physicalMitigation + elementalShare × elementFactor × elementalMitigation] × critFactor × realmFactor × backlashFactor`

Giữ variance seed RNG hiện tại hoặc giảm biên sau playtest; làm tròn một lần cuối. DOT không tự crit, không double-dip hệ số ban đầu. Khi chưa có stat phòng thủ nguyên tố riêng, dùng defense hiện tại cho cả hai mitigation để tránh mở thêm hệ stat quá sớm.

- Đánh thường ban đầu đề xuất `elementalShare=0.30`, skill nguyên tố `0.70`; thành phần vật lý vẫn gây damage khi bị khắc. Cùng mitigation, basic thuận hành chỉ được +4.5% tổng damage, skill +10.5%; sai hành giảm tương ứng 3%/7%. Đây là điểm xuất phát để người chơi không phải reroll mới farm được.
- Cận chiến: tính khoảng cách mép hurtbox, full damage ở vùng hiệu quả, giảm liên tục ở mép ngoài (graze), ngoài hitbox là 0. Không giảm cận chiến vì “đứng quá gần”.
- Súng: damage theo quãng đường từ muzzle tới điểm chạm, giữ falloff hiện có; shotgun tốt gần, carbine trung, sniper xa. Không áp thêm khoảng cách tâm caster để giảm damage hai lần.
- Đạn pháp thuật: falloff là tùy chọn data; không mặc định mọi đạn càng xa càng yếu. AoE dùng khoảng cách từ tâm vùng, không phải từ caster.
- Back/flank thưởng nhẹ đề xuất 1.10/1.20, giảm so với combo prototype để không ép người mới vòng lưng. Giới hạn tổng position/graze multiplier bằng data.
- Vùng đánh, damage và CC độc lập: hit nặng không mặc định stun. Quái tinh anh/boss có stagger resistance và giới hạn bị khóa liên tiếp.

### 3.3. Identity năm hành

| Hành | Nhịp chiến đấu             | Status đầu tiên nên làm                 | VFX basic + di chuyển                                      | Trade-off                       |
| ---- | -------------------------- | --------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| Kim  | chính xác, xuyên, kết liễu | rạn giáp ngắn, không cộng dồn vô hạn    | vệt trắng bạc, mảnh sắc, lóe ngắn                          | vùng đánh gọn, cần vị trí       |
| Mộc  | bền bỉ, giữ áp lực         | dấu sinh khí; Lôi dùng tích điện        | lá/dải xanh; Lôi là tia xanh trắng trên kiếm và afterimage | burst vừa, cần nối đòn          |
| Thủy | kiểm soát nhịp, giữ cự ly  | slow nhẹ, Băng không đóng băng liên tục | vòng nước, hơi băng, vệt trôi                              | damage tức thì vừa              |
| Hỏa  | burst, damage duy trì      | burn ngắn có cap                        | lửa/cinders, impact cam đỏ                                 | phải đánh trúng để duy trì burn |
| Thổ  | vững, bảo vệ vùng, stagger | giáp tạm hoặc poise                     | bụi đá, vết nứt nhỏ, mảnh đất                              | kỹ năng nặng có báo trước       |

Ở slice đầu, khác hành bằng damage/VFX; đưa status vào sau khi kiểm chứng hitbox. Đánh thường nhịp 3 **trúng thật** mới tạo dấu hành; miss không cấp stack. Đặt ngân sách proc theo thời gian/damage gốc: shotgun không được proc 12 lần, auto gun không vượt melee chỉ vì nhiều bullet.

## 4. Gắn hành khi tạo, khóa và migration

- Đề xuất cho người chơi chọn một trong năm hành trên màn tạo nhân vật, có preview basic/mobility và lời giải thích 1 dòng. Người dùng yêu cầu “gắn một hành”, chưa yêu cầu random; chọn rõ ràng tránh reroll mù. Trong giả định mapping hiện tại, Mộc cho chọn biểu hiện Mộc hoặc Lôi ngay từ đầu để giữ fantasy Lôi Kiếm Tu; Băng có thể là biểu hiện Thủy học sau. Biểu hiện không đổi hành và mọi starter có power budget ngang nhau. Server validate enum/mapping rồi ghi một lần cùng transaction tạo nhân vật/wallet.
- Save có `innateElement`, `expression`, `elementRevision`; `expression` phải tương thích mapping và unlock. Không lấy hành từ appearance, class prototype, URL hoặc localStorage.
- Cột DB bản mệnh là nguồn sự thật. Save định kỳ không được ghi đè bằng giá trị client. Session/reconnect/portal/map-transfer phải giữ nguyên; migration tăng save/protocol version.
- Production không có intent đổi hành. Debug offline cho chọn hành và Lôi/Băng để thử cùng kit; online chỉ bật ở server dev có capability được xác thực. `?debug` trên client không cấp quyền. GM production phải theo RBAC/TOTP/audit của repo.
- Đề xuất late game từ Hóa Thần: quest tái cấu trúc Mảnh Thiên Tâm, vật liệu hiếm, tại safe hub ngoài combat và cooldown dài. Đổi qua transaction có idempotency/audit, giữ node/quest/equipment và revalidate mutation/loadout; không reset progression. Đây là mốc đề xuất, chưa khóa cứng trước playtest.
- Súng/kiếm kế thừa bản mệnh người cầm cho phần elemental damage và VFX. Item có socket/conduit phù hợp năm hành, không cho đổi hành tấn công bằng đổi magazine ở early/mid game. Đạn vật lý vẫn theo weapon archetype. Loot súng khác motif không khóa nhân vật khỏi sử dụng.
- Save prototype Lôi cũ: migrate Mộc + Lôi, giữ ID skill/equipment/node/cooldown hợp lệ. Save gunner/neutral chưa có hành: cho chọn một lần tại hub trước combat mới, ghi dấu migration để không chọn lại bằng reconnect. Không suy ra tất cả nhân vật cầm kiếm đều là Lôi.
- Giữ alias ID cũ, migration loadout theo nhân vật và remap `skill_thunder_step` sang roll biểu hiện Lôi. Skill học từ node cũ không mất: giữ unlock, chỉ sửa slot/delivery. Tránh downgrade grant cả bảy skill cho production mới.

## 5. Mobility chung và luật hành động

| Kỹ năng  | Thiết kế đề xuất ban đầu                                               | Luật né/va chạm                                                                               | Học và auto                                                  |
| -------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Lộn nhào | 3 m, 0.30 s, hồi 5 s; resource riêng để không hết MP là mất né         | kiểm tra đường, i-frame damage 0.10–0.20 s giữa roll; không tự thoát hard CC                  | mở đầu; auto chỉ dùng cho telegraph nguy hiểm                |
| Tốc biến | tối đa 4 m, hồi 14 s                                                   | kiểm tra cả hành lang và landing, không xuyên tường/nav gap; không i-frame kéo dài            | mở qua tutorial sớm; auto mặc định tắt để tránh lao vào pack |
| Nhảy     | 0.45 s; height chỉ presentation, ground pos do sim điều khiển; hồi 3 s | không xuyên tường; chỉ né đòn gắn `groundLow` trong cửa sổ airborne, vẫn bị đạn/AoE khác đánh | mở tutorial; auto chỉ nhảy nếu threat có tag phù hợp         |

Tất cả số liệu chuyển sang tick (0.05 s/tick); không hứa i-frame theo frame renderer. Jump không yêu cầu physics 3D. Nếu chưa có clip KayKit phù hợp, ghi placeholder, giữ preview rõ; không đổi tên dash thành jump rồi tuyên bố đã có nhảy.

- Baseline ba action giống nhau cho mọi hành/phái. Tia sét/lá/nước/lửa/đá không gây damage tự động; mutation tấn công là skill riêng có chi phí/telegraph. Lôi Ảnh Trảm vẫn là dash-chém của Kiếm, khác roll chung.
- State: `idle/move → windup → active → recovery`; mobility ưu tiên hơn buffer basic. Cho cancel windup trước commitment hoặc recovery sau impact theo data; một cancel trước impact không được áp damage. Cooldown/resource đã tiêu không hoàn nguyên để spam feint vô hạn.
- Buffer một action có TTL đề xuất 150–200 ms; không giữ lệnh skill vài giây. Manual move/stop hủy queued approach và takeover auto ngay tick kế tiếp. Hướng khóa trước active, không “bẻ kiếm” theo target giữa impact.
- Không thể thực hiện roll/blink/jump đồng thời; shared mobility lock ngắn, cooldown riêng. Khi chết/portal/takeover phải xóa buffer/action tạm.
- HUD: ba skill chính + một slot utility/tuyệt kỹ theo loadout, không bắt bấm cả bảy skill. Roll có nút trực tiếp; blink/jump qua cụm utility có thể đổi lựa chọn. Desktop có bind riêng cho cả ba; touch có tùy chọn pin cả ba và phải nghiệm thu 44 px, dọc/ngang, tay trái/phải. Không yêu cầu đổi utility menu trong lúc đang cần né gấp.

## 6. Kit tám Đạo và giới hạn damage khóa mục tiêu

Q/W/E/R dưới đây là tên slot thiết kế, không ép thay phím hiện tại. Mỗi kit gồm passive + basic + ba skill chính + một tuyệt kỹ, chọn utility theo layout. Hai skill Q/W mở trước; E/R mở bằng quest/node/cảnh giới. Không mở 5×8 kit độc lập: dùng template hình học + overlay hành.

Ký hiệu: **H** = hitbox có thể né; **T** = target assistance/khóa mục tiêu nhưng vẫn kiểm tra tầm, LOS và trạng thái khi resolve; **S** = self/support, không là damage chắc trúng. Tối đa 1 skill damage T trong loadout, tính cả pet/turret/mutation. Aim assist không phải T.

| Đạo        | Basic/passive                                                          | Q                                          | W                                | E                                                             | R                                       | Cách chơi và auto                                                                                           |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------ | -------------------------------- | ------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Kiếm       | chém phải–trái–chém nặng; nhịp 3 cấp ấn khi trúng                      | Phi Kiếm: đạn thẳng H                      | Hoàn Kiếm: nón/vòng quanh thân H | Ảnh Trảm: dash + nón ở landing H                              | Kiếm Vực: vùng báo trước H              | melee cơ động, combo; auto giữ vùng full hit, không dash vào pack mới                                       |
| Thể        | quyền–cước–trọng quyền; poise theo nối đòn                             | Phá Sơn: capsule ngắn H                    | Cường Thể: guard có thời hạn S   | Chấn Địa: vòng sóng groundLow H                               | Bá Thể: buff và chấn động báo trước S/H | tank/brawler, khoảng cách gần; auto guard trước threat, không vĩnh viễn stagger boss                        |
| Pháp       | pháp cầu 3 nhịp, nhịp 3 rộng hơn, không homing mặc định                | Linh Tiễn: đạn H                           | Pháp Ấn: vòng báo trước H        | Hộ Pháp: shield S                                             | Thiên Tượng: nhiều vùng có lịch hit H   | ranged/AoE; auto aim nhẹ theo velocity quan sát được, giữ MP dự phòng                                       |
| Trận       | phù chú 3 nhịp, nhịp 3 gia cố trận đang đặt                            | Đặt Trận: point field H                    | Kích Trận: pulse từ trận H       | Liên Trận: shield/beacon S                                    | Đại Trận: zone cố định H                | setup/control; auto đặt gần anchor, cap số trận, hết hạn/despawn rõ                                         |
| Ngự Thú    | roi/phù 3 nhịp; pet đồng hành có vòng đời                              | Thú Kích: ra lệnh lao cắn có windup H      | Đồng Tâm: heal/shield pet S      | Hợp Kích: nón player + pet H                                  | Bầy Thú: wave có đường đi H             | summon; pet cũng có hurtbox, báo đòn, leash; một pet chủ lực đầu tiên                                       |
| Cơ         | cadence theo súng; nhịp phản hồi 3 phát/cụm, không ép sniper bắn nhanh | Xuyên Giáp: charge shot có ray báo trước H | Lựu Nguyên Khí: đạn ném → AoE H  | Drone Hộ Vệ: shield/support S                                 | Pháo Kích: vòng báo trước H             | gunner; auto range theo súng, reload và LOS; turret chiến đấu là mutation sau                               |
| Ảnh        | đâm–cắt–kết liễu; back/flank thưởng hữu hạn                            | Ảnh Nhận: đạn hẹp H                        | Màn Ảnh: cloak ngắn S            | Truy Ảnh: chọn target để tới vị trí hợp lệ, sau đó nón chém H | Vô Ảnh: nhiều nhát theo đường đã báo H  | assassin; chọn target không bảo đảm chém trúng; auto không teleport qua tường                               |
| Hỗn Nguyên | giữ basic của weapon; passive ổn định lõi                              | Luân Kích: template từ Đạo chính H         | Cộng Hưởng: vùng nối hai nguồn H | Điều Hòa: buff/giảm tải S                                     | Hợp Nhất: combo liên hợp có lịch H      | late game; kết hợp tối đa hai Đạo, một bản mệnh, cùng quota T; không sở hữu hai bộ cooldown để double burst |

Kit mặc định trên đều né được; có thể chọn **một mutation dễ dùng T** đổi lấy tầm/damage thấp hơn, bỏ xuyên/AoE: Kiếm “Kiếm Ấn”, Pháp “Linh Chỉ”, Cơ “Đạn Dẫn”, Ảnh “Truy Dấu”. Thể có thể giữ toàn H/S; Trận dùng T đánh dấu vị trí chứ không auto damage; Ngự Thú có target order nhưng cú cắn vẫn H. Hỗn Nguyên thừa hưởng quota, không cộng quota của hai Đạo. T không có phép hạ boss instant và không được ngụy trang bằng VFX đạn né được.

### 6.1. Overlay hành cho toàn bộ Đạo

Overlay này áp vào kit trên; mỗi ô là mutation signature đề xuất sau slice, không phải thay toàn bộ skill và không phát proc miễn phí từ mỗi effect:

| Đạo        | Kim               | Mộc/Lôi                                         | Thủy/Băng            | Hỏa                   | Thổ                     |
| ---------- | ----------------- | ----------------------------------------------- | -------------------- | --------------------- | ----------------------- |
| Kiếm       | nhát xuyên ngắn   | nhịp 3 giải ấn điện                             | cung nước/slow       | vệt chém burn         | heavy tăng poise damage |
| Thể        | quyền rạn giáp    | quyền tích ấn                                   | phản đòn slow        | trọng quyền bộc nhiệt | guard tốt, chấn đất     |
| Pháp       | tiễn xuyên 1 body | tiễn điện; chain chỉ sau hit hợp lệ, cap target | băng tiễn, vùng nước | cầu lửa/burn          | đá bay, vùng địa chấn   |
| Trận       | trận phá giáp     | trận sinh khí/điện                              | trận slow            | trận nhiệt DOT        | trận phòng hộ           |
| Ngự Thú    | thú giáp sắc      | thú mộc/lôi                                     | thú thủy/băng        | thú lửa               | thú thổ/guard           |
| Cơ         | đạn bạc xuyên     | đạn điện, drone lôi                             | đạn băng slow        | đạn nhiệt/burn        | đạn nặng stagger        |
| Ảnh        | đâm rạn giáp      | ảnh điện                                        | màn sương, dao băng  | dao nhiệt             | ảnh bụi, shield ngắn    |
| Hỗn Nguyên | giao thức xuyên   | giao thức điện/sinh khí                         | giao thức làm lạnh   | giao thức quá nhiệt   | giao thức ổn định       |

Một status signature/hành ở lần rollout đầu. “Chain Lôi” phải có bán kính/LOS/giới hạn và nguồn damage rõ; không biến thành một nhóm T không giới hạn. DOT/thú/trận/súng đều dùng cùng `DamageSpec` và hệ số hành, không có công thức riêng bỏ khắc chế.

### 6.2. Súng có ngũ hành và cảm giác 3 nhịp

| Weapon hiện có | Tầm/vai trò        | Nhịp basic                                  | Nguyên tắc                                                 |
| -------------- | ------------------ | ------------------------------------------- | ---------------------------------------------------------- |
| Pistol         | gần–trung, cơ động | 1–2–phát nhấn thứ 3                         | nhịp 3 mạnh về sound/recoil; proc theo ngân sách           |
| Carbine        | burst trung        | cụm 3 viên đã có                            | ba projectile độc lập, không phải một hit chắc chắn        |
| Rifle          | giữ cò, DPS trung  | chia chuỗi thành cụm phản hồi 3             | giữ fireInterval, không thêm hit-stop mỗi viên             |
| Shotgun        | gần, spread        | ba lượt bóp cò                              | cap damage/proc mỗi shot; pellets có wall/body collision   |
| Sniper         | xa, windup/reload  | chu kỳ ngắm–nổ–nạp; phản hồi mạnh từng phát | không ép combo 3 phát, charge/định hướng báo trước khi PvP |

Muzzle flash, tracer, đạn, impact và sound phụ kế thừa hành; sound cơ khí của súng còn nguyên. Low vẫn thấy đường đạn và dấu chạm. Early game dùng đạn bay có tốc độ hữu hạn; hitscan chỉ dùng ở variant có windup/đường ngắm rõ, không gọi là “đạn bay có thể né sau khi bắn”. Né hitscan bằng tránh aim/LOS trước lúc fire.

## 7. Chuyển đổi bảy skill Lôi đang triển khai

| ID giữ ổn định            | Trạng thái hiện tại                      | Thiết kế mới và reuse                                                                                         |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `skill_thunder_step`      | dash 4 m, instant, 4 s CD                | alias của roll chung biểu hiện Lôi; tái dùng Dodge_Forward_InPlace, tia sét di chuyển; không thêm damage      |
| `skill_thunder_leap`      | dash 5 m + vòng chạm landing             | E Kiếm: dash-chém có travel ticks, khóa hướng và nón landing; có thể hụt; không thay jump chung               |
| `skill_thunder_arc`       | vòng damage quanh caster                 | W Kiếm: windup→vòng/cung impact, rời vùng né được; giữ spinning clip/thunder_arc                              |
| `skill_thunder_field`     | point circle, một burst                  | mutation Kiếm Vực, point khóa khi cast, telegraph rõ; field tick là phase sau                                 |
| `skill_thunder_pierce`    | target instant damage sau cast           | Q Kiếm: capsule projectile sim; giữ đường điện nhưng impact xảy ra lúc collision; target chỉ giúp aim ban đầu |
| `skill_thunder_execution` | target melee damage với kiểm tra tầm nới | heavy finisher/mutation nón hẹp; bỏ range grace `range × 1.5 + 1`; damage dùng hitbox tại active              |
| `skill_thunder_judgement` | point burst 5.5× sau 1.1 s               | R Kiếm: AoE telegraph cố định, một burst ở slice; sau đó mới thêm lịch strikes có tổng damage được chia       |

Giữ `lightning.ts`, pool/thin instances, `thunder-fx.ts`, media/clip/sfx đã vendor. Bổ sung profile cơ bản năm hành dùng chung primitive; Lôi tiếp tục là expression cao hơn với tia điện, không chỉ đổi màu. Không viết năm module copy logic damage. VFX multi-strike phải khớp số/lịch hit sim; nếu chỉ decorative, phần phụ mảnh và không có vòng cảnh báo mới.

## 8. Hitbox và quái: đúng hình học trước khi thêm độ khó

### 8.1. Delivery chung

Data tách `aimMode` (self/direction/point/target) khỏi `delivery` (melee/projectile/field/targeted/support). Hurtbox là circle/capsule XZ quanh chân; vũ khí/đầu chibi không là body damage riêng. Hit shape gồm cone, circle, capsule/segment; box/ring chỉ thêm khi có use case. Không mesh collision theo từng xương.

- Melee/AoE resolve ở active tick; projectile kiểm tra swept segment từng tick, cộng bán kính body; đối tượng di chuyển nhanh dùng relative sweep từ vị trí trước→sau để tránh xuyên qua nhau trong một tick.
- Đòn chém di chuyển dùng swept capsule trong active window, lưu `hitIds` để một swing không đánh lặp mỗi tick. Multi-hit/field có hit interval và cap riêng.
- Bắt đầu từ helpers `bodiesOnRay`, `wallDistance`, cone check đang có; tách module hình học thuần TS, không xây engine ECS mới. Broadphase spatial grid/AOI candidates, tránh mỗi đạn quét cả world.
- `blockedByWalls`/LOS policy là data. Vùng đặt sau tường phải qua validate; circle wave không mặc định xuyên tường. Impact point đứng yên sau telegraph; nếu skill tracking, báo rõ trước và có giai đoạn khóa hướng đủ để né.
- Mọi hit đi qua cùng thứ tự: alive/hostility → shape/LOS → invulnerability/airborne tags → damage → status/stagger → event. Roll/jump phải bảo vệ được trước monster basic, projectile, field/DOT theo tag thiết kế; không chỉ chặn một hàm skill.
- PvP không mặc định rewind mạnh đòn cận chiến/telegraph vì làm người đã né vẫn bị đánh. Slice đo ping trước; prediction vị trí/animation không tự quyết damage. Nếu thêm lag compensation, cần budget thời gian và test công bằng riêng.

### 8.2. Quái cũng có thể né và bị né

Quái thường chuyển attack instant sang `windup→active→recovery`, nhìn mục tiêu trong phần đầu windup rồi khóa hướng/điểm; sau khóa không bám aim đến lúc chạm. Không thêm dodge vô hạn cho mọi quái:

| Quái          | Thiết kế đầu game                          | Khả năng né player                                                      |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Sói/cận chiến | nón cắn, báo trước đề xuất 0.5–0.7 s       | đi/chase tự nhiên đã có thể rời hitbox; một sidestep có CD sau tutorial |
| Hồ ly/pháp    | đạn hữu hạn, hành động phát rõ             | reposition sau cast, không né mọi projectile                            |
| Robot/súng    | line windup + projectile                   | tìm LOS/giữ range; không biết input/đường aim chưa phát của player      |
| Tinh anh      | phối hợp hai shape, 0.6–0.9 s với đòn nặng | dodge theo threat quan sát, có delay và cooldown                        |
| Boss          | telegraph 0.9–1.2 s mở đầu, lớn và rõ      | movement/phase tạo hụt tự nhiên; không auto i-frame mỗi finisher        |

Cho enemy aggression budget ở vùng tutorial: 1–2 quái chuẩn bị đòn nguy hiểm đồng thời, số còn lại reposition. Không để stagger một con khiến con khác lập tức thay thế đòn nguy hiểm trong cùng nhịp. Boss dùng poise break window thay vì stun-lock.

## 9. Auto farm trong cùng sim

Ba mode: **Manual**, **Assist** (auto basic/approach mục tiêu đã chọn), **Farm** (tìm quái trong anchor và rotation). Mode/rotation là cấu hình server validated; không gửi một intent mỗi frame từ React.

State machine: `scan → approach → attack/rotation → evade → recover → loot → scan`; `returnAnchor/stop` khi vượt leash, thiếu MP/thuốc, HP nguy hiểm, inventory đầy, hết target hoặc bị kẹt.

- Ưu tiên: sống sót → threat né được → giữ range/LOS → skill AoE đủ quái → basic → loot an toàn. Rule đơn giản đọc snapshot sim; chưa cần behavior tree phức tạp.
- Đo threat từ telegraph đã công khai; dùng reaction delay đề xuất 200–350 ms và evade cooldown, không nhìn input của player hay RNG tương lai. Không aim hoàn hảo theo vị trí tương lai.
- Với melee chọn khoảng cách nằm trong full-damage band; súng giữ band phù hợp và reload. Hysteresis để tránh chạy tới/lùi mỗi tick; khi path không tiến triển thì bỏ target và quay anchor.
- MP reserve cho utility, cap kéo pack, không vượt anchor để đuổi mục tiêu. Loot đi qua ownership/intent sim; farm không tự nhận thêm gold/items từ client.
- Người chơi bấm move/cast/roll/stop thì auto nhường trong tick kế tiếp, giữ thời gian grace trước khi auto tự tiếp tục. Có nút stop rõ; bị PvP/manual threat thì dừng farm để người chơi xử lý.
- Farm đủ an toàn ở quái thường cùng tier; mục tiêu đề xuất hiệu suất 65–80% của người chơi tay có kỹ năng trong cùng build/bãi/điều kiện. Đạt bằng quyết định đơn giản, không buff damage đánh tay hoặc giảm reward auto bí mật.
- Treo với session online chạy server, client có thể giảm rendering. Không bảo đảm tab browser ngủ vẫn chạy Worker offline. Hiện server có cửa sổ reconnect và despawn khi leave: phase đầu chỉ farm khi session còn sống; mất kết nối vượt grace thì stop/save. **Farm khi đóng app/offline dài là feature riêng**, cần lease/session persistence/economy/load budget, không tuyên bố đã có chỉ vì thêm auto toggle.
- Chạy AI farm ở cadence thấp hơn tick nếu được, nhưng movement/hit/damage luôn 20 Hz. Mob đang combat không được giảm simulation LOD làm mất telegraph/hit.

## 10. Mượt và đã tay, onboarding nhẹ

### 10.1. Combo và phản hồi

Đề xuất thử basic melee: nhịp 1 windup 0.20 s + recovery 0.15 s; nhịp 2 0.20 + 0.15; nhịp 3 0.30 + 0.25; combo reset 0.9–1.0 s. Đây là mục tiêu tuning, **phải căn frame contact của clip/animSpeed thật**, không tăng tốc clip tùy ý khiến chân trượt. Lunge ngắn không xuyên wall, root-motion dùng in-place như D-031.

- Nhịp 1/2 trail nhỏ, âm thanh gọn; nhịp 3 anticipation + trail mạnh + bass/impact + recoil. VFX khởi đầu/travel được phát theo action; sparks trúng, damage text, stagger chỉ theo hit xác nhận. Hụt chỉ có tiếng gió/vệt hụt.
- Giữ hit-stop hiện có 50/120 ms làm baseline; thử 30–50 ms nhẹ, 70–100 ms nặng. Chỉ freeze presentation của nhân vật liên quan, sim/network không dừng; không cộng hit-stop cho từng pellet/mỗi tick DOT. Không kéo root hurtbox lệch nhiều trong thời gian freeze.
- Knock ở renderer là cảm giác, không đổi target.pos. Knockback gameplay phải server-authoritative và clamp/nav-check. Không đẩy quái liên tiếp ra ngoài reach nhịp 2/3; boss giảm displacement.
- Mỗi hành có texture/shape/sound/impact signature ở basic ngay nhịp 1, mạnh hơn ở nhịp 3. Lôi: điện tích lúc gồng, ribbon điện, nứt sáng/tia vào điểm chạm; Thổ: vệt bụi/đá, không đổi thành damage vòng lớn ngoài hitbox.
- Giữ camera shake có cap và option giảm/tắt, không đổi camera hướng aim. Ưu tiên telegraph nguy hiểm hơn FX bạn bè; Low bỏ phụ kiện sáng nhưng giữ outline/đường đạn/cảnh báo/chạm.
- Local input được preview pose/aim sớm; reconcile theo sequence/actionId, dedupe event khi replay. Chỉ thêm movement prediction ở phase riêng khi đo latency; không sửa HP/cooldown dựa trên prediction.

### 10.2. Dạy người mới theo hành động

1. Tạo nhân vật: chọn hành, preview một combo, không yêu cầu học ma trận/40 build.
2. Tutorial đầu: move + giữ/nhấn basic → combo tự nối; quái cùng/neutral matchup để học reach.
3. Một telegraph chậm: học roll; aim assist rộng có giới hạn, vẫn phải thật sự chạm hitbox.
4. Mở Q và W, blink/jump qua bài ngắn; không bắt sử dụng cả ba mobility trong một encounter.
5. Quái thuận hành xuất hiện trước, sau đó một matchup bị khắc nhưng vẫn đánh được. Tooltip “Khắc/ bị khắc” bằng glyph + chữ, không chỉ màu.
6. Quest/node mở E rồi R; Farm mở sau khi học né, preset rotation an toàn; PvP/hybrid/chain reactions để sau.

HUD tuân [Kenney Fantasy Glass](../game-ui-style.md): mở rộng `fantasy-glass.css`, token/HUD hiện có, icon/media đã duyệt; màu hành chỉ trong glyph/skill/telegraph, không nhuộm toàn panel. Giữ reduced transparency, Low, keyboard focus và safe area. Không khóa nguyên tố sau một lựa chọn UI không rõ ràng.

## 11. Contract kỹ thuật cần thêm

Bảng dưới đây là contract mục tiêu; phần ngũ hành, mobility/projectile và DamageSpec đã triển khai như báo cáo phía trên. ActionState/timeline đã được triển khai và nghiệm thu P0 ở các mốc trên; status/stagger, loadout/auto preset và đổi hành late game còn trong roadmap:

| Tầng               | Thay đổi dự kiến                                                                                                                        | Gate                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `game-data` + YAML | `elements/`, biểu hiện tương thích, counter matrix; skill delivery/shape/windup/active/recovery/LOS, DamageSpec, auto policy            | validate references, quota T, max ranges, finite values, effect/proc caps; stats chỉ trong data |
| `game-core`        | Element component, ActionState, mobility, geometry/hit resolver dùng chung, status/stagger, auto driver                                 | deterministic ticks/RNG; không DOM/renderer; không damage hai đường                             |
| `game-protocol`    | enum hành; intent aim direction/point, mobility, mode/loadout; event actionId/projectileId/element/hit position; snapshot action timing | Zod bounds, ownership, sequence, protocol compatibility, delta roundtrip                        |
| `persistence`/API  | bản mệnh immutable sớm, migration/save version, late-game change transaction                                                            | create/reconnect/map transfer không mất hành; debug không ghi production                        |
| server/SimHost     | capabilities debug, auto runtime, reconnect stop policy; Worker/local có cùng content                                                   | parity offline/online; session takeover không sinh hai auto player                              |
| Babylon renderer   | profile năm hành + Lôi, reuse pool/trail/thin instance, event→FX mapping                                                                | travel/impact khớp sim, lifecycle dispose, Low readability                                      |
| web/input          | create preview, aim/quick cast, mobility controls, loadout/auto preset                                                                  | không per-frame React state; HUD ≤10 Hz; desktop/touch/gamepad                                  |

Content giữ shape và DamageSpec nguyên gốc; runtime action/projectile lưu hành/mutation **lúc phát**, không đọc lại vũ khí đã đổi giữa đường. Mục tiêu phòng thủ dùng hành hiện tại hợp lệ; late-game đổi hành không được thực hiện khi đạn còn đang combat. Cooldown là skill slot/family hợp lệ, không reset bằng đổi loadout/vũ khí. Giới hạn projectile/field/status để hoạt động không tăng vô hạn; không silently xóa đạn đã phát mà vẫn tiêu resource khi pool đầy: validate capacity/policy và emit reject rõ.

Pipeline trước P0 từng chạy skill/combat/melee/ranged trước movement. P0 đã đổi và nghiệm thu theo thứ tự: intents/auto/AI → bắt đầu action → movement/mobility → active collision/projectile → damage/status/life → snapshot/events. Ghi vị trí trước/sau movement để sweep; không thêm một resolver trước và một resolver sau cùng tick. Kiểm tra pending approach, cast tự tiếp cận, lunge, portals và action chết theo thứ tự mới.

## 12. Lộ trình triển khai, phụ thuộc và nghiệm thu

Ưu tiên combat trước marketplace/social mới. Đây là thứ tự thực hiện đề xuất; chưa phải báo cáo tính năng đã xong.

| Phase                      | Deliverable cụ thể                                                                                                                                                    | Điều kiện xong                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| P0 — contract ✅           | mapping 5 hành/biểu hiện, DamageSpec/action timeline, migration và feature flag                                                                                       | đã nghiệm thu local: ma trận/schema, audit save cũ, preview tạo nhân vật/HUD, pipeline/reset/replay           |
| P1 — playable combat slice | chọn/khóa hành từ API→DB→sim; debug chọn đủ 5; basic kiếm và pistol có VFX hành; roll/blink/jump; một quái melee và ranged dùng hitbox; Lôi Xuyên Tâm projectile thật | demo đánh tay/né/khắc chế/reconnect chạy Low + online; không trúng ngoài hitbox; không thêm status phức tạp  |
| P2 — feel và auto          | tuning combo, assist/buffer/cancel, geometry sweep, safe Farm, range hysteresis; finish chuyển cả bảy Lôi và 5 súng                                                   | takeover ngay, auto không gian lận, farm 30 phút ổn định, mob và projectile né được; timing clip khớp impact |
| P3 — toàn bộ Đạo           | Thể/Pháp/Trận/Ngự Thú/Ảnh theo kit, five-element overlays, một status/hành, mutation/quota T                                                                          | kit matrix đủ 7 Đạo early/mid; each basic/Q/W/E/R có delivery/counterplay/auto policy, balance theo role     |
| P4 — late game             | Hỗn Nguyên hai Đạo, progression/unlock/balance; đổi hành quest+transaction; elite/boss/hybrid                                                                         | đủ 8 Đạo; không bypass quota/cooldown; đổi hành/reconnect/idempotency không reset tiến độ                    |
| P5 — nghiệm thu            | benchmark thiết bị, latency tests, tune manual vs auto và onboarding                                                                                                  | gates dưới đây có số đo; chưa có thiết bị thì ghi chưa nghiệm thu, không đánh dấu hoàn tất runtime           |

**Việc phát triển tiếp theo nên bắt đầu:** rollout starter/unlock theo progression và nghiệm thu P1. Tiếp tục lấy **Kiếm/Lôi + Pistol + một sói + một robot** làm bãi luyện trước khi nhân số kit. P1 có thể dùng placeholder FX của bốn hành còn lại; chọn hành/khắc chế/damage hiện đã là luật thật.

### 12.1. Kiểm chứng implementation

- Geometry: cone/capsule/circle boundary, body radius, wall/LOS, target di chuyển qua segment, projectile nhanh, miss/graze; mỗi swing/shot không double-hit.
- Damage: 25 cặp hành, neutral, partial elementalShare, đúng khoảng cách/mitigation/crit/realm, DOT/proc/pellet caps; miss không áp status/stack.
- Mobility: cả ba action, cancel/TTL, i-frame tick boundary, airborne groundLow, death/CC/wall/nav gaps; quái đánh thường và AoE dùng cùng gates.
- Persistence/API: bản mệnh tạo một lần, enum sai, save cũ/new/retry, portal/reconnect/takeover, loadout alias, debug client không đổi DB production, late-game transaction conflict.
- Auto: không đánh ngoài reach/LOS, giữ band, thiếu MP/thuốc/inventory/kẹt/dying, anchor/leash, reaction delay và manual takeover; map transfer không mang buffered action.
- Protocol: Zod, version, delta codec/event dedupe; local Worker và Colyseus replay cùng intent/seed cho cùng kết quả gameplay.
- Run checks phù hợp: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm depcruise`, `pnpm validate:data`; UI có `pnpm smoke:controls`, `pnpm smoke:responsive`, `pnpm smoke:login`; súng có `pnpm smoke:gun`. Biome qua `rtk proxy` khi hook làm sai output.
- Playtest 5 người mới: đề xuất ≥4/5 hoàn thành tutorial không hướng dẫn miệng; người mới farm được với hành bất lợi ở bãi thường; đo miss rate, death rate, time-to-kill, mana downtime và số lần cancel bị nuốt input. Số này là gate đề xuất, không phải kết quả hiện có.
- Frame/input: đo local press→pose p95 mục tiêu ≤50 ms, press→server action gồm tick/network ghi riêng; thử RTT 50/100/150 ms và jitter/loss. Không dùng độ trễ pose để tuyên bố damage online chỉ 50 ms.
- Performance: theo `performance_budget.md`, iPhone 13 Pro Max High median 60 FPS, p95 ≤20 ms, Low Android mục tiêu 30 FPS; combat ≥10 phút, auto 30 phút, transition/reload 5 lần. Server p95 step đề xuất ≤10 ms/50 ms tick dưới workload ghi rõ. Không kết luận scale chỉ từ scene offline.
- Asset: clip dùng thật phải kiểm contact/root motion, provenance SOURCE/LICENSE, regenerate vendor/media khi thêm source; không commit generated runtime assets.

### 12.2. Rollout và recoverability

Migrate bản mệnh trước bật combat mới; đọc save cũ trong giai đoạn chuyển tiếp, flag content/combat theo server session. Không cho hai version combat khác luật đánh nhau trong cùng room. Rollback combat vẫn phải giữ cột bản mệnh và lịch sử thay đổi; không chạy down migration phá lựa chọn người chơi. Giữ alias Lôi và fixture replay cũ; rollout dev→staging→production sau gates. Việc giảm timing/hitbox có thể đổi cân bằng PvE cũ: so TTK/MP và boss windows trước mở rộng.

## 13. Nghiên cứu internet và cách áp dụng

Các nguồn dưới đây là tài liệu của đội phát triển/tác giả kỹ thuật; truy cập 2026-10-08. Chúng hỗ trợ nguyên tắc triển khai. Ma trận hành, kit, thông số i-frame/balance/auto là **đề xuất riêng cho dự án**, không phải thông số trích từ LoL/God of War.

1. Riot — [Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/): đọc hình ảnh phải tương ứng gameplay, hierarchy giúp phân biệt mức nguy hiểm. Áp dụng: boundary chạm/telegraph rõ, hiệu ứng nhịp 3 và R nổi hơn basic, không để màu nguyên tố che tín hiệu danger.
2. Mihir Sheth / Santa Monica Studio, GDC 2019 — [Evolving Combat in God of War](https://media.gdcvault.com/gdc2019/presentations/Sheth_Mihir_EvolvingCombat.pdf), phần aggression và strike assist: phản ứng mạnh nhưng displacement quá lớn làm khó nối combo; quản lý kẻ địch đang tấn công ảnh hưởng khả năng đọc trận. Áp dụng: lunge/knock có giới hạn, aggression budget tutorial, giữ quái trong reach và camera. Không sao chép camera 3D cận mặt của God of War.
3. Glenn Fiedler — [Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/): buffer và nội suy snapshot giúp làm mượt nhưng có độ trễ. Áp dụng: remote entity tiếp tục nội suy, timeline/impact FX dùng action tick thống nhất; đo delay, không tăng tick chỉ để sửa animation.
4. Gabriel Gambetta — [Client-Side Prediction and Server Reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html): prediction/replay dựa vào input sequence và server acknowledgement. Áp dụng: preview input/pose sớm, thêm movement prediction sau audit; damage vẫn server quyết, event có ID chống phát FX hai lần.
5. Babylon.js — [Thin Instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances): batch nhiều instance giảm quản lý object, có trade-off về visibility. Áp dụng: giữ batching sprite/pooled VFX hiện có, batch theo vùng/AOI khi cần, không tạo object/React component từng particle.

Không cần phụ thuộc runtime mới để bắt đầu: reuse TS geometry, tick sim, nav, projectile và VFX pool có sẵn. Trì hoãn reaction system toàn cặp, full physics, rollback PvP, offline idle rewards và nhiều pet cho tới khi slice đã có số đo về feel và độ khó.
