# TLMN Frontend — Tiến Lên Miền Nam

Giao diện web (React + Tailwind CSS, dựng bằng Vite) cho backend FastAPI
(`server.py` / `app_controller.py`).

## 1. Cài đặt

```bash
cd tlmn_frontend
npm install
```

## 2. Chép ảnh lá bài vào project

Copy **toàn bộ nội dung** thư mục `assets/cards` của bạn (các file `2C.png`
… `KS.png`, `card_back.png`, `JokerC.png`, `JokerD.png`, `JokerH.png`,
`JokerS.png`) vào:

```
tlmn_frontend/public/assets/cards/
```

Bỏ qua 3 file `Joker_black.png`, `Joker_purple.png`, `Joker_red.png` —
chúng chỉ dùng cho Poker Joker, không dùng trong TLMN.

## 3. Cập nhật Backend (2 file thay đổi)

Đợt này có sửa **cả Backend**, không chỉ Frontend — vì tính năng "hiện đúng
lá Joker đã biến hình" cần Backend trả thêm 1 trường dữ liệu mới. Thay 2 file
sau trong thư mục `tlmn_backend` bằng bản mới:

- `server.py` — `turn_time_limit=30`, tự bỏ qua việc phục vụ static file nếu
  chưa `npm run build` (không crash), và `host="0.0.0.0"` để điện thoại
  cùng WiFi truy cập được.
- `app_controller.py` — thêm `table.last_combo_details.transformed_cards`
  vào `get_game_state()` (dữ liệu này `tlmn_rules.py` của bạn đã tính sẵn,
  chỉ là trước đây chưa được trả ra API).

Chạy backend như cũ:

```bash
python server.py
```

## 4. Chạy Frontend — và chơi trên điện thoại

```bash
npm run dev -- --host
```

(`--host` bắt buộc nếu muốn mở từ điện thoại; không cần nếu chỉ chơi trên
máy tính đang chạy lệnh này). Vite sẽ in ra 2 địa chỉ:

- `Local: http://localhost:5173` — mở trên chính máy đang chạy.
- `Network: http://192.168.x.x:5173` — mở địa chỉ NÀY trên điện thoại/máy
  khác **cùng mạng WiFi** với máy đang chạy `npm run dev`.

Frontend tự nhận diện địa chỉ Backend qua `window.location.hostname`, luôn
trỏ sang cổng `8000` — nên **không cần sửa IP tay** dù mở từ máy nào, miễn
Backend (`python server.py`) đang chạy trên máy đó và cùng mạng.

Điện thoại cầm dọc sẽ tự hiện màn hình yêu cầu xoay ngang (bàn chơi ẩn phía
sau cho tới khi xoay ngang).

## 5. (Tuỳ chọn) Gộp thành 1 server duy nhất

```bash
npm run build
```

Backend sẽ tự tìm `dist/` (cùng cấp thư mục cha, tên `tlmn_frontend`) và
phục vụ luôn giao diện tại `http://<IP máy>:8000` — lúc này chỉ cần chạy
`python server.py`, không cần `npm run dev` nữa.

---

## ⚠️ Những điểm đã xác nhận trực tiếp từ code Backend

**Chất bài thực tế là ký hiệu Unicode `♠ ♣ ♦ ♥`, không phải chữ cái S/C/D/H.**
`tlmn_rules.py` định nghĩa bài kiểu `"3♠"`, `"T♥"`, `"X♦"`. `src/cardMapper.js`
tự đổi `♠→S, ♣→C, ♦→D, ♥→H` rồi mới áp quy tắc `T→10`, `X<chất>→Joker<chất>`.

**Joker "biến hình" khi đánh ra:** `tlmn_rules.py` đã tính sẵn
`transformed_cards` (lá Joker được thay bằng lá thật nó đóng giả, vd
Joker → `3♠`) và lưu trong `env.last_combo`, nhưng **chưa được trả ra API**
trước đây. Bản `app_controller.py` mới thêm đường dẫn
`table.last_combo_details.transformed_cards` đúng như yêu cầu; Frontend
(`getDisplayCombo()` trong `gameFlow.js`) luôn ưu tiên dùng mảng này để vẽ
bài giữa bàn và bài đang bay, tự rơi về `last_combo_cards` gốc nếu thiếu.

**"Người thua" = tất cả người KHÔNG phải người thắng.** Đọc `tlmn_sample_env.py`
xác nhận: ván kết thúc ngay khi có 1 người hết bài (không chơi tiếp để phân
nhì/ba) — `finished_players` vì vậy luôn chỉ có đúng người thắng, nên
`is_finished = false` = một trong các người thua, bài còn lại của họ chính
là `all_hands[id]` tại thời điểm ván kết thúc.

**Số lượng Bot bị giới hạn 1–3** (bộ 52/56 lá vừa khít tối đa 4 người chơi).
**`payment_mode`** chỉ nhận `"count_cards"` / `"winner_takes_all"`.

---

## Cấu trúc thư mục

```
index.html                  Meta viewport chuẩn điện thoại (khoá zoom, viewport-fit=cover)
src/
  api.js                    Gọi REST API — BASE_URL tự suy ra từ window.location (mục 4)
  cardMapper.js              getCardImagePath(), parseCard(), describeCard()
  gameFlow.js                Bot delay, vị trí ghế, getDisplayCombo(), createStackEntry(), assignComboSlots()
  handFan.js                 Hình học XÒE QUẠT + kế hoạch xếp bài + keyframes (hàm thuần)
  flight.js                  Lớp phủ bay bài: chia cho Bot, Bot đánh ra bàn (getBoundingClientRect)
  index.css                  Biến kích thước theo vh + @media (max-height) + toàn bộ bố cục tl-*
  App.jsx                    State, polling, tự gọi Bot, chuỗi chia bài, bay bài liền mạch
  components/
    SetupScreen.jsx          Form khởi tạo bàn (tự cuộn được trên màn hình thấp)
    GameScreen.jsx            Bàn chơi: lưới 3x2, chuỗi chia→lật→chờ→xếp, nút thông minh, glow lá nhỏ nhất
    HandFan.jsx               Tay bài xòe quạt: chọn/rê chuột, chia, lật 3D, xếp kiểu người, bay ra bàn
    DeckPile.jsx              Cọc bài úp giữa bàn, mỏng dần khi chia
    ComboRow.jsx              1 combo trên bàn (xoay/lệch nguyên khối, bậc thang)
    PlayingCard.jsx           Lá bài tĩnh (bàn, ghế, showdown) — kích thước theo biến CSS
    OpponentSeat.jsx          Ghế đối thủ: chỉ avatar + tên + chip + bài úp/badge (không khung)
    TurnTimer.jsx             Avatar tròn + vòng đếm ngược (kích thước theo --avatar)
    FloatingDelta.jsx         Số tiền +/- bay lên rồi mờ dần tại avatar
    JokerChoiceModal.jsx      Modal chọn cách ghép khi đánh bộ bài có Joker
```

## Bản nâng cấp mới nhất (đợt 8): responsive điện thoại ngang + animation chia/xếp/đánh bài

**1. Responsive Mobile Landscape**
- `index.html`: `viewport = width=device-width, initial-scale=1.0, maximum-scale=1.0,
  user-scalable=no, viewport-fit=cover`.
- Mọi kích thước bài tính theo CHIỀU CAO màn hình (biến CSS trong `index.css`),
  luôn đúng tỉ lệ ảnh thật 74x104 (≈ 5:7, không dùng `aspect-[2/3]` vì sẽ làm méo
  ảnh): bài trên tay `--hand-card-h: clamp(50px, 17vh, 140px)`, bài giữa bàn
  `clamp(56px, 16vh, 124px)`, bài ở ghế Bot `clamp(38px, 9vh, 70px)`… Máy tính
  (cao ≥ 800px) giữ đúng cỡ lớn như trước.
- Độ đè (margin âm) của 13-14 lá được TÍNH LẠI mỗi khi đổi cỡ cửa sổ/xoay máy
  (`HandFan` đo bề rộng khung + chiều cao lá thật) nên luôn gọn trong khung, góc
  hạng/chất của mọi lá (kể cả Joker) luôn lộ ra.
- `@media (max-height: 500px)`: avatar 2.5rem, font/nút/padding/badge thu còn
  khoảng 65-70% so với bản máy tính. Thêm `@media (max-height: 380px)` cho màn
  hình rất thấp (iPhone SE ngang 568x320).
- Không còn toạ độ px cứng: bàn là lưới CSS 3 cột tỉ lệ cố định x 2 hàng.

**2. UI/UX**
- Bỏ khung nền/viền quanh avatar Bạn và Bot — chỉ còn avatar tròn, tên, số chip
  (lượt của ai thì vòng đếm ngược + tên sáng vàng).
- Nút **Đánh bài** chỉ hiện khi tới lượt CHÍNH THỨC của Bạn (không phải lượt giả
  3s, không phải lúc chờ người khác, không phải lúc đang chia bài); chỉ SÁNG
  (viền vàng) khi các lá đang chọn tạo thành nước đi nằm trong `legal_actions`,
  còn lại mờ + khoá.
- Nút **Bỏ lượt**: không phải lượt mình thì ẩn hẳn; tới lượt mình thì luôn hiện, kể
  cả lượt đánh mới. Backend không cho bỏ lượt khi bàn trống (không có `[]` trong
  `legal_actions`) nên lúc đó nút hiện nhưng mờ + khoá, tránh bấm ra lỗi.
- **Gợi ý lá nhỏ nhất ván đầu:** người bắt buộc đi trước (round 1, bàn trống) thấy
  vòng sáng vàng nhấp nháy nhẹ quanh lá đó (lấy từ giao của các `legal_actions`).

**3-4. Chia bài, xòe quạt, lật và xếp bài** (mỗi ván mới; tổng ≈ 5 giây)
1. Cọc bài úp giữa bàn, mỏng dần khi chia. Chia vòng tròn ≈ 2 giây: bài bay từ cọc
   về tay Bạn (đang úp, thứ tự bị xáo, ĐÚNG vị trí + góc quạt) và về ghế Bot (badge
   số lá đếm tăng dần).
2. Dáng quạt: lá đầu nghiêng -12°, lá cuối +12°, hai đầu thấp hơn giữa; lá sau đè
   lá trước.
3. Lật ngửa TẤT CẢ cùng lúc (xoay 3D) → chờ đúng 1 giây.
4. Xếp theo thứ tự Backend trả về, kiểu người thật: đổi chỗ GẦN thì lá trượt dọc cung
   (dịch X/Y + xoay); đổi chỗ XA (≥ 2 lá) thì lá nhấc bổng lên, lướt ngang qua các lá
   khác, xoay cho khớp góc đích rồi hạ xuống nhét vào khe. Tối đa 2,4 giây.
5. Trong lúc đó Bot chưa được đánh, polling tạm dừng, Bạn chưa bấm được gì.
   Bật "giảm chuyển động" của hệ điều hành thì bỏ qua cả chuỗi này.

**5. Đánh bài liền mạch**
- Bấm "Đánh bài": cụm bài đích được dựng sẵn (ẩn) giữa bàn, đo toạ độ thật của từng
  lá bằng `getBoundingClientRect`, rồi các lá đang chọn bay từ ĐÚNG chỗ đang nằm
  trên tay tới đó. Chỉ SAU KHI bay xong mới cập nhật state (tay bài mất lá + cụm
  bài hiện) trong cùng 1 lần vẽ → không còn chớp/biến mất. Joker "biến hình" thì lá
  bay đổi sang mặt lá thật ngay khi bay.
- Bot đánh: lá úp bay từ ghế Bot tới đúng vị trí cụm bài, vừa bay vừa lật ngửa.
- Dùng Web Animations API + React refs (không thêm thư viện nào, `package.json`
  không đổi).

## Bản sửa lỗi trước đó (đợt 7)

- **Vòng đếm ngược lượt (`TurnTimer.jsx`):** vòng tròn quanh avatar của người
  đang tới lượt (Bot ở ghế, Bạn ở thanh dưới), số giây nằm ngay trong avatar.
  Tổng thời gian lấy từ trường mới `time_limit` của Backend (30s thường / 15s
  chặt tự do / 3s lượt giả) nên vòng luôn đúng tỉ lệ; đổi màu vàng → cam →
  đỏ + nhấp nháy khi còn ≤ 5s. Mỗi state mới từ Server tự đồng bộ lại (reset
  đúng khi sang lượt mới); giữa 2 lần poll và lúc Bot "suy nghĩ" (polling tạm
  dừng) vòng vẫn tự chạy mượt nhờ `__receivedAt` do `api.js` đóng dấu. Vòng ẩn
  khi bài đang bay, khi ván đã xong, và ngay sau khi Bạn bấm đánh.
  **Backend:** `app_controller.py` chỉ thêm đúng 1 trường `"time_limit":
  current_limit` vào state (không đổi gì khác trong bản bạn đã chỉnh). Nếu
  Backend cũ chưa có trường này, Frontend tự dùng 30s.
- **Bot trên nhích hẳn lên sát mép trên màn hình** (nằm trong dải header trống
  ở giữa) → rộng khoảng cách tới khu vực đánh bài.
- **Tâm khu vực bài đánh ra dịch lên ~55px** (giảm khoảng đệm trên, thêm đệm
  dưới 56px) để sảnh dài không chạm thanh `Bạn · ... chip` ở đáy.
- **Bài lật của người thua to hơn ~1.17x:** Bot trên 62×87 → 72×101px, Bot
  trái/phải 48×68 → 58×82px; đã chỉnh lại độ đè và neo Trái/Phải cách mép 176px
  để không đè lên ghế.
- Các toạ độ (54px, 124px, 176px, 200px, 56px) là ước lượng theo kích thước
  ghế hiện tại (~170px cao) — lệch thì chỉ cần nhích các con số này.

## Bản sửa lỗi trước đó (đợt 6)

- **`formatChip()` dùng chung** (trong `gameFlow.js`): ≥1 nghìn tỷ → `T`, ≥1 tỷ
  → `B`, ≥1 triệu → `M`, ≥1 nghìn → `k`, luôn LÀM TRÒN XUỐNG 2 chữ số thập
  phân (1,568,900 → `1.56M`; 2,450,000,000 → `2.45B`; 521,000 → `521.00k`);
  dưới 1 nghìn hiện nguyên số. Áp dụng ở: ghế Bot, thanh dưới của Bạn, số tiền
  bay lên. (Ô nhập ở màn Setup giữ số thường vì là ô nhập liệu; không còn
  khung Nhật ký/Modal tiền để áp dụng.)
- **Ghế Bot trên sát mép trên** (cách header ~10-12px). **Bài trên tay to ~1.3x**
  (tối đa 98px, trước 76px), đè dần tới ~84% để 13-14 lá vẫn 1 hàng; trần cỡ
  bài còn bị giới hạn theo chiều cao cửa sổ để màn hình thấp không bị chiếm hết.
- **Bài lật showdown khít hơn:** dùng cỡ bài NHỎ THẬT thay vì `scale()` (scale
  không đổi kích thước layout nên margin âm trước đây tính sai, bài chưa khít).
  Bot trên: margin -38px, nằm ngay dưới avatar; Bot trái/phải: dọc, đè ~70%.
- **Bài đánh ra giữa bàn:** cả CỤM xoay -8°..8° và lệch ngẫu nhiên nhỏ (±18/±13px)
  quanh tâm cố định; combo càng dài càng đè chặt để không chạm avatar hai bên.
- **Khoá khung không cuộn:** `html, body, #root, .game-container` →
  `height:100vh (100dvh); width:100vw; overflow:hidden`. GameScreen chuyển sang
  cột flex đúng bằng khung nhìn (bàn ở giữa co giãn, thanh bài/nút không bao
  giờ bị cắt). Lưu ý: trên màn hình rất thấp, khu vực bàn sẽ bị hẹp lại.
- **Số ván:** header trừ 1 khi `is_done` (vì `_finalize_match` tăng `num_round`
  ngay khi ván kết thúc).

## Bản sửa lỗi trước đó (đợt 5)

- **Bỏ hẳn khung/viền "bàn chơi":** không còn khối chữ nhật bo góc riêng ở
  giữa màn hình — chỉ còn 1 màu nền xanh chung cho cả trang, bài nổi trực
  tiếp trên đó.
- **Showdown Trái/Phải giờ dàn DỌC** (trước đó code đang dàn ngang thống
  nhất cho cả 3 hướng, không đúng yêu cầu) — chỉ Trên/Dưới mới dàn ngang.
- **Modal chọn Joker chuyển sang lưới 2-3 cột**, `max-h-[80vh]` + cuộn riêng
  phần lưới, tiêu đề/nút Huỷ luôn cố định.
- **Tìm đúng gốc lỗi "tự chọn lá yếu nhất khi vào ván mới":** lựa chọn cũ
  trước đây được xoá dựa theo `gameState.round` đổi — nhưng Backend tăng
  `num_round` NGAY khi có người thắng (is_done=true), tức là round đã đổi
  *trước* khi bấm "Ván mới", nên lúc bấm "Ván mới" round KHÔNG đổi nữa và
  lựa chọn cũ không được xoá đúng lúc, "dính" sang ván mới nếu ván mới tình
  cờ chia lại đúng lá đó (vd "3♠"). Đã đổi sang xoá lựa chọn dựa theo
  `is_active` chuyển false→true (đúng thời điểm ván mới thật sự bắt đầu).
- **Tâm combo trên bàn trở lại neo cố định ở tâm bàn** — đợt trước tôi đổi
  sang "trôi lệch dần theo combo trước" (nextStackOffset) để tạo cảm giác
  chồng bài tự nhiên hơn, nhưng nhìn tổng thể lại dễ bị dạt về 1 góc mất
  thẩm mỹ như bạn phản ánh — đã quay lại lệch ngẫu nhiên NHỎ, ĐỘC LẬP quanh
  tâm cố định mỗi lần (không cộng dồn).

**Về mục "Ván #1 không tăng":** Frontend không tự giữ số ván riêng — số này
luôn lấy thẳng từ `gameState.round` do Backend trả về, nên không có biến
JS nào để "sửa". Khi đọc lại `app_controller.py`, tôi thấy có đúng 1 chỗ
chủ động đưa `num_round` về lại 1: trong `_finalize_match()`, nếu có người
chơi nào bị âm số dư (phá sản) thì dòng `self.env.num_round = 1` sẽ chạy.
Nếu bạn thấy "Ván #1" lặp lại, nhiều khả năng đúng lúc đó có người (Bot hoặc
Bạn) vừa phá sản — đây là hành vi đã có sẵn trong code Backend bạn gửi, không
phải lỗi Frontend. Nếu lúc đó KHÔNG có ai phá sản mà số ván vẫn không tăng,
cần xem lại `tlmn_sample_env.py` (`reset()`/`step()`, quyết định tăng
`num_round` khi nào) — file này chưa được gửi lại ở các lượt gần đây nên tôi
chưa thể xác nhận thêm.

## Bản sửa lỗi trước đó (đợt 4)

- **Bỏ banner "Ván #N kết thúc":** không còn thông báo text nào khi ván kết
  thúc — việc ván xong đã rõ qua bài lộ ra + tiền bay lên + 2 nút đổi thành
  Ván mới/Thoát bàn.
- **Fix lỗi "gập" lá bài đã chọn khi rê chuột qua lại:** nguyên nhân đúng là
  xung đột giữa class CSS `:hover` và class `selected` (2 rule cùng tranh
  transform). Đã bỏ hẳn `:hover` CSS, theo dõi hover bằng state JS, tính
  transform ở một chỗ duy nhất — lá đã chọn giờ giữ nguyên trạng thái nảy
  lên dù rê chuột ra vào, chỉ click lại mới hạ xuống.
- **Showdown (lật bài thua):** bài lật giờ nằm ở khoảng KHÔNG GIAN GIỮA ghế
  và tâm bàn (không còn lồng trong khung ghế), thu nhỏ `scale(0.7)` + xếp
  khít `-30px`. Bot bên phải lật bài lệch sang trái (hướng vào bàn), bên
  trái lệch sang phải, bot trên lệch xuống dưới.
- **Bài giữa bàn sống động hơn:** bài ĐƠN xoay ngẫu nhiên nhẹ (-6°→6°); combo
  2+ lá luôn thẳng đứng nhưng lệch tung độ tăng dần (bậc thang 4px/lá); mỗi
  combo mới trôi lệch dần so với combo TRƯỚC ĐÓ (không quay về tâm cố định).
- **Ghế trên cách xa bàn hơn**, panel bài của Bạn thấp gọn hơn.

## Bản sửa lỗi trước đó (đợt 3)

- **Bot ghim sát mép trang, không chỉ sát mép 1 khung con:** khung chứa ghế
  giờ rộng hết cỡ trang (bỏ `max-w-6xl`) — trên màn hình rộng, Bot trước đây
  vẫn còn cách mép thật một khoảng do bị giới hạn bởi khung cha, nay hết.
- **Badge số lá bài:** to gấp ~1.6x (20px→32px), màu đỏ `#ff4d4f`, viền
  trắng dày `border-2`, đổ bóng mạnh — dễ thấy từ xa.
- **Bài giữa bàn to thêm lần nữa:** 68×96px → 88×124px (gần bằng cỡ bài trên
  tay).
- **Cảnh báo cache cũ (quan trọng):** thêm header "không cache" cho
  `index.html` ở `server.py` — nếu trình duyệt giữ bản HTML cũ sau khi build
  lại, mọi sửa JS/CSS mới sẽ không bao giờ hiển thị dù file trên server đã
  đúng. Xem mục cảnh báo ngay dưới đây.

## Bản sửa lỗi trước đó (đợt 2)

- **Bài của Bạn "chớp nháy" khi Bot ra bài:** đã cô lập hẳn nguồn dữ liệu tay
  bài (chỉ đọc `gameState.my_hand` / `all_hands['0']`, có chú thích rõ trong
  `GameScreen.jsx`), đồng thời vá một race điều kiện thật sự có thể gây giật
  UI: nếu 1 lần poll đã gửi đi ngay TRƯỚC khi tới lượt Bot, phản hồi của nó
  có thể về SAU, giữa lúc Bot đang "suy nghĩ"/bài đang bay — `App.jsx` giờ có
  bộ đếm "thế hệ hành động", tự loại bỏ mọi phản hồi poll đã lỗi thời thay vì
  lỡ áp đè lên state đang được quản lý thủ công.
- **Ghế Bot ngồi sát tâm bàn:** 3 Bot giờ được ghim sát 3 cạnh (trên/trái/
  phải) bằng absolute positioning, tách biệt hẳn khỏi kích thước thảm xanh.
- **Bàn & bài giữa bàn quá nhỏ:** thảm xanh rộng hơn (`max-w-xl`→`max-w-4xl`),
  bài giữa bàn phóng to ~1.4x (trước 48×68px, nay 68×96px).
- **Đã ẩn "Hũ phạt":** bỏ hẳn dòng chữ này khỏi giao diện (logic tính tiền
  phía Backend không đổi).

## Bản sửa lỗi trước đó (đợt 1)

- **HTTP 500 khi Bỏ lượt / khi đánh bài:** đã tách hẳn nhánh Bỏ lượt trong
  `app_controller.py` (return ngay, không chạm Joker) và bọc try/except
  quanh `get_joker_options`/`env.step` — lỗi nội bộ (nếu có) giờ trả về JSON
  `{"status":"error", message:"..."}` thay vì crash. `server.py` có thêm 1
  lưới an toàn toàn cục: exception nào lọt qua cũng in traceback đầy đủ ra
  console server (để biết nguyên nhân gốc) và trả JSON sạch cho Frontend,
  không còn trang lỗi HTML khiến Frontend báo "dữ liệu không hợp lệ".
- **Lộ bài Bot / sai ghế:** đã rà lại kỹ — `OpponentSeat.jsx` chỉ render mặt
  úp (trừ khi ván xong và Bot đó thua), và Bạn được xác định qua đúng khoá
  `"0"` của `players_status` (khớp `player_names = {0: "Bạn"}` phía backend),
  không dùng chỉ số mảng. Logic này vốn đã đúng — đã kiểm tra lại và giữ
  nguyên, không cần sửa gì thêm ở đây.
- **Lá bài bị cắt ngọn khi chọn:** bỏ `overflow-hidden` ở khung tay bài,
  thêm `pt-10`, tăng độ nâng khi chọn lên `-translate-y-8`.

## Hành vi đã cài đặt

**Ghế ngồi & chiều đi:** Bạn luôn dưới; Bot xếp ngược chiều kim đồng hồ theo
tổng số người chơi (2 người: Bot ở trên; 3 người: phải/trái; 4 người:
phải/trên/trái — Bot 1 luôn bên phải Bạn).

**Nhịp độ Bot:** tới lượt Bot, Frontend gọi `/api/bot_action` ngay để biết
trước nước đi nhưng CHƯA cập nhật UI — hiện "Đang suy nghĩ… Ns" tại ghế Bot
trong `1.5 + (số_lá-1) × 0.35` giây (1 lá ≈1.5s, 11 lá ≈5.0s; bỏ lượt: 1.5s
cố định), rồi mới phát hiệu ứng bay (~0.3s) và cập nhật state thật. Polling
tạm dừng suốt thời gian này để không lộ bài sớm; đồng hồ 30s vẫn tự đếm.

**Chọn bài chờ trước lượt:** được phép click chọn/nâng bài bất cứ lúc nào,
kể cả chưa tới lượt — chỉ 2 nút "Bỏ lượt"/"Đánh bài" mới bị khoá khi chưa
tới lượt. Lựa chọn chỉ tự xoá khi sang ván mới (không xoá khi đổi lượt).

**Bài giữa bàn xếp CHỒNG trong cùng vòng:** khi có người đánh đè, combo cũ
KHÔNG biến mất — combo mới xếp lên trên (z-index tăng dần, lệch x/y ngẫu
nhiên nhẹ) tạo cảm giác một chồng bài thật. Toàn bộ combo luôn xếp NGANG
(`flex-row`). Chỉ xoá sạch chồng bài khi vòng đấu reset (bàn trống) hoặc
sang ván mới. Joker hiện đúng lá đã biến hình (không hiện ký tự `X` gốc).

**Bài Bot luôn úp**, hiện số lượng qua badge tròn gradient cam/đỏ đè góc —
không có dòng chữ khô khan, không lộ mặt bài khi ván đang diễn ra.

**Kết thúc ván:** KHÔNG che bàn bằng màn đen — chỉ một banner gọn phía trên;
bài còn lại của tất cả người thua được lật ngửa ngay tại ghế của họ; số tiền
lãi/lỗ bay lên từ avatar mỗi người (xanh lá/đỏ), tự mờ dần trong ~2 giây; nút
"Ván mới" / "Thoát bàn" luôn sẵn, bàn chơi vẫn nhìn thấy đầy đủ phía sau.

**Mobile:** ép xoay ngang (overlay khi phát hiện điện thoại đang dọc); tay
bài của Bạn luôn 1 hàng ngang duy nhất (`flex-nowrap`) — tự co nhỏ kích
thước + tăng độ đè khi 13-14 lá không đủ chỗ, không bao giờ rớt xuống nhiều
hàng.

**Đã bỏ:** khung "Nhật ký ván đấu" bên phải — bàn chơi giờ rộng rãi hơn.

**Khác:** Nút "Đánh bài" chỉ bật khi lá đang chọn khớp đúng 1 nước đi hợp lệ;
modal chọn cách ghép Joker khi có ≥ 2 cách hợp lệ; toàn bộ animation tự rút
ngắn gần như tức thời nếu hệ điều hành bật "giảm chuyển động".

## Giới hạn đã biết

- Đồng hồ lượt của Backend bắt đầu chạy ngay khi gọi `/api/start`, nên phần chia/xếp
  bài (≈ 5 giây) bị trừ vào lượt đầu của người đi trước (vòng đếm ngược ẩn trong lúc đó).
- Trong lúc Bot "suy nghĩ", Frontend đã biết trước nước đi nhưng cố ý trì
  hoãn hiển thị để mô phỏng nhịp độ — không phải Bot tính toán chậm thật.
- Ép xoay ngang dùng `@media (orientation: portrait) and (max-width: 820px)`
  — một cửa sổ trình duyệt desktop thu hẹp & xoay dọc cũng sẽ bị chặn (hiếm
  gặp trong thực tế, chấp nhận được).
- Lỗi HTTP 500 giờ luôn trả JSON sạch, nhưng nếu vẫn thấy lỗi lặp lại, hãy
  xem console đang chạy `python server.py` — traceback đầy đủ được in ra đó,
  gửi lại đoạn đó để xác định chính xác dòng nào trong `tlmn_rules.py` /
  `tlmn_sample_env.py` gây lỗi (2 file này chưa được cung cấp lại ở lượt sửa
  này nên tôi không thể tự sửa sâu bên trong chúng).
