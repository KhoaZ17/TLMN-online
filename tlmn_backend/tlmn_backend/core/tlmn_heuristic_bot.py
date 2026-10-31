import random
import tlmn_rules
from tlmn_rules import tlmn_dict_deck


class TLMN_AI_Brain:
    """
    BỘ NÃO AI 6.6 - THE TEMPO DICTATOR (KẺ THỐNG TRỊ NHỊP ĐỘ)
    - Anti-Freeze Protocol: Quyết tử xé bài thoát cóng nếu chưa đánh được lá nào.
    - Bloodlust Mode: Bài đẹp (<= 3 bước dọn) sẽ hóa điên, bất chấp rủi ro xé bài/đè Heo để đoạt quyền.
    - Radar Cướp Cái: Đếm số lần địch mở vòng liên tiếp để tắt chế độ an toàn, chủ động xả Boss/Heo.
    - Xé Rác Linh Hoạt (Dynamic Breaker): Trượt theo giá trị lá bài.
    """

    def __init__(self, seat, joker_mode=False, payment_mode="count_cards", cost=1000):
        self.seat = seat
        self.joker_mode = joker_mode
        self.payment_mode = payment_mode
        self.cost = cost
        self.num_players = 4

        self.danger_dict = {}
        self.seen_counts = {}
        self.match_started = False
        self.has_played = False
        self.consecutive_opens = {}

    def reset_match(self, num_players):
        self.num_players = num_players
        self.seen_counts = {}
        self.match_started = True
        self.has_played = False
        self.consecutive_opens = {p: 0 for p in range(num_players)}

        self.danger_dict = {
            p: {
                "cards_left": 14 if self.joker_mode else 13,
                "passed_turns": 0,
                "hoard_score": 0.0,
                "is_danger": False,
                "is_one_card": False,
                "absolute_bounds": {}
            }
            for p in range(num_players) if p != self.seat
        }

    def observe_turn(self, player_id, action_cards, hand_lengths, stack_penalty, last_combo=None):
        if last_combo is None and len(action_cards) > 0:
            self.consecutive_opens[player_id] = self.consecutive_opens.get(player_id, 0) + 1
            for p in range(self.num_players):
                if p != player_id:
                    self.consecutive_opens[p] = 0

        if player_id == self.seat:
            if len(action_cards) > 0:
                self.has_played = True
            return

        cards_left = hand_lengths.get(player_id, 0)
        self.danger_dict[player_id]["cards_left"] = cards_left
        self.danger_dict[player_id]["is_danger"] = (cards_left <= 2)
        self.danger_dict[player_id]["is_one_card"] = (cards_left == 1)

        if len(action_cards) == 0:
            self.danger_dict[player_id]["passed_turns"] += 1
            if stack_penalty > 0:
                self.danger_dict[player_id]["hoard_score"] += 1.5
            else:
                self.danger_dict[player_id]["hoard_score"] += 0.5

            if last_combo:
                c_type = last_combo.get("combo_type")
                last_len = last_combo.get("length", 0)
                highest_card = last_combo.get("highest_card")

                if highest_card and cards_left == last_len:
                    pwr = tlmn_dict_deck.get(highest_card, {}).get("power", 0)
                    current_bound = self.danger_dict[player_id]["absolute_bounds"].get(c_type, 999)
                    self.danger_dict[player_id]["absolute_bounds"][c_type] = min(current_bound, pwr)
        else:
            self.danger_dict[player_id]["passed_turns"] = 0
            self.danger_dict[player_id]["hoard_score"] = max(0.0, self.danger_dict[player_id]["hoard_score"] - 1.0)
            for c in action_cards:
                self.seen_counts[c] = self.seen_counts.get(c, 0) + 1

    def choose_best_action(self, legal_actions, hand, last_combo, has_pass, current_stack_penalty=0.0):
        if len(hand) < (14 if self.joker_mode else 13):
            self.has_played = True

        for idx, act in enumerate(legal_actions):
            if len(act) > 0 and len(act) == len(hand):
                return idx

        playable = [act for act in legal_actions if len(act) > 0]

        if last_combo is None and len(hand) > 1:
            playable = [act for act in playable if not (len(act) == 1 and act[0].startswith("X"))]

        if not playable:
            return legal_actions.index([])

        max_opp_opens = max([self.consecutive_opens.get(p, 0) for p in range(self.num_players) if p != self.seat],
                            default=0)

        def get_next_active_player():
            for i in range(1, self.num_players):
                idx = (self.seat + i) % self.num_players
                if idx in self.danger_dict and self.danger_dict[idx]["cards_left"] > 0:
                    return idx
            return None

        next_p = get_next_active_player()
        next_is_danger = self.danger_dict[next_p]["is_danger"] if next_p is not None else False

        is_1v1 = (self.num_players == 2)
        dead_jokers = set()
        for c in hand:
            if c.startswith('X'):
                dead_jokers.add(c)

        for c, count in self.seen_counts.items():
            if not c.startswith('X'):
                total_occurrences = count + (1 if c in hand else 0)
                if total_occurrences >= 2:
                    dead_jokers.add(f"X{c[-1]}")

        def check_is_absolute_boss(act):
            parsed = tlmn_rules.parse_combo_tlmn(act, joker_mode=self.joker_mode, last_combo=last_combo)
            if not parsed.get("is_valid"):
                return False

            h_card = parsed.get("highest_card", "")
            if not h_card or h_card.startswith("X"):
                return False

            c_type = parsed.get("combo_type")
            my_power = tlmn_dict_deck[h_card]["power"]
            my_rank = tlmn_dict_deck[h_card]["rank"]
            act_len = parsed.get("length", 1)

            def rank_to_str(r):
                return {10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2'}.get(r, str(r))

            alive_jokers = (4 - len(dead_jokers)) if self.joker_mode else 0

            def get_highest_possible_power_for_rank(rank):
                base_str = rank_to_str(rank)
                best_pwr = -1
                for s in ['♠', '♣', '♦', '♥']:
                    c = base_str + s
                    pwr = tlmn_dict_deck[c]["power"]
                    if self.seen_counts.get(c, 0) == 0 and c not in hand:
                        best_pwr = max(best_pwr, pwr)
                    elif alive_jokers > 0:
                        best_pwr = max(best_pwr, pwr)
                return best_pwr

            def get_real_copies(rank):
                base_str = rank_to_str(rank)
                return sum(1 for s in ['♠', '♣', '♦', '♥']
                           if self.seen_counts.get(base_str + s, 0) == 0
                           and (base_str + s) not in hand)

            if c_type == "SINGLE":
                for r in range(my_rank, 16):
                    if get_highest_possible_power_for_rank(r) > my_power:
                        if get_real_copies(r) + alive_jokers >= 1:
                            return False
                return True

            elif c_type == "PAIR":
                for r in range(my_rank, 16):
                    if get_highest_possible_power_for_rank(r) > my_power:
                        if get_real_copies(r) + alive_jokers >= 2:
                            return False
                return True

            elif c_type == "TRIPLE":
                for r in range(my_rank, 16):
                    if get_highest_possible_power_for_rank(r) > my_power:
                        if get_real_copies(r) + alive_jokers >= 3:
                            return False
                return True

            elif c_type == "STRAIGHT":
                for end_r in range(my_rank, 15):
                    if end_r == my_rank and get_highest_possible_power_for_rank(end_r) <= my_power:
                        continue
                    jokers_needed = 0
                    can_form = True
                    for r_straight in range(end_r - act_len + 1, end_r + 1):
                        if get_real_copies(r_straight) == 0:
                            jokers_needed += 1
                            if jokers_needed > alive_jokers:
                                can_form = False
                                break
                    if can_form:
                        return False
                return True

            return False

        def check_hand_has_hang(hand_cards):
            counts = {}
            for c in hand_cards:
                if not c.startswith("X"):
                    r = tlmn_dict_deck[c]["rank"]
                    counts[r] = counts.get(r, 0) + 1
            if any(cnt >= 4 for cnt in counts.values()):
                return True
            pairs = sorted([r for r, cnt in counts.items() if cnt >= 2 and r < 15])
            consec = 1
            for i in range(len(pairs) - 1):
                if pairs[i + 1] == pairs[i] + 1:
                    consec += 1
                    if consec >= 3:
                        return True
                else:
                    consec = 1
            return False

        bot_has_hang = check_hand_has_hang(hand)

        def get_action_details(act):
            ranks = [tlmn_dict_deck.get(c, {}).get("rank", 0) for c in act if not c.startswith("X")]
            max_rank = max(ranks) if ranks else 0
            is_pig = any(r == 15 for r in ranks)
            is_joker = any(c.startswith("X") for c in act)
            return {"len": len(act), "max_rank": max_rank, "is_pig": is_pig, "is_joker": is_joker}

        def get_action_power(act):
            powers = [tlmn_dict_deck[c]["power"] for c in act if not c.startswith("X")]
            return max(powers) if powers else 100

        def estimate_hand_steps(simulated_hand):
            if not simulated_hand:
                return 0
            reals = [c for c in simulated_hand if not c.startswith("X")]
            jokers = [c for c in simulated_hand if c.startswith("X")]
            counts = {}
            for c in reals:
                r = tlmn_dict_deck[c]["rank"]
                counts[r] = counts.get(r, 0) + 1

            steps = 0
            temp_counts = counts.copy()
            for length in range(12, 2, -1):
                for start_r in range(3, 15 - length + 1):
                    has_straight = True
                    for r in range(start_r, start_r + length):
                        if temp_counts.get(r, 0) < 1:
                            has_straight = False
                            break
                    if has_straight:
                        steps += 1
                        for r in range(start_r, start_r + length):
                            temp_counts[r] -= 1
            for r, c in temp_counts.items():
                if c > 0:
                    steps += 1
            return max(1, steps - len(jokers))

        min_opp_cards = min([opp["cards_left"] for opp in self.danger_dict.values()]) if self.danger_dict else 13
        is_game_start = len(self.seen_counts) == 0
        someone_one_card = any(opp["is_one_card"] for opp in self.danger_dict.values())
        someone_danger = any(opp["is_danger"] for opp in self.danger_dict.values())
        bot_is_safe = len(hand) <= 2
        is_endgame_panic = someone_danger and len(hand) > 3

        valid_playable = playable
        if last_combo is None:
            valid_playable = [act for act in valid_playable if not (
                    len(act) == 1 and get_action_details(act)["max_rank"] == 15 and
                    tlmn_dict_deck[act[0]]["suit"] in ['♠', '♣'] and len(hand) > 6)]
            if not valid_playable:
                valid_playable = playable

        valid_playable.sort(key=get_action_power)
        min_playable_rank = min([get_action_details(a)["max_rank"] for a in valid_playable], default=100)

        original_steps = estimate_hand_steps(hand)

        # [NEW CHỨC NĂNG] CHẾ ĐỘ HỔ BÁO: Bài rất đẹp -> Hủy sự nhát gan
        is_bloodlust = (original_steps <= 3)

        def evaluate_action_risk(act):
            simulated_hand = hand.copy()
            for c in act:
                if c in simulated_hand:
                    simulated_hand.remove(c)

            if not simulated_hand:
                return -999999.0

            parsed_act = tlmn_rules.parse_combo_tlmn(act, joker_mode=self.joker_mode, last_combo=last_combo)
            act_type = parsed_act.get("combo_type") if parsed_act else None
            is_bomb = parsed_act.get("can_bomb", False) if parsed_act else False
            act_len = parsed_act.get("length", 1) if parsed_act else 1

            fin_penalty = tlmn_rules.normal_win_payment(
                simulated_hand, self.payment_mode, self.cost, self.joker_mode, last_combo=None
            )
            fin_score = fin_penalty["penalty_amount"] / max(1, self.cost)

            if min_opp_cards <= 3 or len(simulated_hand) <= 2:
                fin_weight = 4.5
            elif min_opp_cards <= 7:
                fin_weight = 1.5
            else:
                fin_weight = 0.5

            sim_steps = estimate_hand_steps(simulated_hand)
            is_combo_broken = (sim_steps >= original_steps)
            step_penalty = sim_steps * 10.0

            details = get_action_details(act)
            is_boss = check_is_absolute_boss(act)
            waste_penalty = 0.0
            boss_bonus = 0.0
            target_rank = tlmn_dict_deck.get(last_combo["highest_card"], {}).get("rank", 0) if last_combo else 0

            # --- DYNAMIC COMBO BREAKER ---
            if is_combo_broken and not is_endgame_panic:
                rank_factor = max(0, (details["max_rank"] - 3)) / 12.0
                base_break = 160.0
                dynamic_break = base_break * (1.1 - rank_factor)

                if max_opp_opens >= 2:
                    dynamic_break *= 0.4

                # Hổ Báo: Sẵn sàng xé rác không thương tiếc nếu bài đang cực đẹp
                if is_bloodlust:
                    dynamic_break *= 0.2

                waste_penalty += dynamic_break

            if last_combo is None:
                if is_boss and len(simulated_hand) > 0:
                    # Nếu bài rất đẹp, xả Boss luôn khỏi giữ
                    waste_penalty += 150.0 if not is_bloodlust else 30.0

                if details["is_pig"] or details["is_joker"] or is_bomb:
                    if len(simulated_hand) == 0:
                        pass
                    elif len(simulated_hand) <= 2 and not someone_danger:
                        waste_penalty += 20.0
                    else:
                        power_cards_count = sum(
                            1 for c in hand if c.startswith('X') or tlmn_dict_deck.get(c, {}).get("rank") == 15)
                        open_fear = 250.0 - (power_cards_count - 1) * 80.0

                        if is_bloodlust:
                            open_fear *= 0.3

                        waste_penalty += max(80.0, open_fear)

                elif details["max_rank"] >= 11 and not someone_danger and len(simulated_hand) > 2:
                    if act_type == "SINGLE":
                        waste_penalty += 80.0 if not is_bloodlust else 10.0
                    elif act_type == "PAIR":
                        waste_penalty += 100.0 if not is_bloodlust else 10.0
                    elif act_type == "STRAIGHT":
                        waste_penalty += 60.0 if not is_bloodlust else 10.0

                if next_is_danger and not bot_is_safe:
                    if act_type == "SINGLE" and details["max_rank"] < 13:
                        waste_penalty += 200.0
                    elif act_type != "SINGLE":
                        boss_bonus -= 60.0
            else:
                is_early_pig_forbidden = False
                if details["is_pig"] or details["is_joker"]:
                    if not (len(simulated_hand) <= 2 or is_endgame_panic or bot_has_hang):
                        total_hoard = sum(opp["hoard_score"] for opp in self.danger_dict.values())
                        max_passed = max((opp["passed_turns"] for opp in self.danger_dict.values()), default=0)
                        max_opp_cards = max((opp["cards_left"] for opp in self.danger_dict.values()), default=13)
                        power_cards_count = sum(
                            1 for c in hand if c.startswith('X') or tlmn_dict_deck.get(c, {}).get("rank") == 15)

                        dynamic_fear = (total_hoard * 35.0) + (max_passed * 20.0) + (max_opp_cards * 3.0)
                        dynamic_fear -= (power_cards_count - 1) * 60.0

                        if is_bloodlust:
                            dynamic_fear *= 0.2

                        dynamic_fear -= (max_opp_opens * 80.0)

                        if self.joker_mode:
                            dynamic_fear += 40.0

                        dynamic_fear = max(0.0, dynamic_fear)
                        waste_penalty += dynamic_fear

                        if dynamic_fear > 120.0:
                            is_early_pig_forbidden = True

                if is_boss:
                    if target_rank <= 11 and len(
                            simulated_hand) > 3 and not is_endgame_panic and max_opp_opens < 2 and not is_bloodlust:
                        waste_penalty += 150.0
                    else:
                        if details[
                            "max_rank"] > min_playable_rank and target_rank < 13 and not is_endgame_panic and max_opp_opens < 2 and not is_bloodlust:
                            waste_penalty += 90.0
                        else:
                            if not is_early_pig_forbidden:
                                boss_bonus = -80.0 - (max_opp_opens * 40.0)
                                if is_bloodlust:
                                    boss_bonus -= 100.0

                if (details["is_pig"] or details["is_joker"] or is_bomb) and not is_boss:
                    if not is_early_pig_forbidden:
                        waste_penalty += 60.0 if not is_bloodlust else 10.0

            triple_bonus = 0.0
            if act_type == "TRIPLE":
                if details["is_pig"]:
                    if len(hand) > 5 and not is_endgame_panic:
                        waste_penalty += 500.0
                elif details["max_rank"] <= 10:
                    triple_bonus -= 35.0
                else:
                    if len(simulated_hand) > 2 and not is_endgame_panic:
                        waste_penalty += 120.0 if not is_bloodlust else 30.0

                if "3♠" in simulated_hand:
                    triple_bonus -= 25.0

            chop_risk = 0.0
            if details["is_pig"] or details["is_joker"] or is_bomb:
                weighted_hoard = 0.0
                for opp_id, opp in self.danger_dict.items():
                    dist = (opp_id - self.seat) % self.num_players
                    w = 2.0 if dist == 1 else (1.0 if dist == 2 else 0.5)
                    weighted_hoard += opp["hoard_score"] * w

                my_act_penalty = tlmn_rules.calculate_stack_penalty(parsed_act, self.joker_mode,
                                                                    self.payment_mode) if parsed_act.get(
                    "is_valid") else 0.0
                total_relative_stack = current_stack_penalty + my_act_penalty

                if weighted_hoard > 0.5:
                    base_unit = 25.0 if self.payment_mode == "count_cards" else 2.5
                    chop_risk += (total_relative_stack + base_unit) * weighted_hoard * (1.5 if is_1v1 else 1.0)

                if details["is_pig"] and details["max_rank"] == 15:
                    is_black_pig = all(
                        tlmn_dict_deck.get(c, {}).get("suit") in ['♠', '♣'] for c in act if not c.startswith('X'))
                    if is_black_pig and weighted_hoard >= 1.5:
                        chop_risk -= 40.0

            control_bonus = 0.0
            if last_combo is None and act_type in ["PAIR", "TRIPLE"]:
                curr_rank = details["max_rank"]
                sim_counts = {}
                for c in simulated_hand:
                    if not c.startswith("X"):
                        r = tlmn_dict_deck[c]["rank"]
                        sim_counts[r] = sim_counts.get(r, 0) + 1
                req_len = 2 if act_type == "PAIR" else 3
                if any(r > curr_rank and count >= req_len for r, count in sim_counts.items()):
                    control_bonus -= 30.0

            bait_bonus = 0.0
            if bot_has_hang and not someone_danger and not is_1v1:
                if details["max_rank"] in [14, 15] and not is_bomb:
                    bait_bonus -= 40.0

            panic_bonus = 0.0
            if is_endgame_panic and (details["is_pig"] or details["is_joker"] or is_bomb):
                panic_bonus -= 150.0

            # [NEW CHỨC NĂNG] THOÁT CÓNG BẰNG MỌI GIÁ
            escape_cong_bonus = 0.0
            if not self.has_played:
                escape_cong_bonus = -400.0  # Thà đứt từng khúc ruột xé Sảnh chứ không để bị Cóng!

            safe_block_bonus = 0.0
            is_suicide_move = False

            if act_type and parsed_act and parsed_act.get("is_valid") and someone_one_card:
                act_pwr = tlmn_dict_deck.get(parsed_act.get("highest_card", ""), {}).get("power", 0)
                fully_blocks_all_danger = True

                for opp_id, opp_data in self.danger_dict.items():
                    if opp_data["is_one_card"] and act_len == 1:
                        bound = opp_data["absolute_bounds"].get("SINGLE", 999)
                        if act_pwr <= bound:
                            fully_blocks_all_danger = False
                            if bound != 999:
                                is_suicide_move = True

                if fully_blocks_all_danger and not details["is_pig"] and not details["is_joker"]:
                    safe_block_bonus -= 200.0

                if is_suicide_move:
                    waste_penalty += 300.0

            return (fin_score * fin_weight) + step_penalty + waste_penalty + chop_risk + \
                boss_bonus + control_bonus + triple_bonus + bait_bonus + panic_bonus + safe_block_bonus + escape_cong_bonus

        if someone_one_card and not bot_is_safe:
            if last_combo is None:
                multi_card = [act for act in playable if
                              len(act) >= 2 and not tlmn_rules.parse_combo_tlmn(act, joker_mode=self.joker_mode)[
                                  "can_bomb"]]
                if multi_card:
                    multi_card.sort(key=lambda x: (-len(x), get_action_power(x)))
                    return legal_actions.index(multi_card[0])
                playable.sort(key=get_action_power, reverse=True)
                for act in playable:
                    dt = get_action_details(act)
                    if not dt["is_pig"] and not dt["is_joker"]:
                        return legal_actions.index(act)
                return legal_actions.index(playable[0])
            else:
                playable.sort(key=get_action_power, reverse=True)
                return legal_actions.index(playable[0])

        if someone_danger and last_combo is None and not bot_is_safe:
            pig_actions = [act for act in playable if
                           get_action_details(act)["is_pig"] or get_action_details(act)["is_joker"]]
            if pig_actions:
                pig_actions.sort(key=get_action_power, reverse=True)
                return legal_actions.index(pig_actions[0])

        best_act_idx = 0
        min_risk = float('inf')

        for act in valid_playable:
            risk = evaluate_action_risk(act)
            if last_combo is None and is_game_start and "3♠" in act:
                risk -= 200.0
            if last_combo is None and len(act) >= 5:
                risk -= 10.0

            if risk < min_risk:
                min_risk = risk
                best_act_idx = legal_actions.index(act)

        # --- LOGIC CẤM BỎ LƯỢT VÀ PASS THÔNG MINH ---
        if last_combo is not None and has_pass:
            if not self.has_played:
                # Lệnh 1: Tuyệt đối không Pass nếu chưa ra lá nào để chống Cóng
                pass
            elif is_bloodlust:
                # Lệnh 2: Bài đang quá đẹp (Hổ Báo), tuyệt đối không Pass để khô máu tới cùng
                pass
            else:
                base_steps_risk = estimate_hand_steps(hand) * 10.0
                net_risk = min_risk - base_steps_risk
                pass_threshold = 120.0 + (max_opp_opens * 150.0)

                if net_risk >= pass_threshold and not someone_danger:
                    return legal_actions.index([])

                details = get_action_details(legal_actions[best_act_idx])
                if (details["is_pig"] or details["is_joker"]) and not someone_danger and len(hand) > 4:
                    total_hoard = sum(opp["hoard_score"] for opp in self.danger_dict.values())
                    if is_1v1:
                        base_chance = 0.10
                        hoard_bonus = min(0.15, total_hoard * 0.05)
                    else:
                        base_chance = 0.40
                        hoard_bonus = min(0.40, total_hoard * 0.1)

                    pass_chance = base_chance + hoard_bonus
                    if random.random() < pass_chance:
                        return legal_actions.index([])

        return best_act_idx
