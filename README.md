# 🃏 Tiến Lên Miền Nam — Frontend

Giao diện web cho game bài **Tiến Lên Miền Nam**, chạy cùng backend FastAPI của dự án: nhiều phòng chơi, tài khoản thật (chip lưu trong database), chơi một mình với Bot hoặc cùng bạn bè, tối ưu cho **điện thoại xoay ngang**.

|||
|-|-|
|Công nghệ|React 18.3.1 · Vite 5.4.8 · Tailwind CSS 3.4.10 — không dùng thêm thư viện nào khác|
|Backend đi kèm|`server.py`, `app_controller.py`, `db_helper.py`, `tlmn_multiplayer_web_env.py`, `tlmn_rules.py` (FastAPI; SQLite, hoặc PostgreSQL/Supabase khi đặt `DATABASE_URL`)|
|Bản cập nhật backend|Thư mục `backend-update/`: `server.py` và `app_controller.py` đã cập nhật + `app_controller.diff`. **Cần có** để chơi 2–4 người thật (phòng chờ, nhập mã phòng) và để mã nhà phát triển chỉ riêng chủ game dùng được (mục 9). Chơi một mình với Bot thì backend cũ vẫn chạy được|
|Luật chơi|Xem **Phụ lục** cuối file. Đây cũng là nội dung bảng hướng dẫn trong game (nút **?**), nguồn là `src/content/guide.md`|

---

## 1. Tính năng

**Tài khoản và chip**

* Đăng ký / đăng nhập; mỗi tài khoản có **ID 10 chữ số** và **500.000 chip** khi tạo. Số dư là tiền chơi thật, thắng thua cập nhật theo từng ván.
* **Nút con mắt** ở ô mật khẩu (đăng nhập, đăng ký và ô nhập lại): bấm để xem / ẩn chữ đang gõ. Mặc định luôn ẩn, tự ẩn lại khi đổi giữa tab Đăng nhập và Đăng ký, bấm không làm mất con trỏ trong ô và không gửi form.
* **Thưởng vốn hằng ngày:** đăng nhập ở ngày mới khi số dư ≤ 0 thì backend tặng 50.000 chip; giao diện báo bằng thông báo, chip bay vào số dư và số dư chạy lên.
* **Mã đổi thưởng:** nút 🎁 ở menu là ô nhập mã **duy nhất** của game. Mã do chủ game phát hành dùng được một lần cho mỗi tài khoản; mã nhà phát triển chỉ riêng chủ game nhận được chip, người khác nhập sẽ bị báo mã không hợp lệ (mục 7).
* **Mọi ô nhập đều để trống, không có chữ gợi ý hay ví dụ** (tên tài khoản, mật khẩu, mã đổi thưởng, mã phòng).
* **Thẻ Căn Cước:** bấm ảnh tròn góc trên-trái của menu để đổi ảnh đại diện (cắt tròn ngay trong trang), tên trong game, giới tính (mặc định Nam); xem số dư, kỷ lục số dư, số ván và tỉ lệ thắng của từng chế độ (Đếm lá / Nhất ăn tất).

**Phòng chơi**

* Menu chính có hai ô lớn **Tạo phòng** và **Nhập ID phòng** (cửa sổ nhập mã 6 chữ số, có bàn phím số trên màn hình và gõ bằng bàn phím máy; nhấn **Enter** là vào).
* **Tạo phòng:** mã 6 chữ số tự sinh (đổi được), hình thức trả tiền, chế độ Joker, số người thật, số Bot, mức cược. Người tạo là **chủ phòng**.
* **Chỉ có 1 người thật** (cùng các Bot): ván bắt đầu ngay khi mở phòng.
* **Từ 2 người thật:** phòng **chờ** thay vì bắt đầu. Chủ phòng và số Bot đã chọn ngồi sẵn, các ghế người thật còn lại để trống. Bạn bè bấm **Nhập ID phòng**, gõ mã rồi nhấn Enter: màn hình của họ chuyển sang phòng chờ đó và họ ngồi vào một ghế trống. Chủ phòng bấm **Bắt đầu ngay** lúc nào tuỳ ý, miễn có từ 2 người ngồi; ghế nào chưa có ai thì **để trống, không tự thêm Bot cho đủ chỗ**.
* **Số người trong phòng không cố định.** Con số chọn lúc tạo phòng chỉ là hiện trạng ban đầu; bàn **mở rộng được tới 4 người** sau mỗi ván (phòng tạo cho 4 người thì lúc nào cũng nhận tối đa 4, bất kể lúc đầu có mấy Bot). Ví dụ 3 Bot → bớt còn 2 Bot → ván sau thêm lại 3 Bot; hoặc phòng 2 người + 1 Bot nâng lên 2 người + 2 Bot. **Người thật luôn được ưu tiên** hơn Bot: có ghế trống thì vào ghế trống, hết ghế mà bàn còn dưới 4 thì bàn mở rộng, bàn đã 4 mà có Bot thì Bot bị mời ra.
* **Đang đấu thì không ai vào thêm được** bằng mã phòng. **Giữa hai ván (kết quả, đang đếm ngược) thì vào được:** người vào đi thẳng tới bàn và cùng đếm ngược ván mới. Bàn đã đủ chỗ mà có Bot thì **một Bot được mời ra** nhường chỗ cho người thật.
* **Từ ván thứ hai** mọi thứ tự chạy: kết quả → đếm ngược → chia ván mới. **Không ai giữ quyền bắt đầu**, kể cả chủ phòng ban đầu; chủ phòng thoát thì ván vẫn tiếp diễn.
* **Game không bao giờ tự thêm Bot thay người đã đi.** Người **Thoát bàn** giữa hai ván rời hẳn: ghế của họ **để trống** (hiện “Trống”, không còn avatar), tới lúc chia ván mới các ghế được dồn lại và đánh số lại. Còn **từ 2 người** thì ván sau tự bắt đầu; còn **1 người** thì bàn dừng ở **“Chờ thêm người chơi”** (có mã phòng để bạn bè nhập vào). Muốn có Bot, **chủ phòng** bấm **+ Bot** (hoặc **− Bot** để bớt) ngay trong phòng chờ, lúc đếm ngược hoặc ở màn “Chờ thêm người chơi”; **+ Bot** dùng được tới khi bàn đủ 4 người (hết ghế trống thì bàn tự mở rộng).
* **Chỉ khi phòng ĐANG ĐẤU mới giữ chỗ:** rớt mạng / đóng tab / tải lại trang **giữa ván** thì Bot đánh thay và **giữ chỗ**; đăng nhập lại **trong lúc ván còn đang đánh** là vào **thẳng** bàn cũ, đúng ghế cũ, không qua menu. **Hết ván là hết giữ chỗ** (chỗ giữ được trả khoảng 6 giây sau khi ván kết thúc). **Lúc đếm ngược ván mới, ở phòng chờ hay màn “Chờ thêm người chơi”, ra khỏi phòng bằng cách nào cũng là rời hẳn** (đóng tab, F5, mất mạng, bấm Thoát bàn): ghế để trống, đăng nhập lại vào **menu**, ván sau không chia bài cho người đó nên không ảnh hưởng chip của họ.
* Nút **?** (tròn, trên-phải; trong ván nằm ngay bên trái **Thoát bàn**) mở bảng hướng dẫn nổi. Đồng hồ lượt vẫn chạy khi đang đọc; nếu tới lượt thật của bạn sẽ có nhắc **“Đã đến lượt bạn đánh bài!”**.

**Bàn chơi**

* Chia bài, xếp bài và lật Joker nhanh; bài đánh ra bay vào giữa bàn.
* **Góc nhìn tương đối:** bạn luôn ngồi dưới cùng, người khác xoay quanh theo thứ tự lượt.
* **Gợi ý thông minh:** chạm một lá, game tự chọn cả bộ hợp lệ (đè được bài trên bàn) chứa lá đó, cả ở chế độ Joker. Bỏ chọn lá do game tự thêm thì gợi ý tắt cho đến hết lượt đó, sang lượt sau tự bật lại.
* Bấm ảnh một **người chơi thật** để xem thẻ thông tin của họ (Bot không bấm được); bấm ra ngoài để đóng, bấm ảnh người khác để chuyển.
* Tiền thắng thua: chip bay giữa các ghế, số tiền hiện **xanh khi được, đỏ khi mất**.
* **Tới trắng:** ván dừng ngay, mọi bài lật ngửa, đèn rọi vào bài mạnh nhất, tên bộ bài hiện chữ vàng giữa bàn; người không tới trắng chỉ mờ nhẹ (còn 85%, vẫn đọc rõ bài), người tới trắng yếu hơn 93–100%. **Hết giờ chiếu là gỡ hẳn mọi hiệu ứng tối** (lớp đèn bị gỡ khỏi trang, ghế và tay bài không còn style nào), nên lúc đếm ngược và ván sau mọi thứ sáng như ván thường. Ván thắng bình thường **không** hiện dòng “… về nhất” giữa bàn.
* **Hết ván:** kết quả 5 giây → dọn sạch bàn và đếm ngược 10 giây giữa bàn → những người còn ngồi tự chơi ván mới (không còn nút “Thoát bàn / Ván mới” ở góc dưới).
* **Thoát bàn** bị khoá khi ván đang diễn ra; rớt mạng hoặc đóng trang giữa ván thì backend cho Bot đánh thay **và giữ chỗ** (xem mục 6). Hai nút **Bỏ lượt** và **Đánh bài** cách nhau một khoảng rõ ràng để không bấm nhầm.

---

## 2. Cài đặt và chạy

**Backend**

```bash
cd tlmn_backend/core
pip install fastapi uvicorn numpy psycopg2-binary
python server.py        # http://localhost:8000
```

Lần chạy đầu `server.py` tự tạo database (tài khoản, mã quà tặng, dữ liệu ván). Không đặt `DATABASE_URL` thì dùng SQLite (`tlmn_backend/database/tlmn_user_database.db`); đặt `DATABASE_URL` thì dùng PostgreSQL/Supabase. Frontend không quan tâm bạn dùng loại nào.

**Frontend**

```bash
cd tlmn_frontend
npm install
```

Chép ảnh lá bài vào `public/assets/cards/` (không có sẵn trong mã nguồn):

|Tệp|Ví dụ|
|-|-|
|Lá thường = hạng + chữ cái chất (**S** ♠, **C** ♣, **D** ♦, **H** ♥); lá 10 viết `10`|`3S.png` `10C.png` `QD.png` `AH.png` `2H.png`|
|Joker (chế độ Joker)|`JokerS.png` `JokerC.png` `JokerD.png` `JokerH.png`|
|Mặt úp|`card_back.png`|

* **Đang code:** `npm run dev`, mở `http://localhost:5173`. Trang tự gọi API ở `http://<cùng hostname>:8000`, nên backend phải đang chạy ở cổng 8000. Muốn thử trên điện thoại cùng WiFi: `npm run dev -- --host` rồi mở `http://<IP-máy-tính>:5173`.
* **Chạy gọn bằng một server:** `npm run build` (ra thư mục `dist/`), rồi `python server.py` và mở `http://localhost:8000`. `server.py` tìm bản build ở `../../tlmn_frontend/dist` (tính từ `tlmn_backend/core`), nên hai thư mục `tlmn_backend` và `tlmn_frontend` phải nằm cạnh nhau. Bản build gọi API cùng gốc với trang nên điện thoại trong cùng mạng mở `http://<IP-máy-tính>:8000` là chơi được, không phải sửa IP.
* **Backend ở máy/cổng khác:** tạo tệp `.env.local` trong thư mục frontend với dòng `VITE_API_BASE_URL=http://192.168.1.10:8000` (thay bằng địa chỉ thật).

---

## 3. Chỉnh nhanh

|Muốn đổi|Sửa ở|
|-|-|
|Mức thưởng vốn hằng ngày (dùng để nhận ra thưởng khi backend chưa báo)|`DAILY_BONUS_AMOUNT` trong `src/bonus.js` (hiện 50000, phải khớp `server.py`)|
|Thời gian hiện kết quả / đếm ngược giữa các ván|`HOLD_RESULT_MS` (5000) và `COUNTDOWN_SECONDS` (10) trong `src/matchFlow.js`|
|Nội dung bảng hướng dẫn trong game|`src/content/guide.md` (Markdown: tiêu đề, danh sách, bảng, đậm/nghiêng, `code`, đường kẻ)|
|Màu sắc, font chữ|`tailwind.config.js` (felt, gold, paper, lacquer) và các biến CSS đầu `src/index.css`|
|Cỡ lá bài trên điện thoại / máy tính|các biến `--hand-card-h`, `--table-card-h`, `--seat-card-h`… đầu `src/index.css` (tính theo chiều cao màn hình)|
|Địa chỉ backend|biến môi trường `VITE_API_BASE_URL` (mục 2)|

---

## 4. Cấu trúc mã nguồn

```
src/
├─ main.jsx, App.jsx        Khởi động; điều hướng Đăng nhập → Menu → Tạo phòng → Bàn chơi
├─ api.js                   Mọi lời gọi backend (đối tượng `api`), tự gắn room_id / ghế đang ngồi
├─ stateCompat.js           Lớp tương thích: bổ sung trường còn thiếu trong state của backend (mục 9)
├─ bonus.js                 Nhận ra thưởng vốn hằng ngày, tính điểm bắt đầu cho hiệu ứng chạy số dư
├─ matchFlow.js             Luồng ván nhiều người (hàm thuần): ván mới, máy điều khiển, đổi số dư, ghế trống, thêm / bớt Bot, đổi số ghế theo tên tài khoản
├─ lobby.js                 Phòng chờ (hàm thuần): danh sách ghế, đếm người, lời nhắc, nhận ra máy chủ cũ, nhận phản hồi nối lại (`resumeTarget`)
├─ suggest.js               Gợi ý đánh bài thông minh (hàm thuần)
├─ instantWin.js            Tới trắng: chọn người mạnh nhất, độ tối của những người còn lại
├─ gameFlow.js, flight.js   Nhịp độ Bot, bố cục ghế, hiệu ứng bay bài
├─ handFan.js, cardPower.js, cardMapper.js   Hình học tay bài xòe quạt, sức mạnh lá bài, tên file ảnh
├─ chipFx.js                Chip bay giữa các ghế / vào số dư
├─ profileStore.js, session.js, sound.js, markdown.jsx
├─ content/guide.md         Bảng hướng dẫn (cũng là Phụ lục README)
├─ index.css                Toàn bộ kích thước responsive, hoạt ảnh, bố cục modal
└─ components/
   ├─ AuthScreen · PasswordInput (ô mật khẩu có nút mắt) · MainMenu · SetupScreen · JoinRoomModal · RedeemModal · ProfileModal · AvatarCropper
   ├─ GameSession (mở phòng / vào phòng chờ, poll state, máy điều khiển, mất mạng) · GameScreen (bàn chơi)
   ├─ HandFan · PlayingCard · ComboRow · DeckPile · OpponentSeat · TurnTimer · TurnBanner · CenterCountdown
   ├─ LobbyOverlay · BotControls (− Bot / + Bot của chủ phòng) · WaitingForPlayers (“Chờ thêm người chơi”) · PlayerInfoPopup · SpotlightOverlay · JokerChoiceModal
   └─ HelpButton · HelpModal · BonusToast · FloatingDelta · AnimatedChip · Avatar
```

---

## 5. Frontend nói chuyện với backend thế nào

|Việc|Lời gọi|
|-|-|
|Đăng ký / đăng nhập / mã đổi thưởng / hồ sơ|`POST /api/auth/register`, `/login`, `/redeem`, `/update_profile`|
|Kiểm tra mã phòng chưa bị dùng|`GET /api/rooms`|
|Mở phòng (chủ phòng)|`POST /api/setup` với đúng 7 trường: `room_id`, `joker_mode`, `payment_mode`, `num_bots`, `num_humans`, `cost`, `player_accounts` (**chỉ gồm tài khoản của chủ phòng**; tiền lấy từ tài khoản). Bản mới trả thêm `host_seat` và `open_seats` (các ghế người thật còn trống)|
|Vào phòng bằng mã (khách)|`POST /api/join` `{room_id, username}` → `{seat, host_seat, lobby}`. Lỗi có `code`: `not_found`, `in_progress` (phòng đã chia bài), `full`, `no_account`|
|Phòng chờ (mỗi giây)|`GET /api/lobby?room_id=&player_id=&username=` → ghế nào ai ngồi (`open` / `bot` / `human`), cấu hình phòng, `started`, và `seat` = ghế HIỆN TẠI của `username` (đổi số khi chủ phòng bắt đầu mà còn ghế trống ở giữa; client tự cập nhật ghế của mình theo giá trị này). Lỗi `closed` (phòng bị huỷ) hoặc `kicked` (ghế đã được trả). Gọi đều đặn cũng là “điểm danh”: im lặng quá ~3 phút thì backend coi người đó đã bỏ đi|
|Bắt đầu|`POST /api/start?room_id=&player_id=`: ván đầu **chỉ ghế chủ phòng** gọi được và cần ít nhất 2 người đang ngồi; ghế người thật còn trống thì **bỏ trống, không thêm Bot**: bàn dựng lại với đúng những người đang ngồi, các ghế được đánh số lại liền mạch 0…n-1 (ghế chủ phòng luôn là 0). Các ván sau không cần `player_id`, backend chỉ chia khi không có ván nào đang chạy, và cũng **dồn bàn lại** (bỏ ghế trống, đánh số lại). Còn dưới 2 người đang ngồi thì trả lỗi `code: "need_players"` (không tự thêm Bot): giao diện dừng ở “Chờ thêm người chơi”, có người vào hoặc chủ phòng thêm Bot đủ 2 người thì tự đếm ngược 10 giây rồi gọi lại|
|Xong màn giới thiệu|`POST /api/intro_done`|
|Trạng thái bàn (mỗi giây)|`GET /api/state?room_id=&player_id=<số ghế>&username=`: `my_player_id` luôn là ghế HIỆN TẠI của `username` (giữa hai ván bàn được dồn lại nên số ghế có thể đổi). Thêm `match_number` (số ván), `host_seat` (chủ phòng); ghế đã rời có `type: "empty", is_left: true`|
|Đánh bài / Bỏ lượt / Bot đánh|`POST /api/action` (kèm `username`), `POST /api/bot_action`|
|Thoát|`POST /api/quit` `{room_id, player_id, username, reason?}`. **Đang đấu**, bằng cách nào cũng vậy (kể cả `reason: "disconnect"` = đóng tab / mất mạng): Bot đánh thay nhưng giữ chỗ tới khi ván xong. **Giữa hai ván** (kết quả / đang đếm ngược / chờ thêm người), **có hay không có `reason`** đều là **rời hẳn**: ghế thành trống, không có Bot, không giữ chỗ. Ở phòng chờ trả ghế (chủ phòng thoát = huỷ phòng)|
|Thêm / bớt Bot (chủ phòng)|`POST /api/bots` `{room_id, username, action: "add" \| "remove"}` → `{status, message, lobby}`. `add`: một Bot ngồi vào ghế **trống** số nhỏ nhất; `remove`: một Bot **thật** rời bàn (ghế thành trống). Chỉ chủ phòng, ở phòng chờ hoặc giữa hai ván|
|Nối lại sau khi bị văng|`POST /api/resume` `{username}` → `{resumed: true, room_id, seat, started, host_seat}` (đã trả lại ghế) hoặc `{resumed: false}`. **Chỉ trả ghế khi phòng đang đấu.** Phòng đang đếm ngược / phòng chờ thì luôn `resumed: false`, và nếu ghế cũ chưa kịp được trả (tab cũ chết mà không gửi được tín hiệu thoát, im quá 3 giây) thì ghế được trả ngay lúc này. Gọi ngay sau đăng nhập, và khi thấy Bot đang đánh thay mình|

* **Số ghế** (`player_id` của các lời gọi trên, 0–3) khác **ID tài khoản 10 chữ số**. Khách nhận số ghế của mình ngay trong phản hồi của `/api/join`, không phải đoán qua tên.
* **Máy điều khiển** là máy của người thật còn ngồi trong ván có số ghế nhỏ nhất (không nhất thiết là chủ phòng): chỉ máy này gọi `/api/bot_action`, `/api/intro_done` và `/api/start` của các ván sau. Các máy khác chỉ đọc state, và nếu máy điều khiển im lặng quá ~8 giây thì tự tiếp quản. Chủ phòng chỉ có quyền riêng ở **ván đầu tiên** (nút **Bắt đầu ngay**).
* **Ghế của mình tính theo tên tài khoản.** Vì bàn được dồn lại giữa các ván (cùng một người có thể từ ghế 2 sang ghế 1), frontend luôn lấy ghế từ `my_player_id` của `/api/state?username=` và nhận ra người qua `username`: số dư “trước ván”, chênh lệch xanh / đỏ và chip bay đều so theo người chứ không theo số ghế, nên không bao giờ tính nhầm tiền người này cho người kia.
* Số ván (“Ván #n”) do frontend tự đếm, vì `round` của backend tăng 2 mỗi ván (xem mục 9).
* **State mà frontend cần** (`get_game_state`): `status`, `room_id`, `my_player_id`, `current_player_type`, `instant_win_info`, và trong `players_status[ghế]`: `name`, `username`, `type`, `gender`, `avatar`, `highest_balance`, `stats` (cùng `cards_left`, `balance`, `is_passed`, `is_finished`). Trường nào backend không gửi thì `stateCompat.js` bổ sung bằng giá trị an toàn (mục 9).

---

## 6. Thoát bàn, rớt mạng, Bot đánh thay

|Tình huống|Hành vi|
|-|-|
|Ván đang diễn ra|Nút **Thoát bàn** bị khoá; bấm vào chỉ hiện nhắc nhở|
|Đóng tab / thoát trang / mất mạng lâu (kể cả chủ phòng)|Trình duyệt gửi `POST /api/quit` với `reason: "disconnect"` đúng **một** lần (`navigator.sendBeacon`, dự phòng `fetch` có `keepalive`); nếu phòng **đang đấu** thì backend đổi ghế đó thành Bot đánh thay nhưng **giữ chỗ** (tài khoản vẫn gắn với ghế **tới khi ván xong**) và **ván vẫn tiếp diễn**; nếu là **giữa hai ván** thì ghế thành **ghế trống** ngay (không Bot, không giữ chỗ). Trên bàn vẫn giữ ảnh, tên, chỗ ngồi, chỉ thêm nhãn **“Bot đang đánh thay”**; tiền thắng thua của ván đó vẫn tính cho tài khoản|
|Đăng nhập lại sau khi bị văng|Ngay sau đăng nhập App gọi `POST /api/resume`: còn ghế **và phòng đang đấu** thì vào **thẳng** bàn cũ (đúng phòng, đúng ghế, tự đánh tiếp; phòng đã hết ván / đang đếm ngược / không có phòng thì vào menu như thường; quá 4 giây không trả lời cũng vào menu). Trang được khôi phục từ bộ nhớ đệm, hoặc thấy Bot đang đánh thay mình trong state, cũng tự nối lại. Nhập lại mã phòng cũ giữa hai ván thì vào như người mới (ghế cũ đã trả)|
|Mất mạng nhưng chưa đóng trang|Hiện thanh **“Mất kết nối…”**, nút Thoát bàn mở khoá; có mạng lại thì thanh tự tắt và nút khoá lại nếu ván còn chạy|
|Giữa hai ván (kết quả / đếm ngược)|**Thoát bàn, đóng tab, tải lại trang hay mất mạng** đều là **rời hẳn**: ghế thành **ghế trống** (“Trống”, avatar biến mất trong ≤ 1,5 giây trên máy những người còn lại), **không có Bot thay, không giữ chỗ**; đăng nhập lại vào menu. Máy nào im quá **8 giây** giữa hai ván (tín hiệu thoát bị mất) cũng bị trả ghế. Tới lúc chia ván mới, bàn dồn lại và đánh số lại ghế. Còn từ 2 người thì ván sau tự bắt đầu; còn 1 người thì “Chờ thêm người chơi” (mã phòng + nút **+ Bot / − Bot** cho chủ phòng); hết người thật thì phòng đóng|
|Có người nhập mã giữa hai ván|Vào thẳng bàn, cùng đếm ngược. Có ghế trống thì vào ghế trống; hết ghế mà bàn còn dưới 4 người thì **bàn mở rộng**; bàn đã 4 người mà có Bot thì **một Bot (số ghế lớn nhất) bị mời ra** cho người đó ngồi; không có Bot nào để mời thì báo phòng đã đủ người|
|Chủ phòng thoát (lúc nào cũng vậy, trừ phòng chờ)|Game vẫn tiếp diễn, **không ai nhận thêm quyền gì**: máy điều khiển chuyển sang người thật còn lại có số ghế nhỏ nhất|
|Phòng chờ (chưa chia bài)|Chủ phòng thoát = **huỷ phòng**: khách thấy “Phòng đã đóng…” và quay về menu. Khách thoát chỉ trả ghế cho người khác|

---

## 7. Bảo mật

* **Mật khẩu chỉ giữ trong bộ nhớ của trang** (để gọi các API cần xác thực), không ghi vào `localStorage`. Vì vậy tải lại trang sẽ phải đăng nhập lại; trình duyệt chỉ nhớ **tên đăng nhập** để điền sẵn.
* **Mã nhà phát triển không nằm ở frontend** (không có trong mã nguồn, README hay bảng hướng dẫn) và không còn ô riêng ở màn đăng nhập. Nó được nhập vào chính ô 🎁 của menu như mọi mã khác, và `server.py` quyết định: **chỉ tài khoản chủ game** (hằng số `DEV_USERNAME`, phân biệt hoa thường) nhận chip; người khác nhập sẽ nhận đúng thông báo “Mã đổi thưởng không hợp lệ hoặc không tồn tại!” như một mã không có thật. Frontend chỉ gửi nguyên văn mã cùng tên tài khoản của người đang đăng nhập.
* Ảnh đại diện được thu nhỏ (192×192) và nén trước khi gửi để state của bàn không phình to.

---

## 8. Đã kiểm thử những gì

**Cách kiểm thử, và giới hạn.**

* Giao diện chạy thật trong **Chromium không giao diện** (Playwright). Ảnh lá bài là ảnh SVG tự vẽ thay cho ảnh PNG của bạn.
* Backend là **chính các tệp Python bạn gửi** (`server.py`, `app_controller.py`, `tlmn_rules.py`, `tlmn_multiplayer_web_env.py`, `db_helper.py`) với database SQLite thật; chỉ lớp FastAPI/uvicorn được thay bằng một server HTTP đơn giản gọi đúng các hàm route của `server.py`.
* **Chưa thử được:** FastAPI/uvicorn thật, PostgreSQL/Supabase, và `npm run build` với Vite 5.4.8 + Tailwind 3.4.10 (môi trường kiểm thử không cài được các gói này nên mã được gộp bằng esbuild và CSS biên dịch bằng Tailwind v4). Bạn nên chạy `npm install && npm run build` một lần trên máy mình để chắc chắn.
* Các bài kiểm thử chạy trên **bốn phiên bản backend**: (A) bản trước Core Mới, (B) Core Mới như bản bạn gửi đầu tiên, (C) bản bạn đang dùng (Core Mới + khôi phục các trường của `get_game_state`), (D) **bản cập nhật trong `backend-update/`** (dựng trên đúng các tệp bạn gửi lần gần nhất, kể cả `tlmn_multiplayer_web_env.py` mới của bạn). Các bài về phòng chờ, nhiều người thật, ghế trống / Bot / nối lại, chủ phòng thoát và mã nhà phát triển chỉ chạy trên (D) vì chỉ bản đó có các tính năng này; các bài còn lại chạy trên cả bốn ở các lần kiểm thử trước, riêng đợt cuối (mô hình ghế mới) chạy trên (D); bài “máy chủ cũ” chạy trên (A), (B), (C). Ở lần chạy cuối, **tất cả đều đạt**.
* Trong các bài chơi bình thường, ván “tới trắng” ngẫu nhiên (vài % số ván) được tắt để không làm lệch kết quả; riêng bài **Tới trắng** dùng bộ bài ép sẵn để thử đúng tính năng đó.

|Bài kiểm thử|Nội dung|Số kiểm tra|
|-|-|-|
|Đơn vị (Node)|Gợi ý đánh bài, tới trắng, góc nhìn tương đối, luồng ván / máy điều khiển, hồ sơ, markdown và `guide.md`, lớp tương thích state, `sendBeacon` khi đóng tab (kèm `reason: "disconnect"`), phòng chờ (`lobby.js`), các lời gọi API mới (`/api/bots`, `/api/resume`); **ghế trống, thêm / bớt Bot, đổi số ghế giữa các ván (số dư so theo tên tài khoản), nhận phản hồi nối lại**, nút con mắt mật khẩu; quét mã nguồn: không còn placeholder, chữ ví dụ, `import sqlite3` hay mã nhà phát triển|110 nhóm|
|Tài khoản và menu|Đăng ký, ID 10 chữ số, mã quà khi đăng ký, thẻ hồ sơ, ô nhập ID phòng 6 ô, bảng hướng dẫn, mã phòng tự sinh; ở 3 cỡ màn hình (844×390, 568×320, 1280×720)|29|
|Thưởng ngày, mã quà, hồ sơ|Thông báo thưởng, xu bay, số dư chạy lên, không báo nhầm; đổi mã quà (dùng lại bị từ chối); ID phòng sai; cắt ảnh đại diện, lưu và đọc lại hồ sơ|29|
|Mã nhà phát triển và ô nhập (844×390 và 568×320, chỉ D)|Người thường nhập mã nhà phát triển (mọi cách viết hoa / thường / khoảng trắng) → báo lỗi, không được chip; chỉ tài khoản chủ game nhận chip và dùng lại được; tài khoản chỉ khác chữ hoa / thường bị từ chối; mã do chủ game phát hành dùng được một lần; ô mã ở thẻ chào mừng sau đăng ký cũng theo luật đó; đăng nhập chỉ gửi tên + mật khẩu; **mọi màn hình có ô nhập** (đăng nhập, đăng ký, menu, ô nhập mã, nhập ID phòng, tạo phòng, phòng chờ, hồ sơ, thẻ chào mừng) **không có placeholder, chữ ví dụ hay mã mẫu**|62 × 2|
|Tới trắng|Dừng ván ngay, lật mọi bài, đèn rọi người mạnh nhất, người không tới trắng chỉ mờ nhẹ còn 85%, chữ vàng giữa bàn, tiền thắng thua, sang đếm ngược thì mọi ghế và bài của mình sáng lại 100%, **không có chữ “… về nhất” ở ván thắng thường**, ván sau tự bắt đầu|18 × 2|
|Tới trắng nhìn từ người thua (844×390 và 568×320, cả A, B, C, D)|Bạn có bài thường, Bot khác tới trắng: người thua chỉ mờ nhẹ còn 85% (vẫn đọc rõ bài), người tới trắng yếu hơn 93–100%; sang đếm ngược **không còn phần tử nào bị tối** (kiểm tra mọi phần tử cha của avatar, ghế, tay bài), đèn tắt hẳn, ván sau vẫn sáng|17 × 2|
|Sau tới trắng, ván mới giống hệt ván thường (844×390 và 568×320, chỉ D)|Với cùng bộ bài và cùng người đi trước, ván mới sau tới trắng được so với một ván thường làm mốc: class, style, opacity, filter, visibility của mọi phần tử và cả ảnh chụp đều khớp từng điểm ảnh (che đúng các chỗ vốn khác: tiêu đề “Ván #n”, số dư, đồng hồ lượt). Các tình huống: bạn thua, bạn thắng (bấm chọn bài + Đánh bài hoạt động), hai lần tới trắng liên tiếp, 2 người thật|38 × 2|
|Bắt đầu sớm, không tự thêm Bot, mã 6 số (844×390 và 568×320, chỉ D)|Mã phòng 6 chữ số, phòng chờ đúng 6 ô; chỉ có mình chủ phòng thì nút Bắt đầu bị khoá; B vào thì sáng lên; phòng 3 người thật + 1 Bot, B rời để trống ghế ở giữa, chủ phòng bắt đầu sớm → bàn đúng 3 người (không thêm Bot, không ghế “Trống”), khách đổi từ ghế 2 sang ghế 1 và máy tự dùng ghế mới (state, đánh bài), đánh được nước đầu|27 × 2|
|Trong ván (844×390 và 568×320)|Nút **?** đúng chỗ, bảng hướng dẫn, banner “Đã đến lượt bạn đánh bài!”, đồng hồ vẫn chạy; gợi ý thông minh và tắt gợi ý theo lượt; mất mạng và có mạng lại|31 × 2|
|Phòng chờ và vào bằng mã (844×390 và 568×320, chỉ D)|Chủ phòng mở phòng 3 người thật + 1 Bot, không còn ô nhập tên bạn bè; ghế trống / Bot / người hiện đúng; khách vào bằng cách gõ mã + Enter và bằng bàn phím số trên màn hình; bàn đủ chỗ mà còn Bot thì người thứ tư **được ưu tiên: Bot bị mời ra** và người đó ngồi ghế đó (rồi rời thì ghế trống, Bot không tự quay lại); khách rời thì nhường ghế; vào phòng đang trong ván bị từ chối; chủ phòng huỷ thì khách thấy “Phòng đã đóng…”; mã phòng đã đóng báo lỗi; phòng chờ vừa khung hình, không phải cuộn|43 × 2|
|Nhiều người (hai trình duyệt + 1 Bot, chỉ D)|Mở phòng, vào bằng mã, góc nhìn tương đối, thẻ thông tin đối thủ, khách đóng tab giữa ván → Bot đánh thay (giữ tên, ảnh, vị trí), tính tiền và thống kê cho người đã thoát, hết ván thì chỗ giữ được trả và ván 2 tự bắt đầu chỉ còn chủ phòng + Bot; khách đóng tab ngay sau khi vừa đánh vẫn báo được cho backend|34 + 1 kịch bản|
|Chủ phòng thoát, game vẫn tiếp diễn (chỉ D)|Chủ phòng thoát giữa hai ván → ghế thành **ghế trống (không có Bot thay)**, bàn dồn lại còn người thật + Bot, ván sau tự bắt đầu cho người còn lại (đổi số ghế), không có nút bắt đầu nào, máy của người còn lại gọi `/api/start` (không kèm `player_id`) và điều khiển Bot, chip chủ phòng không còn bị tính, hết người thật thì phòng đóng; chủ phòng đóng tab giữa ván → Bot đánh thay (giữ chỗ), người còn lại chơi tiếp tới hết ván và ván sau vẫn tự bắt đầu|25|
|**Ghế trống, chờ thêm người, thêm / bớt Bot, nối lại (844×390 và 568×320, chỉ D)**|(1) 3 ghế (chủ phòng + khách + Bot): chủ phòng thoát lúc đang đếm ngược → ghế thành “Trống” trên máy khách trong ≤ 1,5 giây (avatar không kẹt lại), ván sau tự bắt đầu cho khách + Bot với ghế được đánh số lại và chơi tới hết ván. (2) 2 người thật, không Bot: một người thoát → “Chờ thêm người chơi 1/2” + mã phòng + nút + Bot / − Bot, 13 giây sau vẫn không tự có Bot, bấm + Bot → đếm ngược 10 giây → ván 2; bấm − Bot → lại chờ; người thứ ba nhập mã → vào thẳng bàn, đếm ngược, ván 3. (3) Bàn đủ có Bot: người thật nhập mã lúc đếm ngược → một Bot bị mời ra, người đó vào thẳng bàn và ván sau có đủ người. (4) Đóng tab giữa ván → Bot đánh thay nhưng giữ chỗ; đăng nhập lại → vào thẳng bàn cũ, đúng ghế, đánh tiếp được|47 × 2|
|Bố cục nút Bot và màn chờ (844×390 và 568×320, chỉ D)|Phòng chờ có đủ 5 nút (chỉ chủ phòng thấy + Bot / − Bot, bấm thêm / bớt thì khách thấy ngay); lúc đếm ngược, − Bot nằm bên trái và + Bot bên phải vòng đếm: nằm trong vùng giữa bàn, không đè vòng đếm, chữ, ghế hay nhau, bấm được (không bị lớp nào che), cao ≥ 27px; màn “Chờ thêm người chơi” giữa hai ghế trống nằm trọn vùng giữa bàn, không tràn, không cuộn trang|27 × 2|
|Nút con mắt mật khẩu (844×390, 568×320, 1280×720)|Mặc định ẩn; bấm → hiện đúng chữ đang gõ, giữ con trỏ, không gửi form; bấm lại → ẩn; Tab + Space dùng được; `aria-label` / `aria-pressed` đổi đúng; đăng ký có hai nút độc lập (mật khẩu, nhập lại); đổi tab thì tự ẩn lại; nút nằm trọn trong ô, rộng ≥ 44px, không đè chữ; đăng nhập thành công khi đang hiện|20 × 3|
|**Bớt / thêm Bot lúc đếm ngược không làm nháy lại màn hình kết thúc (844×390 và 568×320, chỉ D)**|Chủ phòng 1 người + 3 Bot: sau tới trắng và sau một ván thường, lúc đang đếm ngược bấm − Bot, + Bot, − Bot, − Bot, + Bot, + Bot: không lần nào hiện lại chữ “Tới trắng”, đèn sân khấu, bài lật ngửa hay màn kết quả; đồng hồ đếm ngược không bị quay lại từ đầu; hết giờ ván mới vẫn tự bắt đầu. Nguyên nhân từng gặp: bớt / thêm Bot làm bài của ghế đó ẩn / hiện nên `detectNewMatch` tưởng là một ván tới trắng mới (xem `sameFinishedHands` trong `matchFlow.js`)|9 × 2|
|**Tay bài hiện lại sau khi nối lại (844×390, chỉ D)**|Bị văng ngay sau khi chia, giữa ván, rồi tải lại trang (F5) và đăng nhập lại: số lá nhìn thấy được (opacity, vị trí) khớp với số lá backend trả về. Bài test cũ chỉ đếm phần tử trong DOM nên không bắt được lỗi bài bị ẩn|3|
|**Số người trong phòng không cố định (844×390 và 568×320, chỉ D)**|(T) phòng 1 người + 3 Bot: ván 1 (4 người) → bớt 1 Bot → ván 2 (3 người) → lúc đếm ngược nút **+ Bot sáng** (trước đây bị mờ) và bấm thêm lại 1 Bot → ván 3 lại đủ 4 người, ai cũng có 13 lá nhìn thấy được. (L) phòng chờ 2 người thật + 1 Bot: bấm + Bot lên tới 4 người rồi nút mờ, bắt đầu chia cho 4 người. (J) bàn 2 người (1 người + 1 Bot): người thật thứ hai nhập mã giữa hai ván → bàn mở rộng lên 3 người, Bot vẫn còn, cả hai máy thấy đúng 2 ghế đối thủ|16 × 2|
|**Thoát lúc đếm ngược = rời hẳn; chỉ giữ chỗ khi đang đấu (844×390 và 568×320, chỉ D)**|(C1) đóng tab lúc đếm ngược → ghế thành “Trống” trên máy người còn lại, đăng nhập lại ra **menu** (không vào lại bàn), ván 2 chỉ có người còn lại + Bot. (C2) tải lại trang (F5) lúc đếm ngược, khách rồi chủ phòng → đăng nhập lại ra menu, quyền chủ phòng chuyển, ván 2 không chia bài cho người đã đi. (C3) đóng tab **giữa ván** → Bot giữ chỗ (còn tên), hết ván đăng nhập lại → menu, ghế được trả. (C4) F5 **giữa ván** → đăng nhập lại vẫn ở trong bàn, đúng ghế, tay bài nhìn thấy được. (C5) tab chết lặng (mất mạng, tín hiệu thoát không tới) rồi đăng nhập lại → ghế được trả ngay. (C6) tab chết lặng, không đăng nhập lại → ván sau không chia bài cho người đó|40 × 2|
|API ghế mới (Python, backend D)|Mô hình ghế trống / Bot / giữ chỗ: thoát giữa hai ván → ghế trống; còn 1 người thì không bắt đầu được (`need_players`); đá Bot nhường người thật; chủ phòng thêm / bớt Bot (khách bị từ chối, đang đấu bị từ chối); dồn bàn và đánh số lại, tìm ghế theo tài khoản; văng giữa ván → giữ chỗ → `/api/resume` trả đúng ghế; **chỗ giữ được trả khi ván xong**; **thoát lúc đếm ngược bằng cách nào cũng rời hẳn** (có / không `reason`, tab chết lặng, im quá 8 giây); bàn mở rộng tới 4 người; phòng chờ; phòng bỏ hoang; nhiều phòng. Cộng thêm bài API chung của phòng chờ / quit / bắt đầu / mở rộng bàn|102 + 76 + 30|
|Máy chủ cũ (A, B, C; 844×390 và 568×320)|Chọn 2 người thật → báo cần cập nhật `server.py` + `app_controller.py` và không để phòng “ma”; nhập mã phòng báo rõ; chơi 1 người thật + 3 Bot vẫn bình thường|10 × 2|
|Cả ván (844×390 và 568×320)|Tạo phòng, chơi hết ván 1, kết quả 5 giây, dọn bàn và đếm ngược 10 giây, ván 2 tự bắt đầu, khoá/mở **Thoát bàn**, số dư và thống kê khớp database|27 × 2|
|Cỡ màn hình|10 cỡ từ 568×320 đến 1920×1080: màn đăng nhập, menu, form tạo phòng, bàn 4 người đều không tràn, đủ 4 người trên bàn, lá bài trên tay đúng cỡ thiết kế (cao ≈ 17% chiều cao màn hình, tối đa 140px; 75px ở 844×390)|100|
|Chế độ Joker|Tạo phòng bật Joker, chia 14 lá khớp backend, ảnh Joker, đánh một chuỗi nước đi qua giao diện (có đánh Joker khi trên tay có), tay bài khớp backend, không lỗi console|9–10|

Ghi chú: hộp thoại **“Chọn cách ghép Joker”** chưa được kích hoạt trong các lần chạy với backend thật (các ván thử không rơi vào tình huống Joker có nhiều cách ghép), nên phần đó chưa được kiểm thử tự động. Bài **Nhiều người** (hai trình duyệt) chỉ chơi với 2 người thật + 1 Bot; phòng 3–4 người thật được thử ở bài **Phòng chờ** (vào phòng, đầy phòng, rời phòng) nhưng chưa chơi trọn một ván với 3–4 trình duyệt.

---

## 9. Ghi chú về backend

**Cách áp dụng bản cập nhật:** chép đè `backend-update/server.py` và `backend-update/app_controller.py` lên `tlmn_backend/core/`, rồi chạy lại `python server.py`. Các tệp còn lại của bạn (`db_helper.py`, `tlmn_rules.py`, `tlmn_multiplayer_web_env.py`, bản mới nhất bạn gửi) **giữ nguyên, không sửa gì**. Hai tệp được dựng trên đúng bản bạn gửi lần gần nhất (giữ nguyên kiểu xuống dòng CRLF của bạn); `app_controller.diff` và `server.diff` là phần chênh lệch để bạn đối chiếu.

**Hai tệp đó thay đổi những gì** (mọi thứ khác của bạn giữ nguyên: `db_helper`, `accumulated_rewards` là nguồn số dư duy nhất, Free Turn 15 giây, bù thời gian âm, độ trễ Bot linh hoạt, kiểm tra tới trắng trong `start_new_match`):

* **`server.py`:** thêm `POST /api/join` (nhập mã, người thật được ưu tiên), `GET /api/lobby`, `POST /api/bots` (chủ phòng thêm / bớt Bot) và `POST /api/resume` (nối lại sau khi bị văng); `/api/start` nhận `player_id` và báo `need_players` khi dưới 2 người; `/api/state` và `/api/action` nhận thêm `username` để tìm ghế theo tài khoản (bàn được dồn lại giữa các ván nên số ghế có thể đổi); `/api/quit` nhận `username` và `reason` (`"disconnect"` = bị văng → Bot đánh thay nhưng giữ chỗ). Mã nhà phát triển và hằng số `DEV_BALANCE` giữ nguyên như file bạn gửi (không đổi gì ở phần này).
* **`app_controller.py`** (`app_controller.diff` là phần chênh lệch so với bản bạn gửi): **mô hình ghế mới** — mỗi ghế là người thật / Bot / **trống**. Người chủ động **Thoát bàn** giữa hai ván để lại ghế trống (`type: "empty", is_left: true`), **không bao giờ tự thay bằng Bot**. Người bị **văng** (`reason: "disconnect"`) thì ghế do Bot đánh thay nhưng vẫn gắn với tài khoản (`held_since`) **chỉ trong lúc ván còn đang đấu** (cửa sổ nối lại 30 phút) để `resume_seat` trả lại ghế khi đăng nhập lại; ván xong là chỗ giữ được trả sau `RESULT_GRACE_SECONDS` (6 giây). Giữa hai ván mọi kiểu thoát (kể cả `reason: "disconnect"`) đều để lại ghế trống; máy im quá `STALE_PRESENCE_SECONDS` (8 giây) bị trả ghế, và đăng nhập lại mà ghế cũ im quá `STALE_ON_RESUME_SECONDS` (3 giây) thì ghế được trả ngay. Bàn **mở rộng được tới `MAX_PLAYERS` = 4** (`_grow_table`), không phụ thuộc số người lúc tạo phòng. Tới lúc chia ván mới, `_compact_seats` bỏ ghế trống và đánh số lại liền mạch; mọi tra cứu ghế (state, action, quit, lobby) đi theo `username`; `get_game_state` thêm `match_number` và `host_seat`. Dưới 2 người đang ngồi thì `start_new_match` trả `need_players` (không tự thêm Bot). `manage_bots` cho chủ phòng thêm / bớt Bot (chỉ ở phòng chờ hoặc giữa hai ván); `join_room` cho người thật vào cả giữa hai ván (ghế trống → mở rộng bàn → mời một Bot ra → báo đầy); người thật cuối cùng rời đi thì phòng đóng. Giữ nguyên: phòng chờ (`host_seat`, `open_seats`, `get_lobby`, tự dọn người im lặng ~3 phút trước ván đầu), ván đầu chỉ chủ phòng bắt đầu, `start_new_match` không chia đè khi đang có ván, `TLMNRoomManager.find_room` / `find_room_of`, khoá `threading.RLock` quanh các thao tác của một phòng, và không còn `import sqlite3` (chỉ dùng `db_helper`).

**Backend cũ (chưa cập nhật)** vẫn chơi được **một mình với Bot**. Chọn từ 2 người thật trở lên, hoặc nhập mã phòng, thì giao diện báo “Máy chủ chưa hỗ trợ phòng nhiều người thật…” và đóng phòng vừa mở (không để phòng “ma”).

**Các ghi chú còn lại**

1. **`get_game_state`:** bản `app_controller.py` bạn gửi lần này đã có phần khôi phục các trường `status`, `room_id`, `my_player_id`, `current_player_type`, `instant_win_info` và `username`, `type`, `gender`, `avatar`, `highest_balance`, `stats` ở từng ghế, bản cập nhật giữ nguyên. Frontend vẫn chạy được với backend chưa có các trường đó nhờ `src/stateCompat.js`, nhưng khi đó ảnh và thống kê của người khác không hiện, thông tin tới trắng chỉ ước lượng từ nhật ký, và ghế đã bị Bot thay chỉ nhận ra qua dòng nhật ký “Bot đã tự động tiếp quản”.
2. **Ván tới trắng** được lưu ngay lúc chia (`is_active = false`, `_finalize_match()`), số dư đã nằm trong `accumulated_rewards`. Frontend chạy đúng với cả kiểu mới (`is_active = false`) lẫn kiểu cũ (`is_active = true`).
3. **`round` tăng 2 mỗi ván** (một lần ở env, một lần ở `_finalize_match`), kể cả ván tới trắng. Frontend tự đếm số ván nên không ảnh hưởng.
4. **Thưởng hằng ngày không có cờ:** frontend nhận ra qua chênh lệch số dư so với lần đăng nhập trước, nên **lần đăng nhập đầu tiên trên một thiết bị mới sẽ không báo thưởng** (số dư vẫn đúng). Thêm `"daily_bonus": 50000.0` (hoặc `0`) vào phản hồi `/api/auth/login` là xong, frontend đã đọc sẵn trường này.
5. **Rớt mạng mà không đóng trang:** backend không biết người đó đã đi; tới lượt họ, hết 30 giây backend tự đánh nước đầu trong `legal_actions`, và chỉ khi có `POST /api/quit` thì ghế mới thành Bot. Có thể đếm “lần cuối `/api/state` của ghế đó được gọi” để tự đổi sang Bot (phòng chờ đã có cơ chế tương tự: im lặng ~3 phút thì ghế được trả).
6. **`/api/setup` không kiểm tra trùng `room_id`:** phòng cũ cùng mã bị ghi đè (frontend tự kiểm tra qua `/api/rooms` trước khi mở phòng). Mã 6 số chỉ có 900.000 khả năng nên khi có thật nhiều phòng cùng lúc, hai người mở phòng sát nhau vẫn có thể trùng mã; nếu cần chắc chắn hơn, cho `/api/setup` từ chối khi `room_manager.find_room(room_id)` đã có phòng đang chơi.
7. **`accumulated_rewards` là nguồn số dư của phòng đang chạy:** mã đổi thưởng và thưởng hằng ngày chỉ sửa cột `balance` trong database. Nếu cùng tài khoản đang ngồi trong một phòng (ở thiết bị khác) thì cuối ván `_finalize_match` ghi đè `balance` bằng `accumulated_rewards` và số vừa nhận bị mất. Menu chỉ cho nhập mã khi không ở trong ván nên bình thường không gặp. Người thoát **giữa ván** vẫn gắn tài khoản với ghế (đã thành Bot) tới hết ván đó nên tiền thắng thua của ván vẫn tính cho họ; người thoát **giữa hai ván** được tách khỏi ghế ngay, chip không bị Bot đem đi chơi tiếp.
8. **`db_helper.py` nạp `psycopg2` ngay đầu tệp**, nên máy chỉ dùng SQLite cũng phải `pip install psycopg2-binary`. Muốn bỏ ràng buộc đó, chỉ `import psycopg2` bên trong `get_db_connection()` khi có `DATABASE_URL`.
9. Mật khẩu đang lưu và so sánh **dạng văn bản thường** trong database; nên băm (ví dụ `hashlib.pbkdf2_hmac` hoặc `bcrypt`) trước khi dùng cho nhiều người.
10. **Mã chưa dùng tới trong `tlmn_rules.py`:** hàm `can_chop_out_of_turn` gọi `is_pig_or_hang` (chỉ được định nghĩa trong `app_controller.py`) và `get_all_valid_chops_in_hand` (không được định nghĩa ở đâu cả). Hiện không nơi nào gọi hàm này nên chưa gây lỗi, nhưng sẽ báo `NameError` nếu bạn bắt đầu dùng.
11. **Backend không xác thực người gọi:** `username` và số ghế do trình duyệt gửi lên được tin nguyên văn (`/api/join`, `/api/lobby`, `/api/quit`, `/api/action`…). Chỉ phù hợp cho nhóm bạn bè; muốn chặt hơn cần cấp token lúc đăng nhập và kiểm tra ở mọi route.
12. **Phòng nằm trong bộ nhớ của một tiến trình:** `RLock` chỉ bảo vệ trong một tiến trình, nên hãy chạy một worker (cách chạy `python server.py` hiện tại đã như vậy). Chạy nhiều worker thì mỗi worker có danh sách phòng riêng.

---

## Phụ lục — Luật chơi

*Nội dung dưới đây chính là bảng hướng dẫn trong game (`src/content/guide.md`). Sửa ở đó, rồi chép lại vào đây nếu muốn hai nơi giống nhau.*

Game bài **Tiến Lên Miền Nam**: bạn ngồi cùng bạn bè và/hoặc 1–3 Bot, đánh bài ngược chiều kim đồng hồ, chặt Heo, chặt hàng, ăn tiền cược. Có hai chế độ: **Thường** (bộ bài 52 lá) và **Joker** (thêm 4 lá Joker, mỗi người 14 lá, nhiều bộ mới).

Giao diện chạy trên trình duyệt, tối ưu cho **điện thoại xoay ngang**: bài được chia, lật, xếp và bay ra giữa bàn mượt như đánh bài thật.

---

### 1. Tài khoản và chip

* **Đăng ký** để nhận **500.000 chip** và một **ID người chơi gồm 10 chữ số** (xem lại bất cứ lúc nào ở thẻ hồ sơ).
* Tiền chơi của bạn chính là **số dư tài khoản**: thắng thì cộng, thua thì trừ, được lưu lại cho lần sau. Không cần nhập tiền khởi tạo khi tạo phòng.
* **Hết tiền?** Nếu số dư của bạn **bằng hoặc dưới 0**, lần đăng nhập đầu tiên của **ngày mới** hệ thống tự tặng thêm **50.000 chip** tiền vốn và báo cho bạn ngay ở menu.
* Có **mã quà tặng**? Bấm **🎁 Mã quà tặng** ở menu. Mỗi tài khoản chỉ dùng mỗi mã một lần.
* Bấm **ảnh tròn ở góc trên bên trái** của menu để mở **thẻ người chơi**: đổi ảnh đại diện, tên trong game, giới tính; xem số dư, kỷ lục số dư, số ván và tỉ lệ thắng của từng chế độ.

---

### 2. Phòng chơi

* **Tạo phòng:** mã phòng gồm **6 chữ số** được tạo tự động (bấm ⟳ để đổi mã). Chọn **hình thức trả tiền**, **chế độ Joker**, số người thật, số Bot và mức cược. Người tạo phòng là **chủ phòng**.
* **Chỉ có mình bạn là người thật:** ván bắt đầu ngay khi phòng mở.
* **Chơi cùng bạn bè (từ 2 người thật trở lên):** phòng sẽ **chờ** thay vì bắt đầu ngay. Bạn và số Bot đã chọn ngồi sẵn, các ghế còn trống dành cho bạn bè. Bạn bè đăng nhập, bấm **Nhập ID phòng**, gõ mã 6 chữ số của phòng rồi nhấn **Enter** (bàn phím số trên màn hình hoặc bàn phím của máy đều được): màn hình của họ tự chuyển sang phòng chờ đó. Chủ phòng bấm **Bắt đầu ngay** vào lúc nào tuỳ ý, miễn đã có từ 2 người ngồi. **Ghế nào chưa có ai thì để trống, game không tự thêm Bot cho đủ chỗ**: bàn chỉ gồm những người đang ngồi. Muốn có Bot, chủ phòng bấm **+ Bot** ngay trong phòng chờ (và **− Bot** để bớt).
* **Số người trong phòng không cố định:** bàn nhận **tối đa 4 người**, bất kể lúc tạo phòng bạn chọn mấy người hay mấy Bot. Sau mỗi ván chủ phòng thêm hay bớt Bot thoải mái (ví dụ 3 Bot → 2 Bot → lại 3 Bot), bạn bè vào thêm thì bàn tự rộng ra. **Người thật luôn được ưu tiên hơn Bot.**
* **Đã vào ván thì không ai vào thêm được:** nhập mã của một phòng đang đánh sẽ chỉ nhận được thông báo phòng đang trong ván.
* **Hết mỗi ván:** kết quả hiện **5 giây**, sau đó bàn được dọn sạch và đếm ngược **10 giây** ở giữa bàn. Những người còn ngồi lại sẽ **tự động chơi ván mới**: từ ván thứ hai trở đi **không ai phải bấm Bắt đầu**, kể cả chủ phòng.
* **Tới trắng:** nếu ai đó có bộ bài thắng ngay lúc chia, ván dừng lại, tất cả bài được lật ra, bài mạnh nhất được chiếu sáng và tên bộ bài hiện giữa bàn; những người còn lại chỉ tối nhẹ (vẫn đọc được bài), và khi sang đếm ngược mọi người sáng lại như bình thường.

---

### 3. Thoát bàn và mất kết nối

* **Đang đánh thì không thoát được:** nút **Thoát bàn** bị khoá cho tới khi ván kết thúc. Bấm vào chỉ hiện nhắc nhở.
* **Rớt mạng, đóng trang hay tải lại trang LÚC ĐANG ĐÁNH:** Bot sẽ **đánh thay bạn đến hết ván** và **giữ chỗ cho bạn**. Ảnh, tên và chỗ ngồi của bạn vẫn giữ nguyên trên bàn, chỉ có nhãn **“Bot đang đánh thay”**. Đăng nhập lại **khi ván còn đang đánh** là bạn **vào thẳng lại đúng bàn đó** và tự đánh tiếp, không phải qua màn hình chính. Tiền thắng thua của ván đó vẫn tính cho tài khoản của bạn. **Ván kết thúc là hết giữ chỗ:** nếu bạn đăng nhập lại sau đó, bạn sẽ ở màn hình chính.
* **Chủ phòng thoát thì game vẫn tiếp diễn:** những người còn lại cứ chơi và các ván sau vẫn tự bắt đầu. Chủ phòng chỉ có quyền bắt đầu **ván đầu tiên**; sau đó không ai giữ đặc quyền nào (riêng nút **+ Bot / − Bot** thuộc về chủ phòng).
* **Ở phòng chờ:** chủ phòng thoát sẽ **huỷ phòng** (những người đã vào được đưa ra ngoài); khách thoát chỉ trả lại ghế cho người khác.
* **Hết ván (kết quả và đếm ngược ván mới):** nút **Thoát bàn** dùng tự do. Thoát giữa hai ván là **rời hẳn, bằng cách nào cũng vậy**: bấm Thoát bàn, đóng trang, tải lại trang hay mất mạng đều giống nhau, chỗ của bạn **để trống** ngay (không có Bot ngồi thay, không giữ chỗ) và lần đăng nhập sau bạn vào màn hình chính. Nhờ vậy ván sau không chia bài cho người đã đi và không ảnh hưởng tiền của họ. Ván sau vẫn tự bắt đầu cho những người còn lại nếu còn **từ 2 người**; nếu chỉ còn 1 người, bàn hiện **“Chờ thêm người chơi”** cùng mã phòng để bạn bè nhập vào. Chủ phòng có thể bấm **+ Bot** để thêm Bot vào chỗ trống hoặc **− Bot** để bớt Bot. Game **không bao giờ tự thêm Bot**. Phòng chỉ đóng khi không còn người thật nào.
* **Bạn bè vào lúc đang đếm ngược ván mới:** nhập mã phòng là vào được. Có ghế trống thì vào ghế trống; hết ghế mà bàn còn dưới 4 người thì bàn mở rộng; bàn đã đủ 4 người mà có Bot thì một Bot sẽ được mời ra để nhường chỗ cho người thật.

---

### 4. Game này là gì?

Mục tiêu rất đơn giản: **hết bài đầu tiên**. Người về nhất ăn tiền, những người còn lại đền theo số bài còn trên tay. Bài càng nhiều, càng có hàng hay Heo kẹt trên tay thì càng đau ví.

|||
|-|-|
|Số người|2–4 (người thật + Bot)|
|Bài|13 lá/người (Thường), 14 lá/người (Joker)|
|Thứ tự lá|`3 4 5 6 7 8 9 10 J Q K A 2` (2 = **Heo**, lớn nhất)|
|Thứ tự chất|Bích ♠ < Chuồn ♣ < Rô ♦ < Cơ ♥ (cùng hạng thì so chất)|
|Tiền|Mức cược do chủ phòng chọn, tiền lấy từ số dư tài khoản|
|Thời gian|30 giây mỗi lượt, hết giờ máy tự đánh thay|

**Hai cách tính tiền** (chọn lúc tạo phòng):

* **Đếm lá**: còn bao nhiêu lá trên tay thì đền bấy nhiêu lần cược.
* **Nhất ăn tất**: thua là đền một mức cố định, gọi là một tụ, không quan tâm còn mấy lá. Các hệ số phạt nhỏ hơn 10 lần so với Đếm lá.

---

### 5. Cách đánh bài (chung cho cả hai chế độ)

**Lượt đầu tiên:** ván đầu, ai cầm lá nhỏ nhất (thường là **3♠**) đánh trước, và nước đầu **bắt buộc chứa lá đó** (lá này được viền sáng cho dễ thấy). Từ ván sau, người thắng ván trước đánh trước, muốn đánh gì tuỳ ý.

**Đè bài:** phải đánh **cùng loại, cùng số lá, lớn hơn** bộ đang nằm trên bàn. So lá cao nhất của bộ: hạng trước, chất sau. Không đè được thì **bỏ lượt**. Bàn trống thì không được bỏ lượt.

**Bỏ lượt là bỏ luôn cả vòng:** đã bỏ thì chỉ quay lại được bằng cách **chặt**. Khi cả bàn đã bỏ hết, người đánh bộ cuối cùng được đi tự do.

#### Các bộ được đánh

|Bộ|Mô tả|
|-|-|
|**Lẻ**|1 lá|
|**Đôi**|2 lá cùng hạng|
|**Xám cô**|3 lá cùng hạng|
|**Sảnh**|Từ 3 lá liên tiếp trở lên|
|**3 đôi thông**|3 đôi liên tiếp (hàng)|
|**Tứ quý**|4 lá cùng hạng (hàng)|
|**4 đôi thông**|4 đôi liên tiếp (hàng)|

Sảnh và đôi thông chỉ chạy đến **Ách**, **không chứa Heo**.

#### Chặt Heo, chặt hàng

|Bộ chặt|Chặt được|
|-|-|
|3 đôi thông|1 Heo, 3 đôi thông nhỏ hơn|
|Tứ quý|1 Heo, đôi Heo, 3 đôi thông, Tứ quý nhỏ hơn|
|4 đôi thông|1 Heo, đôi Heo, 3 đôi thông, Tứ quý, 4 đôi thông nhỏ hơn|

Nếu bạn đã bỏ lượt trước đó nhưng đang cầm bộ có thể chặt, và trên bàn xuất hiện bộ có thể bị chặt, thì bạn được cấp một khoảng thời gian ngắn để quyết định có **chen lượt vào chặt** hay không.

---

### 6. Tiền phạt: hũ phạt, chặt và chốt vòng

Mỗi lần có người đánh ra **hàng, Heo hoặc Joker**, một khoản phạt được cộng dồn vào **hũ phạt** (sảnh thì không). Ai **chặt** thành công sẽ thành người thắng chờ chốt. Nếu vòng đó khép lại mà không ai chặt tiếp, người bị chặt nộp **toàn bộ hũ** cho người chặt (tối đa bằng số tiền họ đang có). Nếu người chặt lại bị chặt đè thì hũ chuyển sang người chặt sau.

**Bảng điểm phạt** (nhân với tiền cược):

|Lá / bộ đánh ra|Đếm lá|Nhất ăn tất|
|-|:-:|:-:|
|5 đôi thông *(Chế độ Joker)*|60|6|
|4 đôi thông|50|5|
|Tứ quý|40|4|
|3 đôi thông|30|3|
|Joker đỏ (♦♥) *(Chế độ Joker)*|25|2,5|
|Heo đỏ (2♦ 2♥)|20|2|
|Joker đen (♠♣) *(Chế độ Joker)*|15|1,5|
|Heo đen (2♠ 2♣)|10|1|

#### Khi có người về nhất

Người còn bài trả tiền cho người thắng:

* **Đếm lá**: số lá còn lại cộng tiền phạt các hàng/Heo/Joker còn kẹt trên tay.
* **Nhất ăn tất**: bắt đầu tính từ 1 tụ và cộng tiền phạt các hàng/Heo/Joker còn trên tay.
* Hệ thống sẽ tự động tính ra tiền phạt **lớn nhất có thể** từ tay bài người thua.

Sau đó nhân với các **hệ số đặc biệt** (nhân chồng lên nhau):

|Tình huống|Hệ số|
|-|:-:|
|**Cóng**: thua mà chưa đánh được lá nào|×2|
|**Đút 3 bích**: người thắng kết thúc bằng đúng một lá 3♠ lẻ|×3|
|**Thối 3 bích**: người thua còn giữ 3♠ trên tay|×3|

---

### 7. Chế độ Thường (52 lá, 13 lá/người)

#### Các bộ được đánh

Lẻ, Đôi, Xám cô, Sảnh, 3 đôi thông, Tứ quý, 4 đôi thông.

#### Tới trắng

**Tới trắng** là bộ bài đẹp đến mức thắng ngay lúc chia, không cần đánh. Mỗi người không tới trắng phải trả cho người tới trắng **hệ số × tiền cược**.

**Có hiệu lực mọi ván:**

|Bộ tới trắng|Đếm lá|Nhất ăn tất|
|-|:-:|:-:|
|**Sảnh rồng** (3 → A, đủ 12 lá)|×70|×7|
|**5 đôi thông**|×60|×6|
|**Tứ quý Heo**|×50|×5|
|**6 đôi**|×40|×4|

**Chỉ ván đầu tiên** (các bộ có chứa 3♠):

|Bộ tới trắng|Đếm lá|Nhất ăn tất|
|-|:-:|:-:|
|4 đôi thông có 3 bích|×30|×3|
|Tứ quý 3|×20|×2|
|3 đôi thông có 3 bích|×10|×1|

Nếu hai người cùng tới trắng thì người **mạnh hơn** nhận phần chênh lệch hệ số. Nếu cùng loại thì người có lá lớn nhất thắng thêm 10 lần cược (Đếm lá) hoặc 1 lần cược (Nhất ăn tất).

---

### 8. Chế độ Joker (56 lá, 14 lá/người)

Bộ bài có thêm **4 lá Joker có chất khác nhau** (♠ ♣ ♦ ♥). Joker là lá "đa năng", có thể biến hình thành lá khác để tạo bộ hoàn chỉnh.

#### Cách dùng Joker

* **Joker mang một chất cố định**, khi dùng thì sẽ thay thành lá có giá trị mang chất đó, và chỉ thay được lá **không trùng với lá thật đã xuất hiện trong bộ.**
* Nếu một bộ có **nhiều cách ghép Joker**, bạn được **chọn** trong cửa sổ hiện ra (Bot tự lấy cách đầu tiên). Khi đánh ra, Joker lật lại thành đúng lá nó thay.
* Joker dùng được cho mọi bộ: đôi, sảnh, tứ quý, đôi thông, kể cả Heo.
* Nếu **Joker biến thành Heo mà Heo đó bị chặt**, thì bị phạt tiền Heo và Joker màu đó.

#### Các bộ được đánh

Tất cả các bộ của chế độ Thường, cộng thêm:

|Bộ mới|Mô tả|
|-|-|
|**5 đôi thông**|5 đôi liên tiếp (hàng)|

* **5 đôi thông chặt được:** 1 Heo, đôi Heo, 3 Heo, 3 đôi thông, Tứ quý, 4 đôi thông và 5 đôi thông nhỏ hơn.
* Khi trên tay bài của người chơi có cách tạo ra **4 đôi thông hoặc 5 đôi thông** bất kể có dùng Joker hay không, nếu họ đã bỏ lượt và trên bàn xuất hiện bộ có thể bị chặt, thì người đó được cấp thời gian để quyết định có chen lượt vào chặt hay không.

#### Tiền phạt riêng của Joker

* Đánh Joker ra bàn cũng cộng vào hũ phạt: **Joker đỏ (♦♥) 25**, **Joker đen (♠♣) 15** (Đếm lá).
* Thua mà còn giữ Joker, thì chúng nó sẽ tự biến hình thành những lá sao cho tiền phạt là lớn nhất. Joker không tự biến thành Heo, vì Heo có tiền phạt ít hơn Joker (xem bảng để so sánh).
* Cóng, Đút 3 bích và Thối 3 bích tính **giống chế độ Thường**.

#### Tới trắng

**Có hiệu lực mọi ván:**

|Bộ tới trắng|Đếm lá|Nhất ăn tất|
|-|:-:|:-:|
|**Bát quái Heo** (đủ 4 Heo thường và 4 Joker)|×90|×9|
|**6 đôi thông**|×80|×8|
|**Sảnh rồng** (3 → A)|×70|×7|
|**7 đôi**|×60|×6|
|**Tứ quý Heo**|×50|×5|

**Chỉ ván đầu tiên** (các bộ có chứa 3♠):

|Bộ tới trắng|Đếm lá|Nhất ăn tất|
|-|:-:|:-:|
|5 đôi thông có 3 bích|×40|×4|
|4 đôi thông có 3 bích|×30|×3|
|Tứ quý 3|×20|×2|
|3 đôi thông có 3 bích|×10|×1|

Cách chi trả khi tới trắng giống chế độ Thường.

---

### 9. Mẹo giao diện

* 📱 Xoay ngang điện thoại; bài xếp quạt, **chạm để chọn**, nút **Đánh bài / Bỏ lượt** tự biết lúc nào dùng được.
* 💡 **Gợi ý thông minh:** chạm một lá, game tự chọn sẵn bộ hợp lệ lớn hơn bài trên bàn có chứa lá đó (cả khi chơi Joker). Bỏ chọn một lá do game gợi ý thì gợi ý tạm tắt cho đến hết lượt này; sang lượt sau lại tự bật.
* ⏱ Đồng hồ đếm ngược ngay cạnh mỗi người chơi; bảng này mở ra **không làm dừng đồng hồ**. Nếu đến lượt bạn khi đang đọc, sẽ có nhắc **“Đã đến lượt bạn đánh bài!”**.
* 👤 Bấm vào **ảnh của một người chơi thật** ở trên bàn để xem thẻ thông tin của họ (Bot thì không có). Bấm ra ngoài hoặc bấm ảnh người khác để đóng/chuyển.
* 🧭 Bạn luôn ngồi **ở dưới cùng**; những người còn lại xoay quanh bàn theo thứ tự lượt đánh.
* 💰 Tiền thắng thua bay giữa các ghế sau mỗi ván và số chip đổi màu **xanh khi thắng, đỏ khi thua**.

**Chúc bạn tới nhất!**
