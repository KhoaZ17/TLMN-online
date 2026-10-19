import random
import numpy as np
from itertools import combinations
from typing import List, Dict, Any, Tuple, Union

from tlmn_rules import (
    default_deck,
    tlmn_joker_cards,
    tlmn_dict_deck,
    card_info,
    instant_win_payment,
    normal_win_payment,
    parse_combo_tlmn,
    can_beat_tlmn,
    calculate_stack_penalty,
    sort_hand
)

ALL_CARDS = default_deck + tlmn_joker_cards
CARD_TO_IDX = {c: i for i, c in enumerate(ALL_CARDS)}
IDX_TO_CARD = {i: c for i, c in enumerate(ALL_CARDS)}
NUM_TOTAL_CARDS = len(ALL_CARDS)

COMBO_TYPES = [
    "NONE", "SINGLE", "PAIR", "TRIPLE", "FOUR_OF_A_KIND",
    "STRAIGHT", "3_PAIRS_CHAIN", "4_PAIRS_CHAIN", "5_PAIRS_CHAIN"
]
COMBO_TYPE_TO_IDX = {t: i for i, t in enumerate(COMBO_TYPES)}
HANG_TYPES = {"3_PAIRS_CHAIN", "FOUR_OF_A_KIND", "4_PAIRS_CHAIN", "5_PAIRS_CHAIN"}


class TLMNMultiplayerWebEnv:
    """Môi trường Tiến Lên Miền Nam chuyên biệt cho Web App Multiplayer, liên kết trực tiếp với số dư thực tế từ DB."""

    def __init__(
            self,
            num_players: int = 4,
            joker_mode: bool = False,
            payment_mode: str = "count_cards",
            cost: int = 1000,
            player_balances: Dict[int, float] = None
    ):
        assert 2 <= num_players <= 4, "Số lượng người chơi phải từ 2 đến 4 người"
        assert payment_mode in ["count_cards", "winner_takes_all"], "payment_mode không hợp lệ"

        self.num_players = num_players
        self.joker_mode = joker_mode
        self.payment_mode = payment_mode
        self.cost = cost
        self.weakest_card = "3♠"

        self.num_round = 1
        self.last_winner = None

        # Lấy số dư thực tế từ tài khoản người chơi trong Database truyền vào
        self.accumulated_rewards = {}
        for p in range(num_players):
            if player_balances and p in player_balances:
                self.accumulated_rewards[p] = float(player_balances[p])
            else:
                self.accumulated_rewards[p] = 500000.0

        self.pending_chop_victim = None
        self.pending_chop_winner = None
        self.pending_chop_amount = 0.0

        self.hands: Dict[int, List[str]] = {}
        self.discarded_cards: List[str] = []
        self.current_turn: int = 0
        self.passed_circle: List[bool] = [False] * self.num_players
        self.finished_players: List[int] = []
        self.last_combo: Union[dict, None] = None
        self.last_combo_cards: List[str] = []
        self.last_combo_owner: Union[int, None] = None
        self.stack_penalty: float = 0.0
        self.must_contain_weakest: bool = False

        self.transaction_logs: List[str] = []
        self.done: bool = False
        self.instant_win_info: Union[dict, None] = None

    def reset(self, seed: int = None) -> np.ndarray:
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        deck = default_deck.copy()
        if self.joker_mode:
            deck.extend(tlmn_joker_cards)
        random.shuffle(deck)

        cards_per_player = 14 if self.joker_mode else 13
        self.hands = {
            p: sort_hand([deck.pop() for _ in range(cards_per_player)])
            for p in range(self.num_players)
        }

        iw_res = instant_win_payment(
            self.hands,
            payment_mode=self.payment_mode,
            cost=self.cost,
            joker_mode=self.joker_mode,
            num_round=self.num_round,
            current_balances=self.accumulated_rewards  # <--- ADD THIS: Cung cấp số dư thực tế để chặn thanh toán lố
        )

        smallest_power = 999
        actual_weakest_card = "3♠"
        for p in range(self.num_players):
            for c in self.hands[p]:
                if not c.startswith('X'):
                    pwr = tlmn_dict_deck[c]["power"]
                    if pwr < smallest_power:
                        smallest_power = pwr
                        actual_weakest_card = c
        self.weakest_card = actual_weakest_card

        self.discarded_cards = []
        self.passed_circle = [False] * self.num_players
        self.finished_players = []
        self.last_combo = None
        self.last_combo_cards = []
        self.last_combo_owner = None
        self.stack_penalty = 0.0
        self.transaction_logs = []
        self.done = False
        self.instant_win_info = iw_res if iw_res["has_instant_win"] else None

        self.pending_chop_victim = None
        self.pending_chop_winner = None
        self.pending_chop_amount = 0.0

        if iw_res["has_instant_win"]:
            self.done = True
            net_changes = iw_res["net_changes"]
            for p_id, change in net_changes.items():
                self.accumulated_rewards[p_id] += change
            for log in iw_res["transaction_logs"]:
                self.transaction_logs.append(f"🏆 {log}")
            self.transaction_logs.append("🌟 KẾT THÚC VÁN ĐẤU DO CÓ NGƯỜI TỚI TRẮNG!")
            self.num_round += 1
        else:
            if self.num_round == 1:
                starter = 0
                for p in range(self.num_players):
                    if self.weakest_card in self.hands[p]:
                        starter = p
                        break
                self.current_turn = starter
                self.must_contain_weakest = True
            else:
                starter = self.last_winner if (
                        self.last_winner is not None and self.last_winner < self.num_players) else 0
                self.current_turn = starter
                self.must_contain_weakest = False

        return self.get_observation(self.current_turn)

    def get_legal_actions(self, player_id: int = None) -> List[List[str]]:
        if player_id is None:
            player_id = self.current_turn

        if self.done or player_id in self.finished_players or self.last_combo_owner == player_id:
            return []

        hand = self.hands[player_id]
        is_passed = self.passed_circle[player_id]

        if is_passed and self.last_combo is None:
            return []

        candidate_lengths = self._get_candidate_lengths(len(hand))
        legal_combos = []

        for length in candidate_lengths:
            if self.must_contain_weakest:
                if self.weakest_card not in hand:
                    continue
                other_cards = [c for c in hand if c != self.weakest_card]
                if length - 1 > len(other_cards):
                    continue
                for combo_tuple in combinations(other_cards, length - 1):
                    subset = [self.weakest_card] + list(combo_tuple)
                    self._check_and_add_legal_combo(subset, is_passed, legal_combos)
            else:
                for subset in combinations(hand, length):
                    self._check_and_add_legal_combo(list(subset), is_passed, legal_combos)

        if self.last_combo is not None:
            legal_combos.append([])

        return legal_combos

    def _get_candidate_lengths(self, hand_len: int) -> List[int]:
        if self.must_contain_weakest or self.last_combo is None:
            return list(range(1, hand_len + 1))

        target_len = self.last_combo["length"]
        bomb_lens = {4, 6, 8, 10} if self.joker_mode else {4, 6, 8}

        lengths = set([target_len]).union(bomb_lens)
        return [length_val for length_val in lengths if 1 <= length_val <= hand_len]

    def _check_and_add_legal_combo(self, card_list: List[str], is_passed: bool, legal_combos: List[List[str]]):
        parsed = parse_combo_tlmn(
            card_list,
            joker_mode=self.joker_mode,
            last_combo=self.last_combo
        )
        if not parsed["is_valid"]:
            return

        if self.last_combo is not None:
            if not can_beat_tlmn(self.last_combo, parsed, joker_mode=self.joker_mode):
                return

        if is_passed:
            valid_chop_types = ["4_PAIRS_CHAIN"]
            if self.joker_mode:
                valid_chop_types.append("5_PAIRS_CHAIN")
            if parsed["combo_type"] not in valid_chop_types:
                return

        legal_combos.append(card_list)

    def step(self, action: Union[int, List[str], np.ndarray], override_parsed_combo: dict = None) -> Tuple[
        np.ndarray, Dict[int, float], bool, Dict[str, Any]]:
        if self.done:
            return self.get_observation(self.current_turn), {p: 0.0 for p in range(self.num_players)}, True, {
                "info": "Game Finished"}

        p = self.current_turn
        legal_actions = self.get_legal_actions(p)

        if len(legal_actions) == 0:
            chosen_cards = []
        else:
            chosen_cards = self._parse_action_input(action, legal_actions)

        step_rewards = {i: 0.0 for i in range(self.num_players)}

        if len(chosen_cards) == 0:
            if self.last_combo is None:
                raise ValueError(f"Player {p} không được bỏ lượt khi bàn đang trống!")
            self.passed_circle[p] = True
            self.transaction_logs.append(f"👤 Người chơi {p}: BỎ LƯỢT (PASS)")
            self._advance_turn(step_rewards)
            return self.get_observation(self.current_turn), step_rewards, self.done, {"action_type": "PASS"}

        if override_parsed_combo is not None:
            parsed_combo = override_parsed_combo
        else:
            parsed_combo = parse_combo_tlmn(
                chosen_cards,
                joker_mode=self.joker_mode,
                last_combo=self.last_combo
            )

        if not parsed_combo["is_valid"]:
            raise ValueError(
                f"Hành động không hợp lệ từ Player {p}: {chosen_cards}. Lỗi: {parsed_combo['error_message']}")

        if self.passed_circle[p]:
            self.passed_circle[p] = False

        for card in chosen_cards:
            self.hands[p].remove(card)
            self.discarded_cards.append(card)

        if self.must_contain_weakest:
            self.must_contain_weakest = False

        curr_combo_type = parsed_combo.get("combo_type")
        is_hang = curr_combo_type in HANG_TYPES
        is_chop = (self.last_combo is not None) and is_hang and (self.last_combo_owner is not None) and (
                    self.last_combo_owner != p)

        if is_chop:
            victim = self.last_combo_owner
            self.pending_chop_winner = p
            self.pending_chop_victim = victim
            self.pending_chop_amount = self.stack_penalty

            log_msg = f"⚔️ Người chơi {p} dùng {curr_combo_type} chặt {self.last_combo['combo_type']} của Người chơi {victim}! Chờ chốt vòng để hốt {self.stack_penalty:,.0f} Chip."
            self.transaction_logs.append(log_msg)

        new_combo_penalty = calculate_stack_penalty(parsed_combo, self.joker_mode, self.payment_mode) * self.cost
        if new_combo_penalty > 0:
            self.stack_penalty += new_combo_penalty

        self.last_combo = parsed_combo
        self.last_combo_cards = chosen_cards.copy()
        self.last_combo_owner = p

        display_cards = parsed_combo.get("transformed_cards", chosen_cards)
        self.transaction_logs.append(f"🎴 Người chơi {p} đánh {parsed_combo['combo_type']}: {display_cards}")

        if len(self.hands[p]) == 0:
            self.done = True
            self.last_winner = p
            self.finished_players.append(p)

            self._end_round(step_rewards)

            for loser in range(self.num_players):
                if loser != p:
                    penalty = normal_win_payment(
                        cards=self.hands[loser],
                        payment_mode=self.payment_mode,
                        cost=self.cost,
                        joker_mode=self.joker_mode,
                        last_combo=self.last_combo
                    )
                    actual_payment = min(penalty, max(0.0, self.accumulated_rewards[loser]))
                    step_rewards[loser] -= actual_payment
                    step_rewards[p] += actual_payment
                    self.accumulated_rewards[loser] -= actual_payment
                    self.accumulated_rewards[p] += actual_payment
                    self.transaction_logs.append(
                        f"📉 Người chơi {loser} đền {actual_payment:,.0f} Chip (còn {len(self.hands[loser])} lá)."
                    )

            self.transaction_logs.append(f"🏆 Người chơi {p} đã HẾT BÀI và TỚI NHẤT!")
            self.num_round += 1
            return self.get_observation(self.current_turn), step_rewards, self.done, {"action_type": "WIN", "winner": p}

        self._advance_turn(step_rewards)
        return self.get_observation(self.current_turn), step_rewards, self.done, {"action_type": "PLAY"}

    def _advance_turn(self, step_rewards: Dict[int, float] = None):
        if step_rewards is None:
            step_rewards = {i: 0.0 for i in range(self.num_players)}

        next_p = (self.current_turn + 1) % self.num_players

        while next_p in self.finished_players and next_p != self.last_combo_owner:
            next_p = (next_p + 1) % self.num_players

        if next_p == self.last_combo_owner:
            self._end_round(step_rewards)
            if next_p in self.finished_players:
                next_active = (next_p + 1) % self.num_players
                while next_active in self.finished_players:
                    next_active = (next_active + 1) % self.num_players
                self.current_turn = next_active
            else:
                self.current_turn = next_p
        else:
            self.current_turn = next_p

    def _end_round(self, step_rewards: Dict[int, float] = None):
        if step_rewards is None:
            step_rewards = {i: 0.0 for i in range(self.num_players)}

        if self.pending_chop_winner is not None and self.pending_chop_victim is not None:
            amount = self.pending_chop_amount
            winner = self.pending_chop_winner
            victim = self.pending_chop_victim

            if self.accumulated_rewards[victim] < amount:
                amount = max(0.0, self.accumulated_rewards[victim])

            if amount > 0:
                self.accumulated_rewards[victim] -= amount
                self.accumulated_rewards[winner] += amount
                step_rewards[victim] -= amount
                step_rewards[winner] += amount

                log_msg = f"💥 CHỐT VÒNG! Người chơi {winner} hốt trọn hũ phạt {amount:,.0f} Chip từ Người chơi {victim}."
                self.transaction_logs.append(log_msg)

        self.pending_chop_winner = None
        self.pending_chop_victim = None
        self.pending_chop_amount = 0.0
        self.stack_penalty = 0.0

        self.transaction_logs.append("🔄 --- KẾT THÚC VÒNG ĐÁNH ---")
        self.last_combo = None
        self.last_combo_cards = []
        self.last_combo_owner = None
        self.passed_circle = [False] * self.num_players

    @staticmethod
    def _parse_action_input(action: Union[int, List[str], np.ndarray], legal_actions: List[List[str]]) -> List[str]:
        if isinstance(action, (int, np.integer)):
            if 0 <= action < len(legal_actions):
                return legal_actions[action]
            raise IndexError(f"Index action {action} vượt quá số lượng legal actions ({len(legal_actions)})")
        elif isinstance(action, list):
            return action
        elif isinstance(action, np.ndarray):
            if action.ndim == 1 and len(action) == NUM_TOTAL_CARDS:
                chosen = [IDX_TO_CARD[i] for i, val in enumerate(action) if val > 0.5]
                return chosen
            elif action.ndim == 0:
                return legal_actions[int(action)]
        raise ValueError("Định dạng action không hợp lệ")

    def get_observation(self, player_id: int) -> np.ndarray:
        obs = []
        hand_vec = np.zeros(NUM_TOTAL_CARDS, dtype=np.float32)
        if player_id in self.hands:
            for c in self.hands[player_id]:
                hand_vec[CARD_TO_IDX[c]] = 1.0
        obs.extend(hand_vec)

        disc_vec = np.zeros(NUM_TOTAL_CARDS, dtype=np.float32)
        for c in self.discarded_cards:
            disc_vec[CARD_TO_IDX[c]] = 1.0
        obs.extend(disc_vec)

        lc_vec = np.zeros(NUM_TOTAL_CARDS, dtype=np.float32)
        lc_type_vec = np.zeros(len(COMBO_TYPES), dtype=np.float32)
        lc_power = 0.0
        lc_owner_rel = np.zeros(4, dtype=np.float32)

        if self.last_combo is not None:
            for c in self.last_combo_cards:
                if c in CARD_TO_IDX:
                    lc_vec[CARD_TO_IDX[c]] = 1.0

            c_type = self.last_combo.get("combo_type", "NONE")
            lc_type_vec[COMBO_TYPE_TO_IDX.get(c_type, 0)] = 1.0
            h_card = self.last_combo.get("highest_card", "")
            if h_card in tlmn_dict_deck:
                lc_power = tlmn_dict_deck[h_card]["power"] / 52.0

            if self.last_combo_owner is not None:
                rel_owner = (self.last_combo_owner - player_id) % self.num_players
                lc_owner_rel[rel_owner] = 1.0

        obs.extend(lc_vec)
        obs.extend(lc_type_vec)
        obs.append(lc_power)
        obs.extend(lc_owner_rel)

        passed_rel = np.zeros(4, dtype=np.float32)
        hand_len_rel = np.zeros(4, dtype=np.float32)
        finished_rel = np.zeros(4, dtype=np.float32)

        for i in range(self.num_players):
            rel_i = (i - player_id) % self.num_players
            passed_rel[rel_i] = 1.0 if self.passed_circle[i] else 0.0
            hand_len_rel[rel_i] = len(self.hands[i]) / 14.0
            finished_rel[rel_i] = 1.0 if i in self.finished_players else 0.0

        obs.extend(passed_rel)
        obs.extend(hand_len_rel)
        obs.extend(finished_rel)

        flags = [
            1.0 if self.last_combo is None else 0.0,
            1.0 if self.must_contain_weakest else 0.0,
            self.stack_penalty / (100.0 * self.cost) if self.cost > 0 else 0.0,
            self.num_round / 100.0,
            1.0 if self.joker_mode else 0.0,
            0.0 if self.payment_mode == "count_cards" else 1.0
        ]
        obs.extend(flags)
        return np.array(obs, dtype=np.float32)
