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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "database"))
os.makedirs(DB_DIR, exist_ok=True)

USER_DB_PATH = os.path.join(DB_DIR, "tlmn_user_database.db")
SAMPLE_DB_PATH = os.path.join(DB_DIR, "tlmn_sample_database.db")

# Phòng chờ (nhiều người thật): ai không "điểm danh" qua GET /api/lobby quá số giây này coi như đã bỏ đi (đóng trình
# duyệt, mất mạng...): khách -> trả ghế cho người khác; chủ phòng -> đóng phòng. Đặt rộng tay vì điện thoại hay tạm
# dừng trang khi người chơi chuyển sang app khác để gửi mã phòng cho bạn bè.
LOBBY_IDLE_SECONDS = 180


def ai_heuristic_smart_choice(legal_actions, hand, last_combo=None, joker_mode=False, other_hands_lens=None,
                              seen_cards=None, payment_mode="count_cards", cost=1000):
    """
    Thuật toán Heuristic thông minh cấp cao cho Bot:
    - Biết giữ "Tài sản" đầu game và sợ "Cục nợ" cuối game.
    - Tích hợp toàn bộ chiến thuật thực chiến: Tenpai, mở vòng 3 Bích, quản lý Heo đen, phân rã hàng thông minh,
      chống cóng linh hoạt, quản lý Joker chặt chẽ và đánh giá cấu trúc bài thừa (Look-ahead).
    """
    if seen_cards is None:
        seen_cards = []
    if other_hands_lens is None:
        other_hands_lens = []

    # 0. ƯU TIÊN TUYỆT ĐỐI: Nước đi đánh sạch bài để về nhất ngay lập tức
    for idx, act in enumerate(legal_actions):
        if len(act) > 0 and len(act) == len(hand):
            return idx

    playable = [act for act in legal_actions if len(act) > 0]
    has_pass = [] in legal_actions

    # Lấy thông tin bài mục tiêu ngay từ đầu để dùng chung
    target_card = last_combo.get("highest_card", "") if last_combo else ""
    target_rank = tlmn_dict_deck.get(target_card, {}).get("rank", 0) if target_card else 0

    # Lọc Joker lẻ: Chặn Bot tự mang Joker ra mở vòng
    if last_combo is None and len(hand) > 1:
        playable = [act for act in playable if not (len(act) == 1 and act[0].startswith("X"))]

    if not playable:
        return legal_actions.index([])

    def get_action_details(act):
        ranks = [tlmn_dict_deck.get(c, {}).get("rank", 0) for c in act if not c.startswith("X")]
        max_rank = max(ranks) if ranks else 0
        min_rank = min(ranks) if ranks else 0
        is_pig = any(r == 15 for r in ranks)
        is_black_pig = any(c in ["2♠", "2♣"] for c in act)
        is_joker = any(c.startswith("X") for c in act)
        is_real_hang = len(act) >= 4 or (len(act) == 2 and max_rank == 15 and not is_joker) or (
                len(act) >= 3 and is_pig)
        return {
            "len": len(act), "max_rank": max_rank, "min_rank": min_rank,
            "is_pig": is_pig, "is_black_pig": is_black_pig,
            "is_joker": is_joker, "is_real_hang": is_real_hang
        }

    def get_action_power(act):
        powers = [tlmn_dict_deck[c]["power"] for c in act if not c.startswith("X")]
        return max(powers) if powers else 100

    # Đọc ngữ cảnh ván đấu
    opponent_danger = any(l <= 2 for l in other_hands_lens) if other_hands_lens else False
    opponent_one_card = any(l == 1 for l in other_hands_lens) if other_hands_lens else False
    is_game_start = len(seen_cards) == 0
    min_opp_cards = min(other_hands_lens) if other_hands_lens else 13
    bot_is_safe = len(hand) <= 2

    # ==========================================
    # HÀM MỚI: TÍNH RỦI RO (LINH HOẠT THEO GIAI ĐOẠN)
    # ==========================================
    def evaluate_action_risk(act):
        simulated_hand = hand.copy()
        for c in act:
            if c in simulated_hand:
                simulated_hand.remove(c)

        if not simulated_hand:
            return -999999.0

        # 1. TÀI CHÍNH: Phạt tiền đền
        fin_penalty = tlmn_rules.normal_win_payment(
            simulated_hand, payment_mode, cost, joker_mode, last_combo=None
        )
        fin_score = fin_penalty / max(1, cost)

        # ĐIỀU CHỈNH TRỌNG SỐ: Khái niệm "Tài sản" vs "Cục nợ"
        my_cards_left = len(simulated_hand)
        if min_opp_cards <= 3 or my_cards_left <= 2:
            fin_weight = 3.0  # Tàn cuộc/Nguy hiểm: Rất sợ đền tiền
        elif min_opp_cards <= 7:
            fin_weight = 1.0  # Giữa game: Bắt đầu tính toán
        else:
            fin_weight = 0.05  # Đầu game: Tiền đền không quan trọng bằng việc giữ hàng

        # 2. CẤU TRÚC RÁC
        real_cards = [c for c in simulated_hand if not c.startswith("X")]
        jokers = [c for c in simulated_hand if c.startswith("X")]

        counts = {}
        for c in real_cards:
            r = tlmn_dict_deck[c]["rank"]
            counts[r] = counts.get(r, 0) + 1

        in_straight = set()
        ranks = sorted(list(counts.keys()))
        for i in range(len(ranks)):
            r = ranks[i]
            if r >= 15: continue
            length = 1
            curr = r
            while curr + 1 in counts and curr + 1 < 15:
                length += 1
                curr += 1
            if length >= 3:
                for k in range(r, curr + 1):
                    in_straight.add(k)

        trash_penalty = 0.0
        for r, c in counts.items():
            if c == 1 and r not in in_straight:
                if r <= 8:
                    trash_penalty += 3.0
                elif r <= 12:
                    trash_penalty += 1.5
                else:
                    trash_penalty += 0.5
            elif c == 3:
                trash_penalty += 0.5

        trash_penalty -= len(jokers) * 4.0

        # 3. LÃNG PHÍ: Phạt "Dao mổ trâu giết gà"
        waste_penalty = 0.0
        details = get_action_details(act)
        if details["is_pig"] or details["is_joker"] or details["is_real_hang"]:
            if last_combo is None:
                # Trống vòng tự nhiên xả Heo/Hàng -> Rất lãng phí
                waste_penalty += 100.0
            else:
                # Đang đè bài rác (từ Q trở xuống) ở đầu/giữa game -> Lãng phí báu vật
                if target_rank <= 12 and min_opp_cards > 3 and my_cards_left > 2:
                    waste_penalty += 50.0

        return (fin_score * fin_weight) + trash_penalty + waste_penalty

    # ==========================================
    # 1. PHẢN XẠ TÀN CUỘC KHẨN CẤP
    # ==========================================
    if opponent_one_card and not bot_is_safe:
        if last_combo is None:
            multi_card = [act for act in playable if len(act) >= 2 and not get_action_details(act)["is_real_hang"]]
            if multi_card:
                multi_card.sort(key=lambda x: (len(x), get_action_power(x)), reverse=True)
                return legal_actions.index(multi_card[0])
            playable.sort(key=get_action_power, reverse=True)
            return legal_actions.index(playable[0])
        else:
            playable.sort(key=get_action_power, reverse=True)
            return legal_actions.index(playable[0])

    if opponent_danger and last_combo is None and not bot_is_safe:
        pig_actions = [act for act in playable if
                       get_action_details(act)["is_pig"] or (joker_mode and any(c.startswith("X") for c in act))]
        if pig_actions:
            pig_actions.sort(key=get_action_power, reverse=True)
            return legal_actions.index(pig_actions[0])

    # ==========================================
    # 2. CHẤM ĐIỂM CHIẾN THUẬT CHUNG
    # ==========================================
    best_act_idx = 0
    min_risk = float('inf')

    valid_playable = playable
    if last_combo is None:
        valid_playable = [act for act in valid_playable if
                          not (get_action_details(act)["is_black_pig"] and len(act) == 1 and len(hand) > 6)]
        if not valid_playable:
            valid_playable = playable

    valid_playable.sort(key=get_action_power)

    for act in valid_playable:
        risk = evaluate_action_risk(act)

        if last_combo is None and is_game_start and "3♠" in act:
            risk -= 100.0

        if last_combo is None and len(act) >= 5:
            risk -= 5.0

        if risk < min_risk:
            min_risk = risk
            best_act_idx = legal_actions.index(act)

    # 3. KHI CẦN PASS (LINH HOẠT)
    if last_combo is not None and has_pass:
        if len(hand) <= 6 and target_rank <= 11 and random.random() < 0.2:
            return legal_actions.index([])

    return best_act_idx


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
        # --- Phòng chờ ---
        self.host_seat = 0  # ghế chủ phòng (người tạo phòng): chỉ chủ phòng được bấm "Bắt đầu" ván đầu tiên
        self.open_seats = set()  # ghế người thật còn TRỐNG, chờ người nhập mã phòng để vào (POST /api/join)
        self.lobby_seen = {}  # ghế -> lần cuối ghế đó "điểm danh" ở phòng chờ (GET /api/lobby)

    def intro_done(self):
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
                    # GHẾ TRỐNG chờ người nhập mã phòng để vào. Tới lúc chủ phòng bấm "Bắt đầu" mà vẫn trống thì Bot ngồi vào.
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
        """Khách rời phòng chờ: trả ghế về trạng thái trống để người khác nhập mã vào."""
        self.player_accounts.pop(seat, None)
        self.player_profiles.pop(seat, None)
        self.player_names[seat] = f"Người chơi {seat + 1}"
        self.open_seats.add(seat)
        self.lobby_seen.pop(seat, None)
        if self.env:
            self.env.accumulated_rewards[seat] = 500000.0

    def _fill_open_seats_with_bots(self):
        """Chủ phòng bấm "Bắt đầu" mà vẫn còn ghế người thật trống -> Bot ngồi vào các ghế đó (bàn vẫn đủ số người đã chọn)."""
        for seat in sorted(self.open_seats):
            self._seat_bot(seat)
            bot_balance = self.creator_initial_balance if self.creator_initial_balance is not None else 500000.0
            self.env.accumulated_rewards[seat] = bot_balance
            self.lobby_seen.pop(seat, None)
        self.open_seats.clear()

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
                "is_host": seat == self.host_seat,
            }
        return {
            "room_id": self.room_id,
            "started": bool(self.env.hands),
            "host_seat": self.host_seat,
            "num_players": self.env.num_players,
            "open_seats": sorted(self.open_seats),
            "config": {
                "cost": self.env.cost,
                "payment_mode": self.env.payment_mode,
                "joker_mode": self.env.joker_mode
            },
            "players": players,
        }

    def _join_result(self, seat: int) -> dict:
        return {"status": "success", "message": "Đã vào phòng.", "room_id": self.room_id, "seat": seat,
                "host_seat": self.host_seat, "lobby": self._lobby_view()}

    def join_room(self, username: str):
        """Nhập mã phòng để NGỒI VÀO một ghế người thật còn trống. Chỉ vào được khi phòng đang chờ (chưa chia ván đầu)."""
        with self._lock:
            self.last_activity = time.time()
            self._prune_lobby()
            if not self.env:
                return {"status": "error", "code": "not_found",
                        "message": "Không tìm thấy phòng này. Hãy kiểm tra lại mã phòng."}
            if self.env.hands:
                return {"status": "error", "code": "in_progress",
                        "message": "Phòng đang trong ván, bạn chưa thể vào lúc này."}

            username = (username or "").strip()
            # Đã ngồi trong phòng này rồi -> trả đúng ghế cũ (không chiếm thêm ghế).
            for seat, acc in self.player_accounts.items():
                if acc == username and self._is_seated(seat):
                    self.lobby_seen[seat] = time.time()
                    return self._join_result(seat)

            if not self.open_seats:
                return {"status": "error", "code": "full", "message": "Phòng đã đủ người chơi."}

            conn, _ = get_db_connection()
            cursor = conn.cursor()
            loaded = self._load_account(cursor, username)
            conn.close()
            if not loaded:
                return {"status": "error", "code": "no_account", "message": "Tài khoản không tồn tại."}

            profile, balance = loaded
            seat = min(self.open_seats)
            self.open_seats.discard(seat)
            self.player_accounts[seat] = username
            self.player_names[seat] = profile["display_name"]
            self.player_profiles[seat] = profile
            self.env.accumulated_rewards[seat] = balance
            self.lobby_seen[seat] = time.time()
            return self._join_result(seat)

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
            return {"status": "success", **self._lobby_view()}

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
        if first_match:
            self._fill_open_seats_with_bots()  # ghế người thật còn trống -> Bot ngồi vào

        # Thay thế Bot hết tiền (Lấy lại logic từ bản trước)
        replaced_bots = []
        for p in range(self.env.num_players):
            if self.player_types.get(p) == "bot" and self.env.accumulated_rewards.get(p, 0) <= 0:
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

        for old, new, bal in replaced_bots:
            self.env.transaction_logs.insert(0,
                                             f"🔄 {old} hết tiền đã rời bàn. {new} (mang theo {bal:,.0f} Chip) vào thế chỗ!")

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

    def handle_player_quit(self, player_id: int, username: str = None):
        """Thoát phòng. Tuỳ lúc thoát:
        - Phòng chờ (chưa chia ván đầu): chủ phòng thoát = huỷ phòng; khách thoát = trả ghế cho người khác.
        - Đang đấu: ghế của người thoát do Bot tiếp quản (giữ tài khoản tới hết ván đó), ván vẫn tiếp diễn.
        - Giữa 2 ván: ghế do Bot ngồi thay và ván sau vẫn tự bắt đầu cho những người còn lại (kể cả khi người thoát là chủ
          phòng ban đầu). Hết người thật thì phòng đóng.
        `username` (không bắt buộc) bảo đảm không đá nhầm người khác đã ngồi vào ghế đó."""
        with self._lock:
            self.last_activity = time.time()
            if not self.env or player_id is None or player_id not in self.player_types:
                self._reset_controller_state()
                return {"status": "success", "message": f"Đã thoát phòng {self.room_id}."}
            if not self._is_seat_of(player_id, username):
                return {"status": "success", "message": "Bạn không còn ở ghế này."}

            if not self.env.hands:
                if player_id == self.host_seat:
                    self._reset_controller_state()
                    return {"status": "success", "message": f"Đã huỷ phòng {self.room_id}."}
                if player_id not in self.open_seats:
                    self._free_seat(player_id)
                return {"status": "success", "message": "Bạn đã rời phòng chờ."}

            mid_match = self.is_active and not self.env.done
            if self.player_types[player_id] == "human":
                self.player_types[player_id] = "bot"
                if mid_match:
                    self.env.transaction_logs.append(
                        f"🤖 Người chơi {player_id} mất kết nối/thoát trận. Bot đã tự động tiếp quản tài khoản!")
                    return {"status": "success", "message": "Bạn đã rời trận. Bot đang đánh thay bạn!"}

                # Thoát giữa 2 ván: ghế không còn dính tài khoản (người đã đi thì chip không bị Bot đem ra chơi tiếp).
                self.player_accounts.pop(player_id, None)
                self.env.transaction_logs.append(f"🚪 Người chơi {player_id} đã rời phòng. Bot ngồi thay chỗ trống!")

            # không còn người thật nào -> đóng phòng
            if not mid_match and not any(t == "human" for t in self.player_types.values()):
                self._reset_controller_state()
                return {"status": "success", "message": f"Đã thoát phòng {self.room_id}."}
            return {"status": "success", "message": "Bạn đã rời phòng. Bot ngồi thay chỗ của bạn!"}

    def get_current_turn_time(self):
        """Lấy thời gian đếm ngược thực tế cho lượt hiện tại, tích hợp quyền chặt ngoài vòng (Free Turn)"""
        if not self.env or self.env.done:
            return self.turn_time_limit

        current_p = self.env.current_turn
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

    def handle_timeout(self):
        if not self.is_active or not self.env or self.env.done:
            return
        current_limit = self.get_current_turn_time()
        elapsed = time.time() - self.turn_start_time
        if elapsed >= current_limit:
            current_p = self.env.current_turn
            p_type = self.player_types.get(current_p, "bot")
            if p_type == "bot":
                self.play_bot_turn()
            else:
                legal_actions = self.env.get_legal_actions(current_p)
                if [] in legal_actions:
                    self.play_action(current_p, [])
                elif len(legal_actions) > 0:
                    self.play_action(current_p, legal_actions[0])

    def get_game_state(self, player_id=0):
        if not self.env:
            return {"status": "error", "message": "Chưa có ván đấu."}
        if not self.env.hands:
            # Đã setup bàn nhưng chưa chia ván nào: trả lỗi gọn thay vì để KeyError thành HTTP 500.
            return {"status": "error", "message": "Ván đấu chưa bắt đầu."}

        self.handle_timeout()
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
            "current_turn": self.env.current_turn,
            "current_player_type": self.player_types.get(self.env.current_turn, "bot"),
            "time_left": time_left,
            "time_limit": current_limit,
            "config": {
                "cost": self.env.cost,
                "payment_mode": self.env.payment_mode,
                "joker_mode": self.env.joker_mode
            },
            "my_player_id": player_id,
            "my_hand": self.env.hands[player_id] if player_id in self.env.hands and not self.env.done else [],
            "players_status": {},
            "table": {
                "last_combo_owner": self.env.last_combo_owner,
                "last_combo_cards": self.env.last_combo_cards,
                "last_combo_details": {
                    "transformed_cards": last_combo.get("transformed_cards", self.env.last_combo_cards)
                },
                "stack_penalty": self.env.stack_penalty
            },
            "legal_actions": self.env.get_legal_actions(player_id) if self.env.current_turn == player_id else [],
            "logs": self.env.transaction_logs[-5:],
            "is_done": self.env.done,
            "instant_win_info": getattr(self.env, "instant_win_info", None)
        }

        empty_stats = {
            "count_cards": {"played": 0, "won": 0, "win_rate": 0.0},
            "winner_takes_all": {"played": 0, "won": 0, "win_rate": 0.0}
        }
        for p in range(self.env.num_players):
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
                "stats": profile.get("stats", empty_stats)
            }

        if self.env.done:
            state["all_hands"] = self.env.hands

        return state

    def play_action(self, player_id, cards_to_play, chosen_option_index=None):
        self.last_activity = time.time()
        if not self.is_active or self.env.done:
            return {"status": "error", "message": "Ván đấu chưa bắt đầu hoặc đã kết thúc."}
        if self.env.current_turn != player_id:
            return {"status": "error", "message": "Chưa tới lượt của bạn."}

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
        if not self.is_active or self.env.done:
            return {"status": "error"}
        current_p = self.env.current_turn
        legal_actions = self.env.get_legal_actions(current_p)
        hand = self.env.hands.get(current_p, [])
        last_combo = self.env.last_combo
        other_hands_lens = [len(self.env.hands[p]) for p in range(self.env.num_players) if p != current_p]
        seen_cards = self.env.discarded_cards

        action_idx = ai_heuristic_smart_choice(
            legal_actions,
            hand,
            last_combo=last_combo,
            joker_mode=self.env.joker_mode,
            other_hands_lens=other_hands_lens,
            seen_cards=seen_cards,
            payment_mode=self.env.payment_mode,
            cost=self.env.cost
        )

        chosen_cards = legal_actions[action_idx]
        chosen_option_index = None

        # NẾU ĐÁNH JOKER LẺ, CHỈ ĐƯỢC PHÉP BIẾN THÀNH HEO
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
            chosen_option_index=chosen_option_index
        )

    def _finalize_match(self):
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
