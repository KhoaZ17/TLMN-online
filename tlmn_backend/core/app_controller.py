import json
import itertools
import time
import sqlite3
import uuid
import random
import tlmn_rules
import os
from tlmn_rules import card_info, tlmn_dict_deck
from tlmn_sample_env import TLMNSampleEnv


def ai_heuristic_smart_choice(legal_actions, hand, last_combo=None, joker_mode=False, other_hands_lens=None, seen_cards=None):
    """
    Thuật toán Heuristic thông minh cấp cao cho Bot (Bản linh hoạt, dùng Look-ahead & Chấm điểm tổng hợp):
    - Tích hợp toàn bộ chiến thuật thực chiến: Tenpai, mở vòng 3 Bích, quản lý Heo đen, phân rã hàng thông minh, 
      chống cóng linh hoạt, quản lý Joker chặt chẽ và thuật toán đánh giá cấu trúc bài thừa (Look-ahead).
    """
    if seen_cards is None:
        seen_cards = []
    if other_hands_lens is None:
        other_hands_lens = []

    # 0. ƯU TIÊN TUYỆT ĐỐI: Nước đi đánh sạch bài để về nhất ngay lập tức[cite: 12]
    for idx, act in enumerate(legal_actions):
        if len(act) > 0 and len(act) == len(hand):
            return idx

    playable = [act for act in legal_actions if len(act) > 0]
    has_pass = [] in legal_actions

    if not playable:
        return legal_actions.index([])

    # Đọc ngữ cảnh ván đấu
    opponent_danger = any(l <= 2 for l in other_hands_lens) if other_hands_lens else False
    opponent_one_card = any(l == 1 for l in other_hands_lens) if other_hands_lens else False
    is_game_start = len(seen_cards) == 0

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
        powers = [tlmn_dict_deck[c]["power"] for c in act if c in tlmn_dict_deck]
        return max(powers) if powers else 0

    # ==========================================
    # 1. PHẢN XẠ TÀN CUỘC KHẨN CẤP (KHI ĐỐI THỦ SẮP VỀ)[cite: 12]
    # ==========================================
    if opponent_one_card:
        if last_combo is None:
            # Mở vòng khi đối thủ còn 1 lá: Cấm cóc rác nhỏ, ưu tiên bộ nhiều lá hoặc lá to nhất[cite: 12]
            multi_card = [act for act in playable if len(act) >= 2 and not get_action_details(act)["is_real_hang"]]
            if multi_card:
                multi_card.sort(key=lambda x: (len(x), get_action_power(x)), reverse=True)
                return legal_actions.index(multi_card[0])
            playable.sort(key=get_action_power, reverse=True)
            return legal_actions.index(playable[0])
        else:
            # Đè bài khi đối thủ còn 1 lá: Tuyệt đối không Pass, dùng bài mạnh nhất để cướp quyền[cite: 12]
            playable.sort(key=get_action_power, reverse=True)
            return legal_actions.index(playable[0])

    if opponent_danger and last_combo is None:
        # Đối thủ còn 2 lá: Chủ động tìm Heo hoặc hóa Joker thành Heo để chặn đầu mở vòng[cite: 12]
        pig_actions = [act for act in playable if
                       get_action_details(act)["is_pig"] or (joker_mode and any(c.startswith("X") for c in act))]
        if pig_actions:
            pig_actions.sort(key=get_action_power, reverse=True)
            return legal_actions.index(pig_actions[0])

    # ==========================================
    # 2. THUẬT TOÁN LOOK-AHEAD ĐÁNH GIÁ CẤU TRÚC BÀI THỪA[cite: 12]
    # ==========================================
    def evaluate_remaining_structure(remaining_cards):
        """
        Nhìn trước tương lai: Giả lập phần bài thừa, phạt nặng rác lẻ nhỏ (3, 4, 5...), 
        phạt nhẹ hơn với rác trung bình/lớn (10, J, Q...) để giữ bài thừa mượt mà[cite: 12].
        """
        if not remaining_cards:
            return 0

        real_rem = [c for c in remaining_cards if not c.startswith("X")]
        ranks_count = {}
        for c in real_rem:
            r = tlmn_dict_deck[c]["rank"]
            ranks_count[r] = ranks_count.get(r, 0) + 1

        penalty = 0
        for r, count in ranks_count.items():
            if count == 1:
                # Phạt nặng rác nhỏ (rank thấp như 3, 4, 5... tương ứng rank 3, 4, 5), phạt nhẹ hơn với rác từ trung bình trở lên[cite: 12]
                if r <= 6:
                    penalty += 8
                else:
                    penalty += 4
            elif count == 3:
                penalty += 3

        jokers_count = sum(1 for c in remaining_cards if c.startswith("X"))
        penalty -= jokers_count * 3
        return penalty

    # ==========================================
    # 3. KHI ĐƯỢC QUYỀN MỞ VÒNG (BÀN ĐANG TRỐNG)
    # ==========================================
    if last_combo is None:
        # Ván đầu tiên: Ưu tiên đi trọn vẹn combo chứa 3 Bích (đôi 3, sảnh chứa 3)[cite: 12]
        if is_game_start and any("3♠" in act for act in playable):
            combos_with_3s = [act for act in playable if "3♠" in act and len(act) >= 2]
            if combos_with_3s:
                combos_with_3s.sort(key=lambda x: (len(x), get_action_power(x)))
                return legal_actions.index(combos_with_3s[0])

        # Trạng thái Tenpai linh hoạt: Xả combo dài (>= 5 lá) nếu xả xong còn <= 2 lá[cite: 12]
        for act in playable:
            if len(act) >= 5 and (len(hand) - len(act)) <= 2:
                return legal_actions.index(act)

        if len(hand) <= 5:
            playable.sort(key=lambda x: (len(x), get_action_power(x)), reverse=True)
            return legal_actions.index(playable[0])

        # Chấm điểm linh hoạt bằng Look-ahead thay vì cấm đoán cứng nhắc[cite: 12]
        best_act_idx = 0
        min_score = float('inf')

        for act in playable:
            details = get_action_details(act)

            # Tránh các hành vi phản chiến thuật thô (ví dụ: dùng Joker làm rác lẻ trừ khi bất khả kháng)[cite: 12]
            if details["is_joker"] and len(act) == 1:
                continue
            # Hạn chế đi lẻ Heo đen ở đầu/giữa ván khi chưa rõ Heo đỏ[cite: 12]
            if details["is_black_pig"] and len(act) == 1 and len(hand) > 6:
                continue

            # Giả lập phần bài còn lại để tính điểm cấu trúc (Look-ahead)[cite: 12]
            simulated_hand = hand.copy()
            for c in act:
                if c in simulated_hand:
                    simulated_hand.remove(c)

            score = evaluate_remaining_structure(simulated_hand)
            # Ưu tiên cộng điểm thưởng nhẹ cho các nước đi xả rác nhỏ hoặc bộ ngắn hợp lý
            if score < min_score:
                min_score = score
                best_act_idx = legal_actions.index(act)

        return best_act_idx

    # ==========================================
    # 4. KHI PHẢI ĐÈ BÀI (CÓ LAST_COMBO)
    # ==========================================
    target_card = last_combo.get("highest_card", "")
    target_rank = tlmn_dict_deck.get(target_card, {}).get("rank", 0)

    # Đè bài linh hoạt dựa trên Look-ahead và sức mạnh
    playable.sort(key=get_action_power)

    # Linh hoạt Pass ở tàn cuộc khi bài đã gọn và đối thủ đánh bài nhỏ[cite: 12]
    if has_pass and len(hand) <= 6 and target_rank <= 11 and random.random() < 0.3:
        return legal_actions.index([])

    # Ưu tiên đè bằng bài thường, bảo vệ tối đa Hàng[cite: 12]
    non_hang_playable = [act for act in playable if not get_action_details(act)["is_real_hang"]]
    if non_hang_playable and len(hand) > 2:
        non_hang_playable.sort(key=get_action_power)
        return legal_actions.index(non_hang_playable[0])

    return legal_actions.index(playable[0])


class TLMNAppController:
    def __init__(self, default_cost=1000, default_starting_balance=500000.0, turn_time_limit=30, fake_turn_limit=3, free_turn_limit=15):
        self.default_cost = default_cost
        self.default_starting_balance = max(default_starting_balance, 10 * self.default_cost)
        self.turn_time_limit = turn_time_limit
        self.fake_turn_limit = fake_turn_limit
        self.free_turn_limit = free_turn_limit
        self._reset_controller_state()

    def _reset_controller_state(self):
        self.cost = self.default_cost
        self.starting_balance = self.default_starting_balance
        self.env = None
        self.player_names = {}
        self.is_active = False
        self.match_data = None
        self.bot_counter = 0
        self.turn_start_time = 0

    # [CLAUDE UPDATE - 2026]: Đưa hàm `intro_done` vào BÊN TRONG lớp `TLMNAppController`
    # để nhận đúng phương thức của controller, reset lại mốc `turn_start_time` ngay khoảnh khắc
    # animation chia/xếp bài kết thúc, đảm bảo người chơi nhận trọn vẹn 100% thời gian suy nghĩ.
    def intro_done(self):
        if self.is_active:
            self.turn_start_time = time.time()
        return {"status": "success"}

    def setup_game(self, joker_mode: bool, payment_mode: str, num_bots: int, cost: int = None, starting_balance: float = None):
        self.cost = cost if (cost is not None and cost > 0) else self.default_cost

        # 1. Mức tiền khởi đầu tối thiểu (Đếm lá = 10 lần cược, Nhất ăn tất = 1 lần cược)
        min_sb = 10 * self.cost if payment_mode == "count_cards" else self.cost

        # 2. Lấy số tiền khởi đầu do người chơi thiết lập hoặc mặc định
        requested_sb = starting_balance if (
                    starting_balance is not None and starting_balance > 0) else self.default_starting_balance

        # 3. Ép sàn đảm bảo tiền khởi đầu không bao giờ thấp hơn min_sb
        self.starting_balance = float(max(requested_sb, min_sb))

        num_players = num_bots + 1
        self.env = TLMNSampleEnv(
            num_players=num_players,
            joker_mode=joker_mode,
            payment_mode=payment_mode,
            cost=self.cost,
            starting_balance=self.starting_balance
        )

        self.player_names = {0: "Bạn"}
        self.bot_counter = 0
        for i in range(1, num_players):
            self.bot_counter += 1
            self.player_names[i] = f"Bot {self.bot_counter}"

        self.is_active = False
        pay_type_str = "Đếm lá" if payment_mode == "count_cards" else "Nhất ăn tất"
        return {
            "status": "success",
            "message": f"Khởi tạo bàn {pay_type_str} thành công. Mức cược: {self.cost:,} chip/đơn vị."
        }

    def start_new_match(self):
        if not self.env:
            return {"status": "error", "message": "Chưa setup bàn chơi."}

        self.env.reset()
        self.is_active = True

        # BÙ TRỪ 5 GIÂY ANIMATION MỞ ĐẦU:
        # Đẩy mốc thời gian bắt đầu tính giờ lùi về tương lai 5 giây.
        # Trong 5 giây này, hàm get_game_state sẽ nhận diện elapsed < 0 và giữ nguyên time_left ở mức tối đa.
        self.turn_start_time = time.time() + 4.0

        self.match_data = {
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

        if self.env.done and getattr(self.env, "instant_win_info", None) and self.env.instant_win_info.get(
                "has_instant_win"):
            self.is_active = False
            self._finalize_match()

        return self.get_game_state(player_id=0)

    def quit_game(self):
        self._reset_controller_state()
        return {"status": "success", "message": "Đã thoát game an toàn, đã reset toàn bộ tham số phòng chơi."}

    def get_current_turn_time(self):
        """Hàm hỗ trợ: Lấy thời gian đếm ngược thực tế cho lượt hiện tại"""
        if not self.env or self.env.done:
            return self.turn_time_limit

        current_p = self.env.current_turn
        is_passed = self.env.passed_circle[current_p]

        # Điều kiện 1: Đã pass lượt trước đó trong vòng
        if not is_passed:
            return self.turn_time_limit

        # Điều kiện 2: Trên bàn xuất hiện Heo hoặc Hàng (không kể độ lớn)
        last_combo = self.env.last_combo
        if not last_combo:
            return self.fake_turn_limit

        c_type = last_combo.get("combo_type", "")
        is_hang = c_type in ["3_PAIRS_CHAIN", "FOUR_OF_A_KIND", "4_PAIRS_CHAIN", "5_PAIRS_CHAIN"]

        is_heo = False
        if last_combo.get("used_heo") and len(last_combo["used_heo"]) > 0:
            is_heo = True
        elif last_combo.get("highest_card") and tlmn_rules.tlmn_dict_deck.get(last_combo["highest_card"], {}).get("rank") == 15:
            is_heo = True

        if not (is_heo or is_hang):
            return self.fake_turn_limit

        # Điều kiện 3: Trên tay có cách ghép 4/5 đôi thông (kể cả joker, có là được)
        hand = self.env.hands[current_p]
        can_have_free_turn = False

        # Chỉ cần check độ dài 8 (4 đôi thông) và 10 (5 đôi thông nếu bật Joker mode)
        check_lengths = [8, 10] if self.env.joker_mode else [8]

        for length in check_lengths:
            if length > len(hand):
                continue
            for subset in itertools.combinations(hand, length):
                parsed = tlmn_rules.parse_combo_tlmn(list(subset), joker_mode=self.env.joker_mode, last_combo=None)
                if parsed["is_valid"] and parsed["combo_type"] in ["4_PAIRS_CHAIN", "5_PAIRS_CHAIN"]:
                    can_have_free_turn = True
                    break
            if can_have_free_turn:
                break

        if can_have_free_turn:
            return self.free_turn_limit  # Đủ 3 điều kiện -> cấp 15s free
        else:
            return self.fake_turn_limit  # Không có 4/5 đôi thông -> 3s lượt giả

    def handle_timeout(self):
        """Xử lý tự động đánh hoặc bỏ lượt nếu hết thời gian"""
        if not self.is_active or not self.env or self.env.done:
            return

        current_limit = self.get_current_turn_time()
        elapsed = time.time() - self.turn_start_time
        if elapsed >= current_limit:
            current_p = self.env.current_turn
            legal_actions = self.env.get_legal_actions(current_p)

            if current_p != 0:
                self.play_bot_turn()
            else:
                if [] in legal_actions:
                    self.play_action(current_p, [])
                elif len(legal_actions) > 0:
                    self.play_action(current_p, legal_actions[0])

    def get_game_state(self, player_id=0):
        if not self.env:
            return {"status": "error", "message": "Chưa có ván đấu."}

        self.handle_timeout()

        current_limit = self.get_current_turn_time()

        # KHẮC PHỤC LỖI 1: Xử lý hiển thị thời gian khi bù trừ delay
        elapsed = time.time() - self.turn_start_time
        if elapsed < 0:
            time_left = float(current_limit)
        else:
            time_left = max(0.0, current_limit - elapsed) if self.is_active else 0.0

        last_combo = self.env.last_combo or {}

        state = {
            "is_active": self.is_active,
            "round": self.env.num_round,
            "current_turn": self.env.current_turn,
            "time_left": time_left,
            "time_limit": current_limit,
            "config": {
                "cost": self.env.cost,
                "payment_mode": self.env.payment_mode,
                "joker_mode": self.env.joker_mode
            },
            "my_hand": self.env.hands[player_id] if not self.env.done else [],
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
            "is_done": self.env.done
        }

        for p in range(self.env.num_players):
            state["players_status"][p] = {
                "name": self.player_names[p],
                "cards_left": len(self.env.hands[p]),
                "balance": self.env.accumulated_rewards[p],
                "is_passed": self.env.passed_circle[p],
                "is_finished": p in self.env.finished_players
            }

        if self.env.done:
            state["all_hands"] = self.env.hands

        return state

    def play_action(self, player_id, cards_to_play, chosen_option_index=None):
        if not self.is_active or self.env.done:
            return {"status": "error", "message": "Ván đấu chưa bắt đầu hoặc đã kết thúc."}
        if self.env.current_turn != player_id:
            return {"status": "error", "message": "Chưa tới lượt của bạn."}

        prev_log_count = len(self.env.transaction_logs)

        if len(cards_to_play) == 0:
            try:
                obs, rewards, done, info = self.env.step([])
            except Exception as e:
                print(f"[play_action] Lỗi khi bỏ lượt (player {player_id}): {e!r}")
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
                print(f"[play_action] Lỗi get_joker_options {cards_to_play}: {e!r}")
                return {"status": "error", "message": f"Không xử lý được bộ bài này: {e}"}

            if not options:
                return {"status": "error", "message": "Nước đi không hợp lệ hoặc không đè được bài trên bàn."}

            if len(options) >= 2 and chosen_option_index is None and player_id == 0:
                return {
                    "status": "require_joker_choice",
                    "options": [
                        {"option_id": idx, "description": opt.get("description", "")}
                        for idx, opt in enumerate(options)
                    ],
                    "cards_to_play": cards_to_play
                }

            selected_option = options[chosen_option_index] if (
                    chosen_option_index is not None and 0 <= chosen_option_index < len(options)) else options[0]

            try:
                obs, rewards, done, info = self.env.step(cards_to_play, override_parsed_combo=selected_option)
            except Exception as e:
                print(f"[play_action] Lỗi env.step {cards_to_play}: {e!r}")
                return {"status": "error", "message": f"Không thực hiện được nước đi: {e}"}

            if done and not self.env.last_combo_cards:
                self.env.last_combo_cards = cards_to_play
                self.env.last_combo_owner = player_id
                self.env.last_combo = selected_option

        if self.match_data:
            self.match_data["transactions"].extend(self.env.transaction_logs[prev_log_count:])

        self.turn_start_time = time.time()

        if player_id != 0:
            if len(cards_to_play) == 0:
                delay = 1.5
            else:
                n = max(1, len(cards_to_play))
                delay = 1.5 + (n - 1) * 0.35 + 0.3
            self.turn_start_time += delay
        else:
            if len(cards_to_play) > 0:
                self.turn_start_time += 0.3

        if done:
            self.is_active = False
            self._finalize_match()

        return {"status": "success", "state": self.get_game_state(0)}

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
            seen_cards=seen_cards
        )
        return self.play_action(current_p, legal_actions[action_idx])

    def _finalize_match(self):
        if self.match_data:
            self.match_data["final_balances"] = self.env.accumulated_rewards.copy()

            try:
                conn = sqlite3.connect("../database/tlmn_database.db")
                cursor = conn.cursor()
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS match_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        match_id INTEGER,
                        timestamp TEXT,
                        config TEXT,
                        data TEXT
                    )
                ''')
                cursor.execute('''
                    INSERT INTO match_history (match_id, timestamp, config, data)
                    VALUES (?, ?, ?, ?)
                ''', (
                    self.match_data["match_id"],
                    self.match_data["timestamp"],
                    json.dumps(self.match_data["config"], ensure_ascii=False),
                    json.dumps(self.match_data, ensure_ascii=False)
                ))
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"Lỗi truy xuất Database: {e}")

        if self.env:
            self.env.num_round += 1

        has_bankrupt_player = False
        for p in range(self.env.num_players):
            if self.env.accumulated_rewards[p] <= 0:
                has_bankrupt_player = True

                if p != 0:
                    self.bot_counter += 1
                    self.player_names[p] = f"Bot {self.bot_counter}"
                    self.env.accumulated_rewards[p] = self.starting_balance
                else:
                    self.env.accumulated_rewards[p] = 0

        if has_bankrupt_player:
            self.env.num_round = 1
