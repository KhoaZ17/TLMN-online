import json
import itertools
import time
import sqlite3
import uuid
import random
from tlmn_rules import card_info, tlmn_dict_deck
from tlmn_sample_env import TLMNSampleEnv
import tlmn_rules
import os

# 1. Lấy đường dẫn thư mục hiện tại đang chứa file code (ví dụ: .../tlmn_backend/core)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 2. Trỏ ra ngoài một cấp và đi vào thư mục database (.../tlmn_backend/database)
DB_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "database"))
os.makedirs(DB_DIR, exist_ok=True)

# 3. Định nghĩa đường dẫn chính xác cho 2 file database
USER_DB_PATH = os.path.join(DB_DIR, "tlmn_user_database.db")
SAMPLE_DB_PATH = os.path.join(DB_DIR, "tlmn_sample_database.db")


def ai_heuristic_smart_choice(legal_actions, hand, last_combo=None, joker_mode=False):
    """
    Thuật toán Heuristic nâng cao giúp Bot đưa ra quyết định thông minh hơn:
    - Giữ lại Heo và Hàng trừ khi cần thiết.
    - Ưu tiên xả rác nhỏ/bộ nhỏ khi mở vòng.
    - Bỏ lượt thông minh khi đối thủ đánh bài quá lớn để tiết kiệm lực lượng.
    - Dứt điểm nhanh khi sắp hết bài.
    """
    playable = [act for act in legal_actions if len(act) > 0]
    if not playable:
        return legal_actions.index([])

    # Nếu trên bàn chưa có bài (Bot mở vòng mới)
    if last_combo is None:
        # 1. Ưu tiên đánh Sảnh / Đôi thông lớn nhất trước nếu có
        chains = [act for act in playable if len(act) >= 3 and not any(tlmn_dict_deck[c]["rank"] == 15 for c in act if not c.startswith("X"))]
        if chains:
            # Chọn sảnh/chuỗi lá nhỏ nhất trước
            chains.sort(key=lambda x: min(tlmn_dict_deck[c]["power"] for c in x if c in tlmn_dict_deck))
            return legal_actions.index(chains[0])

        # 2. Ưu tiên đánh Bộ (Đôi / Xám) có giá trị thấp
        multi_cards = [act for act in playable if len(act) in [2, 3] and not any(tlmn_dict_deck[c]["rank"] == 15 for c in act if not c.startswith("X"))]
        if multi_cards:
            multi_cards.sort(key=lambda x: min(tlmn_dict_deck[c]["power"] for c in x if c in tlmn_dict_deck))
            return legal_actions.index(multi_cards[0])

        # 3. Đánh lá rác nhỏ nhất (loại trừ Heo)
        singles = [act for act in playable if len(act) == 1 and tlmn_dict_deck.get(act[0], {}).get("rank") != 15]
        if singles:
            singles.sort(key=lambda x: tlmn_dict_deck[x[0]]["power"])
            return legal_actions.index(singles[0])

        # Nếu chỉ còn Heo hoặc Hàng thì đánh bộ ngắn nhất
        playable.sort(key=len)
        return legal_actions.index(playable[0])

    # Nếu phải đè bài người chơi khác (Đã có last_combo)
    target_rank = tlmn_dict_deck.get(last_combo.get("highest_card", ""), {}).get("rank", 0)

    # Nếu bài đối thủ quá lớn (Ví dụ: Ách A trở lên) và nước đi duy nhất phải dùng Heo/Hàng
    # Bot cân nhắc bỏ lượt 60% thời gian nếu còn nhiều bài trên tay
    if target_rank >= 14 and len(hand) > 4 and [] in legal_actions:
        # Nếu chỉ đè bằng 1 lá Heo lẻ thì nhường vòng
        only_pigs = [act for act in playable if len(act) == 1 and tlmn_dict_deck.get(act[0], {}).get("rank") == 15]
        if only_pigs and random.random() < 0.6:
            return legal_actions.index([])

    # Tìm nước đi hợp lệ có sức mạnh (power) thấp nhất vừa đủ đè
    def get_action_power(act):
        powers = [tlmn_dict_deck[c]["power"] for c in act if c in tlmn_dict_deck]
        return max(powers) if powers else 0

    playable.sort(key=get_action_power)
    best_action = playable[0]
    return legal_actions.index(best_action)


class TLMNAppController:
    """Quản lý logic ván đấu cho MỘT phòng chơi cụ thể (Room)."""

    def __init__(self, room_id="default", default_cost=1000, default_starting_balance=500000.0, turn_time_limit=30,
                 fake_turn_limit=3, free_turn_limit=15):
        self.room_id = room_id
        self.default_cost = default_cost
        self.default_starting_balance = max(default_starting_balance, 10 * self.default_cost)
        self.turn_time_limit = turn_time_limit
        self.fake_turn_limit = fake_turn_limit
        self.free_turn_limit = free_turn_limit
        self.last_activity = time.time()
        self._reset_controller_state()

    def _reset_controller_state(self):
        self.cost = self.default_cost
        self.starting_balance = self.default_starting_balance
        self.env = None
        self.player_names = {}
        self.player_types = {}
        self.player_accounts = {}  # Lưu mapping giữa slot player_id và username trong database
        self.is_active = False
        self.match_data = None
        self.bot_counter = 0
        self.turn_start_time = 0
        self.last_activity = time.time()

    def intro_done(self):
        self.last_activity = time.time()
        if self.is_active:
            self.turn_start_time = time.time()
        return {"status": "success"}

    def setup_game(self, joker_mode: bool, payment_mode: str, num_bots: int, num_humans: int = 1, cost: int = None,
                   starting_balance: float = None, player_accounts: list = None):
        self.last_activity = time.time()
        self.cost = cost if (cost is not None and cost > 0) else self.default_cost
        min_sb = 10 * self.cost if payment_mode == "count_cards" else self.cost

        num_players = max(2, min(4, num_humans + num_bots))

        self.env = TLMNSampleEnv(
            num_players=num_players,
            joker_mode=joker_mode,
            payment_mode=payment_mode,
            cost=self.cost,
            starting_balance=min_sb
        )

        self.player_names = {}
        self.player_types = {}
        self.player_accounts = {}
        self.player_profiles = {}
        self.bot_counter = 0
        human_count = 0

        conn = sqlite3.connect(USER_DB_PATH)
        cursor = conn.cursor()

        for i in range(num_players):
            if i < num_humans:
                self.player_types[i] = "human"
                human_count += 1
                acc_name = player_accounts[human_count - 1] if (
                            player_accounts and len(player_accounts) >= human_count) else None

                if acc_name:
                    cursor.execute("""
                        SELECT player_id, display_name, gender, avatar, balance, highest_balance, 
                               games_played_cc, games_won_cc, games_played_wta, games_won_wta 
                        FROM accounts WHERE username = ?
                    """, (acc_name,))
                    row = cursor.fetchone()
                    if row:
                        p_id_str, d_name, gender, avatar, bal, high_bal, gp_cc, gw_cc, gp_wta, gw_wta = row
                        self.player_accounts[i] = acc_name
                        self.player_names[i] = d_name or acc_name
                        self.env.accumulated_rewards[i] = float(bal)
                        self.player_profiles[i] = {
                            "player_id": p_id_str,
                            "username": acc_name,
                            "display_name": d_name or acc_name,
                            "gender": gender or "Nam",
                            "avatar": avatar or "",
                            "highest_balance": high_bal,
                            "stats": {
                                "count_cards": {"played": gp_cc, "won": gw_cc,
                                                "win_rate": round((gw_cc / gp_cc) * 100, 1) if gp_cc > 0 else 0.0},
                                "winner_takes_all": {"played": gp_wta, "won": gw_wta,
                                                     "win_rate": round((gw_wta / gp_wta) * 100,
                                                                       1) if gp_wta > 0 else 0.0}
                            }
                        }
                    else:
                        self.player_names[i] = f"Người chơi {human_count}"
                        self.env.accumulated_rewards[i] = float(
                            max(starting_balance or self.default_starting_balance, min_sb))
                else:
                    self.player_names[i] = f"Người chơi {human_count}" if human_count > 1 else "Bạn"
                    self.env.accumulated_rewards[i] = float(
                        max(starting_balance or self.default_starting_balance, min_sb))
            else:
                self.player_types[i] = "bot"
                self.bot_counter += 1
                self.bot_id = f"BOT_{self.bot_counter}_{random.randint(100000, 999999)}"
                self.player_names[i] = f"Bot {self.bot_counter}"
                self.player_profiles[i] = {
                    "player_id": self.bot_id,
                    "username": f"bot_{i}",
                    "display_name": self.player_names[i],
                    "gender": "Nam",
                    "avatar": "",
                    "highest_balance": self.starting_balance,
                    "stats": {
                        "count_cards": {"played": 0, "won": 0, "win_rate": 0.0},
                        "winner_takes_all": {"played": 0, "won": 0, "win_rate": 0.0}
                    }
                }
                self.env.accumulated_rewards[i] = float(max(starting_balance or self.default_starting_balance, min_sb))

        conn.close()
        self.is_active = False
        pay_type_str = "Đếm lá" if payment_mode == "count_cards" else "Nhất ăn tất"

        return {
            "status": "success",
            "room_id": self.room_id,
            "num_players": num_players,
            "player_types": self.player_types,
            "message": f"Khởi tạo phòng {self.room_id} ({pay_type_str}) thành công."
        }

    def start_new_match(self):
        self.last_activity = time.time()
        if not self.env:
            return {"status": "error", "message": "Chưa setup bàn chơi cho phòng này."}

        self.env.reset()
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
                "starting_balance": self.starting_balance
            },
            "initial_hands": {p: self.env.hands[p].copy() for p in range(self.env.num_players)},
            "transactions": [],
            "final_balances": {}
        }

        return self.get_game_state(player_id=0)

    def quit_game(self):
        self._reset_controller_state()
        return {"status": "success", "message": f"Đã thoát phòng {self.room_id} an toàn."}

    def get_current_turn_time(self):
        if not self.env or self.env.done:
            return self.turn_time_limit
        current_p = self.env.current_turn
        is_passed = self.env.passed_circle[current_p]
        if not is_passed:
            return self.turn_time_limit
        return self.fake_turn_limit

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
        self.last_activity = time.time()
        if not self.env:
            return {"status": "error", "message": "Chưa có ván đấu trong phòng này."}

        self.handle_timeout()
        current_limit = self.get_current_turn_time()
        elapsed = time.time() - self.turn_start_time
        time_left = max(0.0, current_limit - elapsed) if self.is_active else 0.0
        last_combo = self.env.last_combo or {}

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

        for p in range(self.env.num_players):
            profile = getattr(self, "player_profiles", {}).get(p, {})
            state["players_status"][p] = {
                "name": profile.get("display_name", self.player_names.get(p, f"Player {p}")),
                "username": profile.get("username", ""),
                "type": self.player_types.get(p, "bot"),
                "cards_left": len(self.env.hands[p]),
                "balance": self.env.accumulated_rewards[p],
                "gender": profile.get("gender", "Nam"),
                "avatar": profile.get("avatar", ""),
                "highest_balance": profile.get("highest_balance", self.env.accumulated_rewards[p]),
                "stats": profile.get("stats", {"count_cards": {"played": 0, "won": 0, "win_rate": 0.0},
                                               "winner_takes_all": {"played": 0, "won": 0, "win_rate": 0.0}}),
                "is_passed": self.env.passed_circle[p],
                "is_finished": p in self.env.finished_players
            }

        if self.env.done:
            state["all_hands"] = self.env.hands

        return state

    def play_action(self, player_id, cards_to_play, chosen_option_index=None):
        self.last_activity = time.time()
        if not self.is_active or self.env.done:
            return {"status": "error", "message": "Ván đấu chưa bắt đầu hoặc đã kết thúc."}
        if self.env.current_turn != player_id:
            return {"status": "error", "message": f"Chưa tới lượt của bạn."}

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

        self.turn_start_time = time.time()
        if self.player_types.get(player_id, "human") == "bot":
            self.turn_start_time += 1.5

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

        action_idx = ai_heuristic_smart_choice(
            legal_actions,
            hand,
            last_combo=last_combo,
            joker_mode=self.env.joker_mode
        )
        return self.play_action(current_p, legal_actions[action_idx])

    def _finalize_match(self):
        # 1. Cập nhật tài khoản người chơi vào tlmn_user_database.db
        try:
            conn = sqlite3.connect(USER_DB_PATH)
            cursor = conn.cursor()
            is_cc = (self.env.payment_mode == "count_cards")
            winner_id = getattr(self.env, "last_winner", None)

            for p_id, username in self.player_accounts.items():
                current_balance = self.env.accumulated_rewards.get(p_id, 0.0)

                cursor.execute("""
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

                    cursor.execute("""
                        UPDATE accounts 
                        SET balance = ?, highest_balance = ?, games_played_cc = ?, games_won_cc = ?, games_played_wta = ?, games_won_wta = ?
                        WHERE username = ?
                    """, (current_balance, new_high, gp_cc, gw_cc, gp_wta, gw_wta, username))

            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Lỗi cập nhật số dư & thống kê vào User DB: {e}")

        # 2. Lưu toàn bộ dữ liệu ván đấu sang tlmn_sample_database.db cho Bot huấn luyện
        if self.match_data:
            self.match_data["final_balances"] = self.env.accumulated_rewards.copy()
            try:
                conn_sample = sqlite3.connect(SAMPLE_DB_PATH)
                cursor_sample = conn_sample.cursor()
                cursor_sample.execute('''
                    INSERT INTO match_training_data (room_id, match_id, timestamp, config, match_json)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    self.room_id,
                    self.match_data["match_id"],
                    self.match_data["timestamp"],
                    json.dumps(self.match_data["config"], ensure_ascii=False),
                    json.dumps(self.match_data, ensure_ascii=False)
                ))
                conn_sample.commit()
                conn_sample.close()
            except Exception as e:
                print(f"Lỗi lưu dữ liệu huấn luyện vào Sample DB: {e}")

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

    def list_rooms(self):
        active = []
        for rid, room in self.rooms.items():
            active.append({
                "room_id": rid,
                "is_active": room.is_active,
                "num_players": room.env.num_players if room.env else 0,
                "round": room.env.num_round if room.env else 1
            })
        return active
