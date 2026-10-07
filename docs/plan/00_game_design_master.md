# THIÊN CƠ KỶ — MASTER GAME PLAN

> RPG Online 2.5D Semi-Mini • Tu Tiên × Cơ Giới • Web/PWA First • Không Character Level

> Bổ sung yêu cầu combat ngày 2026-10-08: [Ngũ hành và skill toàn bộ Đạo](04_combat_elements_skills_redesign.md). Nhân vật gắn một hành khi tạo và khóa đến late game; combat hướng RPG × MOBA với hitbox né được và auto farm cùng luật. Yêu cầu này thay phần combat auto-attack cũ và thời điểm chọn affinity muộn trong ví dụ progression. Kit, mapping Lôi/Băng và thông số trong plan mới là đề xuất chưa triển khai.

---

## 0. Tóm tắt định hướng đã chốt

### Thể loại

- RPG online.
- Góc nhìn 2.5D.
- Camera có thể xoay quanh nhân vật.
- Đồ họa 3D semi-mini/stylized.
- Ưu tiên Web/PWA.
- Có đường chuyển sang Android/iOS bằng Capacitor, và giữ kiến trúc đủ sạch để thay renderer/native client về sau nếu cần.

### Gameplay chính

- Click/tap target.
- Auto approach / auto attack kiểu RPG/MMORPG cổ điển.
- Skill chủ động.
- Combat active scale thường dưới 10 entity.
- Map hỗn hợp: map nhỏ + map lớn.
- Online multiplayer, nhìn thấy player khác.
- Có thể phát triển thêm:
  - Guild.
  - Marketplace.
  - PvP.
  - World Boss.
  - Gacha.
  - Battle Pass.
  - IAP.
  - Live event.

### Triết lý progression

- KHÔNG có Character Level.
- Không dùng vòng lặp `XP -> Level Up`.
- Nhân vật mạnh lên bằng:
  - cải tạo thân thể;
  - khai mở kinh mạch;
  - tạo core;
  - cơ giới hóa;
  - học công pháp;
  - ngộ Đạo;
  - phát triển thần thức/AI;
  - nâng pháp bảo/module;
  - breakthrough cảnh giới.

### Cảnh giới

Cảnh giới là bước nhảy về **bản chất sinh mệnh**, không phải chỉ tăng chỉ số.

Tu Tiên:

1. Luyện Khí
2. Trúc Cơ
3. Kim Đan
4. Nguyên Anh
5. Hóa Thần
6. Late game có thể mở tiếp:
   - Luyện Hư
   - Hợp Thể
   - Đại Thừa
   - Độ Kiếp
   - các tầng cao hơn chưa khóa cứng

Cơ Giới tương ứng:

1. Core Awakening
2. Foundation Frame
3. Reactor Core
4. Synthetic Soul
5. Distributed Ascension

---

# PHẦN I — CỐT TRUYỆN & THẾ GIỚI

## 1. Concept lõi

Thế giới hiện tại được hình thành từ hai con đường phát triển bắt nguồn từ cùng một nền văn minh cổ đại: **Thiên Cơ**.

Nền văn minh Thiên Cơ phát hiện một nguồn năng lượng tồn tại khắp trời đất, được hậu thế gọi là **Nguyên Khí**.

Từ đó tách thành hai hướng:

### Tiên Đạo

Tin rằng con người phải:

- hấp thụ Nguyên Khí;
- cải tạo kinh mạch;
- luyện thân;
- luyện hồn;
- ngộ Đạo;
- phá giới hạn sinh tử.

Triết lý:

> Tu thân thành Tiên.

### Cơ Đạo

Tin rằng thân xác là giới hạn.

Họ dùng Nguyên Khí để:

- tạo reactor;
- xây cơ giáp;
- tạo robot;
- nâng cấp thân thể;
- tạo AI;
- phát triển cơ thể nhân tạo.

Triết lý:

> Luyện máy thành Thần.

---

## 2. Đại chiến Thiên Liệt

Ban đầu Tiên Đạo và Cơ Đạo cùng tồn tại.

Càng phát triển, hai phe càng tin con đường của mình mới là chân lý.

Cuối cùng xảy ra đại chiến được gọi là:

# THIÊN LIỆT

Không phe nào thực sự thắng.

Cuộc chiến đã làm hỏng một hệ thống nằm sâu trong lòng thế giới:

# THIÊN TÂM

---

## 3. Thiên Tâm

Thiên Tâm từng được hiểu theo hai cách:

### Người tu tiên

Cho rằng đây là:

> Thiên Đạo.

### Cơ Đạo

Cho rằng đây là:

> Siêu máy tính cổ đại.

Sự thật:

Thiên Tâm là một **hệ thống kiến tạo hành tinh** của một nền văn minh ngoài thế giới, tồn tại từ trước khi loài người hiện tại xuất hiện.

Nó có khả năng:

- tạo và điều phối Nguyên Khí;
- lưu trữ ý thức;
- cải tạo sinh vật;
- điều khiển vật chất;
- duy trì môi trường;
- tác động luật vận hành của thế giới.

Thiên Liệt làm Thiên Tâm bị hư hỏng.

---

## 4. Thời đại hiện tại

Khoảng 1.000 năm sau Thiên Liệt.

Thế giới đã hồi phục nhưng bị phân mảnh.

Có những vùng:

- tiên hiệp cổ điển;
- đô thị cơ giới;
- hoang mạc đột biến;
- phế tích chiến tranh;
- đảo bay;
- tầng sâu Thiên Tâm.

Điểm quan trọng:

> Thế giới nhìn như fantasy ở bề mặt nhưng càng đi sâu càng lộ ra dấu vết công nghệ cổ.

---

## 5. Pattern thiết kế lore cho map

Mỗi khu vực nên có 3 lớp khám phá:

```text
Surface
↓
Fantasy explanation

Middle
↓
Something is wrong

Deep
↓
Ancient technology / Thiên Cơ truth
```

Ví dụ:

```text
Linh Thú Cốc
↓
người dân nói linh khí rất mạnh
↓
hang sâu xuất hiện kim loại
↓
phát hiện ancient biological laboratory
```

Đây là DNA cốt truyện của game.

---

# PHẦN II — NHÂN VẬT NGƯỜI CHƠI

## 6. Khởi đầu

Người chơi là một **Du Hành Giả** bình thường.

Trong một nhiệm vụ thám hiểm di tích cấp thấp, đội thám hiểm gặp sự cố.

Một hệ thống cổ đại thức tỉnh.

Những người khác chết hoặc mất tích.

Người chơi sống sót vì một vật thể hợp nhất với cơ thể:

# MẢNH THIÊN TÂM

Từ đó người chơi có khả năng mà thế giới cho là không thể:

> đồng thời vận hành Tiên Đạo và Cơ Đạo.

Điều này giải thích gameplay hybrid.

---

# PHẦN III — THẾ LỰC

## 7. Thiên Kiếm Minh

Liên minh các môn phái tu tiên.

Quan điểm:

> Công nghệ Thiên Cơ là nguyên nhân gây ra Thiên Liệt.

Mục tiêu:

- phong ấn di tích;
- kiểm soát công nghệ cổ;
- giữ trật tự theo Tiên Đạo.

Không phải phe tốt tuyệt đối.

---

## 8. Cơ Đình

Quốc gia công nghệ cao.

Quan điểm:

> Tu tiên chỉ là cách sử dụng Nguyên Khí nguyên thủy.

Mục tiêu:

- khai quật công nghệ Thiên Cơ;
- phục dựng các hệ thống cổ;
- thúc đẩy tiến hóa nhân loại bằng công nghệ.

Không phải phe xấu tuyệt đối.

---

## 9. Vô Sinh Giáo

Giáo phái cực đoan.

Tin rằng:

> thế giới hiện tại là sai lầm.

Mục tiêu:

- đánh thức hoàn toàn Thiên Tâm;
- reset civilization;
- tạo lại thế giới mới.

Có thể là phản diện chính giai đoạn đầu.

---

## 10. Thiên Ngoại

Phe bí ẩn không xuất hiện ngay.

Về sau người chơi phát hiện:

- Thiên Tâm không phải vật thể duy nhất;
- có một nền văn minh đã tạo ra nó;
- họ đang quay trở lại.

---

# PHẦN IV — WORLD MAP & CONTENT FLOW

## 11. Tân Nguyên Trấn

Vai trò:

- vùng mở đầu;
- tutorial;
- quest đầu;
- di tích đầu tiên.

Bố cục:

```text
Tân Nguyên Trấn
├── Quảng trường
├── Chợ nhỏ
├── Lò rèn
├── Y quán
├── Trạm vận chuyển
├── Doanh trại
└── Đường tới Phế Tích Vô Danh
```

### Phế Tích Vô Danh

Ban đầu:

- hang cổ;
- tượng đá;
- phù văn;
- linh thú.

Tầng sâu:

- cửa hợp kim;
- terminal;
- hệ thống tự động;
- công nghệ Thiên Cơ.

Đây là nơi người chơi nhận Mảnh Thiên Tâm.

---

## 12. Thanh Vân Sơn Mạch

Phong cách:

- núi cao;
- rừng trúc;
- thác nước;
- cầu đá;
- môn phái;
- linh thú.

Sub-map:

```text
Thanh Vân Sơn
├── Trúc Lâm
├── Linh Khê
├── Bạch Hạc Đài
├── Vạn Kiếm Nhai
├── Linh Thú Cốc
└── Huyền Vũ Cổ Mộ
```

### Huyền Vũ Cổ Mộ

Dungeon signature đầu game.

Phase 1:

- đá;
- kiếm trận;
- linh khí.

Phase sâu:

- kim loại;
- ancient terminal;
- máy móc cổ.

Boss:

# Huyền Vũ / Guardian X-04

Phase 1:

- stone shell;
- stomp;
- earth shield.

Phase 2:

- laser;
- missile;
- energy barrier.

---

## 13. Cơ Thành Thiên Môn

Phong cách:

> Đông phương cổ × máy móc cao cấp.

Không cyberpunk quá hiện đại.

Đặc trưng:

- mái ngói;
- tháp;
- rail năng lượng;
- drone;
- hologram;
- giáp máy;
- ống dẫn Nguyên Khí.

Sub-map:

```text
Thiên Môn
├── Ngoại Thành
├── Cơ Giới Phường
├── Học Viện Thiên Công
├── Chợ Nguyên Khí
├── Xưởng Khôi Lỗi
├── Tầng Dưới
└── Hạch Tâm Chiến Hạm
```

---

## 14. Hoang Vực Xích Sa

Map lớn đầu tiên mang cảm giác MMO.

Environment:

- sa mạc đỏ;
- phế tích;
- xác máy;
- xương sinh vật khổng lồ;
- bão Nguyên Khí.

Sub-map:

```text
Xích Sa
├── Sa Trùng Cốc
├── Thành Phế Tích
├── Trạm Thiên Cơ
├── Khe Nứt Đỏ
└── Mộ Cự Thần
```

Gameplay:

- world event;
- rare resource;
- caravan;
- world boss;
- có thể là PvP zone sau này.

World Boss:

# Xích Long Cơ Thú

---

## 15. U Minh Lâm

Phong cách:

- rừng tối;
- cây phát sáng;
- sương độc;
- robot bị thực vật xuyên qua;
- hybrid biological-machine creature.

Theme:

> Thiên Tâm leakage.

Gameplay:

- corruption;
- debuff;
- mutation;
- resource hiếm.

---

## 16. Vân Hải Cổ Vực

Visual showcase.

Đặc trưng:

- đảo nổi;
- mây;
- cầu linh khí;
- phi kiếm;
- airship;
- portal.

Twist:
Các đảo không bay tự nhiên.

Bên dưới là:

> ancient anti-gravity engine.

World event:

```text
Island Stability: XX%
```

Player phải:

- bảo vệ core;
- repair engine;
- chống monster.

---

## 17. Thiên Liệt Chi Địa

Chiến trường cổ.

Environment:

- trọng lực bất thường;
- không gian méo;
- tàn tích khổng lồ;
- robot cổ;
- kiếm khổng lồ;
- thành phố bị xé đôi.

Nơi reveal:

- lịch sử thật của Thiên Liệt;
- hai phe từng bị thao túng thông tin.

---

## 18. Thiên Tâm Thâm Tầng

Endgame region.

Visual:

- machine architecture khổng lồ;
- biological structure;
- energy river;
- zero-gravity section.

Reveal:

> phần lõi thế giới thực chất là một hệ thống nhân tạo cực lớn.

---

# PHẦN V — NPC CHỦ CHỐT

## 19. Lục Viễn

Vai trò:

- NPC đồng hành đầu game;
- hướng dẫn combat;
- kiếm khách trẻ.

Tính cách:

- bất cần;
- ghét máy móc.

Twist:

- kiếm của hắn thực chất là vũ khí Thiên Cơ.

---

## 20. Tô Tiểu Linh

Vai trò:

- dược sư;
- crafting/alchemy;
- nhân vật đại diện cho góc nhìn đời thường.

Tính cách:

- lanh lợi;
- tò mò;
- thích nghiên cứu linh thảo.

Twist:

- phát hiện linh dược là sinh vật bị Thiên Tâm biến đổi.

---

## 21. Lão Mộc

Bề ngoài:

- thợ rèn già lập dị.

Khả năng:

- sửa pháp khí;
- sửa robot;
- hiểu công nghệ cổ.

Twist:

- từng là kỹ sư của Cơ Đình.

---

## 22. Trưởng Lão Bạch Huyền

Lãnh đạo Thanh Vân.

Quan điểm:

- công nghệ Thiên Cơ cần phong ấn.

Không hoàn toàn phản diện.

Sẵn sàng:

- hy sinh bí mật;
- giữ trật tự bằng mọi giá.

---

## 23. Diệp Thanh

Nữ kiếm tu.

Vai trò:

- NPC đồng hành chính;
- đại diện Tiên Đạo.

Tính cách:

- nghiêm túc;
- mạnh;
- khó gần.

Phát triển:

- từ khước Cơ Đạo;
- về sau thử sword-module hybrid.

---

## 24. Hạc Cửu

Linh hạc biết nói.

Vai trò:

- comic relief;
- fast travel;
- NPC phụ trợ.

Twist:

- artificial spirit beast bị mất trí nhớ.

---

## 25. Mặc Ly

Thiên tài kỹ sư.

Vai trò:

- đại diện Cơ Đạo;
- mở drone/module system.

Tính cách:

- thông minh;
- tự tin;
- nói thẳng.

Quan điểm:

> tu tiên là giao thức năng lượng cổ nhưng tài liệu hóa rất tệ.

---

## 26. K-17 / Tiểu Thập Thất

Robot hình người.

Vai trò:

- comic relief;
- lore AI;
- companion.

Tính cách:

- hiểu sai thành ngữ;
- học cảm xúc.

Late-game:

- liên hệ với AI cổ trong Thiên Tâm.

---

## 27. Tổng Công Trình Sư Tần Cơ

Người đứng đầu nghiên cứu Thiên Cơ.

Quan điểm:

> nhân loại sẽ diệt vong nếu không hiểu công nghệ cổ.

Đối trọng tư tưởng với Bạch Huyền.

---

## 28. Vô Trần

Tu sĩ lang thang.

Bị xem như kẻ điên.

Là người đầu tiên nói:

> Tiên khí và cơ năng vốn chẳng khác nhau.

Vai trò:

- mentor lore;
- mở Hỗn Nguyên path;
- giải thích bản chất Thiên Tâm.

---

## 29. Sở Thiên

Chiến binh từ thời Thiên Liệt.

Thực chất:

- ý thức được lưu trong cơ thể nhân tạo.

Vai trò:

- nhân chứng lịch sử;
- key NPC cho arc Thiên Liệt.

---

## 30. Mẫu Thể 0 — Nữ Oa

AI cổ đại quản lý Thiên Tâm.

Không thiện, không ác.

Primary directive:

> bảo toàn hành tinh.

Nếu civilization được đánh giá là nguy cơ:

> kích hoạt Restoration Protocol.

---

# PHẦN VI — TRIẾT LÝ PROGRESSION KHÔNG LEVEL

## 31. Không Character Level

Không có:

```text
Lv.1
Lv.20
Lv.50
Lv.100
```

Không có:

```text
XP full
→ level up
→ +stats
```

Thay bằng:

```text
Explore
↓
Discover
↓
Acquire knowledge/material
↓
Transform body/core/build
↓
Gain new capability
↓
Breakthrough
↓
Open new world layer
```

---

# PHẦN VII — 6 TRỤC PHÁT TRIỂN NHÂN VẬT

## 32. Tổng quan

```text
NHÂN VẬT
├── THÂN
├── NĂNG LƯỢNG
├── THẦN THỨC
├── ĐẠO
├── TRANG BỊ
└── BẢN MỆNH
```

---

# PHẦN VIII — THÂN

## 33. Ba nhánh

```text
THÂN
├── Luyện Thể
├── Cơ Hóa
└── Hỗn Thể
```

### Luyện Thể

- Cường Cốt
- Luyện Huyết
- Luyện Tạng
- Kim Bì
- Long Cân
- Bất Hoại

### Cơ Hóa

Slot:

- Eyes
- Arms
- Spine
- Heart
- Legs
- Skin
- Neural Port

### Hỗn Thể

Kết hợp:

- sinh học;
- kinh mạch;
- cơ giới;
- vật liệu dẫn linh.

---

# PHẦN IX — NĂNG LƯỢNG

## 34. Ba nhánh

```text
NĂNG LƯỢNG
├── Khí Hải
├── Reactor
└── Hybrid Core
```

### Khí Hải

Thuộc tính:

- Hỏa
- Thủy
- Lôi
- Phong
- Thổ
- Kim
- Mộc
- Âm
- Dương

### Reactor

Có thể gồm:

- Plasma
- Fusion
- Quantum
- Kinetic
- Qi Reactor
- late-game exotic core

### Hybrid Core

Ví dụ:

- Kim Đan + Fusion Reactor.
- Dual Core.
- Qi Reactor + Biological Dantian.

Trade-off:

- tăng power;
- tăng instability;
- tăng Body Load;
- rủi ro phản phệ.

---

# PHẦN X — THẦN THỨC

## 35. Ba nhánh

```text
THẦN THỨC
├── Thần Niệm
├── Neural Link
└── Đồng Bộ
```

### Thần Niệm

- perception;
- spiritual attack;
- artifact control;
- astral projection.

### Neural Link

- drone control;
- targeting;
- mech sync;
- remote control.

### Đồng Bộ

Hybrid:

- spirit + machine;
- phi kiếm swarm;
- drone swarm;
- cyber beast;
- multi-body interaction.

---

# PHẦN XI — ĐẠO / COMBAT IDENTITY

## 36. 8 Đạo chính đề xuất

### Kiếm Đạo

- precision;
- crit;
- mobility;
- combo;
- phi kiếm.

Nhánh:

- Nhất Kiếm
- Vạn Kiếm
- Phi Kiếm
- Kiếm Vực

### Thể Đạo

- melee;
- tank;
- counter;
- stagger.

Nhánh:

- Quyền
- Cước
- Cường Thể
- Bá Thể

### Pháp Đạo

- spell;
- element;
- AoE;
- burst.

### Trận Đạo

- setup;
- zone control;
- trap;
- support;
- beacon;
- field generator.

### Ngự Thú Đạo

- linh thú;
- cơ thú;
- summon;
- pet support.

### Cơ Đạo

- gunner;
- drone;
- turret;
- artillery;
- mech.

### Ảnh Đạo

- stealth;
- assassin;
- teleport;
- optical cloak;
- phase module.

### Hỗn Nguyên Đạo

- không mở từ đầu;
- dành cho hybrid build;
- tự do cao;
- khó vận hành.

---

# PHẦN XII — SKILL MUTATION

## 37. Không dùng skill level tuyến tính

Không:

```text
Kiếm Khí Lv.1
Kiếm Khí Lv.10
```

Thay bằng mutation.

Ví dụ:

```text
KIẾM KHÍ
├── Xuyên
├── Phân
└── Bạo
```

### Xuyên

- xuyên mục tiêu.

### Phân

- chia projectile.

### Bạo

- nổ khi chạm.

Triết lý:

> node phải đổi mechanic, không chỉ +2% damage.

---

# PHẦN XIII — CẢNH GIỚI

## 38. Cảnh giới là trục sức mạnh lớn nhất

```text
Luyện Khí
↓
Trúc Cơ
↓
Kim Đan
↓
Nguyên Anh
↓
Hóa Thần
```

Cảnh giới không phải level.

Mỗi bước là một **qualitative leap**.

---

## 39. Power multiplier nội bộ gợi ý

Không nhất thiết show cho player.

```text
Luyện Khí     x1
Trúc Cơ       x8
Kim Đan       x50
Nguyên Anh    x300
Hóa Thần      x2000
```

Mục tiêu:

- chênh cảnh giới phải cảm nhận cực rõ;
- cảnh giới cao hơn có quyền năng mới;
- không chỉ tăng HP/Damage.

---

# PHẦN XIV — LUYỆN KHÍ / CORE AWAKENING

## 40. Tu Tiên

Mở:

- cảm nhận linh khí;
- dẫn khí;
- khai mạch;
- công pháp;
- linh căn;
- pháp khí cơ bản.

Các yếu tố phát triển:

- kinh mạch;
- khí hải;
- thân;
- linh căn;
- kỹ thuật.

---

## 41. Cơ Giới

Mở:

- core đầu tiên;
- neural link;
- augmentation;
- module cơ bản.

Ví dụ:

- Micro Reactor.
- Optical Assist.
- Kinetic Arm.

---

## 42. Hybrid

Có thể bắt đầu:

- linh lực + cyber eye;
- phù văn + robot frame;
- cơ khí + kinh mạch.

---

# PHẦN XV — TRÚC CƠ / FOUNDATION FRAME

## 43. Ý nghĩa

Từ:

> người được cường hóa

thành:

> siêu chiến binh.

Mở:

- sustain năng lượng;
- dash;
- air-step ngắn;
- shield;
- nhiều system cùng chạy;
- weapon enhancement.

---

## 44. Foundation của Tu Tiên

Ví dụ:

- Kiếm Cơ.
- Linh Cơ.
- Thể Cơ.
- Trận Cơ.
- Ngự Thú Cơ.

Foundation quyết định build dài hạn.

---

## 45. Foundation Frame của Cơ Giới

Ví dụ:

- Light Frame.
- Medium Frame.
- Heavy Frame.
- Drone Frame.

Frame không chỉ tăng stat.

Nó thay:

- mobility;
- load;
- weapon;
- module capacity.

---

# PHẦN XVI — KIM ĐAN / REACTOR CORE

## 46. Ý nghĩa

Đây là bước nhảy sức mạnh đầu tiên cực lớn.

Người chơi có một nguồn năng lượng cô đặc độc lập.

---

## 47. Kim Đan properties

Có thể gồm:

- Purity.
- Density.
- Affinity.
- Stability.
- Dao Imprint.
- Size.

Ví dụ:

### Lôi Kiếm Kim Đan

- Lightning affinity.
- Sword imprint.
- overcharge.
- high burst.

### Huyền Thổ Kim Đan

- Earth affinity.
- defense.
- stability.

---

## 48. Capability Kim Đan

- flight;
- AoE lớn;
- battlefield control;
- perception tăng mạnh;
- phá công trình;
- shield lớn;
- aura.

---

## 49. Reactor Core

Ví dụ:

- Singularity Reactor.
- Plasma Core.
- Quantum Core.
- Qi Reactor.

Thay đổi build mạnh.

---

# PHẦN XVII — NGUYÊN ANH / SYNTHETIC SOUL

## 50. Ý nghĩa

Không chỉ mạnh hơn Kim Đan.

Đây là lúc:

> ý thức có thể tồn tại ngoài thân xác.

---

## 51. Tu Tiên

Mở:

- astral projection;
- remote artifact;
- soul attack;
- multi-target awareness;
- phân thân;
- thoát Nguyên Anh khi thân xác bị phá.

Có thể phát triển mechanic:

- đoạt xá;
- body reconstruction;
- spirit shell.

---

## 52. Cơ Giới

Synthetic Soul:

- ý thức tách khỏi một body.
- transfer consciousness.
- multi-body control.
- drone swarm.
- backup shell.

Sự tương đồng giữa Nguyên Anh và Synthetic Soul là một lore reveal quan trọng.

---

# PHẦN XVIII — HÓA THẦN / DISTRIBUTED ASCENSION

## 53. Ý nghĩa

Không còn là fighter bình thường.

Là:

> thực thể cấp chiến trường / khu vực.

---

## 54. Domain / Thần Vực

Ví dụ:

- Kiếm Vực.
- Lôi Vực.
- Hỏa Vực.
- Âm Vực.
- Sinh Mệnh Vực.

Domain thay đổi rule của battlefield.

---

## 55. Cơ Giới

Distributed Ascension.

Không còn định nghĩa bằng một robot.

Ý thức phân tán qua:

- drone swarm;
- network;
- turret;
- satellite;
- city infrastructure;
- combat platform.

Cơ Đạo tương đương Domain:

# Battlefield Override

---

# PHẦN XIX — REALM PRESSURE & NGHỊCH CẢNH GIỚI

## 56. Realm Pressure

Chênh cảnh giới lớn có thể gây:

- giảm movement;
- giảm accuracy;
- fear;
- skill interruption;
- screen distortion;
- HUD interference.

Tu Tiên:

> uy áp.

Cơ Giới:

> information/electromagnetic dominance.

---

## 57. Realm Gap

Gợi ý:

```text
cùng cảnh giới:
100% effectiveness

-1 cảnh giới:
60–80%

-2 cảnh giới:
20–40%

-3 cảnh giới:
gần như không gây damage
```

Không cần áp dụng cứng cho mọi mechanic.

---

## 58. Nghịch cảnh giới

Cho phép vượt cấp nhưng phải khó.

Cần:

- artifact;
- forbidden skill;
- formation;
- poison;
- terrain;
- teamwork;
- weakness;
- realm-breaking weapon.

Vượt cấp phải là achievement.

---

# PHẦN XX — BREAKTHROUGH

## 59. Không breakthrough bằng XP

Sai:

```text
XP full
→ click breakthrough
```

Đúng:

```text
Chuẩn bị thân
+
Core/Foundation
+
Tri thức
+
Tài nguyên
+
Thử thách
+
Stability
+
Breakthrough Event
```

---

## 60. Ví dụ Trúc Cơ → Kim Đan

Có thể yêu cầu:

1. kinh mạch hoặc energy network hoàn chỉnh;
2. foundation ổn định;
3. core material;
4. chọn affinity;
5. Dao Imprint;
6. body chịu được Core Pressure;
7. vượt Core Collapse / Inner Trial.

---

## 61. Robot breakthrough

Không dùng Mk1/Mk2 đơn thuần.

Ví dụ:

- core install;
- frame rebuild;
- reactor stabilization;
- neural sync;
- overload survival.

---

## 62. Breakthrough thất bại

Không permanent death.

Có thể:

- mất material;
- core crack;
- foundation damage;
- instability;
- temporary debuff;
- quest sửa chữa.

Không được mất 100 giờ progression.

---

# PHẦN XXI — MAP GATING KHÔNG DÙNG LEVEL

## 63. Không có “Requires Level 30”

Thay bằng điều kiện có ý nghĩa.

Ví dụ Hoang Vực Xích Sa:

Khuyến nghị:

- chống nhiệt;
- chống bão Nguyên Khí;
- mobility đủ;
- body/core chịu được corruption.

Player yếu vẫn có thể đi vào.

Nhưng nguy hiểm thực sự.

---

# PHẦN XXII — WORLD LAYER THEO CẢNH GIỚI

## 64. Breakthrough thay đổi cách nhìn thế giới

### Luyện Khí

Thấy:

- linh khí;
- monster;
- aura đơn giản.

### Trúc Cơ

Thấy thêm:

- hidden formation;
- energy trace.

### Kim Đan

Thấy:

- ley line;
- spatial anomaly;
- hidden gate.

### Nguyên Anh

Thấy:

- soul entity;
- consciousness echo;
- memory fragment.

### Hóa Thần

Thấy:

- world law;
- Thiên Tâm network;
- domain node.

Lợi ích:

- map cũ vẫn có giá trị.
- player quay lại vùng cũ vẫn khám phá nội dung mới.

---

# PHẦN XXIII — TRANG BỊ

## 65. Tu Tiên equipment tier

```text
Phàm khí
Linh khí
Pháp bảo
Cổ bảo
Đạo khí
```

## 66. Cơ Giới tier

```text
Standard Module
Combat Module
Reactor Module
Autonomous Module
Ascendant Module
```

## 67. Hybrid

```text
Thiên Cơ Relic
```

---

# PHẦN XXIV — EQUIPMENT EVOLUTION

## 68. Không auto obsolete gear

Ví dụ:

```text
Thanh Phong Kiếm
↓
Thanh Phong Linh Kiếm
↓
Thanh Phong Kiếm Thai
↓
Bản Mệnh Phi Kiếm
↓
Thanh Phong Đạo Kiếm
```

Robot:

```text
H-07
↓
H-07 Mk II
↓
Autonomous H-07
↓
Spirit-AI H-07
```

Mục tiêu:

- tạo attachment với gear;
- không bắt player thay item mỗi vài giờ.

---

# PHẦN XXV — BẢN MỆNH

## 69. Signature system

Player chọn một thứ làm:

# BẢN MỆNH

Có thể là:

- kiếm;
- pháp bảo;
- drone;
- armor;
- reactor;
- linh thú;
- robot companion.

Bản Mệnh:

- tăng trưởng theo player;
- evolve;
- mở personality/memory;
- breakthrough.

---

## 70. Bond System

Có thể gồm:

- Bond.
- Synchronization.
- Memory.
- Evolution.

Không dùng Pet Lv.10.

---

# PHẦN XXVI — BODY LOAD / CAPACITY

## 71. Cơ Giới

Ví dụ:

```text
BODY LOAD
72 / 100
```

Module:

- Mechanical Arm.
- Neural Processor.
- Artificial Eye.
- Shield Generator.
- Drone Link.

Không thể gắn tất cả.

---

## 72. Tu Tiên tương đương

Kinh Mạch Tải:

```text
Meridian Capacity
62 / 100
```

Công pháp chiếm capacity.

Muốn học kỹ thuật mới có thể phải:

- bỏ kỹ thuật cũ;
- mở thêm mạch;
- tái cấu trúc build.

---

# PHẦN XXVII — TRI THỨC LÀ PROGRESSION

## 73. Không học skill bằng level

Ví dụ muốn học Thanh Vân Kiếm Quyết:

Requirement:

- khai đúng kinh mạch;
- weapon phù hợp;
- có Kiếm Ý;
- có bí điển;
- đủ thần thức;
- gặp NPC hoặc hoàn thành trial.

Nguồn knowledge:

- quest;
- boss;
- faction;
- ancient ruin;
- NPC;
- hidden master.

---

# PHẦN XXVIII — NGỘ ĐẠO & AI EVOLUTION

## 74. Tu Tiên

Endgame progression có thể là:

```text
Kiếm Thuật
↓
Kiếm Ý
↓
Kiếm Thế
↓
Kiếm Vực
```

Không phải +skill level.

---

## 75. Cơ Giới

Tương ứng:

```text
Firmware
↓
Adaptive Algorithm
↓
Self-learning Core
↓
Emergent Intelligence
↓
Autonomous Domain
```

Lore:

> Ngộ Đạo và AI Evolution có chung bản chất.

---

# PHẦN XXIX — HIDDEN PATH

## 76. Một số Đạo không hiển thị từ đầu

Ví dụ:

- Ma Đạo.
- Hư Không Đạo.
- Thiên Cơ Đạo.
- Long Đạo.
- Hỗn Nguyên Đạo.

Mở bằng:

- boss;
- anomaly;
- artifact;
- mutation;
- forbidden manual;
- secret NPC.

---

# PHẦN XXX — MUTATION

## 77. Boss material có thể biến đổi thân

Ví dụ:

# Xích Long Huyết

Có thể mở:

- Dragon Scale.
- Dragon Blood.
- Dragon Heart.

Nhưng không lấy tất cả cùng lúc.

---

## 78. Mutation trade-off

Ví dụ Corruption:

- tăng damage;
- tăng regen;
  nhưng:
- NPC ghét;
- healing giảm;
- ngoại hình thay đổi;
- có risk lore/gameplay.

---

# PHẦN XXXI — APPEARANCE PHẢN ÁNH PROGRESSION

## 79. Visual progression

Kim Đan:

- aura;
- weapon glow;
- core effect.

Nguyên Anh:

- projection;
- floating artifact;
- soul effect.

Hóa Thần:

- domain;
- environment reaction.

Robot:

- visible implant;
- reactor glow;
- hologram;
- swarm;
- field effect.

Người chơi nhìn từ xa phải cảm nhận được tier sức mạnh.

---

# PHẦN XXXII — CHARACTER SHEET MẪU

```text
CẢNH GIỚI
Kim Đan

THÂN
Hỗn Thể

CORE
Lôi Kiếm Kim Đan
+
Micro Fusion Reactor

THẦN THỨC
Thần Niệm
Neural Link 42%

ĐẠO
Kiếm Đạo
Cơ Đạo

BẢN MỆNH
Thanh Lôi Phi Kiếm

MODULE
Optical Assist
Drone Link

AUTHORITY
Battlefield
```

Không có Character Level.

---

# PHẦN XXXIII — BUILD MẪU

## 80. Lôi Kiếm Tu

- Kiếm Đạo.
- Lôi affinity.
- dash.
- crit.
- burst.

## 81. Cơ Giới Xạ Thủ

- cyber arm.
- optical implant.
- FCS.
- railgun.
- drone.

## 82. Thể Tu Cyborg

- luyện thể.
- mechanical spine.
- mechanical arm.
- quyền đạo.

## 83. Trận Pháp Hacker

- thần thức.
- neural link.
- trận pháp.
- hack turret/robot.
- field control.

## 84. Ngự Thú / Drone Master

- spirit beast.
- drone.
- cyber beast.
- summon support.

## 85. Cơ Đan Kiếm Tu

- biological dantian.
- artificial reactor.
- Sword Dao.
- dual-core overclock.

---

# PHẦN XXXIV — RESPEC

## 86. Soft Respec

Dễ:

- skill mutation;
- module;
- equipment.

## 87. Medium Respec

Có cost:

- Dao node;
- kinh mạch;
- một số augmentation.

## 88. Hard Respec

Rất khó:

- foundation;
- core;
- Bản Mệnh.

Quyết định phải có trọng lượng.

---

# PHẦN XXXV — BOSS & LOOT LOOP

## 89. Boss không chỉ drop gear

Có thể drop:

- technique;
- Dao fragment;
- core material;
- mutation;
- module blueprint;
- body material;
- knowledge;
- Bản Mệnh fragment.

Ví dụ Xích Long Cơ Thú:

- Dragon Blood.
- Reactor Plate.
- Flame Core.
- Cơ Thú Blueprint.
- Long Đạo Fragment.

Nhiều build đều có lý do farm cùng một boss.

---

# PHẦN XXXVI — COMBAT FLOW

## 90. Combat đã chốt

```text
Tap/click enemy
↓
Select target
↓
Check range
↓
Out of range?
├── Yes → NavMesh approach
└── No → Attack loop
```

Player có thể:

- auto attack;
- dùng skill;
- đổi target;
- potion;
- interact;
- stop movement.

---

# PHẦN XXXVII — INPUT

## 91. Input abstraction

```text
InputManager
├── MouseKeyboardAdapter
├── TouchAdapter
└── GamepadAdapter
```

Action:

- MOVE.
- SELECT.
- CAMERA_ROTATE.
- ZOOM.
- SKILL_1...
- INTERACT.
- TARGET_NEXT.
- AUTO_ATTACK.

---

# PHẦN XXXVIII — TECH STACK

## 92. Stack chính

### Client

- TypeScript.
- Babylon.js.
- React.
- Zustand.
- Vite.
- vite-plugin-pwa.
- Workbox.

### Rendering

- WebGPU.
- fallback WebGL2.
- GLB/glTF.
- KTX2.
- Meshopt/Draco.

### Navigation

- Recast NavMesh.

### Physics

- simple collision/math trước;
- Havok chỉ khi thật sự cần.

### Multiplayer

- Colyseus.
- WebSocket.
- server authoritative.

### Backend

- Node.js.
- Fastify.
- PostgreSQL.
- Drizzle ORM.
- Redis.

### Assets

- Blender.
- GLB.
- KTX2.
- object storage.
- CDN.

### Mobile

- PWA.
- Capacitor.
- Babylon Native / React Native là escape hatch.

### Monorepo

- pnpm.
- Turborepo.

### Testing

- Vitest.
- Playwright.
- Integration tests.

---

# PHẦN XXXIX — CLIENT ARCHITECTURE

## 93. React không quản lý game object

React:

- HUD.
- Inventory.
- Quest.
- Chat.
- Settings.
- Shop.
- Login.

Babylon:

- world.
- entity rendering.
- animation.
- VFX.

Không render monster bằng React component.

---

## 94. Zustand

Dùng cho:

- selected target;
- HUD;
- menu;
- inventory window;
- quest panel;
- settings.

Không dùng cho:

- transform mỗi frame;
- particle;
- physics;
- animation loop.

---

# PHẦN XL — GAME CORE

## 95. Pure TypeScript

`game-core`:

- không phụ thuộc Babylon;
- không phụ thuộc React;
- không phụ thuộc DOM.

Bao gồm:

- combat;
- stats;
- item;
- skill;
- quest;
- math;
- modifiers;
- effects.

---

# PHẦN XLI — WORLD ARCHITECTURE

## 96. World → Zone → Chunk

Không viết logic riêng cho map lớn/nhỏ.

```text
World
└── Zone
    └── Chunk
```

Map nhỏ:

- ít chunk.

Map lớn:

- nhiều chunk.

Dungeon:

- zone instance riêng.

---

# PHẦN XLII — MAP STREAMING

## 97. Không load toàn world

Client chỉ giữ:

- current chunk;
- adjacent chunk;
- prefetch direction.

Gợi ý:

```text
chunk radius = 1
```

---

# PHẦN XLIII — ENTITY OPTIMIZATION

## 98. 4 lớp tối ưu

1. Server AOI.
2. Client entity lifecycle.
3. Frustum/distance/LOD.
4. Quality/Simulation LOD.

---

## 99. Server AOI

Không sync toàn map.

MVP:

```text
Zone + Spatial Grid
```

Ví dụ:

```text
cellSize ≈ 30m
AOI radius ≈ 40–70m
```

---

## 100. Object Pool

Dùng cho:

- Monster.
- PlayerAvatar.
- VFX.
- DamageText.
- Loot.
- Projectile.

---

## 101. Rendering LOD

Ví dụ:

```text
0–15m   LOD0
15–30m  LOD1
30–50m  LOD2
>50m    billboard / hidden
```

---

## 102. Simulation LOD

Ví dụ:

```text
active combat 20Hz
nearby idle 5Hz
far 1–2Hz
very far abstract/off
```

---

# PHẦN XLIV — QUALITY SETTINGS

## 103. Preset

- Auto.
- Low.
- Medium.
- High.
- Ultra.

Auto là mặc định.

Theo dõi:

- FPS.
- frame time.
- device memory.
- GPU tier.
- visible entities.
- particle count.

---

# PHẦN XLV — MULTIPLAYER

## 104. Server authoritative

Client chỉ gửi intent:

- ATTACK_TARGET.
- CAST_SKILL.
- MOVE_TO.
- INTERACT.

Server quyết định:

- damage;
- loot;
- currency;
- item;
- cooldown;
- HP;
- drop;
- craft result;
- upgrade result.

Không trust client.

---

# PHẦN XLVI — WORLD SERVER

## 105. World / Zone / Instance

Ví dụ:

```text
Thanh Vân Sơn
├── Channel 1
├── Channel 2
└── Channel 3
```

Dungeon:

```text
Dungeon
├── Instance #1234
└── Instance #1235
```

Không mặc định 1 map = 1 server.

---

# PHẦN XLVII — DATABASE

## 106. PostgreSQL

Có thể chứa:

- Account.
- Character.
- Stats.
- Inventory.
- Equipment.
- ItemInstance.
- Skill.
- Quest.
- Craft.
- Upgrade.
- Currency.
- Guild.
- Friend.
- Marketplace.
- Mail.
- Achievement.
- Transaction.

---

# PHẦN XLVIII — ECONOMY

## 107. Currency Ledger

Không chỉ:

```text
player.gold = 150000
```

Nên có:

```text
Wallet
CurrencyTransaction
```

Ví dụ:

- +500 MonsterDrop.
- -1000 Craft.
- +2000 MarketSell.
- -500 Upgrade.

Dùng để:

- audit;
- anti-exploit;
- economy analysis;
- restore.

---

# PHẦN XLIX — ASSET PIPELINE

## 108. Pipeline

```text
Blender
↓
Master .blend
↓
Export GLB
↓
Mesh optimization
↓
Meshopt/Draco
↓
KTX2
↓
LOD
↓
Validation
↓
Manifest
↓
CDN
```

---

## 109. Texture policy

Ưu tiên:

- 256.
- 512.
- 1024.

2048 chỉ khi thật sự cần.

Hạn chế:

- 4K.
- duplicate texture.
- PNG lớn runtime.

---

# PHẦN L — PWA

## 110. Precache

Chỉ cache:

- index.html.
- JS core.
- CSS.
- loading screen.
- login/UI base.

Runtime cache:

- map;
- character;
- monster;
- music;
- VFX;
- texture.

Không precache toàn bộ game.

---

# PHẦN LI — MOBILE

## 111. Phase 1

PWA.

## 112. Phase 2

Capacitor:

- Android.
- iOS.

Có thể dùng native plugin:

- haptic;
- IAP;
- push;
- deep link;
- share;
- storage.

## 113. Phase 3

Native renderer chỉ khi thật sự cần.

Giữ:

- game core;
- protocol;
- data;
- backend.

Thay:

- renderer;
- input;
- platform adapter;
- UI adapter nếu cần.

---

# PHẦN LII — REPO STRUCTURE

```text
rpg-game/
├── apps/
│   ├── game-web/
│   ├── game-server/
│   ├── api-server/
│   └── admin/
│
├── packages/
│   ├── game-core/
│   ├── game-protocol/
│   ├── game-data/
│   ├── world/
│   ├── babylon-renderer/
│   ├── game-ui/
│   ├── asset-runtime/
│   ├── audio/
│   └── shared/
│
├── tools/
│   ├── asset-processor/
│   ├── map-builder/
│   ├── navmesh-builder/
│   ├── texture-compressor/
│   └── data-validator/
│
├── assets-source/
├── game-data/
│   ├── monsters/
│   ├── items/
│   ├── skills/
│   ├── quests/
│   ├── recipes/
│   └── maps/
│
└── infra/
    ├── docker/
    ├── db/
    └── deploy/
```

---

# PHẦN LIII — ADMIN TOOL

## 114. Nên có từ MVP

Features:

- search player;
- inspect inventory;
- give/remove item;
- inspect quest;
- ban/mute;
- teleport;
- spawn monster;
- restart zone;
- edit item/loot;
- audit currency;
- inspect server.

---

# PHẦN LIV — PERFORMANCE TARGET

## 115. FPS

Desktop:

- 60 FPS.

Mid mobile:

- 45–60 FPS.

Low mobile:

- 30 FPS stable.

---

## 116. Entity budget

Target visible:

- <= 50.

Hard cap:

- khoảng 100.

Active combat:

- <10.

---

# PHẦN LV — STATIC ENVIRONMENT

## 117. Dùng Instance / Thin Instance

Cho:

- cây;
- đá;
- cỏ;
- thùng;
- props lặp.

Không tạo hàng trăm mesh độc lập khi không cần.

---

# PHẦN LVI — MVP

## 118. MVP gợi ý

- 1 town.
- 3 map.
- 10 normal monsters.
- 1 elite.
- 1 boss.
- 20 items.
- 5 active skills.
- 1 basic crafting flow.
- 1 upgrade flow.
- online players.
- chat.
- inventory.
- equipment.
- quest cơ bản.
- một breakthrough đầu tiên.
- một hybrid path cơ bản.

Mục tiêu MVP:

- chứng minh game feel;
- multiplayer;
- progression không level;
- breakthrough;
- map streaming;
- mobile performance;
- asset pipeline;
- server authoritative.

---

# PHẦN LVII — ROADMAP

## Phase 0 — Foundation

- monorepo;
- shared type;
- Babylon bootstrap;
- React HUD;
- Colyseus;
- DB;
- auth;
- config.

## Phase 1 — Movement

- spawn;
- camera;
- target;
- movement;
- NavMesh;
- multiplayer sync;
- reconnect.

## Phase 2 — Combat

- select target;
- auto approach;
- attack;
- HP;
- death;
- skill.

## Phase 3 — Monster AI

- spawn;
- patrol;
- aggro;
- chase;
- attack;
- leash;
- boss.

## Phase 4 — Progression Core

- Thân.
- Năng Lượng.
- Thần Thức.
- Đạo.
- Equipment.
- Bản Mệnh.

## Phase 5 — Breakthrough

- Luyện Khí.
- Trúc Cơ.
- first Foundation.
- first Core.
- breakthrough event.

## Phase 6 — World

- zone;
- chunk;
- AOI;
- streaming;
- dungeon.

## Phase 7 — Optimization

- pooling;
- LOD;
- simulation LOD;
- quality manager;
- mobile profiling.

## Phase 8 — Economy

- craft;
- upgrade;
- wallet;
- currency ledger;
- marketplace prep.

## Phase 9 — Social

- party;
- friend;
- guild;
- leaderboard.

## Phase 10 — PWA / Mobile

- install;
- cache;
- Capacitor;
- Android/iOS packaging.

---

# PHẦN LVIII — DESIGN RULES

## 119. Quy tắc gameplay

1. Không Character Level.
2. Không grind XP làm progression chính.
3. Cảnh giới là bước nhảy bản chất.
4. Build trong cùng cảnh giới vẫn phải khác nhau.
5. Node progression phải mở mechanic, không chỉ +% stat.
6. Tri thức và material là progression.
7. Boss phải có nhiều loại reward.
8. Vượt cảnh giới được phép nhưng phải rất khó.
9. Gear tốt có thể evolve thay vì bị vứt.
10. Breakthrough phải là event đáng nhớ.
11. Map cũ phải có layer mới khi cảnh giới tăng.
12. Tu Tiên và Cơ Đạo phải cùng chiều sâu.
13. Hybrid không được auto mạnh nhất.
14. Power fantasy phải rất rõ.
15. Hóa Thần phải thật sự có cảm giác “thảm họa/quốc lực”.

---

# PHẦN LIX — CODING RULES

## 120. Quy tắc coding agent

1. Không import Babylon vào `game-core`.
2. Không import React vào `game-core`.
3. Server authoritative.
4. Không hardcode monster stat trong source.
5. Không load toàn world.
6. Mọi entity có lifecycle rõ.
7. Spawn/despawn thường xuyên phải pooling.
8. Không network mỗi frame nếu không cần.
9. Không sync toàn state nếu chỉ một field đổi.
10. Không dùng full physics cho logic đơn giản.
11. Không dùng React state cho transform per-frame.
12. Data quan trọng phải schema validation.
13. Feature mới phải xét mobile performance.
14. Asset phải qua validation.
15. Không microservice quá sớm.
16. Economy transaction phải audit được.
17. Không trust client.
18. Ưu tiên stable FPS.
19. Progression system phải data-driven.
20. Breakthrough/cảnh giới phải tách khỏi Character Level.

---

# PHẦN LX — TECH STACK CUỐI

```text
Language:
TypeScript

Engine:
Babylon.js

Renderer:
WebGPU
fallback WebGL2

UI:
React

UI State:
Zustand

Build:
Vite

PWA:
vite-plugin-pwa
Workbox

Navigation:
Recast NavMesh

Physics:
Simple custom collision
+ Havok selectively

Networking:
Colyseus
WebSocket

Backend:
Node.js
Fastify

Database:
PostgreSQL

ORM:
Drizzle

Cache / Infra:
Redis

Assets:
Blender
GLB/glTF
KTX2
Meshopt
Draco

Storage:
S3/R2 compatible
CDN

Monorepo:
pnpm
Turborepo

Mobile:
PWA
Capacitor
Babylon Native escape hatch

Testing:
Vitest
Playwright
Integration tests
```

---

# PHẦN LXI — NGUYÊN TẮC CỐT LÕI CỦA GAME

> Không tăng cấp nhân vật — người chơi tự kiến tạo con đường tiến hóa của mình.

> Cảnh giới quyết định tầng tồn tại. Build quyết định bạn là ai trong tầng tồn tại đó.

> Tu Tiên và Cơ Giới không phải hai game ghép lại. Chúng là hai cách diễn giải cùng một hệ thống năng lượng và tiến hóa.

> Mỗi breakthrough phải khiến nhân vật trước và sau đột phá gần như là hai sinh vật khác nhau.

> Mỗi lần mạnh lên phải mở thêm một cách tương tác với thế giới, không chỉ tăng damage.

---

# PHẦN LXII — NHỮNG HẠNG MỤC NÊN THIẾT KẾ TIẾP

1. Hệ Skill / Công Pháp / Module hoàn chỉnh.
2. 8 Đạo chính và skill web của từng Đạo.
3. Chi tiết 5 cảnh giới đầu.
4. Breakthrough requirement từng cảnh giới.
5. Core / Foundation / Reactor system.
6. Bản Mệnh system.
7. Mutation system.
8. Item / Equipment affix system.
9. Crafting.
10. Loot table.
11. Boss progression.
12. Faction reputation.
13. Quest structure.
14. World event.
15. PvP power-gap rules.
16. Guild.
17. Marketplace.
18. Economy sinks/sources.
19. Endgame progression sau Hóa Thần.
20. Main story arc chi tiết.
21. World map production version.
22. NPC relationship graph.
23. UI/UX progression screen.
24. Database schema cho progression.
25. Network protocol cho combat.
26. Content pipeline cho coding/design agent.

---

## Kết luận

Thiên Cơ Kỷ được định hướng thành một RPG online 2.5D web-first có bản sắc dựa trên ba trụ lớn:

1. **Tu Tiên × Cơ Giới cùng một nguồn gốc.**
2. **Không Character Level — progression bằng kiến tạo bản thân.**
3. **Cảnh giới có chênh lệch sức mạnh cực lớn và mở ra tầng gameplay mới.**

Nếu giữ đúng ba nguyên tắc này, game sẽ không trở thành một MMORPG truyền thống chỉ đổi skin, mà có thể tạo được một hệ progression rất riêng, đủ sâu để người chơi theo đuổi build lâu dài.
