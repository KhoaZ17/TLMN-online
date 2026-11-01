# Bản cập nhật backend (dựng trên bộ file bạn gửi ngày 29/10)

Chép đè 4 tệp trong thư mục này lên `tlmn_backend/core/` rồi chạy lại `python server.py`:

* `server.py`
* `app_controller.py`
* `tlmn_multiplayer_web_env.py`
* `tlmn_rules.py`

`db_helper.py` và `tlmn_heuristic_bot.py` **giữ nguyên**. Mọi thay đổi của bạn (luật tới trắng, cóng + `is_cong`, bot heuristic, AFK, chi tiết phạt, mã nhà phát triển…) đều được giữ. Các tệp `*.diff` là phần chênh lệch so với file của bạn.

## Thêm gì so với file của bạn

| Tệp | Thêm | Nếu không chép thì frontend… |
|-|-|-|
| `tlmn_multiplayer_web_env.py` | `winning_play` (nước đánh cuối của người thắng, có `is_dut_3_spade`) | tự suy ra nhãn “ĐÚT 3♠” từ bộ cuối trên bàn |
| `tlmn_rules.py` | `arranged_groups` trong `all_hands_penalty_details`; Joker thế chỗ trong Hàng lấy **chất còn trống** (trước luôn là ♠, chỉ đổi tên lá hiển thị, không đổi tiền) | vẫn xếp bài thua theo `arranged_hand`, chỉ không chia cụm |
| `server.py` | `POST /api/afk_back`; tham số `spectate=1` cho `GET /api/state` | lớp mờ AFK chỉ mất khi người đó tự bấm Đánh bài / Bỏ lượt |
| `app_controller.py` | `clear_afk` + `afk_reason` (thêm trường hợp máy im lặng quá 10 giây), hết giờ khi bàn trống thì tự đánh lá nhỏ nhất không phải Joker, và **chế độ khán giả** (vào phòng đang đấu khi còn chỗ, state không có bài trên tay, tự ngồi vào bàn sau ván, dọn khán giả im lặng sau 30 giây) | nhập mã vào phòng đang đấu vẫn bị từ chối như trước |

## Kiểm thử đã chạy trên bản này

`api_smoke` 76, ghế 102, mở rộng bàn 30, khán giả 26, AFK 14, chi tiết phạt 32 — toàn bộ đạt (SQLite thật; lớp FastAPI/uvicorn được thay bằng máy chủ giả cùng chữ ký).
