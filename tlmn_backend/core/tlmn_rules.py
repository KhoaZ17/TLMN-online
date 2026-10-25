import random
import secrets
import json
import unittest
from itertools import combinations, product, permutations
from collections import Counter


default_deck = [
    "3♠", "3♣", "3♦", "3♥",
    "4♠", "4♣", "4♦", "4♥",
    "5♠", "5♣", "5♦", "5♥",
    "6♠", "6♣", "6♦", "6♥",
    "7♠", "7♣", "7♦", "7♥",
    "8♠", "8♣", "8♦", "8♥",
    "9♠", "9♣", "9♦", "9♥",
    "T♠", "T♣", "T♦", "T♥",
    "J♠", "J♣", "J♦", "J♥",
    "Q♠", "Q♣", "Q♦", "Q♥",
    "K♠", "K♣", "K♦", "K♥",
    "A♠", "A♣", "A♦", "A♥",
    "2♠", "2♣", "2♦", "2♥",
]
tlmn_joker_cards = [
    "X♠", "X♣", "X♦", "X♥",
]
tlmn_dict_deck = {
    "3♠": {"rank": 3, "suit": "♠", "power": 1},
    "3♣": {"rank": 3, "suit": "♣", "power": 2},
    "3♦": {"rank": 3, "suit": "♦", "power": 3},
    "3♥": {"rank": 3, "suit": "♥", "power": 4},
    "4♠": {"rank": 4, "suit": "♠", "power": 5},
    "4♣": {"rank": 4, "suit": "♣", "power": 6},
    "4♦": {"rank": 4, "suit": "♦", "power": 7},
    "4♥": {"rank": 4, "suit": "♥", "power": 8},
    "5♠": {"rank": 5, "suit": "♠", "power": 9},
    "5♣": {"rank": 5, "suit": "♣", "power": 10},
    "5♦": {"rank": 5, "suit": "♦", "power": 11},
    "5♥": {"rank": 5, "suit": "♥", "power": 12},
    "6♠": {"rank": 6, "suit": "♠", "power": 13},
    "6♣": {"rank": 6, "suit": "♣", "power": 14},
    "6♦": {"rank": 6, "suit": "♦", "power": 15},
    "6♥": {"rank": 6, "suit": "♥", "power": 16},
    "7♠": {"rank": 7, "suit": "♠", "power": 17},
    "7♣": {"rank": 7, "suit": "♣", "power": 18},
    "7♦": {"rank": 7, "suit": "♦", "power": 19},
    "7♥": {"rank": 7, "suit": "♥", "power": 20},
    "8♠": {"rank": 8, "suit": "♠", "power": 21},
    "8♣": {"rank": 8, "suit": "♣", "power": 22},
    "8♦": {"rank": 8, "suit": "♦", "power": 23},
    "8♥": {"rank": 8, "suit": "♥", "power": 24},
    "9♠": {"rank": 9, "suit": "♠", "power": 25},
    "9♣": {"rank": 9, "suit": "♣", "power": 26},
    "9♦": {"rank": 9, "suit": "♦", "power": 27},
    "9♥": {"rank": 9, "suit": "♥", "power": 28},
    "T♠": {"rank": 10, "suit": "♠", "power": 29},
    "T♣": {"rank": 10, "suit": "♣", "power": 30},
    "T♦": {"rank": 10, "suit": "♦", "power": 31},
    "T♥": {"rank": 10, "suit": "♥", "power": 32},
    "J♠": {"rank": 11, "suit": "♠", "power": 33},
    "J♣": {"rank": 11, "suit": "♣", "power": 34},
    "J♦": {"rank": 11, "suit": "♦", "power": 35},
    "J♥": {"rank": 11, "suit": "♥", "power": 36},
    "Q♠": {"rank": 12, "suit": "♠", "power": 37},
    "Q♣": {"rank": 12, "suit": "♣", "power": 38},
    "Q♦": {"rank": 12, "suit": "♦", "power": 39},
    "Q♥": {"rank": 12, "suit": "♥", "power": 40},
    "K♠": {"rank": 13, "suit": "♠", "power": 41},
    "K♣": {"rank": 13, "suit": "♣", "power": 42},
    "K♦": {"rank": 13, "suit": "♦", "power": 43},
    "K♥": {"rank": 13, "suit": "♥", "power": 44},
    "A♠": {"rank": 14, "suit": "♠", "power": 45},
    "A♣": {"rank": 14, "suit": "♣", "power": 46},
    "A♦": {"rank": 14, "suit": "♦", "power": 47},
    "A♥": {"rank": 14, "suit": "♥", "power": 48},
    "2♠": {"rank": 15, "suit": "♠", "power": 49},
    "2♣": {"rank": 15, "suit": "♣", "power": 50},
    "2♦": {"rank": 15, "suit": "♦", "power": 51},
    "2♥": {"rank": 15, "suit": "♥", "power": 52},
    "X♠": {"rank": 00, "suit": "♠", "power": 00},
    "X♣": {"rank": 00, "suit": "♣", "power": 00},
    "X♦": {"rank": 00, "suit": "♦", "power": 00},
    "X♥": {"rank": 00, "suit": "♥", "power": 00},
}

joker_mode = False
payment_mode = "count_cards"  # Chỉ nhận 1 trong 2 giá trị "count_cards" hoặc "winner_takes_all". Mặc định "count_cards
cost = 0

every_round_instant_win_hands_none_joker = {
    "SẢNH RỒNG":               {"power": 7, "po_mtp_cc": 70, "po_mtp_wta": 7},
    "5 ĐÔI THÔNG":             {"power": 6, "po_mtp_cc": 60, "po_mtp_wta": 6},
    "TỨ QUÝ HEO":              {"power": 5, "po_mtp_cc": 50, "po_mtp_wta": 5},
    "6 ĐÔI":                   {"power": 4, "po_mtp_cc": 40, "po_mtp_wta": 4},
}
first_round_instant_win_hands_none_joker = {
    "4 ĐÔI THÔNG CÓ 3 BÍCH": {"power": 3, "po_mtp_cc": 30, "po_mtp_wta": 3},
    "TỨ QUÝ 3":              {"power": 2, "po_mtp_cc": 20, "po_mtp_wta": 2},
    "3 ĐÔI THÔNG CÓ 3 BÍCH": {"power": 1, "po_mtp_cc": 10, "po_mtp_wta": 1},
}

every_round_instant_win_hands_with_joker = {
    "BÁT QUÁI HEO":          {"power": 9, "po_mtp_cc": 90, "po_mtp_wta": 9},
    "6 ĐÔI THÔNG":           {"power": 8, "po_mtp_cc": 80, "po_mtp_wta": 8},
    "SẢNH RỒNG":             {"power": 7, "po_mtp_cc": 70, "po_mtp_wta": 7},
    "7 ĐÔI":                 {"power": 6, "po_mtp_cc": 60, "po_mtp_wta": 6},
    "TỨ QUÝ HEO":            {"power": 5, "po_mtp_cc": 50, "po_mtp_wta": 5},
}
first_round_instant_win_hands_with_joker = {
    "5 ĐÔI THÔNG CÓ 3 BÍCH": {"power": 4, "po_mtp_cc": 40, "po_mtp_wta": 4},
    "4 ĐÔI THÔNG CÓ 3 BÍCH": {"power": 3, "po_mtp_cc": 30, "po_mtp_wta": 3},
    "TỨ QUÝ 3":              {"power": 2, "po_mtp_cc": 20, "po_mtp_wta": 2},
    "3 ĐÔI THÔNG CÓ 3 BÍCH": {"power": 1, "po_mtp_cc": 10, "po_mtp_wta": 1},
}

penalty_count_cards = {
    "5 ĐÔI THÔNG": 60,
    "4 ĐÔI THÔNG": 50,
    "TỨ QUÝ": 40,
    "3 ĐÔI THÔNG": 30,
    "JOKER ĐỎ": 25,
    "HEO ĐỎ": 20,
    "JOKER ĐEN": 15,
    "HEO ĐEN": 10,
}
penalty_winner_takes_all = {
    "5 ĐÔI THÔNG": 6,
    "4 ĐÔI THÔNG": 5,
    "TỨ QUÝ": 4,
    "3 ĐÔI THÔNG": 3,
    "JOKER ĐỎ": 2.5,
    "HEO ĐỎ": 2,
    "JOKER ĐEN": 1.5,
    "HEO ĐEN": 1,
}


def card_info(card):
    return tlmn_dict_deck[card]["rank"], tlmn_dict_deck[card]["suit"], tlmn_dict_deck[card]["power"]


def rank_to_str(r):
    return {10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2'}.get(r, str(r))


def suit_power(s):
    return {'♠': 1, '♣': 2, '♦': 3, '♥': 4}[s]


def get_valid_suits(r, min_power):
    card_str_base = rank_to_str(r)
    valid = []
    for s in ['♠', '♣', '♦', '♥']:
        c_str = card_str_base + s
        if tlmn_dict_deck[c_str]["power"] >= min_power:
            valid.append(s)
    return valid


def sort_hand(cards: list[str]) -> list[str]:
    """
    Sắp xếp bộ bài trên tay:
    1. Các lá Joker (X♠, X♣, X♦, X♥) đứng trước, xếp theo thứ tự chất: ♠ < ♣ < ♦ < ♥.
    2. Các lá thường đứng sau, xếp tăng dần theo chỉ số power (từ 3♠ đến 2♥).
    """
    jokers = [c for c in cards if c.startswith('X')]
    regulars = [c for c in cards if not c.startswith('X')]

    # Sắp xếp Joker theo chất (Bích, Chuồn, Rô, Cơ)
    jokers_sorted = sorted(
        jokers, key=lambda c: suit_power(c[1]) if len(c) > 1 and c[1] in {'♠', '♣', '♦', '♥'} else 0
    )

    # Sắp xếp lá thường theo Power
    regulars_sorted = sorted(
        regulars, key=lambda c: tlmn_dict_deck[c]["power"] if c in tlmn_dict_deck else 0
    )

    return jokers_sorted + regulars_sorted


def is_instant_win(cards, joker_mode, num_round, payment_mode):
    # 1. Kiểm tra số lượng lá bài hợp lệ
    if joker_mode and len(cards) != 14:
        return None, None, None, None
    if not joker_mode and len(cards) != 13:
        return None, None, None, None

    # 2. Gom bảng luật tới trắng theo cấu hình
    hands_to_check = {}
    if not joker_mode:
        hands_to_check.update(every_round_instant_win_hands_none_joker)
        if num_round == 1:
            hands_to_check.update(first_round_instant_win_hands_none_joker)
    else:
        hands_to_check.update(every_round_instant_win_hands_with_joker)
        if num_round == 1:
            hands_to_check.update(first_round_instant_win_hands_with_joker)

    sorted_hands = sorted(hands_to_check.items(), key=lambda x: x[1]['power'], reverse=True)

    # 3. Phân loại bài thật và xác định mốc sàn power
    counts = {}
    joker_suits = []

    min_power = 1  # Joker luôn được quyền hóa thân xuống tận đáy (3 Bích)
    req_card = (3, '♠')  # Cố định các bộ tới trắng ván đầu yêu cầu chứa 3 bích

    for card in cards:
        if card.startswith('X'):
            joker_suits.append(card[1])
        else:
            rank = tlmn_dict_deck[card]["rank"]
            suit = tlmn_dict_deck[card]["suit"]
            if rank not in counts:
                counts[rank] = []
            counts[rank].append(suit)

    # Hàm lõi: Kiểm tra ghép Joker chất cố định vào các vị trí trống (chống trùng chất & vi phạm mốc sàn)
    def get_best_highest_card(target_counts, required_card=None):
        missing_ranks = []
        rank_info = {}

        for r, qty in target_counts.items():
            v_suits = set(get_valid_suits(r, min_power))
            if len(v_suits) < qty:
                return None

            real_have = set(counts.get(r, [])) & v_suits

            if len(real_have) >= qty:
                missing_count = 0
            else:
                missing_count = qty - len(real_have)

            rank_info[r] = {
                'v_suits': v_suits,
                'real_have': real_have,
                'missing_count': missing_count,
                'qty': qty
            }
            missing_ranks.extend([r] * missing_count)

        if len(missing_ranks) > len(joker_suits):
            return None

        top_rank = max(target_counts.keys())

        best_h_card = None
        best_h_power = -1
        seen_assignments = set()

        # Thử nghiệm việc phân bổ từng lá Joker (với chất cố định) vào các vị trí thiếu
        for joker_combo in combinations(range(len(joker_suits)), len(missing_ranks)):
            chosen_joker_suits = [joker_suits[i] for i in joker_combo]
            for p in set(permutations(chosen_joker_suits)):
                if p in seen_assignments:
                    continue
                seen_assignments.add(p)

                valid = True
                assigned_jokers = {r: set() for r in target_counts}

                for idx, r in enumerate(missing_ranks):
                    j_suit = p[idx]
                    info = rank_info[r]

                    # 1. Trùng chất với bài thật ở cùng rank
                    if j_suit in info['real_have']:
                        valid = False
                        break
                    # 2. Trùng chất với Joker khác ở cùng rank
                    if j_suit in assigned_jokers[r]:
                        valid = False
                        break
                    # 3. Vi phạm mốc sàn (min_power)
                    if j_suit not in info['v_suits']:
                        valid = False
                        break
                    assigned_jokers[r].add(j_suit)

                if not valid:
                    continue

                # Kiểm tra yêu cầu chứa lá nhỏ nhất (đối với ván đầu)
                if required_card:
                    req_r, req_s = required_card
                    if req_r in target_counts:
                        # CHỈ chấp nhận 3 Bích thật, KHÔNG cho Joker giả làm 3 Bích
                        if req_s not in rank_info[req_r]['real_have']:
                            continue
                    else:
                        continue

                top_info = rank_info[top_rank]
                top_jokers = assigned_jokers[top_rank]

                needed_real_qty = top_info['qty'] - len(top_jokers)
                sorted_real_suits = sorted(top_info['real_have'], key=suit_power, reverse=True)
                chosen_real_suits = set(sorted_real_suits[:needed_real_qty])

                all_top_suits = chosen_real_suits | top_jokers
                highest_suit = max(all_top_suits, key=suit_power)

                h_card = rank_to_str(top_rank) + highest_suit
                pwr = tlmn_dict_deck[h_card]["power"]

                if pwr > best_h_power:
                    best_h_power = pwr
                    best_h_card = h_card

        return best_h_card

    # --- CÁC HÀM KIỂM TRA CHO TỪNG LOẠI BỘ ---

    def check_sanh_rong():
        target = {r: 1 for r in range(3, 15)}
        return get_best_highest_card(target)

    def check_bat_quai_heo():
        # Riêng Bát quái heo: Cho phép Joker đóng vai Heo trùng chất với bài thật hoặc Joker khác
        real_heos = counts.get(15, [])
        valid_real = [s for s in real_heos if tlmn_dict_deck["2" + s]["power"] >= min_power]
        valid_jokers = [s for s in joker_suits if tlmn_dict_deck["2" + s]["power"] >= min_power]
        all_valid = valid_real + valid_jokers
        if len(all_valid) >= 8:
            best_suit = max(all_valid, key=suit_power)
            return rank_to_str(15) + best_suit
        return None

    def check_tu_quy(target_rank, req_card_param=None):
        # NẾU LÀ TỨ QUÝ HEO: Kiểm tra tay bài thật phải có đủ 4 con (Rank 15)
        if target_rank == 15:
            if len(counts.get(15, [])) == 4:
                return "2♥"  # Nếu có 4 Heo thật, lá cao nhất chắc chắn là 2 Cơ
            return None

        target = {target_rank: 4}
        return get_best_highest_card(target, req_card_param)

    def check_n_doi_thong(N, req_card_param=None):
        if req_card_param:
            w_rank = req_card_param[0]
            min_R_top = max(w_rank, N + 1)
            max_R_top = min(14, w_rank + N - 1)

            for R_top in range(max_R_top, min_R_top - 1, -1):
                target = {r: 2 for r in range(R_top - N + 1, R_top + 1)}
                res = get_best_highest_card(target, req_card_param)
                if res:
                    return res
        else:
            for R_top in range(14, N + 1, -1):
                target = {r: 2 for r in range(R_top - N + 1, R_top + 1)}
                res = get_best_highest_card(target)
                if res:
                    return res
        return None

    def check_n_doi(N):
        for R_top in range(15, 2, -1):
            v_top = set(get_valid_suits(R_top, min_power))
            if len(v_top) < 2:
                continue

            candidate_ranks = []
            for r in range(3, 16):
                if r == R_top:
                    continue
                v_r = set(get_valid_suits(r, min_power))
                if len(v_r) >= 2:
                    real_r = set(counts.get(r, [])) & v_r
                    cost_r = max(0, 2 - len(real_r))
                    candidate_ranks.append((cost_r, -len(real_r), r))

            if len(candidate_ranks) < N - 1:
                continue

            candidate_ranks.sort()
            chosen_other_ranks = [r for _, _, r in candidate_ranks[:N - 1]]

            target = {r: 2 for r in ([R_top] + chosen_other_ranks)}
            res = get_best_highest_card(target)
            if res:
                return res
        return None

    # 4. Duyệt các tay bài
    for name, data in sorted_hands:
        highest = None
        if name == "SẢNH RỒNG":
            highest = check_sanh_rong()
        elif name == "BÁT QUÁI HEO":
            highest = check_bat_quai_heo()
        elif name == "TỨ QUÝ HEO":
            highest = check_tu_quy(15)
        elif name == "TỨ QUÝ 3" and req_card:
            highest = check_tu_quy(req_card[0], req_card)
        elif name.endswith("ĐÔI THÔNG CÓ 3 BÍCH") and req_card:
            n_pairs = int(name.split()[0])
            highest = check_n_doi_thong(n_pairs, req_card)
        elif name.endswith("ĐÔI THÔNG"):
            n_pairs = int(name.split()[0])
            highest = check_n_doi_thong(n_pairs)
        elif name.endswith("ĐÔI"):
            n_pairs = int(name.split()[0])
            highest = check_n_doi(n_pairs)

        if highest is not None:
            mtp_key = "po_mtp_cc" if payment_mode == "count_cards" else "po_mtp_wta"
            return name, data["power"], highest, data[mtp_key]

    return None, None, None, None


def normal_win_payment(cards, payment_mode, cost, joker_mode, last_combo):
    # 1. Kiểm tra các hệ số nền tảng (Cóng, Thối 3 bích)
    max_cards = 14 if joker_mode else 13
    is_cong = (len(cards) == max_cards)

    is_thoi_moc = False
    if last_combo and last_combo.get("combo_type") == "SINGLE" and last_combo.get("highest_card") == "3♠":
        is_thoi_moc = True

    # Kiểm tra xem trên tay có sẵn lá 3 bích thật hay không
    has_real_3_spade = ("3♠" in cards)

    real_cards = [c for c in cards if not c.startswith('X')]
    jokers = [c for c in cards if c.startswith('X')] if joker_mode else []

    if payment_mode == "count_cards":
        penalties = penalty_count_cards
        base_points = 0
    else:
        penalties = penalty_winner_takes_all
        base_points = 1

    # Danh sách các loại Hàng khả thi
    all_candidates = []
    if joker_mode:
        for r in range(3, 11):
            all_candidates.append(('5_doi_thong', r))
    for r in range(3, 12):
        all_candidates.append(('4_doi_thong', r))
    for r in range(3, 15):
        all_candidates.append(('tu_quy', r))
    for r in range(3, 13):
        all_candidates.append(('3_doi_thong', r))

    def get_requirements(cand_type, r):
        req = {i: 0 for i in range(3, 15)}
        if cand_type == '5_doi_thong':
            for i in range(r, r + 5):
                req[i] = 2
        elif cand_type == '4_doi_thong':
            for i in range(r, r + 4):
                req[i] = 2
        elif cand_type == 'tu_quy':
            req[r] = 4
        elif cand_type == '3_doi_thong':
            for i in range(r, r + 3):
                req[i] = 2
        return req

    max_final_penalty = 0.0

    # Hàm tính điểm chi tiết cho một kịch bản phân bổ cụ thể
    def evaluate_config(base_counts, r_jokers, b_jokers, heos, is_giu_moc_active, extracted_hangs):
        score = base_points

        # Cộng điểm phạt Hàng
        for hang in extracted_hangs:
            if hang.startswith('5_doi_thong'):
                score += penalties["5 ĐÔI THÔNG"]
            elif hang.startswith('4_doi_thong'):
                score += penalties["4 ĐÔI THÔNG"]
            elif hang.startswith('tu_quy'):
                score += penalties["TỨ QUÝ"]
            elif hang.startswith('3_doi_thong'):
                score += penalties["3 ĐÔI THÔNG"]

        # Cộng điểm phạt Joker dư thừa chưa dùng làm gì
        score += r_jokers * penalties["JOKER ĐỎ"]
        score += b_jokers * penalties["JOKER ĐEN"]

        # Cộng điểm phạt Heo dư thừa
        for heo in heos:
            if heo in ['2♥', '2♦']:
                score += penalties["HEO ĐỎ"]
            else:
                score += penalties["HEO ĐEN"]

        # Đếm rác (Nếu là chế độ đếm lá)
        if payment_mode == "count_cards":
            score += sum(base_counts.values())

        # Tính toán hệ số nhân (Multiplier)
        mult = 1
        if is_cong:
            mult *= 2

        if is_thoi_moc:
            mult *= 3
        elif is_giu_moc_active:
            mult *= 3  # Kích hoạt nhân 3 khi giữ mốc (hoặc Joker hóa 3 bích)

        return score * mult * cost

    # Thuật toán Backtracking tìm Hàng tối ưu trên tập bài còn lại
    def search_hangs(cand_idx, counts, r_jokers, b_jokers, heos, is_giu_moc_active, extracted_hangs):
        nonlocal max_final_penalty

        current_penalty = evaluate_config(counts, r_jokers, b_jokers, heos, is_giu_moc_active, extracted_hangs)
        if current_penalty > max_final_penalty:
            max_final_penalty = current_penalty

        if cand_idx == len(all_candidates):
            return

        # Thử nhánh không lập Hàng này
        search_hangs(cand_idx + 1, counts, r_jokers, b_jokers, heos, is_giu_moc_active, extracted_hangs)

        # Thử nhánh lập Hàng
        cand_type, r = all_candidates[cand_idx]
        req = get_requirements(cand_type, r)

        times = 1
        while True:
            missing = 0
            for rank, needed in req.items():
                total_needed = needed * times
                if total_needed > counts[rank]:
                    missing += (total_needed - counts[rank])

            if missing > (r_jokers + b_jokers):
                break

            new_counts = counts.copy()
            for rank, needed in req.items():
                total_needed = needed * times
                if total_needed <= new_counts[rank]:
                    new_counts[rank] -= total_needed
                else:
                    new_counts[rank] = 0

            rem_b = b_jokers
            rem_r = r_jokers
            rem_missing = missing

            use_b = min(rem_b, rem_missing)
            rem_b -= use_b
            rem_missing -= use_b

            use_r = rem_missing
            rem_r -= use_r

            new_extracted = extracted_hangs + [f"{cand_type}_{r}"] * times
            search_hangs(cand_idx + 1, new_counts, rem_r, rem_b, heos, is_giu_moc_active, new_extracted)
            times += 1

    # DUYỆT MỌI TRƯỜNG HỢP BIẾN ĐỔI CỦA JOKER (Dùng nhị phân bitwise để xét vai trò từng Joker)
    n_jokers = len(jokers)
    for i in range(1 << n_jokers):
        base_counts = {r: 0 for r in range(3, 15)}
        heos_list = []
        for c in real_cards:
            rank, suit, _ = card_info(c)
            if rank == 15:
                heos_list.append(c)
            else:
                base_counts[rank] += 1

        is_giu_moc_active = has_real_3_spade
        pool_r_jokers = 0
        pool_b_jokers = 0

        # Phân rã vai trò từng Joker dựa trên bit thứ idx
        for idx, j_card in enumerate(jokers):
            is_red = j_card in ['X♥', 'X♦']
            if (i & (1 << idx)) != 0:
                # Joker này đóng vai trò hóa thân thành 3 bích (Kích hoạt Giữ mốc x3)
                is_giu_moc_active = True
                base_counts[3] += 1
            else:
                # Joker này nằm trong hồ chứa chung (dùng để ghép Hàng hoặc phạt Joker đơn thuần)
                if is_red:
                    pool_r_jokers += 1
                else:
                    pool_b_jokers += 1

        # Chạy thuật toán tìm Hàng cho cấu hình Joker hiện tại
        search_hangs(0, base_counts, pool_r_jokers, pool_b_jokers, heos_list, is_giu_moc_active, [])

    return max_final_penalty


def instant_win_payment(players_cards: dict, payment_mode: str, cost: int, joker_mode: bool = False, num_round: int = 1, current_balances: dict = None) -> dict:
    iw_players = {}
    non_iw_players = []

    for player_id, cards in players_cards.items():
        hand_name, power, highest, multiplier = is_instant_win(cards, joker_mode, num_round, payment_mode)
        if hand_name is not None:
            iw_players[player_id] = {
                "hand_name": hand_name,
                "power": power,
                "highest": highest,
                "multiplier": multiplier
            }
        else:
            non_iw_players.append(player_id)

    if not iw_players:
        return {
            "has_instant_win": False,
            "net_changes": {p: 0 for p in players_cards},
            "instant_win_players": {},
            "transaction_logs": []
        }

    net_changes = {p: 0 for p in players_cards}
    transaction_logs = []

    # === THUẬT TOÁN GIỚI HẠN SỐ DƯ KHI THANH TOÁN ===
    if current_balances is None:
        working_balances = {p: float('inf') for p in players_cards}
    else:
        working_balances = {p: float(current_balances.get(p, 0.0)) for p in players_cards}

    def transfer(payer, payee, amount, reason):
        # Người đền chỉ đền tối đa số tiền họ đang có
        actual = min(float(amount), max(0.0, working_balances[payer]))
        if actual > 0:
            working_balances[payer] -= actual
            working_balances[payee] += actual
            net_changes[payer] -= actual
            net_changes[payee] += actual
            transaction_logs.append(f"{payer} trả cho {payee}: {actual:,.0f} ({reason})")

    # Các người chơi bình thường trả tiền cho người Tới Trắng
    for non_p in non_iw_players:
        for iw_p, iw_info in iw_players.items():
            amount = iw_info["multiplier"] * cost
            transfer(non_p, iw_p, amount, f"Tới trắng: {iw_info['hand_name']}")

    # Nếu có nhiều người cùng Tới Trắng (Hiếm), phân xử theo Power
    iw_list = list(iw_players.keys())
    for i in range(len(iw_list)):
        for j in range(i + 1, len(iw_list)):
            p1, p2 = iw_list[i], iw_list[j]
            info1, info2 = iw_players[p1], iw_players[p2]

            if info1["power"] > info2["power"]:
                diff_mtp = info1["multiplier"] - info2["multiplier"]
                transfer(p2, p1, diff_mtp * cost, f"Chênh lệch Power tới trắng: {info1['power']} vs {info2['power']}")
            elif info2["power"] > info1["power"]:
                diff_mtp = info2["multiplier"] - info1["multiplier"]
                transfer(p1, p2, diff_mtp * cost, f"Chênh lệch Power tới trắng: {info2['power']} vs {info1['power']}")
            else:
                p1_card_power = tlmn_dict_deck[info1["highest"]]["power"]
                p2_card_power = tlmn_dict_deck[info2["highest"]]["power"]
                extra_mtp = 10 if payment_mode == "count_cards" else 1

                if p1_card_power > p2_card_power:
                    transfer(p2, p1, extra_mtp * cost,
                             f"Thua lá lớn nhất trong cùng Power: {info2['highest']} vs {info1['highest']}")
                elif p2_card_power > p1_card_power:
                    transfer(p1, p2, extra_mtp * cost,
                             f"Thua lá lớn nhất trong cùng Power: {info1['highest']} vs {info2['highest']}")

    return {
        "has_instant_win": True,
        "net_changes": net_changes,
        "instant_win_players": iw_players,
        "transaction_logs": transaction_logs
    }


def parse_combo_tlmn(chosen_cards: list[str], joker_mode: bool = False, last_combo: dict = None) -> dict:
    n = len(chosen_cards)
    invalid_result = {
        "is_valid": False, "combo_type": "INVALID",
        "highest_card": "", "length": n,
        "can_bomb": False, "used_joker": [], "used_heo": [],
        "error_message": ""
    }

    if n == 0:
        invalid_result["error_message"] = "Không có bài được chọn"
        return invalid_result

    min_power = 1  # Gỡ bỏ giới hạn yếu nhất của ván, cho phép Joker xuống tới 3 Bích

    real_cards, jokers = [], []
    for c in chosen_cards:
        (jokers if c.startswith('X') else real_cards).append(c)

    if jokers and not joker_mode:
        invalid_result["error_message"] = "Chế độ thường không cho phép dùng Joker"
        return invalid_result

    real_counts, real_suits = {}, {}
    for c in real_cards:
        if c not in tlmn_dict_deck:
            invalid_result["error_message"] = f"Mã bài không hợp lệ: {c}"
            return invalid_result

        rank, suit = tlmn_dict_deck[c]["rank"], tlmn_dict_deck[c]["suit"]
        real_counts[rank] = real_counts.get(rank, 0) + 1

        if rank not in real_suits:
            real_suits[rank] = set()
        if suit in real_suits[rank]:
            invalid_result["error_message"] = "Có lá bài trùng lặp trong danh sách chọn"
            return invalid_result
        real_suits[rank].add(suit)

    # 1. TẠO TẤT CẢ CÁC CANDIDATES KHẢ THI THEO ĐỘ DÀI
    all_candidates = []
    if n == 1:
        for r in range(3, 16):
            all_candidates.append(("SINGLE", {r: 1}))
    elif n == 2:
        for r in range(3, 16):
            all_candidates.append(("PAIR", {r: 2}))
    elif n == 3:
        for r in range(3, 16):
            all_candidates.append(("TRIPLE", {r: 3}))
    elif n == 4:
        for r in range(3, 16):
            all_candidates.append(("FOUR_OF_A_KIND", {r: 4}))

    # Sảnh và Đôi thông không chứa Heo (chỉ chạy đến 14/Ách)
    if n >= 3:
        for r in range(3, 16 - n):
            all_candidates.append(("STRAIGHT", {k: 1 for k in range(r, r + n)}))

    if n >= 6 and n % 2 == 0:
        num_pairs = n // 2
        if not (num_pairs == 5 and not joker_mode):
            chain_name = f"{num_pairs}_PAIRS_CHAIN"
            for r in range(3, 16 - num_pairs):
                all_candidates.append((chain_name, {k: 2 for k in range(r, r + num_pairs)}))

    # 2. LỌC CANDIDATES DỰA TRÊN LAST_COMBO (Ép Joker tuân thủ luật)
    if last_combo and last_combo.get("combo_type") and last_combo.get("combo_type") != "INVALID":
        target_type = last_combo["combo_type"]
        target_len = last_combo["length"]

        if n == target_len:
            # Cùng số lượng lá -> Ép buộc phải khớp đúng loại combo của last_combo
            candidates = [c for c in all_candidates if c[0] == target_type]
        else:
            # Khác số lượng lá -> Chắc chắn đang muốn đánh Hàng (Bomb) để chặt
            valid_bombs = ["FOUR_OF_A_KIND", "3_PAIRS_CHAIN", "4_PAIRS_CHAIN"]
            if joker_mode:
                valid_bombs.append("5_PAIRS_CHAIN")
            candidates = [c for c in all_candidates if c[0] in valid_bombs]
    else:
        # Không có last_combo (vòng mới) -> Cho phép duyệt tự do mọi trường hợp
        candidates = all_candidates

    best_combo, best_highest_card, max_power = None, "", -1

    def can_form(target_ranks):
        for r, c in real_counts.items():
            if r not in target_ranks or c > target_ranks[r]:
                return None, None  # Sửa ở đây (trả về 2 giá trị)

        missing_slots = []
        for r, req_c in target_ranks.items():
            have = real_counts.get(r, 0)
            if have < req_c:
                missing_slots.extend([r] * (req_c - have))

        if len(missing_slots) != len(jokers):
            return None, None  # Sửa ở đây

        joker_suits_available = [j[1] for j in jokers]
        best_h_card = None
        best_transformed = None  # Thêm dòng này
        local_max_pwr = -1

        for p in set(permutations(joker_suits_available)):
            valid = True
            assigned_suits = {r: set(real_suits.get(r, set())) for r in target_ranks.keys()}

            for i, r in enumerate(missing_slots):
                j_suit = p[i]
                if j_suit in assigned_suits[r]:
                    valid = False
                    break
                c_str = rank_to_str(r) + j_suit
                if c_str not in tlmn_dict_deck or tlmn_dict_deck[c_str]["power"] < min_power:
                    valid = False
                    break
                assigned_suits[r].add(j_suit)

            if valid:
                highest_rank = max(target_ranks.keys())
                suits_at_highest = assigned_suits[highest_rank]
                best_suit = max(suits_at_highest, key=suit_power)
                h_card = rank_to_str(highest_rank) + best_suit
                pwr = tlmn_dict_deck[h_card]["power"]

                if pwr > local_max_pwr:
                    local_max_pwr = pwr
                    best_h_card = h_card

                    # Buid lại toàn bộ danh sách bài sau khi Joker biến hình
                    temp_cards = []
                    for r_key, s_set in assigned_suits.items():
                        for s_val in s_set:
                            temp_cards.append(rank_to_str(r_key) + s_val)
                    best_transformed = sort_hand(temp_cards)

        return best_h_card, best_transformed  # Sửa return ở đây

    final_transformed = real_cards + jokers  # Mặc định nếu không có biến hình
    for c_type, t_ranks in candidates:
        h_card, transformed = can_form(t_ranks)  # Nhận 2 giá trị
        if h_card:
            pwr = tlmn_dict_deck[h_card]["power"]
            if pwr > max_power:
                max_power, best_highest_card, best_combo = pwr, h_card, c_type
                final_transformed = transformed  # Lưu mảng bài đã biến hình

    if best_combo:
        # 3. XÁC ĐỊNH THUỘC TÍNH CAN_BOMB VÀ USED_HEO
        rank = tlmn_dict_deck[best_highest_card]["rank"]
        is_bomb = False

        # Trích xuất danh sách các lá Heo thật được sử dụng
        used_heo = [c for c in real_cards if tlmn_dict_deck[c]["rank"] == 15]

        # Heo (Rank 15): 1 Heo, Đôi Heo, hoặc 3 Heo (nếu có Joker)
        if rank == 15 and n in [1, 2]:
            is_bomb = True
        elif rank == 15 and n == 3 and joker_mode:
            is_bomb = True
        # Các loại Hàng (Bao gồm Tứ Quý và Đôi Thông)
        elif best_combo in ["FOUR_OF_A_KIND", "3_PAIRS_CHAIN", "4_PAIRS_CHAIN"]:
            is_bomb = True
        elif best_combo == "5_PAIRS_CHAIN" and joker_mode:
            is_bomb = True

        return {
            "is_valid": True, "combo_type": best_combo,
            "highest_card": best_highest_card, "length": n,
            "can_bomb": is_bomb,
            "used_joker": jokers if joker_mode else [],
            "used_heo": used_heo,
            "transformed_cards": final_transformed,  # <--- DÒNG MỚI NÀY ĐỂ TRẢ VỀ CHO FRONTEND
            "error_message": ""
        }

    invalid_result["error_message"] = "Bộ bài không tạo thành combo hợp lệ hoặc không tuân thủ luật đè"
    return invalid_result


def can_beat_tlmn(last_combo: dict, chosen_combo: dict, joker_mode: bool) -> bool:
    # An toàn: Nếu người đánh là người mở vòng thì luôn hợp lệ
    if not last_combo or last_combo.get("combo_type") is None:
        return True

    type_last = last_combo["combo_type"]
    type_chosen = chosen_combo["combo_type"]

    card_last = last_combo["highest_card"]
    card_chosen = chosen_combo["highest_card"]

    # Ràng buộc dữ liệu
    if not card_last or not card_chosen:
        return False

    power_last = tlmn_dict_deck[card_last]["power"]
    power_chosen = tlmn_dict_deck[card_chosen]["power"]

    # 1. QUY TẮC ĐÈ THÔNG THƯỜNG (Cùng loại, cùng độ dài)
    # Áp dụng cho rác, đôi, xám, sảnh, và cả Hàng đè Hàng (ví dụ: tứ quý lớn đè tứ quý nhỏ)
    if type_chosen == type_last and chosen_combo["length"] == last_combo["length"]:
        return power_chosen > power_last

    # 2. QUY TẮC CHẶT HEO VÀ HÀNG (Khác loại combo)
    # Xác định tính chất của last_combo xem có phải là Heo không
    is_single_heo = (type_last == "SINGLE" and tlmn_dict_deck[card_last]["rank"] == 15)
    is_pair_heo = (type_last == "PAIR" and tlmn_dict_deck[card_last]["rank"] == 15)
    is_triple_heo = (type_last == "TRIPLE" and tlmn_dict_deck[card_last]["rank"] == 15)

    # Xác định xem chosen_combo (Hàng) có thể chặt được last_combo không
    if type_chosen == "3_PAIRS_CHAIN":
        # 3 đôi thông chặt 1 heo lẻ
        if is_single_heo:
            return True

    elif type_chosen == "FOUR_OF_A_KIND":
        # Tứ quý chặt: 1 heo, 2 heo, 3 đôi thông
        if is_single_heo or is_pair_heo or type_last == "3_PAIRS_CHAIN":
            return True

    elif type_chosen == "4_PAIRS_CHAIN":
        # 4 đôi thông chặt: 1 heo, 2 heo, 3 đôi thông, tứ quý
        if is_single_heo or is_pair_heo or type_last == "3_PAIRS_CHAIN" or type_last == "FOUR_OF_A_KIND":
            return True

    elif joker_mode and type_chosen == "5_PAIRS_CHAIN":
        # 5 đôi thông chặt: 1 heo, 2 heo, 3 heo, 3 đôi thông, tứ quý, 4 đôi thông
        if is_single_heo or is_pair_heo or is_triple_heo or \
                type_last == "3_PAIRS_CHAIN" or type_last == "FOUR_OF_A_KIND" or type_last == "4_PAIRS_CHAIN":
            return True

    # Nếu không rơi vào các trường hợp hợp lệ trên thì không thể đè
    return False


def is_chop_action(last_combo: dict, current_combo: dict) -> bool:
    """
    Kiểm tra hành động CHẶT chính xác theo luật:
    - Nước đi hiện tại PHẢI LÀ HÀNG (3 đôi thông, Tứ quý, 4 đôi thông, 5 đôi thông).
    - Bài trên bàn PHẢI LÀ HEO (hoặc chứa Heo) HOẶC LÀ HÀNG.
    - Heo đè Heo -> KHÔNG CHẶT.
    - Heo đè Joker / Đôi đè Đôi Joker -> KHÔNG CHẶT.
    """
    if not last_combo or not last_combo.get("combo_type") or last_combo.get("combo_type") == "INVALID":
        return False
    if not current_combo or not current_combo.get("combo_type") or current_combo.get("combo_type") == "INVALID":
        return False

    last_type = last_combo["combo_type"]
    curr_type = current_combo["combo_type"]

    hang_types = {"3_PAIRS_CHAIN", "FOUR_OF_A_KIND", "4_PAIRS_CHAIN", "5_PAIRS_CHAIN"}

    # Bắt buộc nước đi hiện tại phải là HÀNG
    if curr_type not in hang_types:
        return False

    is_last_heo = False
    if last_combo.get("used_heo") and len(last_combo["used_heo"]) > 0:
        is_last_heo = True
    else:
        h_card = last_combo.get("highest_card", "")
        if h_card and tlmn_dict_deck.get(h_card, {}).get("rank") == 15:
            is_last_heo = True

    is_last_hang = last_type in hang_types

    return is_last_heo or is_last_hang


def is_pig_or_hang(combo: dict) -> bool:
    """Kiểm tra một combo bài trên bàn có phải là Heo hoặc Hàng hay không."""
    if not combo or not combo.get("combo_type") or combo.get("combo_type") == "INVALID":
        return False

    c_type = combo.get("combo_type")
    hang_types = {"3_PAIRS_CHAIN", "FOUR_OF_A_KIND", "4_PAIRS_CHAIN", "5_PAIRS_CHAIN"}
    if c_type in hang_types:
        return True

    if combo.get("used_heo") and len(combo["used_heo"]) > 0:
        return True

    h_card = combo.get("highest_card", "")
    if h_card and tlmn_dict_deck.get(h_card, {}).get("rank") == 15:
        return True

    return False


def can_chop_out_of_turn(hand, top_play, is_joker_mode=False):
    """
    Kiểm tra người chơi có 4 đôi thông (chế độ thường) hoặc 4/5 đôi thông (chế độ Joker)
    để được cấp quyền chặt ngoài lượt (Free turn 15s) hay không.
    """
    if not top_play:
        return False

    # Xác định top_play có phải là Heo hoặc Hàng (3 đôi thông, 4 tứ quý...) không
    # Thay 'is_pig_or_hang' bằng hàm kiểm tra tương ứng trong code của bạn
    if not is_pig_or_hang(top_play):
        return False

    # Lọc tìm 4 đôi thông (hoặc 5 đôi thông nếu bật is_joker_mode) trong hand
    # Thay 'get_all_4_doi_thong' bằng hàm lấy danh sách hàng trong code của bạn
    hang_list = get_all_valid_chops_in_hand(hand, is_joker_mode)

    for hang in hang_list:
        if is_chop_action(hang, top_play):  # Bắt buộc phải lớn hơn top_play mới được chặt
            return True

    return False


def calculate_stack_penalty(current_combo: dict, joker_mode: bool, payment_mode: str) -> float:
    """
    Tính số điểm phạt của combo hiện tại để dồn vào hũ phạt.
    Sảnh (STRAIGHT) trả về 0.0 điểm phạt.
    """
    combo_type = current_combo.get("combo_type", "")

    # Sảnh hoàn toàn không tính điểm phạt vào hũ
    if combo_type == "STRAIGHT":
        return 0.0

    penalty_table = penalty_count_cards if payment_mode == "count_cards" else penalty_winner_takes_all
    total_penalty = 0.0

    used_joker = current_combo.get("used_joker", [])
    used_heo = current_combo.get("used_heo", [])

    combo_map = {
        "5_PAIRS_CHAIN": "5 ĐÔI THÔNG",
        "4_PAIRS_CHAIN": "4 ĐÔI THÔNG",
        "FOUR_OF_A_KIND": "TỨ QUÝ",
        "3_PAIRS_CHAIN": "3 ĐÔI THÔNG",
    }

    # 1. Điểm phạt nếu là Hàng
    if combo_type in combo_map:
        total_penalty += penalty_table.get(combo_map[combo_type], 0)

    # 2. Điểm phạt Heo
    for heo in used_heo:
        if heo in ['2♥', '2♦']:
            total_penalty += penalty_table.get("HEO ĐỎ", 0)
        else:
            total_penalty += penalty_table.get("HEO ĐEN", 0)

    # 3. Điểm phạt Joker (chỉ tính khi bật Joker mode)
    if joker_mode:
        for joker in used_joker:
            if joker in ['X♥', 'X♦']:
                total_penalty += penalty_table.get("JOKER ĐỎ", 0)
            else:
                total_penalty += penalty_table.get("JOKER ĐEN", 0)

    return total_penalty


def check_can_form(real_counts, real_suits, jokers, target_ranks, min_power=-1):
    for r, c in real_counts.items():
        if r not in target_ranks or c > target_ranks[r]:
            return None, None

    missing_slots = []
    for r, req_c in target_ranks.items():
        have = real_counts.get(r, 0)
        if have < req_c:
            missing_slots.extend([r] * (req_c - have))

    if len(missing_slots) != len(jokers):
        return None, None

    joker_suits_available = [j[1] for j in jokers]
    best_h_card = None
    best_transformed = None
    local_max_pwr = -1

    for p in set(permutations(joker_suits_available)):
        valid = True
        assigned_suits = {r: set(real_suits.get(r, set())) for r in target_ranks.keys()}

        for i, r in enumerate(missing_slots):
            j_suit = p[i]
            if j_suit in assigned_suits[r]:
                valid = False
                break
            c_str = rank_to_str(r) + j_suit
            if c_str not in tlmn_dict_deck or tlmn_dict_deck[c_str]["power"] < min_power:
                valid = False
                break
            assigned_suits[r].add(j_suit)

        if valid:
            highest_rank = max(target_ranks.keys())
            suits_at_highest = assigned_suits[highest_rank]
            best_suit = max(suits_at_highest, key=suit_power)
            h_card = rank_to_str(highest_rank) + best_suit
            pwr = tlmn_dict_deck[h_card]["power"]

            if pwr > local_max_pwr:
                local_max_pwr = pwr
                best_h_card = h_card

                temp_cards = []
                for r_key, s_set in assigned_suits.items():
                    for s_val in s_set:
                        temp_cards.append(rank_to_str(r_key) + s_val)
                best_transformed = sort_hand(temp_cards)

    return best_h_card, best_transformed


def generate_combo_description(c_type, t_ranks, h_card):
    """Tạo tên hiển thị thân thiện cho Frontend (ví dụ: Sảnh 5 - 8 (Lá cao nhất 8♣))."""
    r_min = rank_to_str(min(t_ranks.keys()))
    r_max = rank_to_str(max(t_ranks.keys()))

    if c_type == "STRAIGHT":
        return f"Sảnh {r_min} đến {r_max} (Lá cao nhất: {h_card})"
    elif c_type == "SINGLE":
        return f"Lá lẻ {r_max} ({h_card})"
    elif c_type == "PAIR":
        return f"Đôi {r_max} (Lá cao nhất: {h_card})"
    elif c_type == "TRIPLE":
        return f"Xám cô {r_max} (Lá cao nhất: {h_card})"
    elif c_type == "FOUR_OF_A_KIND":
        return f"Tứ quý {r_max} (Lá cao nhất: {h_card})"
    elif "_PAIRS_CHAIN" in c_type:
        num = c_type.split('_')[0]
        return f"{num} Đôi thông {r_min}-{r_max} (Lá cao nhất: {h_card})"
    return f"{c_type} (Lá cao nhất: {h_card})"


def get_joker_options(chosen_cards: list[str], joker_mode: bool = False, last_combo: dict = None) -> list[dict]:
    """Tìm tất cả các cách biến hình hợp lệ khi bộ bài chọn có chứa Joker."""
    n = len(chosen_cards)
    jokers = [c for c in chosen_cards if c.startswith('X')]

    # Nếu không có Joker, chỉ có 1 cách xếp tiêu chuẩn
    if not jokers or not joker_mode:
        parsed = parse_combo_tlmn(chosen_cards, joker_mode=joker_mode, last_combo=last_combo)
        if parsed["is_valid"] and can_beat_tlmn(last_combo, parsed, joker_mode):
            parsed["description"] = generate_combo_description(parsed["combo_type"], {tlmn_dict_deck[parsed["highest_card"]]["rank"]: 1}, parsed["highest_card"])
            return [parsed]
        return []

    real_cards = [c for c in chosen_cards if not c.startswith('X')]
    real_counts, real_suits = {}, {}
    for c in real_cards:
        rank, suit = tlmn_dict_deck[c]["rank"], tlmn_dict_deck[c]["suit"]
        real_counts[rank] = real_counts.get(rank, 0) + 1
        if rank not in real_suits:
            real_suits[rank] = set()
        real_suits[rank].add(suit)

    # Khởi tạo toàn bộ danh sách Candidate
    all_candidates = []
    if n == 1:
        for r in range(3, 16):
            all_candidates.append(("SINGLE", {r: 1}))
    elif n == 2:
        for r in range(3, 16):
            all_candidates.append(("PAIR", {r: 2}))
    elif n == 3:
        for r in range(3, 16):
            all_candidates.append(("TRIPLE", {r: 3}))
    elif n == 4:
        for r in range(3, 16):
            all_candidates.append(("FOUR_OF_A_KIND", {r: 4}))

    if n >= 3:
        for r in range(3, 16 - n):
            all_candidates.append(("STRAIGHT", {k: 1 for k in range(r, r + n)}))

    if n >= 6 and n % 2 == 0:
        num_pairs = n // 2
        chain_name = f"{num_pairs}_PAIRS_CHAIN"
        for r in range(3, 16 - num_pairs):
            all_candidates.append((chain_name, {k: 2 for k in range(r, r + num_pairs)}))

    # Lọc Candidates theo luật đè bài của last_combo
    if last_combo and last_combo.get("combo_type") and last_combo.get("combo_type") != "INVALID":
        target_type = last_combo["combo_type"]
        target_len = last_combo["length"]
        if n == target_len:
            candidates = [c for c in all_candidates if c[0] == target_type]
        else:
            valid_bombs = ["FOUR_OF_A_KIND", "3_PAIRS_CHAIN", "4_PAIRS_CHAIN", "5_PAIRS_CHAIN"]
            candidates = [c for c in all_candidates if c[0] in valid_bombs]
    else:
        candidates = all_candidates

    valid_options = []
    seen_keys = set()
    min_power = 1

    for c_type, t_ranks in candidates:
        skip_candidate = False
        for r, req_c in real_counts.items():
            if r not in t_ranks or req_c > t_ranks[r]:
                skip_candidate = True
                break
        if skip_candidate:
            continue

        h_card, transformed = check_can_form(real_counts, real_suits, jokers, t_ranks, min_power)
        if h_card:
            rank = tlmn_dict_deck[h_card]["rank"]
            is_bomb = False
            used_heo = [c for c in real_cards if tlmn_dict_deck[c]["rank"] == 15]

            if rank == 15 and n in [1, 2, 3]:
                is_bomb = True
            elif c_type in ["FOUR_OF_A_KIND", "3_PAIRS_CHAIN", "4_PAIRS_CHAIN", "5_PAIRS_CHAIN"]:
                is_bomb = True

            parsed_option = {
                "is_valid": True,
                "combo_type": c_type,
                "highest_card": h_card,
                "length": n,
                "can_bomb": is_bomb,
                "used_joker": jokers,
                "used_heo": used_heo,
                "transformed_cards": transformed if transformed else chosen_cards,
                "error_message": ""
            }

            if can_beat_tlmn(last_combo, parsed_option, joker_mode):
                unique_key = f"{c_type}_{min(t_ranks.keys())}_{max(t_ranks.keys())}"
                if unique_key not in seen_keys:
                    seen_keys.add(unique_key)
                    parsed_option["description"] = generate_combo_description(c_type, t_ranks, h_card)
                    valid_options.append(parsed_option)

    return valid_options
