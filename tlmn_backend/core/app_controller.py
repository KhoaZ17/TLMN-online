import json
import itertools
import time
import threading
import uuid
import random
import tlmn_rules
import os
from tlmn_rules import card_info, tlmn_dict_deck
from tlmn_multiplayer_web_env import TLMNMultiplayerWebEnv
from db_helper import get_db_connection, execute_query
from tlmn_heuristic_bot import TLMN_AI_Brain

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "database"))
os.makedirs(DB_DIR, exist_ok=True)

USER_DB_PATH = os.path.join(DB_DIR, "tlmn_user_database.db")
SAMPLE_DB_PATH = os.path.join(DB_DIR, "tlmn_sample_database.db")

# Phòng chờ (nhiều người thật): ai không "điểm danh" qua GET /api/lobby quá số giây này coi như đã bỏ đi (đóng trình
# duyệt, mất mạng...): khách -> trả ghế cho người khác; chủ phòng -> đóng phòng. Đặt rộng tay vì điện thoại hay tạm
# dừng trang khi người chơi chuyển sang app khác để gửi mã phòng cho bạn bè.
LOBBY_IDLE_SECONDS = 180

# Kết nối lại (POST /api/resume): người bị văng / mất mạng / đóng tab khi đang chơi, đăng nhập lại trong vòng ngần này
# giây kể từ lần cuối phòng có hoạt động thì được đưa về đúng phòng + ghế cũ. Phòng còn người khác chơi thì phòng luôn
# "có hoạt động", nên chỉ phòng đã bị bỏ hoang (không ai hỏi state) lâu hơn mức này mới hết hạn.
RESUME_WINDOW_SECONDS = 1800

# Người bị văng (đóng tab, tải lại trang, mất mạng) GIỮA VÁN được Bot đánh thay nhưng GIỮ chỗ (tài khoản + avatar) để đăng nhập lại là vào
# lại đúng ghế. Chỉ giữ trong lúc ván còn đang đấu: ván vừa XONG thì mọi chỗ đang giữ bị trả ngay (sau ngần này giây để màn kết quả ở máy
# những người còn lại kịp hiện đủ), từ đó mà Bot không còn đánh thay bằng tài khoản của người đã đi, không ảnh hưởng chip của họ.
RESULT_GRACE_SECONDS = 6.0

# Giữa hai ván (màn kết quả + đếm ngược ván mới) mà một người thật im lặng (không máy nào của họ hỏi state; máy thật hỏi mỗi giây)
# quá ngần này giây thì coi như đã bỏ đi (đóng tab / tắt máy / mất mạng mà tín hiệu thoát không tới được): trả ghế ngay, người còn lại
# thấy ghế trống và ván sau không chia bài cho họ, để họ khỏi bị tự đánh thay bằng chip của chính mình.
STALE_PRESENCE_SECONDS = 8.0

# Đăng nhập lại (POST /api/resume) mà ghế cũ của tài khoản đó ở phòng KHÔNG đang đấu đã im lặng quá ngần này giây thì tab cũ đã chết:
# trả ghế ngay (người chơi đang ở menu thì không thể còn ngồi ở bàn). Máy còn sống hỏi mỗi giây nên không bao giờ bị trả nhầm.
STALE_ON_RESUME_SECONDS = 3.0

# --- AFK: Bot đánh giúp người treo máy / mất kết nối ---
# Một người thật bị coi là AFK khi:
#  1) "idle": HAI lần liên tục để hết giờ LƯỢT THẬT (30 giây) dù có nước đi (đè được bài trên bàn, hoặc phải mở vòng). Lượt free (15 giây)
#     và lượt giả (3 giây) tự qua nằm giữa hai lần đó không làm đứt chuỗi; chỉ một QUYẾT ĐỊNH của con người (đánh / bấm bỏ lượt) mới xoá chuỗi.
#     Ở cuối lượt thứ hai Bot đánh ngay thay họ và tiếp tục đánh các lượt sau cho tới khi họ "quay lại" (POST /api/afk_back).
#  2) "silent": máy của họ không hỏi state quá AFK_SILENT_SECONDS giây (tắt máy / mất mạng / tab bị đóng băng) mà lại tới lượt họ.
#     Máy hỏi state lại thì tự trả quyền đi (không cần làm gì thêm).
# Ghế vẫn là "human" (giữ chỗ, giữ tên, tiền): chỉ lượt đi do Bot lo, nên người đó quay lại lúc nào cũng đánh tiếp được.
AFK_STRIKES = 2
AFK_SILENT_SECONDS = 10.0
AFK_TURN_SECONDS = 0.5  # lượt của người đang AFK chỉ còn chừng này: Bot đánh gần như ngay

# KHÁN GIẢ: phòng ĐANG ĐẤU mà bàn chưa đủ chỗ (còn ghế trống / bàn chưa đủ 4 người / còn Bot để nhường chỗ) thì người nhập mã vẫn được vào, nhưng chỉ
# ngồi XEM (không có bài trên tay, không đánh được). Hết ván và qua RESULT_GRACE_SECONDS thì họ được ngồi vào bàn như người vừa nhập mã giữa hai
# ván. Khán giả im lặng (không máy nào hỏi state) quá ngần này giây thì coi như đã đi.
SPECTATOR_STALE_SECONDS = 30.0

# Bàn tối đa 4 người. Mọi phòng đều MỞ RỘNG được tới mức này, bất kể lúc tạo phòng chọn mấy người / mấy Bot: số người trong phòng
# chỉ là hiện trạng, có thể đổi sau mỗi ván (chủ phòng thêm Bot, bạn bè nhập mã vào...), xem _grow_table.
MAX_PLAYERS = 4


class TLMNAppController:
    """Quản lý phòng chơi và trạng thái ván đấu multiplayer thực tế."""

    def __init__(self, room_id="default", default_cost=1000, turn_time_limit=30, free_turn_limit=15, fake_turn_limit=3):
        self.room_id = room_id
        self.default_cost = default_cost
        self.turn_time_limit = turn_time_limit
        self.free_turn_limit = free_turn_limit
        self.fake_turn_limit = fake_turn_limit
        self.last_activity = time.time()
        # Khoá cho các thao tác ở phòng chờ (tạo / vào / rời / bắt đầu / thoát): 2 yêu cầu đến cùng lúc không được chen nhau.
        self._lock = threading.RLock()
        self._reset_controller_state()

    def _reset_controller_state(self):
        self.cost = self.default_cost
        self.env = None
        self.player_names = {}
        self.player_types = {}
        self.player_accounts = {}
        self.player_profiles = {}
        self.is_active = False
        self.match_data = None
        self.bot_counter = 0
        self.turn_start_time = 0
        self.last_activity = time.time()
        self.creator_initial_balance = None  # <--- KHÓA MỐC SỐ DƯ BAN ĐẦU CỦA CHỦ PHÒNG
        self.match_count = 0  # đã chia bao nhiêu ván trong phòng này (gửi cho Frontend: "Ván #N" đúng cả khi vào lại giữa chừng)
        self.held_since = {}  # ghế -> lúc người thật bị văng GIỮA VÁN (Bot đánh thay nhưng còn giữ chỗ, chỉ tới khi ván xong)
        self.seen = {}  # ghế người thật -> lần cuối máy của họ hỏi state (chỉ tính khi có username): biết ai đã bỏ đi giữa hai ván
        self.match_done_at = None  # lúc ván hiện tại kết thúc (để trả các chỗ đang giữ sau RESULT_GRACE_SECONDS)
        # --- Phòng chờ ---
        self.host_seat = 0  # ghế chủ phòng (người tạo phòng): chỉ chủ phòng được bấm "Bắt đầu" ván đầu tiên
        self.open_seats = set()  # ghế người thật còn TRỐNG, chờ người nhập mã phòng để vào (POST /api/join)
        self.lobby_seen = {}  # ghế -> lần cuối ghế đó "điểm danh" ở phòng chờ (GET /api/lobby)
        # --- AFK ---
        self.consecutive_timeouts = {}  # ghế -> số lần liên tiếp để hết giờ lượt thật
        self.is_afk = {}  # ghế -> True khi Bot đang đánh giúp
        self.afk_reason = {}  # ghế -> "idle" | "silent"
        # --- Khán giả (xem ván đang đấu, chờ ngồi vào từ ván sau) ---
        self.spectators = {}  # tài khoản -> {"since": lúc vào, "seen": lần cuối máy họ hỏi state}

    def intro_done(self):
        with self._lock:
            self.last_activity = time.time()
            if self.is_active:
                self.turn_start_time = time.time()
            return {"status": "success"}

    def _load_account(self, cursor, username: str):
        """Đọc tài khoản từ DB (qua db_helper). Trả về (hồ sơ trong phòng, số dư) hoặc None nếu không có tài khoản đó."""
        execute_query(cursor, """
            SELECT player_id, display_name, gender, avatar, balance, highest_balance,
                   games_played_cc, games_won_cc, games_played_wta, games_won_wta
            FROM accounts WHERE username = ?
        """, (username,))
        row = cursor.fetchone()
        if not row:
            return None
        p_id_str, d_name, gender, avatar, bal, high_bal, gp_cc, gw_cc, gp_wta, gw_wta = row
        profile = {
            "player_id": p_id_str,
            "username": username,
            "display_name": d_name or username,
            "gender": gender or "Nam",
            "avatar": avatar or "",
            "highest_balance": high_bal,
            "stats": {
                "count_cards": {"played": gp_cc, "won": gw_cc,
                                "win_rate": round((gw_cc / gp_cc) * 100, 1) if gp_cc > 0 else 0.0},
                "winner_takes_all": {"played": gp_wta, "won": gw_wta,
                                     "win_rate": round((gw_wta / gp_wta) * 100, 1) if gp_wta > 0 else 0.0}
            }
        }
        return profile, float(bal)

    def _seat_bot(self, seat: int):
        """Cho một Bot ngồi vào ghế `seat` (tên "Bot N", hồ sơ mặc định)."""
        self.player_types[seat] = "bot"
        self.bot_counter += 1
        bot_id = f"BOT_{self.bot_counter}_{random.randint(100000, 999999)}"
        self.player_names[seat] = f"Bot {self.bot_counter}"
        self.player_profiles[seat] = {
            "player_id": bot_id,
            "username": f"bot_{seat}",
            "display_name": self.player_names[seat],
            "gender": "Nam",
            "avatar": "",
            "highest_balance": 500000.0,
            "stats": {
                "count_cards": {"played": 0, "won": 0, "win_rate": 0.0},
                "winner_takes_all": {"played": 0, "won": 0, "win_rate": 0.0}
            }
        }

    def setup_game(self, joker_mode: bool, payment_mode: str, num_bots: int, num_humans: int = 1, cost: int = None,
                   player_accounts: list = None):
        """Mở / cấu hình lại phòng. `player_accounts` = tài khoản của những người thật ĐÃ CÓ MẶT (phần tử đầu = chủ phòng).
        Người thật còn thiếu (num_humans > số tài khoản đưa vào) là GHẾ TRỐNG chờ người nhập mã phòng để vào (POST /api/join)."""
        with self._lock:
            return self._setup_game(joker_mode, payment_mode, num_bots, num_humans, cost, player_accounts)

    def _setup_game(self, joker_mode: bool, payment_mode: str, num_bots: int, num_humans: int = 1, cost: int = None,
                    player_accounts: list = None):
        self.last_activity = time.time()
        self.cost = cost if (cost is not None and cost > 0) else self.default_cost
        num_players = max(2, min(4, num_humans + num_bots))

        self.player_names = {}
        self.player_types = {}
        self.player_accounts = {}
        self.player_profiles = {}
        self.host_seat = 0
        self.open_seats = set()
        self.lobby_seen = {}
        self.held_since = {}
        self.seen = {}
        self.consecutive_timeouts = {}
        self.is_afk = {}
        self.afk_reason = {}
        self.match_done_at = None
        self.match_count = 0
        player_balances = {}
        self.bot_counter = 0
        human_count = 0

        # SỬ DỤNG DB_HELPER (Thay vì sqlite3.connect)
        conn, _ = get_db_connection()
        cursor = conn.cursor()

        for i in range(num_players):
            if i < num_humans:
                self.player_types[i] = "human"
                human_count += 1
                acc_name = player_accounts[human_count - 1] if (
                        player_accounts and len(player_accounts) >= human_count) else None

                if acc_name:
                    loaded = self._load_account(cursor, acc_name)
                    if loaded:
                        profile, balance = loaded
                        self.player_accounts[i] = acc_name
                        self.player_names[i] = profile["display_name"]
                        player_balances[i] = balance

                        # KHÓA MỐC SỐ DƯ LẦN ĐẦU TẠO PHÒNG CỦA CHỦ PHÒNG (Chỉ ghi nhận 1 lần duy nhất)
                        if human_count == 1 and self.creator_initial_balance is None:
                            self.creator_initial_balance = float(balance)

                        self.player_profiles[i] = profile
                    else:
                        self.player_names[i] = f"Người chơi {human_count}"
                        player_balances[i] = 500000.0
                        if human_count == 1 and self.creator_initial_balance is None:
                            self.creator_initial_balance = 500000.0
                elif human_count > 1:
                    # GHẾ TRỐNG chờ người nhập mã phòng để vào. Tới lúc chủ phòng bấm "Bắt đầu" mà vẫn trống thì ghế đó bị
                    # BỎ TRỐNG (không tự thêm Bot): bàn chỉ gồm những người đang ngồi — xem _compact_seats.
                    # Muốn có Bot, chủ phòng bấm nút "Thêm Bot" trong phòng (POST /api/bots).
                    self.open_seats.add(i)
                    self.player_names[i] = f"Người chơi {human_count}"
                    player_balances[i] = 500000.0
                else:
                    self.player_names[i] = "Bạn"
                    player_balances[i] = 500000.0
                    if human_count == 1 and self.creator_initial_balance is None:
                        self.creator_initial_balance = 500000.0
            else:
                self._seat_bot(i)
                # BOT MỚI SẼ LUÔN LẤY MỐC BAN ĐẦU CỦA CHỦ PHÒNG
                bot_balance = self.creator_initial_balance if self.creator_initial_balance is not None else 500000.0
                player_balances[i] = bot_balance

        conn.close()

        self.env = TLMNMultiplayerWebEnv(
            num_players=num_players,
            joker_mode=joker_mode,
            payment_mode=payment_mode,
            cost=self.cost,
            player_balances=player_balances
        )

        self.is_active = False
        self.lobby_seen = {self.host_seat: time.time()}
        pay_type_str = "Đếm lá" if payment_mode == "count_cards" else "Nhất ăn tất"

        return {
            "status": "success",
            "room_id": self.room_id,
            "num_players": num_players,
            "player_types": self.player_types,
            "host_seat": self.host_seat,
            "open_seats": sorted(self.open_seats),
            "message": f"Khởi tạo phòng {self.room_id} ({pay_type_str}) thành công với mức cược {self.cost:,}!"
        }

    # ------------------------------------------------------------------ PHÒNG CHỜ (nhiều người thật)
    def _is_seated(self, seat, username: str = None) -> bool:
        """Ghế người thật `seat` đang có người ngồi (và đúng là tài khoản `username` nếu có truyền) không?"""
        if seat not in self.player_types or self.player_types[seat] != "human" or seat in self.open_seats:
            return False
        acc = self.player_accounts.get(seat)
        return username is None or acc is None or acc == username

    def _is_seat_of(self, seat, username: str = None) -> bool:
        """Ghế `seat` (người hay Bot) có đúng là của tài khoản `username` không? Không truyền username thì chỉ cần ghế tồn tại."""
        if seat not in self.player_types:
            return False
        acc = self.player_accounts.get(seat)
        return username is None or acc is None or acc == username

    def _free_seat(self, seat: int):
        """Người ngồi ở `seat` rời đi (khách rời phòng chờ / thoát chủ động giữa hai ván / giữ chỗ hết hạn): trả ghế về trạng
        thái TRỐNG (không tự thay bằng Bot) để người khác nhập mã vào. Ghế chủ phòng bị trả thì quyền chủ phòng chuyển cho
        người thật kế tiếp (nếu còn)."""
        self.player_accounts.pop(seat, None)
        self.player_profiles.pop(seat, None)
        self.player_types[seat] = "human"
        self.player_names[seat] = f"Người chơi {seat + 1}"
        self.open_seats.add(seat)
        self.lobby_seen.pop(seat, None)
        self.held_since.pop(seat, None)
        self.seen.pop(seat, None)
        self._clear_afk(seat)  # ghế đổi chủ: cờ AFK của người cũ không được dính sang người mới
        if self.env:
            self.env.accumulated_rewards[seat] = 500000.0
        if seat == self.host_seat:
            nxt = self._seated_humans()
            if nxt:
                self.host_seat = min(nxt)

    def _clear_afk(self, seat: int):
        """Xoá mọi dấu vết AFK của ghế (chuỗi hết giờ, cờ AFK, lý do)."""
        self.consecutive_timeouts.pop(seat, None)
        self.is_afk.pop(seat, None)
        self.afk_reason.pop(seat, None)

    def _mark_afk(self, seat: int, reason: str):
        """Bot bắt đầu đánh giúp người ở `seat` (reason: "idle" | "silent")."""
        if self.is_afk.get(seat):
            return
        self.is_afk[seat] = True
        self.afk_reason[seat] = reason
        if self.env:
            self.env.transaction_logs.append(f"💤 Người chơi {seat} đang vắng mặt (AFK): Bot đánh giúp cho tới khi bạn quay lại.")

    def clear_afk(self, username: str):
        """Người chơi đã quay lại (chạm / bấm phím / mở lại tab): trả quyền đi cho họ. Không có gì để trả cũng không phải lỗi."""
        with self._lock:
            self.last_activity = time.time()
            seat = self._seat_of_account(username)
            if seat is None or not self.env:
                return {"status": "success", "cleared": False}
            was = bool(self.is_afk.get(seat)) or self.consecutive_timeouts.get(seat, 0) > 0
            self._clear_afk(seat)
            self.seen[seat] = time.time()
            if was and self.player_types.get(seat) == "human":
                self.env.transaction_logs.append(f"🔄 Người chơi {seat} đã quay lại và tự đánh bài trở lại.")
                if self.is_active and not self.env.done and self.env.current_turn == seat:
                    self.turn_start_time = time.time()  # đúng lượt mình thì được đủ thời gian nghĩ
            return {"status": "success", "cleared": was}

    def _grow_table(self):
        """Mở thêm MỘT ghế TRỐNG ở cuối bàn (tối đa MAX_PLAYERS). Số ghế lúc tạo phòng KHÔNG cố định: bàn đã nhỏ lại sau khi có người
        / Bot rời đi thì vẫn mở rộng lại được khi chủ phòng thêm Bot hoặc có người nhập mã vào. Chỉ gọi lúc phòng chờ hoặc giữa hai ván
        (không đụng tới ván đang đấu). Trả về số ghế mới (đã nằm trong open_seats) hoặc None nếu bàn đã đủ MAX_PLAYERS."""
        env = self.env
        if not env or env.num_players >= MAX_PLAYERS:
            return None
        seat = env.num_players
        env.num_players += 1
        env.accumulated_rewards[seat] = 500000.0
        while len(env.passed_circle) < env.num_players:
            env.passed_circle.append(False)
        if env.hands:
            env.hands[seat] = []  # giữa hai ván: ghế mới chưa có bài, ván sau reset() sẽ chia
        self.player_accounts.pop(seat, None)
        self.player_profiles.pop(seat, None)
        self.player_types[seat] = "human"
        self.player_names[seat] = f"Người chơi {seat + 1}"
        self.open_seats.add(seat)
        return seat

    def _seated_humans(self):
        """Các ghế có NGƯỜI THẬT đang ngồi (đang kết nối): loại ghế trống và ghế Bot đánh thay người bị văng."""
        return [s for s, t in self.player_types.items() if t == "human" and s not in self.open_seats]

    def _plain_bot_seats(self):
        """Các ghế Bot THẬT (không gắn tài khoản của ai): Bot loại này mới bị mời ra khi có người nhập mã vào."""
        return [s for s, t in self.player_types.items()
                if t == "bot" and s not in self.open_seats and s not in self.player_accounts]

    def _seated_count(self) -> int:
        """Số người (thật + Bot) đang ngồi bàn, không tính ghế trống."""
        return self.env.num_players - len(self.open_seats) if self.env else 0

    def _current_host_seat(self):
        """Ghế CHỦ PHÒNG hiện tại: người tạo phòng nếu họ còn ngồi; họ đã đi / đang bị văng thì người thật có ghế nhỏ nhất."""
        if self.host_seat in self._seated_humans():
            return self.host_seat
        humans = self._seated_humans()
        return min(humans) if humans else self.host_seat

    def _seat_of_account(self, username: str):
        """Ghế đang gắn với tài khoản `username` (người thật đang ngồi hoặc ghế Bot đánh thay họ); None nếu không có."""
        if not username:
            return None
        for seat, acc in self.player_accounts.items():
            if acc == username and seat not in self.open_seats:
                return seat
        return None

    def _hold_seat(self, seat: int):
        """Người ở `seat` bị văng / đóng tab: Bot đánh thay nhưng GIỮ tài khoản + tên + avatar để họ đăng nhập lại vào lại ghế này."""
        self.player_types[seat] = "bot"
        self.held_since[seat] = time.time()

    def _release_held_seats(self):
        """Ván đã XONG: trả mọi chỗ đang giữ cho người bị văng giữa ván (ghế thành ghế TRỐNG). Từ lúc đếm ngược ván mới, ra khỏi phòng bằng
        cách nào cũng KHÔNG được giữ lại: Bot không đánh thay bằng tài khoản của họ nữa."""
        for seat in list(self.held_since):
            if seat in self.open_seats:
                continue
            name = self.player_names.get(seat, f"Người chơi {seat}")
            self.env.transaction_logs.append(f"🚪 {name} đã rời bàn (mất kết nối trước khi ván kết thúc).")
            self._free_seat(seat)

    def _silent_seconds(self, seat: int) -> float:
        """Máy của người ngồi ghế `seat` đã im lặng bao lâu (0 nếu chưa từng có máy nào điểm danh: người chơi qua API thuần)."""
        last = self.seen.get(seat) if self.env and self.env.hands else self.lobby_seen.get(seat)
        return 0.0 if last is None else max(0.0, time.time() - last)

    def _release_stale_humans(self):
        """Giữa hai ván: người thật đã im lặng quá STALE_PRESENCE_SECONDS (tắt máy / mất mạng không kịp báo thoát) thì trả ghế.
        Chỉ xét người từng có máy hỏi state (self.seen) nên không ảnh hưởng người chơi qua API thuần."""
        now = time.time()
        for seat, last in list(self.seen.items()):
            if self.player_types.get(seat) == "human" and seat not in self.open_seats and now - last > STALE_PRESENCE_SECONDS:
                self.env.transaction_logs.append(f"🚪 Người chơi {seat} đã rời bàn (không còn kết nối).")
                self._free_seat(seat)

    def _compact_seats(self):
        """Trước mỗi ván: ghế còn TRỐNG thì bỏ đi, bàn chỉ gồm những người đang ngồi (không thêm Bot).
        Môi trường ván chơi cần các ghế liền mạch 0..n-1 nên những ghế còn lại được ĐÁNH SỐ LẠI theo thứ tự cũ; số ván,
        người thắng ván trước, chip từng ghế được giữ nguyên. Người chơi tìm ghế mới của mình theo TÊN TÀI KHOẢN
        (GET /api/state?username=..., GET /api/lobby trả `seat`)."""
        if not self.open_seats:
            return
        old = self.env
        new_host_old = self._current_host_seat()
        keep = [s for s in range(old.num_players) if s not in self.open_seats]
        remap = {o: n for n, o in enumerate(keep)}

        def moved(d):
            return {remap[k]: v for k, v in d.items() if k in remap}

        balances = {remap[o]: old.accumulated_rewards[o] for o in keep}
        self.player_names = moved(self.player_names)
        self.player_types = moved(self.player_types)
        self.player_accounts = moved(self.player_accounts)
        self.player_profiles = moved(self.player_profiles)
        self.lobby_seen = moved(self.lobby_seen)
        self.held_since = moved(self.held_since)
        self.seen = moved(self.seen)
        self.consecutive_timeouts = moved(self.consecutive_timeouts)
        self.is_afk = moved(self.is_afk)
        self.afk_reason = moved(self.afk_reason)
        self.host_seat = remap.get(new_host_old, 0)
        self.open_seats = set()
        new_env = TLMNMultiplayerWebEnv(
            num_players=len(keep),
            joker_mode=old.joker_mode,
            payment_mode=old.payment_mode,
            cost=old.cost,
            player_balances=balances
        )
        new_env.num_round = old.num_round
        new_env.last_winner = remap.get(old.last_winner) if old.last_winner is not None else None
        self.env = new_env

    def _new_bot_balance(self) -> float:
        return self.creator_initial_balance if self.creator_initial_balance is not None else 500000.0

    def manage_bots(self, username: str, action: str):
        """Chủ phòng thêm / bớt Bot ngay trong phòng (phòng chờ hoặc giữa hai ván; không làm được lúc đang đấu).
        - "add": Bot ngồi vào ghế TRỐNG có số nhỏ nhất. Không có ghế trống thì bàn được MỞ RỘNG thêm một ghế (tới tối đa 4 người,
          dù lúc tạo phòng chọn ít hơn); đủ 4 người rồi mới báo bàn đã đủ chỗ.
        - "remove": một Bot THẬT (cao số nhất) rời bàn, ghế đó thành ghế TRỐNG cho người nhập mã vào. Không đụng tới
          ghế Bot đang đánh thay người bị văng."""
        with self._lock:
            self.last_activity = time.time()
            if not self.env:
                return {"status": "error", "code": "closed", "message": "Phòng đã đóng hoặc không tồn tại."}
            seat = self._seat_of_account(username)
            if seat is None or seat != self._current_host_seat():
                return {"status": "error", "message": "Chỉ chủ phòng mới được thêm / bớt Bot."}
            if self.is_active and not self.env.done:
                return {"status": "error", "message": "Ván đang diễn ra, chưa thể thêm / bớt Bot."}
            if action == "add":
                if not self.open_seats:
                    self._grow_table()
                if not self.open_seats:
                    return {"status": "error", "message": f"Bàn đã đủ {MAX_PLAYERS} người, không thêm Bot được nữa."}
                target = min(self.open_seats)
                self.open_seats.discard(target)
                self._seat_bot(target)
                self.env.accumulated_rewards[target] = self._new_bot_balance()
                self.lobby_seen.pop(target, None)
                self.env.transaction_logs.append(f"🤖 Chủ phòng thêm {self.player_names[target]} vào bàn.")
                message = f"Đã thêm {self.player_names[target]}."
            elif action == "remove":
                bots = self._plain_bot_seats()
                if not bots:
                    return {"status": "error", "message": "Không có Bot nào để bớt."}
                target = max(bots)
                name = self.player_names.get(target, "Bot")
                self._free_seat(target)
                self.env.transaction_logs.append(f"🤖 Chủ phòng cho {name} rời bàn.")
                message = f"Đã bớt {name}."
            else:
                return {"status": "error", "message": "Hành động không hợp lệ (add hoặc remove)."}
            return {"status": "success", "message": message, "lobby": self._lobby_view()}

    def _prune_lobby(self):
        """Dọn người bỏ đi mà không báo (đóng trình duyệt, mất mạng...). Chỉ chạy khi chưa chia ván đầu."""
        if not self.env or self.env.hands:
            return
        now = time.time()
        if now - self.lobby_seen.get(self.host_seat, now) > LOBBY_IDLE_SECONDS:
            self._reset_controller_state()  # chủ phòng đã bỏ đi -> đóng phòng
            return
        for seat, seen in list(self.lobby_seen.items()):
            if seat != self.host_seat and seat not in self.open_seats and now - seen > LOBBY_IDLE_SECONDS:
                self._free_seat(seat)

    def _lobby_view(self) -> dict:
        """Ảnh chụp phòng chờ: ghế nào ai ngồi (người thật / Bot / còn trống), cấu hình phòng, ván đầu đã chia chưa."""
        players = {}
        host = self._current_host_seat()
        for seat in range(self.env.num_players):
            if seat in self.open_seats:
                players[seat] = {"type": "open", "name": "", "username": "", "avatar": "", "gender": "Nam",
                                 "is_host": False}
                continue
            profile = self.player_profiles.get(seat, {})
            players[seat] = {
                "type": self.player_types.get(seat, "bot"),
                "name": self.player_names.get(seat, f"Player {seat}"),
                "username": profile.get("username", ""),
                "avatar": profile.get("avatar", ""),
                "gender": profile.get("gender", "Nam"),
                "is_host": seat == host,
            }
        return {
            "room_id": self.room_id,
            "started": bool(self.env.hands),
            "host_seat": host,
            "num_players": self.env.num_players,
            "open_seats": sorted(self.open_seats),
            "config": {
                "cost": self.env.cost,
                "payment_mode": self.env.payment_mode,
                "joker_mode": self.env.joker_mode
            },
            "players": players,
        }

    # ------------------------------------------------------------------ KHÁN GIẢ
    def _prune_spectators(self):
        """Bỏ khán giả đã im lặng quá SPECTATOR_STALE_SECONDS (đóng tab / mất mạng không kịp báo rời)."""
        now = time.time()
        for name, sp in list(self.spectators.items()):
            if now - sp.get("seen", now) > SPECTATOR_STALE_SECONDS:
                self.spectators.pop(name, None)

    def _spectate_capacity(self) -> int:
        """Còn bao nhiêu chỗ cho người thật ở ván SAU: ghế trống + số ghế bàn còn mở rộng được (tối đa MAX_PLAYERS) + Bot THẬT có thể nhường."""
        if not self.env:
            return 0
        return len(self.open_seats) + max(0, MAX_PLAYERS - self.env.num_players) + len(self._plain_bot_seats())

    def _pick_seat_for_human(self):
        """Chọn ghế cho một người thật mới vào (CHỈ gọi lúc phòng chờ hoặc giữa hai ván): ghế trống số nhỏ nhất -> mở rộng bàn -> mời một Bot
        THẬT ra (số cao nhất). None nếu bàn đã đủ người thật."""
        if self.open_seats:
            return min(self.open_seats)
        seat = self._grow_table()
        if seat is None:
            bots = self._plain_bot_seats()
            if bots:
                seat = max(bots)
        return seat

    def _occupy_seat(self, seat: int, username: str, profile: dict, balance: float):
        """Người thật `username` ngồi vào `seat` (ghế trống hoặc ghế Bot được mời ra)."""
        if seat in self.open_seats:
            self.open_seats.discard(seat)
        else:
            kicked = self.player_names.get(seat, "Bot")
            self.env.transaction_logs.append(
                f"🚪 {kicked} được mời ra để nhường chỗ cho {profile['display_name']}.")
        self.player_types[seat] = "human"
        self.player_accounts[seat] = username
        self.player_names[seat] = profile["display_name"]
        self.player_profiles[seat] = profile
        self.env.accumulated_rewards[seat] = balance
        self.held_since.pop(seat, None)
        self.lobby_seen[seat] = time.time()
        self.seen[seat] = time.time()
        self._clear_afk(seat)

    def _seat_spectators(self):
        """Ván đã xong: các khán giả đang chờ được ngồi vào bàn theo thứ tự vào trước (như vừa nhập mã giữa hai ván). Hết chỗ thì tiếp tục xem.
        Gọi lúc ván đã xong và đã qua RESULT_GRACE_SECONDS (màn kết quả ở các máy đã hiện đủ), hoặc ngay đầu ván mới."""
        if not self.spectators or not self.env or not self.env.done:
            return
        self._prune_spectators()
        for name in sorted(self.spectators, key=lambda n: self.spectators[n].get("since", 0)):
            if self._seat_of_account(name) is not None:
                self.spectators.pop(name, None)  # (phòng thủ) đã có ghế rồi
                continue
            conn, _ = get_db_connection()
            cursor = conn.cursor()
            loaded = self._load_account(cursor, name)
            conn.close()
            if not loaded:
                self.spectators.pop(name, None)
                continue
            seat = self._pick_seat_for_human()
            if seat is None:
                break  # bàn đã đủ người thật: còn lại tiếp tục xem
            profile, balance = loaded
            self._occupy_seat(seat, name, profile, balance)
            self.spectators.pop(name, None)
            self.env.transaction_logs.append(f"👀 {profile['display_name']} từ khán giả đã ngồi vào bàn.")

    def _join_result(self, seat: int) -> dict:
        return {"status": "success", "message": "Đã vào phòng.", "room_id": self.room_id, "seat": seat,
                "host_seat": self._current_host_seat(), "lobby": self._lobby_view()}

    def _spectate_result(self) -> dict:
        return {"status": "success", "spectator": True, "seat": None, "room_id": self.room_id,
                "message": "Phòng đang trong ván: bạn vào xem và sẽ được ngồi vào bàn từ ván sau.",
                "host_seat": self._current_host_seat(), "lobby": self._lobby_view()}

    def join_room(self, username: str):
        """Nhập mã phòng để NGỒI VÀO một ghế. NGƯỜI THẬT ĐƯỢC ƯU TIÊN, vào được ngay khi bàn còn chỗ HOẶC còn Bot để nhường:
        - Còn ghế trống (phòng chờ, hoặc người vừa rời giữa hai ván) -> ngồi vào ghế trống số nhỏ nhất.
        - Bàn chưa đủ 4 người -> bàn được MỞ RỘNG thêm một ghế cho người đó (số người trong phòng không cố định theo lúc tạo phòng).
        - Bàn đủ 4 người nhưng có Bot ngồi -> mời một Bot THẬT ra (cao số nhất) nhường chỗ. Không đụng ghế Bot đang đánh thay
          người bị văng (người đó còn quyền vào lại).
        Vào được khi phòng đang chờ hoặc GIỮA HAI VÁN (kể cả lúc đếm ngược ván mới). Phòng ĐANG ĐẤU mà bàn chưa đủ chỗ: vào làm KHÁN GIẢ
        (`spectator`: true, `seat`: null; chỉ xem, ván sau được ngồi vào); đủ chỗ rồi thì báo `full`."""
        with self._lock:
            self.last_activity = time.time()
            self._prune_lobby()
            if not self.env:
                return {"status": "error", "code": "not_found",
                        "message": "Không tìm thấy phòng này. Hãy kiểm tra lại mã phòng."}

            username = (username or "").strip()
            # Đã ngồi trong phòng này rồi -> trả đúng ghế cũ (không chiếm thêm ghế). Ghế đang do Bot đánh thay mình
            # (bị văng) thì nhập mã phòng cũng là vào lại chỗ cũ, kể cả lúc đang đấu.
            mine = self._seat_of_account(username)
            if mine is not None:
                self._reclaim_seat(mine)
                return self._join_result(mine)

            if self.env.hands and self.is_active and not self.env.done:
                # ĐANG ĐẤU: còn chỗ cho ván sau thì cho vào làm KHÁN GIẢ (chỉ xem), hết chỗ mới báo đủ người.
                self._prune_spectators()
                if username in self.spectators:
                    self.spectators[username]["seen"] = time.time()
                    return self._spectate_result()
                conn, _ = get_db_connection()
                cursor = conn.cursor()
                loaded = self._load_account(cursor, username)
                conn.close()
                if not loaded:
                    return {"status": "error", "code": "no_account", "message": "Tài khoản không tồn tại."}
                if self._spectate_capacity() <= len(self.spectators):
                    return {"status": "error", "code": "full", "message": "Phòng đã đủ người chơi."}
                self.spectators[username] = {"since": time.time(), "seen": time.time()}
                return self._spectate_result()

            # Kiểm tra tài khoản TRƯỚC khi chọn / mở ghế để không bỏ lại một ghế trống mồ côi khi báo lỗi.
            conn, _ = get_db_connection()
            cursor = conn.cursor()
            loaded = self._load_account(cursor, username)
            conn.close()
            if not loaded:
                return {"status": "error", "code": "no_account", "message": "Tài khoản không tồn tại."}

            seat = self._pick_seat_for_human()
            if seat is None:
                return {"status": "error", "code": "full", "message": "Phòng đã đủ người chơi."}

            profile, balance = loaded
            self._occupy_seat(seat, username, profile, balance)
            return self._join_result(seat)

    def _reclaim_seat(self, seat: int):
        """Ghế do Bot đánh thay người bị văng trả lại cho người thật (họ đăng nhập lại / nhập lại mã phòng)."""
        self.held_since.pop(seat, None)
        self.seen[seat] = time.time()
        self._clear_afk(seat)
        if self.player_types.get(seat) == "human":
            self.lobby_seen[seat] = time.time()
            return
        self.player_types[seat] = "human"
        if self.env and self.env.hands:
            self.env.transaction_logs.append(f"🔄 Người chơi {seat} đã kết nối lại và tự đánh bài trở lại.")
            if self.is_active and not self.env.done and self.env.current_turn == seat:
                self.turn_start_time = time.time()  # đúng lượt mình thì được đủ thời gian nghĩ, không bị tính giờ lúc vắng mặt

    def resume_seat(self, username: str):
        """Người chơi đăng nhập lại sau khi bị văng: trả về ghế cũ của họ NẾU PHÒNG ĐANG ĐẤU (ván đang diễn ra) và còn trong hạn
        RESUME_WINDOW_SECONDS. Ghế đang do Bot đánh thay (bị văng giữa ván) được trả lại cho người thật.
        Phòng ĐANG ĐẾM NGƯỢC ván mới / phòng chờ / chờ thêm người thì KHÔNG giữ ai: ra khỏi phòng bằng cách nào cũng là rời bàn
        (không để người chơi tưởng đã thoát mà vẫn bị chia bài, tốn chip). Trả None nghĩa là không có phòng để vào."""
        with self._lock:
            if not self.env or not username:
                return None
            seat = self._seat_of_account(username)
            if seat is None:
                return None
            playing = bool(self.env.hands) and self.is_active and not self.env.done
            if not playing:
                if seat in self.held_since:
                    self._release_held_seats()  # ván đã xong: chỗ giữ cho người bị văng giữa ván không còn nữa
                elif self.player_types.get(seat) == "human" and self._silent_seconds(seat) > STALE_ON_RESUME_SECONDS:
                    # Tab cũ đã chết mà không kịp báo thoát: người này đang ở menu nên phải trả ghế, đúng như bấm Thoát bàn.
                    self.handle_player_quit(seat, username)
                return None
            now = time.time()
            if now - self.last_activity > RESUME_WINDOW_SECONDS:
                return None
            self._reclaim_seat(seat)
            self.last_activity = now
            return {"status": "success", "resumed": True, "room_id": self.room_id, "seat": seat,
                    "started": bool(self.env.hands), "host_seat": self._current_host_seat()}

    def get_lobby(self, player_id: int = None, username: str = None):
        """Trạng thái phòng chờ (cả chủ phòng lẫn khách gọi mỗi giây). Truyền `player_id` (+ `username`) = "điểm danh" là
        mình còn ở phòng. `started` = true nghĩa là ván đầu đã chia: chuyển sang GET /api/state."""
        with self._lock:
            self.last_activity = time.time()
            if not self.env:
                return {"status": "error", "code": "closed", "message": "Phòng đã đóng hoặc không tồn tại."}
            if not self.env.hands:
                if player_id is not None:
                    if not self._is_seated(player_id, username):
                        return {"status": "error", "code": "kicked", "message": "Bạn không còn ở trong phòng chờ này."}
                    self.lobby_seen[player_id] = time.time()
                self._prune_lobby()
                if not self.env:
                    return {"status": "error", "code": "closed", "message": "Phòng đã đóng hoặc không tồn tại."}
            view = {"status": "success", **self._lobby_view()}
            seat = self._seat_of_account(username)
            if seat is not None:
                view["seat"] = seat  # ghế HIỆN TẠI của tài khoản này (đổi số khi bàn được dồn lại, xem _compact_seats)
            return view

    def start_new_match(self, player_id: int = None):
        with self._lock:
            return self._start_new_match(player_id)

    def _start_new_match(self, player_id: int = None):
        self.last_activity = time.time()
        if not self.env:
            return {"status": "error", "message": "Chưa setup bàn chơi cho phòng này."}

        first_match = not self.env.hands
        # Ván ĐẦU TIÊN: chỉ chủ phòng được bấm "Bắt đầu" (không truyền player_id thì bỏ qua kiểm tra, để gọi tay từ Swagger).
        # Các ván sau tự bắt đầu sau đếm ngược: KHÔNG ai, kể cả chủ phòng ban đầu, có đặc quyền bắt đầu.
        if first_match and player_id is not None and player_id != self.host_seat:
            return {"status": "error", "message": "Chỉ chủ phòng mới được bắt đầu ván đầu tiên."}
        # Đang có ván chạy thì không chia đè (2 máy cùng gọi /api/start sẽ phá ván của mọi người).
        if self.is_active and not self.env.done:
            return {"status": "error", "message": "Ván đấu đang diễn ra."}
        if not first_match:
            # Ván trước đã xong: chỗ giữ cho người bị văng giữa ván được trả (Bot thôi đánh thay bằng tài khoản của họ), và người
            # thật đã im lặng quá lâu (tắt máy / mất mạng không kịp báo thoát) cũng không được chia bài.
            self._release_held_seats()
            self._release_stale_humans()
            self._seat_spectators()  # khán giả đang chờ được ngồi vào trước khi tính số người (có thể cứu một bàn chỉ còn 1 người)
            if not self._seated_humans():
                self._reset_controller_state()  # không còn người thật nào ở bàn -> đóng phòng
                return {"status": "error", "code": "closed", "message": "Phòng đã đóng hoặc không tồn tại."}
        # KHÔNG tự thêm Bot cho đủ chỗ: bàn chỉ gồm những người đang ngồi, cần ít nhất 2 người. Còn lại một mình thì
        # phải chờ người khác nhập mã phòng vào (hoặc chủ phòng bấm "Thêm Bot" trong phòng).
        if self._seated_count() < 2:
            if first_match:
                return {"status": "error",
                        "message": "Cần ít nhất 2 người chơi để bắt đầu. Hãy chờ bạn bè nhập mã phòng để vào."}
            return {"status": "error", "code": "need_players",
                    "message": "Cần ít nhất 2 người chơi để bắt đầu ván mới. Hãy chờ người khác nhập mã phòng để vào "
                               "(hoặc chủ phòng thêm Bot)."}
        self._compact_seats()  # ghế còn trống thì bỏ đi, đánh số lại cho liền mạch
        self.consecutive_timeouts = {}  # chuỗi "hai lần hết giờ liên tục" tính lại từ đầu mỗi ván (cờ AFK thì giữ tới khi họ quay lại)

        # Thay thế Bot hết tiền (Lấy lại logic từ bản trước). Ghế Bot đang đánh thay người bị văng (có tài khoản) thì giữ nguyên.
        replaced_bots = []
        for p in range(self.env.num_players):
            if (self.player_types.get(p) == "bot" and p not in self.player_accounts
                    and self.env.accumulated_rewards.get(p, 0) <= 0):
                old_name = self.player_names[p]
                self.bot_counter += 1
                bot_id = f"BOT_{self.bot_counter}_{random.randint(100000, 999999)}"
                new_name = f"Bot {self.bot_counter}"

                self.player_names[p] = new_name
                bot_balance = self.creator_initial_balance if getattr(self, "creator_initial_balance",
                                                                      None) is not None else 500000.0
                self.env.accumulated_rewards[p] = bot_balance

                self.player_profiles[p] = {
                    "player_id": bot_id,
                    "username": f"bot_{p}_{self.bot_counter}",
                    "display_name": new_name,
                    "gender": "Nam",
                    "avatar": "",
                    "highest_balance": bot_balance,
                    "stats": {
                        "count_cards": {"played": 0, "won": 0, "win_rate": 0.0},
                        "winner_takes_all": {"played": 0, "won": 0, "win_rate": 0.0}
                    }
                }
                replaced_bots.append((old_name, new_name, bot_balance))

        self.env.reset()
        self.match_count += 1
        self.match_done_at = None

        # === THÊM ĐOẠN KHỞI TẠO NÃO CHO BOT TẠI ĐÂY ===
        self.bot_brains = {}
        for p in range(self.env.num_players):
            self.bot_brains[p] = TLMN_AI_Brain(
                seat=p,
                joker_mode=self.env.joker_mode,
                payment_mode=self.env.payment_mode,
                cost=self.env.cost
            )
            self.bot_brains[p].reset_match(self.env.num_players)
        # ===============================================

        for old, new, bal in replaced_bots:
            self.env.transaction_logs.insert(0, f"🔄 {old} hết tiền đã rời bàn. {new} (mang theo {bal:,.0f} Chip) vào thế chỗ!")

        self.is_active = True
        self.turn_start_time = time.time() + 4.0

        self.match_data = {
            "room_id": self.room_id,
            "match_id": self.env.num_round,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "config": {
                "joker_mode": self.env.joker_mode,
                "payment_mode": self.env.payment_mode,
                "cost": self.env.cost,
            },
            "initial_hands": {p: self.env.hands[p].copy() for p in range(self.env.num_players)},
            "transactions": [],
            "final_balances": {}
        }

        # --- ĐOẠN BỔ SUNG TỪ FILE CỦ: Xử lý Tới trắng ngay khi chia bài ---
        if self.env.done and getattr(self.env, "instant_win_info", None) and self.env.instant_win_info.get(
                "has_instant_win"):
            self.is_active = False
            self._finalize_match()

        return self.get_game_state(player_id=0)

    def handle_player_quit(self, player_id: int, username: str = None, reason: str = None):
        """Thoát phòng. Tuỳ lúc thoát:
        - Phòng chờ (chưa chia ván đầu): chủ phòng thoát = huỷ phòng; khách thoát = trả ghế cho người khác.
        - Đang đấu (ván đang diễn ra), BẰNG CÁCH NÀO cũng vậy (bấm Thoát bàn, đóng tab, tải lại trang, mất mạng): ghế của người
          thoát do Bot tiếp quản (GIỮ tài khoản + tên + avatar) tới khi ván xong, ván vẫn tiếp diễn; đăng nhập lại (POST /api/resume)
          trong lúc ván còn đang đấu thì được vào lại đúng ghế.
        - Giữa 2 ván (đang đếm ngược ván mới / chờ thêm người), BẰNG CÁCH NÀO cũng là rời hẳn, kể cả `reason == "disconnect"`
          (Frontend gửi khi đóng tab / tải lại trang): ghế thành ghế TRỐNG (không tự thay bằng Bot, không giữ chỗ, đăng nhập lại
          không vào lại phòng): trên bàn những người còn lại avatar biến mất ngay, ván sau tự bắt đầu nếu còn từ 2 người trở lên
          (bàn nhỏ lại, đánh số lại ghế); chỉ còn 1 người thì phải chờ người khác vào. Quyền chủ phòng chuyển cho người thật kế
          tiếp. Hết người thật thì phòng đóng. Chỗ giữ cho người bị văng giữa ván cũng được trả khi ván xong.
        `username` (không bắt buộc) bảo đảm không đá nhầm người khác; có username thì ghế được tìm THEO TÀI KHOẢN
        (số ghế có thể đã đổi khi bàn được dồn lại)."""
        with self._lock:
            self.last_activity = time.time()
            if username:
                found = self._seat_of_account(username)
                if found is not None:
                    player_id = found
                elif username in self.spectators:
                    # Khán giả rời phòng xem (bấm thoát / đóng tab): chỉ xoá khỏi danh sách chờ, không đụng tới bàn.
                    self.spectators.pop(username, None)
                    return {"status": "success", "message": "Bạn đã rời phòng xem."}
            if not self.env:
                self._reset_controller_state()
                return {"status": "success", "message": f"Đã thoát phòng {self.room_id}."}
            if player_id is None or player_id not in self.player_types:
                if username:
                    return {"status": "success", "message": "Bạn không còn ở trong phòng này."}
                self._reset_controller_state()
                return {"status": "success", "message": f"Đã thoát phòng {self.room_id}."}
            if not self._is_seat_of(player_id, username) or player_id in self.open_seats:
                return {"status": "success", "message": "Bạn không còn ở ghế này."}

            if not self.env.hands:
                if player_id == self.host_seat:
                    self._reset_controller_state()
                    return {"status": "success", "message": f"Đã huỷ phòng {self.room_id}."}
                self._free_seat(player_id)
                return {"status": "success", "message": "Bạn đã rời phòng chờ."}

            mid_match = self.is_active and not self.env.done
            if mid_match:
                if self.player_types[player_id] == "human":
                    # Thoát GIỮA VÁN (bấm Thoát bàn, đóng tab, tải lại, mất mạng): Bot đánh thay, GIỮ chỗ tới khi ván xong.
                    self._hold_seat(player_id)
                    self.env.transaction_logs.append(
                        f"🤖 Người chơi {player_id} mất kết nối/thoát trận. Bot đã tự động tiếp quản tài khoản!")
                    return {"status": "success", "message": "Bạn đã rời trận. Bot đang đánh thay bạn!"}
                return {"status": "success", "message": "Bạn không còn ở ghế này."}
            if self.player_types[player_id] == "bot" and player_id not in self.player_accounts:
                return {"status": "success", "message": "Bạn không còn ở ghế này."}

            # GIỮA 2 VÁN (đang đếm ngược ván mới / chờ thêm người), thoát BẰNG CÁCH NÀO cũng là rời hẳn, kể cả đóng tab / tải lại trang /
            # `reason == "disconnect"`: ghế thành ghế TRỐNG, không giữ chỗ, không Bot thay.
            self.env.transaction_logs.append(f"🚪 Người chơi {player_id} đã rời phòng.")
            self._free_seat(player_id)
            if not self._seated_humans():
                self._reset_controller_state()  # không còn người thật nào -> đóng phòng
                return {"status": "success", "message": f"Đã thoát phòng {self.room_id}."}
            return {"status": "success", "message": "Bạn đã rời phòng."}

    def get_current_turn_time(self):
        """Lấy thời gian đếm ngược thực tế cho lượt hiện tại, tích hợp quyền chặt ngoài vòng (Free Turn)"""
        if not self.env or self.env.done:
            return self.turn_time_limit

        current_p = self.env.current_turn

        # Nếu đang AFK, rút gọn lượt để Bot đánh ngay không cần đợi!
        if self.is_afk.get(current_p, False):
            return AFK_TURN_SECONDS

        is_passed = self.env.passed_circle[current_p]

        # Điều kiện 1: Nếu chưa bỏ lượt, cho full thời gian
        if not is_passed:
            return self.turn_time_limit

        # Điều kiện 2: Đã pass, kiểm tra xem trên bàn có Heo hoặc Hàng không
        last_combo = self.env.last_combo
        if not last_combo:
            return self.fake_turn_limit

        c_type = last_combo.get("combo_type", "")
        is_hang = c_type in ["3_PAIRS_CHAIN", "FOUR_OF_A_KIND", "4_PAIRS_CHAIN", "5_PAIRS_CHAIN"]

        is_heo = False
        if last_combo.get("used_heo") and len(last_combo["used_heo"]) > 0:
            is_heo = True
        elif last_combo.get("highest_card") and tlmn_dict_deck.get(last_combo["highest_card"], {}).get("rank") == 15:
            is_heo = True

        if not (is_heo or is_hang):
            return self.fake_turn_limit

        # Điều kiện 3: Nếu có Heo/Hàng, kiểm tra tay bài xem có 4/5 Đôi Thông để chặt ngoài vòng không
        hand = self.env.hands[current_p]
        can_have_free_turn = False
        check_lengths = [8, 10] if self.env.joker_mode else [8]

        for length in check_lengths:
            if length > len(hand):
                continue
            for subset in itertools.combinations(hand, length):
                # Import tạm tlmn_rules nếu cần, hoặc dùng hàm parse_combo_tlmn đã import sẵn ở trên
                parsed = tlmn_rules.parse_combo_tlmn(list(subset), joker_mode=self.env.joker_mode, last_combo=None)
                if parsed["is_valid"] and parsed["combo_type"] in ["4_PAIRS_CHAIN", "5_PAIRS_CHAIN"]:
                    can_have_free_turn = True
                    break
            if can_have_free_turn:
                break

        if can_have_free_turn:
            return self.free_turn_limit  # Cấp quyền 15s
        else:
            return self.fake_turn_limit  # Không có hàng để chặt, tua nhanh 3s

    def _auto_lead_card(self, seat: int):
        """Hết giờ khi BÀN TRỐNG (mở vòng) mà người thật chưa AFK: tự đi "cóc" (1 lá) nhỏ nhất KHÔNG phải Joker (ván đầu: lá bắt buộc)."""
        hand = self.env.hands[seat]
        if getattr(self.env, "must_contain_weakest", False) and self.env.weakest_card in hand:
            return self.env.weakest_card
        for c in hand:  # tay bài đã sort: lá thường bé nhất đứng trước
            if not c.startswith('X'):
                return c
        return hand[0] if hand else None  # (cực hiếm) toàn Joker

    def handle_timeout(self):
        if not self.is_active or not self.env or self.env.done:
            return

        current_p = self.env.current_turn
        p_type = self.player_types.get(current_p, "bot")

        # Tiêu chí AFK 1 — máy của người này không còn hỏi state (đóng băng / mất mạng): Bot đánh giúp NGAY khi tới lượt họ.
        # Người chơi qua API thuần (chưa từng có `seen`) thì _silent_seconds = 0 nên không bao giờ bị tính.
        if p_type == "human" and not self.is_afk.get(current_p, False) \
                and self._silent_seconds(current_p) > AFK_SILENT_SECONDS:
            self._mark_afk(current_p, "silent")

        current_limit = self.get_current_turn_time()
        elapsed = time.time() - self.turn_start_time
        if elapsed < current_limit:
            return

        if p_type == "bot" or self.is_afk.get(current_p, False):
            self.play_bot_turn()
            return

        legal_actions = self.env.get_legal_actions(current_p)

        # Tiêu chí AFK 2 — HAI lần liên tục để hết giờ LƯỢT THẬT (30s) khi có nước đi. Lượt free / lượt giả tự qua, hoặc lượt thật
        # mà không có nước nào ngoài bỏ lượt, không tính và cũng không làm đứt chuỗi. Lần thứ hai: Bot đánh luôn ở giây cuối lượt.
        if current_limit == self.turn_time_limit and any(len(a) > 0 for a in legal_actions):
            self.consecutive_timeouts[current_p] = self.consecutive_timeouts.get(current_p, 0) + 1
            if self.consecutive_timeouts[current_p] >= AFK_STRIKES:
                self._mark_afk(current_p, "idle")
                self.play_bot_turn()
                return

        if [] in legal_actions:
            # BÀN ĐÃ CÓ BÀI HOẶC LƯỢT FREE / GIẢ: hết giờ thì tự động BỎ LƯỢT (Pass).
            self._play_action(current_p, [], is_timeout_auto=True)
        else:
            # BÀN TRỐNG (MỞ VÒNG): bắt buộc phải đánh -> đi "cóc" nhỏ nhất không phải Joker (lần hết giờ đầu tiên).
            card = self._auto_lead_card(current_p)
            if card is None:
                return
            self._play_action(current_p, [card], chosen_option_index=0, is_timeout_auto=True)

    def get_game_state(self, player_id=0, username=None, spectate=False):
        # Có `username` thì ghế được tìm THEO TÀI KHOẢN: số ghế đổi khi bàn được dồn lại giữa hai ván (xem _compact_seats)
        # và `my_player_id` trong kết quả là ghế HIỆN TẠI của người đó. Cả hàm nằm trong khoá để không đọc dở lúc đang dồn ghế.
        with self._lock:
            return self._get_game_state(player_id, username, spectate)

    def _get_game_state(self, player_id=0, username=None, spectate=False):
        if not self.env:
            return {"status": "error", "message": "Chưa có ván đấu."}
        mine = self._seat_of_account(username)
        if mine is not None:
            player_id = mine
        if not self.env.hands:
            # Đã setup bàn nhưng chưa chia ván nào: trả lỗi gọn thay vì để KeyError thành HTTP 500.
            return {"status": "error", "message": "Ván đấu chưa bắt đầu."}

        # Khán giả (vào xem lúc phòng đang đấu): máy họ hỏi state = còn đang xem. Ván xong và qua RESULT_GRACE_SECONDS thì được ngồi vào bàn
        # ngay trong lần hỏi này (nên tính lại ghế sau khi gọi _seat_spectators).
        spectating = False
        if spectate and mine is None and not (username and username in self.spectators):
            # Máy này xin xem với tư cách khán giả nhưng không còn là khán giả (bị dọn vì im lặng / phòng đã đổi): không trả bài của ai cả.
            return {"status": "error", "code": "not_spectating", "message": "Bạn không còn ở phòng này."}
        if mine is None and username and username in self.spectators:
            self.spectators[username]["seen"] = time.time()
            if self.env.done and self.match_done_at is not None and time.time() - self.match_done_at >= RESULT_GRACE_SECONDS:
                self._seat_spectators()
                mine = self._seat_of_account(username)
                if mine is not None:
                    player_id = mine
            spectating = mine is None and username in self.spectators
        if self.spectators:
            self._prune_spectators()

        if mine is not None:
            self.seen[mine] = time.time()  # máy của họ còn hỏi state = còn ở bàn (xem _release_stale_humans)
            if self.is_afk.get(mine) and self.afk_reason.get(mine) == "silent":
                # Máy họ hỏi state lại = đã kết nối lại: trả quyền đi ngay (AFK do treo máy "idle" thì phải chờ họ chạm vào màn hình).
                self._clear_afk(mine)
                if self.is_active and not self.env.done and self.env.current_turn == mine:
                    self.turn_start_time = time.time()
        self.handle_timeout()
        # Ván đã xong được RESULT_GRACE_SECONDS: trả các chỗ đang giữ cho người bị văng giữa ván (từ lúc đếm ngược, thoát là rời hẳn).
        if self.env.done and self.held_since and self.match_done_at is not None \
                and time.time() - self.match_done_at >= RESULT_GRACE_SECONDS:
            self._release_held_seats()
        # Giữa hai ván: máy nào im lặng quá STALE_PRESENCE_SECONDS thì ghế được trả ngay (những người còn lại thấy ghế trống).
        if self.env.done:
            self._release_stale_humans()
        current_limit = self.get_current_turn_time()

        elapsed = time.time() - self.turn_start_time
        # Xử lý bù trừ hiển thị thời gian khi animation bắt đầu ván chạy
        if elapsed < 0:
            time_left = float(current_limit)
        else:
            time_left = max(0.0, current_limit - elapsed) if self.is_active else 0.0

        last_combo = self.env.last_combo or {}

        # LƯU Ý CHO FRONTEND: các trường status / room_id / my_player_id / current_player_type / instant_win_info
        # và username / type / gender / avatar / highest_balance / stats của từng ghế là DỮ LIỆU FRONTEND CẦN
        # (nhận ghế, nhận ra Bot đánh thay, popup đối thủ, hiệu ứng tới trắng). Đừng bỏ khi chỉnh sửa.
        state = {
            "status": "success",
            "room_id": self.room_id,
            "is_active": self.is_active,
            "round": self.env.num_round,
            "match_number": self.match_count,
            "host_seat": self._current_host_seat(),
            "current_turn": self.env.current_turn,
            "current_player_type": self.player_types.get(self.env.current_turn, "bot"),
            "time_left": time_left,
            "time_limit": current_limit,
            "config": {
                "cost": self.env.cost,
                "payment_mode": self.env.payment_mode,
                "joker_mode": self.env.joker_mode
            },
            "my_player_id": None if spectating else player_id,
            "my_hand": [] if spectating else (self.env.hands[player_id] if player_id in self.env.hands and not self.env.done else []),
            "players_status": {},
            "table": {
                "last_combo_owner": self.env.last_combo_owner,
                "last_combo_cards": self.env.last_combo_cards,
                "last_combo_details": {
                    "transformed_cards": last_combo.get("transformed_cards", self.env.last_combo_cards)
                },
                "stack_penalty": self.env.stack_penalty
            },
            "legal_actions": [] if spectating else (self.env.get_legal_actions(player_id) if self.env.current_turn == player_id else []),
            "logs": self.env.transaction_logs[-5:],
            "is_done": self.env.done,
            "instant_win_info": getattr(self.env, "instant_win_info", None),
            "chip_transfers": getattr(self.env, "chip_transfers", [])
        }

        # Xác định số lá bài tối đa để xét Cóng
        max_cards = 14 if self.env.joker_mode else 13

        empty_stats = {
            "count_cards": {"played": 0, "won": 0, "win_rate": 0.0},
            "winner_takes_all": {"played": 0, "won": 0, "win_rate": 0.0}
        }
        for p in range(self.env.num_players):

            if p in self.open_seats:
                # Ghế trống (người ngồi đã rời giữa hai ván, chưa có ai vào thay): hiện là chỗ trống, không còn avatar / tên.
                state["players_status"][p] = {
                    "name": "", "username": "", "type": "empty", "is_left": True, "cards_left": 0, "balance": 0.0,
                    "is_passed": False, "is_finished": False, "gender": "Nam", "avatar": "", "highest_balance": 0.0,
                    "stats": empty_stats, "is_afk": False, "is_cong": False,
                }
                continue
            profile = self.player_profiles.get(p, {})
            balance = self.env.accumulated_rewards[p]
            state["players_status"][p] = {
                "name": self.player_names.get(p, f"Player {p}"),
                "username": profile.get("username", ""),
                "type": self.player_types.get(p, "bot"),
                "cards_left": len(self.env.hands[p]),
                "balance": balance,
                "is_passed": self.env.passed_circle[p],
                "is_finished": p in self.env.finished_players,
                "gender": profile.get("gender", "Nam"),
                "avatar": profile.get("avatar", ""),
                "highest_balance": max(profile.get("highest_balance") or 0, balance),
                "stats": profile.get("stats", empty_stats),
                "is_afk": self.is_afk.get(p, False),
                # Cóng = hết ván mà vẫn giữ nguyên số lá lúc chia (chưa đánh được lá nào). Ván tới trắng không có cóng.
                "is_cong": bool(self.env.done and getattr(self.env, "instant_win_info", None) is None
                                and len(self.env.hands[p]) == max_cards),
            }

        if self.env.done:
            state["all_hands"] = {p: ([] if p in self.open_seats else h) for p, h in self.env.hands.items()}
            state["all_hands_penalty_details"] = getattr(self.env, "penalty_details", {})
            state["winning_play"] = getattr(self.env, "winning_play", None)

        if spectating:
            state["spectating"] = True  # khán giả: không bài trên tay, không nước đi hợp lệ, my_player_id = null
        return state

    def play_action(self, player_id, cards_to_play, chosen_option_index=None, username=None, is_timeout_auto=False, is_bot_action=False):
        with self._lock:
            return self._play_action(player_id, cards_to_play, chosen_option_index, username, is_timeout_auto, is_bot_action)

    def _play_action(self, player_id, cards_to_play, chosen_option_index=None, username=None, is_timeout_auto=False, is_bot_action=False):
        self.last_activity = time.time()
        mine = self._seat_of_account(username)
        if mine is not None:
            player_id = mine  # số ghế có thể đã đổi khi bàn được dồn lại: tin tài khoản hơn số ghế cũ của máy khách
            self.seen[mine] = time.time()
        if not self.is_active or self.env.done:
            return {"status": "error", "message": "Ván đấu chưa bắt đầu hoặc đã kết thúc."}
        if self.env.current_turn != player_id:
            return {"status": "error", "message": "Chưa tới lượt của bạn."}

        # Một QUYẾT ĐỊNH của con người (tự bấm đánh / bỏ lượt đúng lượt của mình, kể cả nước đi bị từ chối) -> xoá chuỗi hết giờ và cờ AFK.
        # Hết giờ tự bỏ lượt (is_timeout_auto) và Bot đánh giúp (is_bot_action) thì không phải quyết định của họ.
        if self.player_types.get(player_id) == "human" and not is_timeout_auto and not is_bot_action:
            self._clear_afk(player_id)

        prev_log_count = len(self.env.transaction_logs)

        if len(cards_to_play) == 0:
            try:
                obs, rewards, done, info = self.env.step([])
            except Exception as e:
                return {"status": "error", "message": f"Không thể bỏ lượt: {e}"}
        else:
            legal_actions = self.env.get_legal_actions(player_id)
            cards_set = set(cards_to_play)
            is_legal = False
            for act in legal_actions:
                if set(act) == cards_set:
                    is_legal = True
                    cards_to_play = act
                    break
            if not is_legal:
                return {"status": "error", "message": "Nước đi không hợp lệ."}

            try:
                options = tlmn_rules.get_joker_options(
                    chosen_cards=cards_to_play,
                    joker_mode=self.env.joker_mode,
                    last_combo=self.env.last_combo
                )
            except Exception as e:
                return {"status": "error", "message": f"Không xử lý được bộ bài này: {e}"}

            if not options:
                return {"status": "error", "message": "Nước đi không hợp lệ hoặc không đè được bài."}

            if len(options) >= 2 and chosen_option_index is None and self.player_types.get(player_id) == "human":
                return {
                    "status": "require_joker_choice",
                    "options": [{"option_id": idx, "description": opt.get("description", "")} for idx, opt in
                                enumerate(options)],
                    "cards_to_play": cards_to_play
                }

            selected_option = options[chosen_option_index] if (
                    chosen_option_index is not None and 0 <= chosen_option_index < len(options)) else options[0]

            try:
                obs, rewards, done, info = self.env.step(cards_to_play, override_parsed_combo=selected_option)
            except Exception as e:
                return {"status": "error", "message": f"Không thực hiện được nước đi: {e}"}

            if done and not self.env.last_combo_cards:
                self.env.last_combo_cards = cards_to_play
                self.env.last_combo_owner = player_id
                self.env.last_combo = selected_option

        # === THÊM ĐOẠN CẬP NHẬT MẮT THẦN CHO BOT Ở ĐÂY ===
        # Bot chỉ được nhìn thấy bài ĐÃ BIẾN HÌNH (như một người chơi thật nhìn xuống bàn)
        actual_played_cards = cards_to_play
        if len(cards_to_play) > 0 and 'selected_option' in locals():
            actual_played_cards = selected_option.get("transformed_cards", cards_to_play)

        hand_lengths = {p: len(self.env.hands[p]) for p in range(self.env.num_players)}
        for b_seat, brain in getattr(self, 'bot_brains', {}).items():
            brain.observe_turn(
                player_id=player_id,
                action_cards=actual_played_cards,
                hand_lengths=hand_lengths,
                stack_penalty=self.env.stack_penalty,
                last_combo=self.env.last_combo
            )
        # ===================================================

        if self.match_data:
            self.match_data["transactions"].extend(self.env.transaction_logs[prev_log_count:])

        # --- BẮT ĐẦU ĐOẠN TÍNH DELAY LINH HOẠT TỪ FILE CỦ ---
        self.turn_start_time = time.time()
        if self.player_types.get(player_id, "human") == "bot":
            if len(cards_to_play) == 0:
                delay = 1.5
            else:
                n = max(1, len(cards_to_play))
                delay = 1.5 + (n - 1) * 0.35 + 0.3
            self.turn_start_time += delay
        else:
            if len(cards_to_play) > 0:
                self.turn_start_time += 0.3
        # --- KẾT THÚC ĐOẠN TÍNH DELAY LINH HOẠT ---

        if done:
            self.is_active = False
            self._finalize_match()

        return {"status": "success", "state": self.get_game_state(player_id)}

    def play_bot_turn(self):
        with self._lock:
            return self._play_bot_turn()

    def _play_bot_turn(self):
        if not self.is_active or self.env.done:
            return {"status": "error"}

        current_p = self.env.current_turn
        legal_actions = self.env.get_legal_actions(current_p)
        hand = self.env.hands.get(current_p, [])
        last_combo = self.env.last_combo

        # === SỬ DỤNG BỘ NÃO ĐÃ LƯU ĐỂ RA QUYẾT ĐỊNH ===
        if current_p in getattr(self, 'bot_brains', {}):
            brain = self.bot_brains[current_p]
            action_idx = brain.choose_best_action(
                legal_actions=legal_actions,
                hand=hand,
                last_combo=last_combo,
                has_pass=([] in legal_actions)
            )
        else:
            # An toàn fallback nếu lỡ lỗi không tìm thấy não
            action_idx = legal_actions.index([]) if [] in legal_actions else 0
        # ==============================================

        chosen_cards = legal_actions[action_idx]
        chosen_option_index = None

        # NẾU ĐÁNH JOKER LẺ, CHỈ ĐƯỢC PHÉP BIẾN THÀNH HEO (Giữ nguyên logic bảo vệ cũ)
        if len(chosen_cards) == 1 and chosen_cards[0].startswith("X"):
            options = tlmn_rules.get_joker_options(
                chosen_cards,
                joker_mode=self.env.joker_mode,
                last_combo=last_combo
            )
            best_heo_idx = None
            max_heo_power = -1

            for i, opt in enumerate(options):
                h_card = opt["highest_card"]
                if tlmn_dict_deck[h_card]["rank"] == 15:
                    pwr = tlmn_dict_deck[h_card]["power"]
                    if pwr > max_heo_power:
                        max_heo_power = pwr
                        best_heo_idx = i

            if best_heo_idx is not None:
                chosen_option_index = best_heo_idx

        return self.play_action(
            current_p,
            chosen_cards,
            chosen_option_index=chosen_option_index,
            is_bot_action=True
        )

    def _finalize_match(self):
        self.match_done_at = time.time()  # từ đây tính RESULT_GRACE_SECONDS để trả các chỗ đang giữ (xem _get_game_state)
        try:
            # DÙNG CHUNG 1 KẾT NỐI DB CHO CẢ VIỆC CẬP NHẬT TÀI KHOẢN VÀ LƯU VÁN ĐẤU
            conn, _ = get_db_connection()
            cursor = conn.cursor()
            is_cc = (self.env.payment_mode == "count_cards")
            winner_id = getattr(self.env, "last_winner", None)

            # 1. Cập nhật số dư người chơi
            for p_id, username in self.player_accounts.items():
                current_balance = self.env.accumulated_rewards.get(p_id, 0.0)

                execute_query(cursor, """
                    SELECT highest_balance, games_played_cc, games_won_cc, games_played_wta, games_won_wta 
                    FROM accounts WHERE username = ?
                """, (username,))
                row = cursor.fetchone()
                if row:
                    high_bal, gp_cc, gw_cc, gp_wta, gw_wta = row
                    new_high = max(high_bal, current_balance)

                    if is_cc:
                        gp_cc += 1
                        if winner_id == p_id:
                            gw_cc += 1
                    else:
                        gp_wta += 1
                        if winner_id == p_id:
                            gw_wta += 1

                    execute_query(cursor, """
                        UPDATE accounts 
                        SET balance = ?, highest_balance = ?, games_played_cc = ?, games_won_cc = ?, games_played_wta = ?, games_won_wta = ?
                        WHERE username = ?
                    """, (current_balance, new_high, gp_cc, gw_cc, gp_wta, gw_wta, username))

                    # Làm tươi hồ sơ lưu trong phòng để popup đối thủ ở ván SAU hiện số liệu mới nhất
                    # (hồ sơ này được chụp lúc setup_game nên nếu không làm tươi sẽ bị cũ sau mỗi ván).
                    profile = self.player_profiles.get(p_id)
                    if profile is not None:
                        profile["highest_balance"] = new_high
                        profile["stats"] = {
                            "count_cards": {"played": gp_cc, "won": gw_cc,
                                            "win_rate": round((gw_cc / gp_cc) * 100, 1) if gp_cc > 0 else 0.0},
                            "winner_takes_all": {"played": gp_wta, "won": gw_wta,
                                                 "win_rate": round((gw_wta / gp_wta) * 100,
                                                                   1) if gp_wta > 0 else 0.0}
                        }

            # 2. Lưu dữ liệu huấn luyện vào bảng match_training_data
            if self.match_data:
                self.match_data["final_balances"] = self.env.accumulated_rewards.copy()
                execute_query(cursor, '''
                    INSERT INTO match_training_data (room_id, match_id, timestamp, config, match_json)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    self.room_id,
                    self.match_data["match_id"],
                    self.match_data["timestamp"],
                    json.dumps(self.match_data["config"], ensure_ascii=False),
                    json.dumps(self.match_data, ensure_ascii=False)
                ))

            # Đóng kết nối DB ở cuối
            conn.commit()
            conn.close()

        except Exception as e:
            print(f"Lỗi lưu dữ liệu vào DB: {e}")

        if self.env:
            self.env.num_round += 1


class TLMNRoomManager:
    def __init__(self):
        self.rooms: dict[str, TLMNAppController] = {}

    def get_room(self, room_id: str) -> TLMNAppController:
        if not room_id:
            room_id = "default"
        if room_id not in self.rooms:
            self.rooms[room_id] = TLMNAppController(room_id=room_id)
        self.rooms[room_id].last_activity = time.time()
        return self.rooms[room_id]

    def find_room(self, room_id: str):
        """Tìm phòng ĐÃ được mở. Khác get_room: không tự tạo phòng rỗng cho một mã lạ."""
        room = self.rooms.get(room_id)
        return room if (room is not None and room.env is not None) else None

    def find_room_of(self, username: str):
        """Phòng đang giữ một ghế gắn với tài khoản `username` (phòng hoạt động gần nhất nếu có nhiều); None nếu không có."""
        best = None
        for room in list(self.rooms.values()):
            if room.env is None or room._seat_of_account(username) is None:
                continue
            if best is None or room.last_activity > best.last_activity:
                best = room
        return best

    def list_rooms(self):
        active = []
        for rid, room in self.rooms.items():
            active.append({
                "room_id": rid,
                "is_active": room.is_active,
                "num_players": room.env.num_players if room.env else 0,
                "round": room.env.num_round if room.env else 1,
                "started": bool(room.env and room.env.hands),
                "open_seats": len(room.open_seats)
            })
        return active
