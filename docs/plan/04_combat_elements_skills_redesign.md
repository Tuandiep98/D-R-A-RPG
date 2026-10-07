# Combat RPG × MOBA — Ngũ hành và skill toàn bộ Đạo

Ngày: 2026-10-08. Trạng thái: **đã triển khai nền tảng ngũ hành + combat slice đầu tiên; kit tám Đạo và late game còn trong roadmap**.

Yêu cầu của chủ dự án là nền tảng của tài liệu này. Các con số cân bằng, cách gán Lôi và mốc late game dưới đây là đề xuất để playtest; không xem là số liệu đã nghiệm thu. Phạm vi bao gồm tám Đạo trong master plan, bảy skill Lôi hiện có, năm loại súng, nhân vật mới/cũ, quái và auto farm.

## Bản triển khai đầu tiên — 2026-10-08

Đã có luật khắc chế trong `game-data/combat/combat_rules.yaml`; character/monster affinity, phân tỉ lệ damage cơ bản/skill; súng dùng bản mệnh người cầm và giữ falloff theo khoảng cách. Protocol v9 đưa hành/biểu hiện, mobility, projectile và windup sang client. Core vẫn là TS thuần, sim authoritative 20 Hz.

Tạo nhân vật online chọn hành, DB khóa bản mệnh qua save thường; API chọn một lần cho nhân vật cũ chưa có hành. Migration 0008 lưu cooldown còn lại (giây, đóng băng khi offline) để chuyển map/reconnect không reset. Migration 0006 giữ nhân vật `player_default` đã chơi là Mộc/Lôi; 0007 kiểm tra giá trị/biểu hiện. Migration được áp dụng khi API/game server mở DB. Debug offline: `?element=kim|moc|thuy|hoa|tho` hoặc Cài đặt → Ngũ hành debug. Khi không có flag, dùng mặc định YAML; cờ không đổi nhân vật online.

Lộn (Shift, 5 s), tốc biến (E, 14 s), nhảy (V, 3 s) là action dùng chung, có nút cảm ứng và cooldown server. Roll có cửa sổ né, jump chỉ né đòn `groundLow`, blink không có i-frame. Đi theo tick, nav và circle obstacles; không xuyên tường. Nhảy hiện nâng model với clip Dodge có sẵn: **placeholder animation**, cần clip jump chuẩn khi polish.

Combo cơ bản giữ ba nhát, finisher dùng variant đầu để dễ đoán; buffer 0.2 s. Vệt kiếm/đạn/impact đổi màu theo hành; Lôi reuse VFX điện. Bốn hành còn lại dùng VFX recolor ban đầu, chưa phải bốn bộ asset riêng. Bảy ID skill Lôi được giữ: Xuyên Tâm là projectile thật; Hoàn Kiếm/Trảm/Lôi Nhảy dùng cone/circle; Vực/Thiên Phạt khóa vùng có telegraph; Lôi Bộ alias roll chung. Lôi Nhảy vẫn dùng dash tức thời của skill cũ, chưa chuyển thành timeline travel đầy đủ.

Quái đánh thường khóa hướng, có windup và cảnh báo cone trước damage; laser/kiếm khí đã chuyển projectile; damage kiểm tra hitbox sau di chuyển, LOS và va chạm swept projectile. `player_gunner` debug có ba skill Lôi để thử cùng năm súng và kiếm.

Auto quái chạy trong core qua intent SET_FARM; giới hạn quanh điểm bật, phản ứng sau thời gian cấu hình, dùng skill/basic/reload bình thường và giữ MP dự phòng. HP thấp/túi đầy thì dừng, thao tác tay ngắt auto. Đây là auto cơ bản: chưa có bộ tùy chọn farm, ưu tiên mục tiêu, tự dùng thuốc, stuck recovery hoặc màn lý do dừng.

Còn lại: DamageSpec/action timeline hợp nhất; đổi hành late game bằng chi phí/transaction; starter unlock theo progression; kit tám Đạo; balance/proc cap; VFX riêng, animation jump chuẩn và đánh giá cảm giác trên thiết bị thật. Bản này **không nghiệm thu toàn bộ P0–P5**.

Kiểm chứng: unit/integration test core/API/persistence; typecheck các workspace; data validator; depcruise; build web; responsive audit trên 9 kích thước. Test sim bao gồm đủ 25 cặp hành, projectile hit/miss/tường, roll/jump, quái windup, save affinity và auto.

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

Tên field dưới đây là đề xuất, chưa tồn tại trong Zod/runtime:

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

World.step hiện chạy skill/combat/melee/ranged trước movement. Khi bổ sung né phải đổi có chủ đích: intents/auto/AI → bắt đầu action → movement/mobility → active collision/projectile → damage/status/life → snapshot/events. Ghi vị trí trước/sau movement để sweep; không thêm một resolver trước và một resolver sau cùng tick. Kiểm tra pending approach, cast tự tiếp cận, lunge, portals và action chết theo thứ tự mới.

## 12. Lộ trình triển khai, phụ thuộc và nghiệm thu

Ưu tiên combat trước marketplace/social mới. Đây là thứ tự thực hiện đề xuất; chưa phải báo cáo tính năng đã xong.

| Phase                      | Deliverable cụ thể                                                                                                                                                    | Điều kiện xong                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| P0 — contract              | mapping 5 hành/biểu hiện, DamageSpec/action timeline, migration và feature flag                                                                                       | ma trận/data schema validate, audit save cũ, preview thiết kế tạo nhân vật và HUD                            |
| P1 — playable combat slice | chọn/khóa hành từ API→DB→sim; debug chọn đủ 5; basic kiếm và pistol có VFX hành; roll/blink/jump; một quái melee và ranged dùng hitbox; Lôi Xuyên Tâm projectile thật | demo đánh tay/né/khắc chế/reconnect chạy Low + online; không trúng ngoài hitbox; không thêm status phức tạp  |
| P2 — feel và auto          | tuning combo, assist/buffer/cancel, geometry sweep, safe Farm, range hysteresis; finish chuyển cả bảy Lôi và 5 súng                                                   | takeover ngay, auto không gian lận, farm 30 phút ổn định, mob và projectile né được; timing clip khớp impact |
| P3 — toàn bộ Đạo           | Thể/Pháp/Trận/Ngự Thú/Ảnh theo kit, five-element overlays, một status/hành, mutation/quota T                                                                          | kit matrix đủ 7 Đạo early/mid; each basic/Q/W/E/R có delivery/counterplay/auto policy, balance theo role     |
| P4 — late game             | Hỗn Nguyên hai Đạo, progression/unlock/balance; đổi hành quest+transaction; elite/boss/hybrid                                                                         | đủ 8 Đạo; không bypass quota/cooldown; đổi hành/reconnect/idempotency không reset tiến độ                    |
| P5 — nghiệm thu            | benchmark thiết bị, latency tests, tune manual vs auto và onboarding                                                                                                  | gates dưới đây có số đo; chưa có thiết bị thì ghi chưa nghiệm thu, không đánh dấu hoàn tất runtime           |

**Việc phát triển tiếp theo nên bắt đầu:** P0 rồi P1, lấy **Kiếm/Lôi + Pistol + một sói + một robot** làm bãi luyện. Có cả cận/xa, skill projectile, mobility, hành và quái; đủ để kiểm chứng “đã tay + né thật” trước khi nhân số kit. P1 có thể dùng placeholder FX của bốn hành còn lại, nhưng chọn hành/khắc chế/damage phải là luật thật.

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
