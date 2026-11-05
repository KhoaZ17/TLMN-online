"""
BỘ NÃO BOT TIẾN LÊN MIỀN NAM (heuristic) — bản viết lại "kỳ vọng chip".

Ý tưởng chính (giữ tinh hoa của bản 7.1 và bổ sung):
  1. Mỗi nước đi (kể cả bỏ lượt) được chấm bằng KỲ VỌNG CHIP:
        EV = P(thắng) * (tiền thu từ 3 đối thủ) - P(thua) * (tiền đền) - rủi ro bị chặt + tiền chặt được ...
     chứ không cộng trừ điểm rời rạc, nên các hệ số tự "trượt mượt" theo tình huống (như tinh thần fuzzy của bản 7.1).
  2. "Nhịp" của tay bài = số nước tối thiểu để đánh hết (quy hoạch động trên số lá theo hạng, có Joker làm lá vạn năng),
     mỗi tổ hợp được tính nhẹ hơn nếu nó khó bị đè (so với các lá CHƯA LỘ: bài đã đánh + bài trên tay mình).
     Đây là phiên bản chính xác của `estimate_hand_steps` + `check_is_absolute_boss` trong bản cũ.
  3. P(thắng) lấy từ cuộc đua nhịp độ (mình vs từng đối thủ, theo số lá còn lại của họ).
  4. Phạt khi thua lấy từ chính `normal_win_payment` (Heo, Hàng, Joker, cóng x2, giữ 3♠ x3...), nên bot tự biết
     lúc nào nên xả Heo / Tứ quý / tránh cóng / xả 3♠.
  5. Rủi ro bị chặt tính CHÍNH XÁC theo các lá chưa lộ (đối thủ nào còn khả năng có Tứ quý / Đôi thông, người đã
     bỏ lượt chỉ còn chặt được bằng 4-5 đôi thông), nhân với hũ phạt hiện tại. Tiền chặt được cũng được cộng vào.
  6. Đối thủ chỉ còn 1 lá: tự động ưu tiên bộ nhiều lá / lá đơn cao nhất, bắt buộc đè khi họ đang giữ quyền.
  7. Không bao giờ ném lỗi ra ngoài: có nước đi dự phòng an toàn.

Giao diện (khớp app_controller hiện tại):
    TLMN_AI_Brain(seat, joker_mode, payment_mode, cost)
    reset_match(num_players)
    observe_turn(player_id, action_cards, hand_lengths, stack_penalty, last_combo=None, **kw)
    choose_best_action(legal_actions, hand, last_combo, has_pass, current_stack_penalty=0.0) -> chỉ số trong legal_actions
    choose_joker_option(options) -> chỉ số option Joker nên dùng (tuỳ chọn, controller gọi nếu có)
`stack_penalty` / `current_stack_penalty` tính bằng CHIP (env.stack_penalty). Nếu controller chưa truyền thì bot tự theo dõi.
"""
import math
import os
import random
import time

import tlmn_rules
from tlmn_rules import (
    tlmn_dict_deck,
    default_deck,
    parse_combo_tlmn,
    normal_win_payment,
    calculate_stack_penalty,
    get_joker_options,
)

_POW = {c: d["power"] for c, d in tlmn_dict_deck.items()}
_RK = {c: d["rank"] for c, d in tlmn_dict_deck.items()}
_SU = {c: d["suit"] for c, d in tlmn_dict_deck.items()}
_REAL = list(default_deck)
_BY_RANK = {r: [c for c in _REAL if _RK[c] == r] for r in range(3, 16)}
_SUITS = ["♠", "♣", "♦", "♥"]
_JOKER_HEO_POW = {"♠": 49, "♣": 50, "♦": 51, "♥": 52}
_HANG = {"3_PAIRS_CHAIN", "FOUR_OF_A_KIND", "4_PAIRS_CHAIN", "5_PAIRS_CHAIN"}
_KIND_N = {1: "S", 2: "P", 3: "T", 4: "Q"}
_KIND_OF_TYPE = {"SINGLE": "S", "PAIR": "P", "TRIPLE": "T", "FOUR_OF_A_KIND": "Q", "STRAIGHT": "R"}

# Số nước tối thiểu trung bình của một tay h lá ngẫu nhiên (đo bằng mô phỏng) — dùng làm "nhịp" của đối thủ.
_TEMPO = [0.0, 1.0, 1.93, 2.77, 3.49, 4.01, 4.51, 4.87, 5.26, 5.52, 5.75, 6.04, 6.14, 6.40, 6.7]

DEFAULTS = dict(
    q_beat=0.75,       # đối thủ có bài đè được thì thực sự đè với xác suất này
    c0=0.7,            # "giá nhịp" của tổ hợp không thể bị đè (tổ hợp dễ bị đè giá 1.0)
    ctl=0.0,           # thưởng nhịp khi giữ được quyền đánh tiếp
    joker_use=0.25,    # giá nhịp mỗi Joker bị dùng làm lá thế
    soft=1.3,          # độ "mềm" của cuộc đua nhịp (softmax)
    opp_disc=0.9,      # hệ số nhịp đối thủ
    g_reg=0.6,         # phần lá thường còn trên tay tới lúc thua thật (còn đánh thêm trước khi ván kết thúc)
    g_spec=0.25,       # phần phạt Heo/Joker/Hàng còn trên tay tới lúc thua (hay xả được khi cần nên nhỏ)
    g3=0.5,            # xác suất vẫn còn giữ 3♠ (x3) lúc thua
    shed=1.3,          # số lá đối thủ đánh bớt trong mỗi nhịp của mình (để ước lượng tiền thu khi mình thắng)
    g_opp_spec=0.5,    # phần phạt Heo/Joker đối thủ còn giữ lúc mình thắng
    w_cong=0.1,        # xác suất đối thủ chưa đánh lá nào vẫn bị cóng khi mình thắng
    chop_q=0.9,        # có hàng chặt được thì chặt
    chop_w=1.0,        # trọng số rủi ro bị chặt
    gain_w=1.0,        # trọng số tiền chặt được
    hold_w=4.0,        # trọng số "dự trữ hàng": không phí hàng mạnh để chặt hũ nhỏ khi còn chờ được hũ lớn
    hold_T=30.0,       # hũ "đáng giá" để dành hàng (đơn vị giá lá): hũ nhỏ hơn mức này thì hàng mạnh nên chờ
    hold_cap3=0.3,     # mức quý của 3 đôi thông / tứ quý / 4-5 đôi thông khi dự trữ
    hold_capq=0.5,
    hold_cap4=0.8,
    hold_opp=4,        # đối thủ còn <= số lá này thì không còn dự trữ hàng nữa
    topk=14,           # số nước đi được chấm chính xác (phạt thật) sau vòng lọc nhanh
    noise=0.0,
    debug=False,
)


def _tail(need, u, f):
    """P(Binomial(u, f) >= need)."""
    if need <= 0:
        return 1.0
    if u < need or f <= 0.0:
        return 0.0
    if f >= 1.0:
        return 1.0
    tot = 0.0
    q = 1.0 - f
    for k in range(need, u + 1):
        tot += math.comb(u, k) * (f ** k) * (q ** (u - k))
    return tot


class _Ctx:
    pass


class TLMN_AI_Brain:
    def __init__(self, seat, joker_mode=False, payment_mode="count_cards", cost=1000, **params):
        self.seat = seat
        self.joker_mode = bool(joker_mode)
        self.payment_mode = payment_mode
        self.cost = cost
        self.P = dict(DEFAULTS)
        self.P.update(params)
        if os.environ.get("TLMN_BOT_DEBUG"):
            self.P["debug"] = True
        self.rng = random.Random(seat * 104729 + 17)
        self.max_cards = 14 if self.joker_mode else 13
        self.n = 4
        self.last_error = None
        self._clear()

    # ------------------------------------------------------------------ theo dõi ván
    def seed(self, s):
        self.rng.seed(s)

    def _clear(self):
        self.hl = {}
        self.seen = {}
        self.owner = None
        self.passed = set()
        self.pot = 0.0
        self.played_any = {}
        self.cur = None

    def reset_match(self, num_players):
        self.n = num_players
        self.max_cards = 14 if self.joker_mode else 13
        self._clear()
        self.hl = {p: self.max_cards for p in range(num_players)}
        self.played_any = {p: False for p in range(num_players)}

    def observe_turn(self, player_id, action_cards, hand_lengths, stack_penalty, last_combo=None, **kw):
        try:
            self._observe(player_id, action_cards, hand_lengths, stack_penalty)
        except Exception as e:  # theo dõi lỗi không được làm hỏng ván
            self.last_error = repr(e)
            if self.P["debug"]:
                raise

    def _observe(self, pid, cards, hand_lengths, stack_penalty):
        for p, v in hand_lengths.items():
            self.hl[int(p)] = v
        unit = max(1, self.cost)
        self.pot = (stack_penalty or 0.0) / unit
        if cards:
            self.played_any[pid] = True
            for c in cards:
                self.seen[c] = self.seen.get(c, 0) + 1
            pc = parse_combo_tlmn(list(cards), joker_mode=self.joker_mode)
            self.cur = pc if pc.get("is_valid") else None
            self.owner = pid
            self.passed.discard(pid)
        else:
            self.passed.add(pid)
        nxt = (pid + 1) % self.n
        if self.owner is not None and nxt == self.owner and not cards:
            # hết vòng: chủ bài được đánh tiếp, bàn sạch, hũ phạt đã chốt
            self.cur = None
            self.owner = None
            self.passed = set()
            self.pot = 0.0

    # ------------------------------------------------------------------ API chính
    def choose_best_action(self, legal_actions, hand, last_combo, has_pass, current_stack_penalty=0.0):
        try:
            idx = self._choose(legal_actions, list(hand), last_combo, current_stack_penalty)
            if idx is not None and 0 <= idx < len(legal_actions):
                return idx
        except Exception as e:
            self.last_error = repr(e)
            if self.P["debug"]:
                raise
        return self._fallback(legal_actions)

    def choose_joker_option(self, options, hand=None, last_combo=None):
        """Joker có nhiều cách biến hình: chọn cách cho lá cao nhất mạnh nhất (khó bị đè nhất, không tốn thêm gì)."""
        best, bp = 0, -1
        for i, o in enumerate(options):
            p = _POW.get(o.get("highest_card", ""), 0)
            if p > bp:
                bp, best = p, i
        return best

    def _fallback(self, legal_actions):
        if not legal_actions:
            return 0
        acts = [(i, a) for i, a in enumerate(legal_actions) if a]
        if not acts:
            return 0
        best = None
        for i, a in acts:
            pw = max((_POW.get(c, 60) for c in a), default=60)
            key = (len(a) == 1 and a[0].startswith("X"), pw)
            if best is None or key < best[0]:
                best = (key, i)
        return best[1]

    # ------------------------------------------------------------------ bối cảnh một lần quyết định
    def _context(self, hand, last_combo, stack_pen):
        cx = _Ctx()
        cx.hand = hand
        hs = set(hand)
        cx.hs = hs
        cnt = [0] * 13
        mp = {}
        J = 0
        for c in hand:
            if c.startswith("X"):
                J += 1
            else:
                r = _RK[c]
                cnt[r - 3] += 1
                if _POW[c] > mp.get(r, 0):
                    mp[r] = _POW[c]
        cx.counts = tuple(cnt)
        cx.J = J if self.joker_mode else 0
        cx.mp = mp
        cx.mp_default = {r: _POW[_BY_RANK[r][2]] for r in range(3, 16)}
        # lá chưa lộ
        dead = set()
        for c, k in self.seen.items():
            if c.startswith("X"):
                continue
            if k >= 2 or c in hs:
                dead.add(_SU[c])
        u = {}
        ucards = {}
        for r in range(3, 16):
            lst = [c for c in _BY_RANK[r] if c not in hs and self.seen.get(c, 0) == 0]
            ucards[r] = lst
            u[r] = len(lst)
        cx.u = u
        cx.ucards = ucards
        if self.joker_mode:
            cx.jalive = [s for s in _SUITS if ("X" + s) not in hs and s not in dead]
        else:
            cx.jalive = []
        cx.pending = last_combo if last_combo else None
        cx.lead = cx.pending is None
        cx.pot = max(self.pot, (stack_pen or 0.0) / max(1, self.cost))
        opps = []
        nu = 0
        for p in range(self.n):
            if p == self.seat:
                continue
            h = self.hl.get(p, self.max_cards)
            nu += h
            opps.append({"seat": p, "h": h, "passed": (p in self.passed) and not cx.lead,
                         "played": self.played_any.get(p, True)})
        # số lá chưa lộ (bàn 2-3 người còn lá không ai cầm nên KHÔNG bằng tổng bài đối thủ)
        nu = max(1, nu, sum(u.values()) + len(cx.jalive))
        cx.nu = nu
        for o in opps:
            o["f"] = min(1.0, o["h"] / nu)
        cx.opps = opps
        cx.live = [o for o in opps if o["h"] > 0]
        cx.exposed = [o for o in cx.live if not o["passed"]]
        cx.owner = self.owner if not cx.lead else None
        cx.memo = {}
        cx.ccache = {}
        cx.scache = {}
        cx.penc = {}
        cx.dcache = {}
        cx.hcache = {}
        # bảng phạt
        if self.payment_mode == "count_cards":
            cx.heo = {"♠": 10, "♣": 10, "♦": 20, "♥": 20}
            cx.jok = {"♠": 15, "♣": 15, "♦": 25, "♥": 25}
        else:
            cx.heo = {"♠": 1, "♣": 1, "♦": 2, "♥": 2}
            cx.jok = {"♠": 1.5, "♣": 1.5, "♦": 2.5, "♥": 2.5}
        cx.spec_unseen = sum(cx.heo[_SU[c]] for c in cx.ucards.get(15, [])) + sum(cx.jok[s] for s in cx.jalive)
        cx.has3_unseen = ("3♠" not in cx.hs) and self.seen.get("3♠", 0) == 0
        return cx

    def _W(self, cx, t_me):
        """Số đơn vị 3 đối thủ đền cho mình nếu mình thắng sau khoảng t_me nhịp nữa."""
        P = self.P
        tot = 0.0
        cc = self.payment_mode == "count_cards"
        for o in cx.opps:
            h = max(1.0, o["h"] - P["shed"] * t_me)
            f = o["f"]
            base = h if cc else 1.0
            spec = f * cx.spec_unseen * P["g_opp_spec"]
            mult = 1.0
            if (not o["played"]) and o["h"] >= self.max_cards:
                mult += P["w_cong"]
            if cx.has3_unseen:
                mult *= (1.0 + 2.0 * f * P["g3"])
            tot += (base + spec) * mult
        return tot

    # ------------------------------------------------------------------ quy hoạch động "nhịp"
    def _dp(self, cx, cnt, J, unit=False):
        key = (cnt, J, unit)
        v = cx.memo.get(key)
        if v is not None:
            return v
        i = 0
        while i < 13 and cnt[i] == 0:
            i += 1
        if i == 13:
            if J == 0:
                v = 0.0
            else:
                v = (J // 2) * self._ccost(cx, "P", 15, 15, 1, 0, jk=True, unit=unit) + (J % 2) * self._ccost(cx, "S", 15, 15, 1, 0, jk=True, unit=unit)
            cx.memo[key] = v
            return v
        r = i + 3
        c = cnt[i]
        best = 1e9
        maxn = 3 if r == 15 else 4
        for t in range(1, min(c, maxn) + 1):
            nc = cnt[:i] + (c - t,) + cnt[i + 1:]
            val = self._ccost(cx, _KIND_N[t], r, r, 1, 0, unit=unit) + self._dp(cx, nc, J, unit)
            if val < best:
                best = val
            if t == c and J > 0:
                for j in range(1, J + 1):
                    n = t + j
                    if n > maxn:
                        break
                    val = self._ccost(cx, _KIND_N[n], r, r, 1, j, unit=unit) + self._dp(cx, nc, J - j, unit)
                    if val < best:
                        best = val
        if r <= 14:
            # sảnh: bắt đầu s <= r, phải chứa lá thật hạng r
            for s in range(max(3, r - J), r + 1):
                mj = r - s
                if mj > J:
                    continue
                nc = list(cnt)
                for k in range(r, 15):
                    if cnt[k - 3] > 0:
                        nc[k - 3] = cnt[k - 3] - 1
                    else:
                        mj += 1
                        if mj > J:
                            break
                    L = k - s + 1
                    if L >= 3:
                        val = self._ccost(cx, "R", s, k, L, mj, unit=unit) + self._dp(cx, tuple(nc), J - mj, unit)
                        if val < best:
                            best = val
            # đôi thông
            maxp = 5 if self.joker_mode else 4
            for s in range(max(3, r - J), r + 1):
                mj = 2 * (r - s)
                if mj > J:
                    continue
                nc = list(cnt)
                for k in range(r, 15):
                    take = min(cnt[k - 3], 2)
                    mj += 2 - take
                    if mj > J:
                        break
                    nc[k - 3] = cnt[k - 3] - take
                    P_ = k - s + 1
                    if P_ > maxp:
                        break
                    if P_ >= 3:
                        val = self._ccost(cx, "C", s, k, P_, mj, unit=unit) + self._dp(cx, tuple(nc), J - mj, unit)
                        if val < best:
                            best = val
        cx.memo[key] = best
        return best

    def _ccost(self, cx, kind, lo, hi, L, mj, jk=False, unit=False):
        key = (kind, lo, hi, L, mj, jk, unit)
        v = cx.ccache.get(key)
        if v is not None:
            return v
        if unit:
            v = 1.0 + self.P["joker_use"] * mj
            cx.ccache[key] = v
            return v
        pw = 50.5 if jk else cx.mp.get(hi, cx.mp_default[hi])
        s = self._survive(cx, kind, lo, hi, L, pw, cx.live)
        P = self.P
        v = P["c0"] + (1.0 - P["c0"]) * (1.0 - s) + P["joker_use"] * mj
        cx.ccache[key] = v
        return v

    # ------------------------------------------------------------------ xác suất bị đè
    def _n_stronger(self, cx, pw):
        k = 0
        for r in range(3, 16):
            for c in cx.ucards[r]:
                if _POW[c] > pw:
                    k += 1
        for s in cx.jalive:
            if _JOKER_HEO_POW[s] > pw:
                k += 1
        return k

    def _p_hold_joker(self, cx, f):
        ja = len(cx.jalive)
        return 1.0 - (1.0 - f) ** ja if ja else 0.0

    def _p_beat(self, cx, f, kind, lo, hi, L, pw):
        """P(một đối thủ (mỗi lá chưa lộ rơi vào tay họ với xác suất f) giữ tổ hợp CÙNG LOẠI đè được)."""
        u = cx.u
        if kind == "S":
            k = self._n_stronger(cx, pw)
            return 1.0 - (1.0 - f) ** k if k else 0.0
        jf = self._p_hold_joker(cx, f)
        if kind in ("P", "T", "Q"):
            n = {"P": 2, "T": 3, "Q": 4}[kind]
            miss = 1.0
            for r2 in range(hi, 16):
                if r2 == 15 and kind == "Q":
                    continue
                if r2 == hi:
                    if not any(_POW[c] > pw for c in cx.ucards[r2]):
                        continue
                ur = u[r2]
                p = _tail(n, ur, f)
                if jf > 0:
                    p += jf * max(0.0, _tail(n - 1, ur, f) - p)
                miss *= 1.0 - min(1.0, p)
            return 1.0 - miss
        if kind == "R":
            miss = 1.0
            for t in range(hi, 15):
                if t - L + 1 < 3:
                    continue
                p = 1.0
                for r2 in range(t - L + 1, t + 1):
                    if r2 == hi and t == hi:
                        ur = sum(1 for c in cx.ucards[r2] if _POW[c] > pw)
                    else:
                        ur = u[r2]
                    a = 1.0 - (1.0 - f) ** ur
                    if jf > 0:
                        a += (1.0 - a) * 0.5 * jf
                    p *= a
                    if p <= 0.0:
                        break
                miss *= 1.0 - p
            return 1.0 - miss
        if kind == "C":
            miss = 1.0
            for t in range(hi, 15):
                if t - L + 1 < 3:
                    continue
                p = 1.0
                for r2 in range(t - L + 1, t + 1):
                    if r2 == hi and t == hi:
                        if not any(_POW[c] > pw for c in cx.ucards[r2]):
                            p = 0.0
                            break
                    a = _tail(2, u[r2], f)
                    if jf > 0:
                        a += jf * max(0.0, _tail(1, u[r2], f) - a)
                    p *= a
                    if p <= 0.0:
                        break
                miss *= 1.0 - p
            return 1.0 - miss
        return 0.0

    def _p_quad(self, cx, f, above_rank=2):
        """P(đối thủ giữ trọn một Tứ quý hạng > above_rank) (chỉ tính hạng còn đủ 4 lá chưa lộ)."""
        k = 0
        for r in range(max(3, above_rank + 1), 15):
            if cx.u[r] == 4:
                k += 1
        if not k:
            return 0.0
        return 1.0 - (1.0 - f ** 4) ** k

    def _p_chain(self, cx, f, k, above_top=2, strict_top_pw=None):
        """P(đối thủ giữ k đôi thông có hạng đầu trên > above_top)."""
        miss = 1.0
        for t in range(max(3 + k - 1, above_top + 1), 15):
            p = 1.0
            for r2 in range(t - k + 1, t + 1):
                p *= _tail(2, cx.u[r2], f)
                if p <= 0:
                    break
            miss *= 1.0 - p
        return 1.0 - miss

    def _p_hang_beats(self, cx, f, kind, hi, L, heo_n, only_chain4=False):
        """P(đối thủ có HÀNG chặt/đè được tổ hợp này). heo_n>0: tổ hợp chứa Heo (1/2/3 lá)."""
        jm = self.joker_mode
        if kind in ("S", "P", "T") and heo_n > 0:
            if heo_n == 1:
                ps = [("q", 0), ("c", 3), ("c", 4)] + ([("c", 5)] if jm else [])
            elif heo_n == 2:
                ps = [("q", 0), ("c", 4)] + ([("c", 5)] if jm else [])
            else:
                ps = [("c", 5)] if jm else []
        elif kind == "Q":
            ps = [("q", hi), ("c", 4)] + ([("c", 5)] if jm else [])
        elif kind == "C":
            if L == 3:
                ps = [("q", 0), ("c", 3), ("c", 4)] + ([("c", 5)] if jm else [])
            elif L == 4:
                ps = [("c", 4)] + ([("c", 5)] if jm else [])
            else:
                ps = [("c", 5)] if jm else []
        else:
            return 0.0
        miss = 1.0
        for typ, arg in ps:
            if only_chain4 and not (typ == "c" and arg >= 4):
                continue
            if typ == "q":
                p = self._p_quad(cx, f, arg)
            else:
                if arg == L and kind == "C":
                    p = self._p_chain(cx, f, arg, above_top=hi)
                else:
                    p = self._p_chain(cx, f, arg)
            miss *= 1.0 - p
        return 1.0 - miss

    def _survive(self, cx, kind, lo, hi, L, pw, opps, heo_n=None):
        key = (kind, lo, hi, L, int(pw), tuple((o["seat"], o["passed"]) for o in opps))
        v = cx.scache.get(key)
        if v is not None:
            return v
        q = self.P["q_beat"]
        s = 1.0
        if heo_n is None:
            heo_n = (1 if kind == "S" else 2 if kind == "P" else 3 if kind == "T" else 0) if hi == 15 else 0
        for o in opps:
            f = o["f"]
            p = self._p_beat(cx, f, kind, lo, hi, L, pw)
            ph = self._p_hang_beats(cx, f, kind, hi, L, heo_n)
            p = 1.0 - (1.0 - p) * (1.0 - ph)
            s *= 1.0 - q * p
        cx.scache[key] = s
        return s

    # ------------------------------------------------------------------ mô tả nước đi
    def _describe(self, cx, act):
        key = tuple(act)
        d = cx.dcache.get(key)
        if d is not None:
            return d
        n = len(act)
        nj = sum(1 for c in act if c.startswith("X"))
        d = None
        if nj == 0:
            rs = sorted(_RK[c] for c in act)
            hc = max(act, key=_POW.get)
            hp, hr = _POW[hc], _RK[hc]
            if n == 1:
                typ, kind, lo, hi, L = "SINGLE", "S", rs[0], rs[0], 1
            elif rs[0] == rs[-1]:
                typ = {2: "PAIR", 3: "TRIPLE", 4: "FOUR_OF_A_KIND"}[n]
                kind = _KIND_N[n]
                lo = hi = rs[0]
                L = 1
            elif len(set(rs)) == n:
                typ, kind, lo, hi, L = "STRAIGHT", "R", rs[0], rs[-1], n
            else:
                k = n // 2
                typ, kind, lo, hi, L = f"{k}_PAIRS_CHAIN", "C", rs[0], rs[-1], k
            heos = [c for c in act if _RK[c] == 15]
            pot = calculate_stack_penalty(
                {"combo_type": typ, "used_joker": [], "used_heo": heos}, self.joker_mode, self.payment_mode)
            d = dict(cards=act, n=n, typ=typ, kind=kind, lo=lo, hi=hi, L=L, hp=hp, hr=hr, heo=len(heos),
                     hang=typ in _HANG, nj=0, pot=pot)
        else:
            opts = get_joker_options(list(act), self.joker_mode, cx.pending)
            if opts:
                o = opts[self.choose_joker_option(opts)]
                typ = o["combo_type"]
                tr = o.get("transformed_cards") or list(act)
                rs = sorted(_RK[c] for c in tr)
                hc = o["highest_card"]
                hp, hr = _POW[hc], _RK[hc]
                if typ in _KIND_OF_TYPE:
                    kind = _KIND_OF_TYPE[typ]
                    if kind == "R":
                        lo, hi, L = rs[0], rs[-1], n
                    else:
                        lo = hi = rs[0]
                        L = 1
                elif typ.endswith("_PAIRS_CHAIN"):
                    kind = "C"
                    lo, hi, L = rs[0], rs[-1], n // 2
                else:
                    kind, lo, hi, L = "S", hr, hr, 1
                heos = [c for c in tr if _RK[c] == 15]
                pot = calculate_stack_penalty(o, self.joker_mode, self.payment_mode)
                d = dict(cards=act, n=n, typ=typ, kind=kind, lo=lo, hi=hi, L=L, hp=hp, hr=hr, heo=len(heos),
                         hang=typ in _HANG, nj=nj, pot=pot)
        cx.dcache[key] = d
        return d

    # ------------------------------------------------------------------ phạt khi thua
    def _pen_exact(self, cx, after):
        key = tuple(sorted(after))
        v = cx.penc.get(key)
        if v is None:
            if not after:
                v = 0.0
            else:
                r = normal_win_payment(after, self.payment_mode, self.cost, self.joker_mode, None)
                v = r["penalty_amount"] / max(1, self.cost)
            cx.penc[key] = v
        return v

    def _pen_parts(self, cx, after, exact):
        """(lá thường, phần đặc biệt Heo/Joker/Hàng, hệ số cóng, có 3♠) của tay `after`."""
        if not after:
            return 0.0, 0.0, 1.0, 0
        cc = self.payment_mode == "count_cards"
        cong = len(after) >= self.max_cards
        has3 = 1 if "3♠" in after else 0
        mult = (2.0 if cong else 1.0) * (3.0 if has3 else 1.0)
        if exact:
            base = self._pen_exact(cx, after) / mult
        else:
            base = (0.0 if cc else 1.0)
            for c in after:
                if c.startswith("X"):
                    base += cx.jok[c[1]]
                elif _RK[c] == 15:
                    base += cx.heo[_SU[c]]
                elif cc:
                    base += 1.0
        reg = 0.0
        if cc:
            reg = sum(1 for c in after if not c.startswith("X") and _RK[c] != 15)
        else:
            reg = 1.0
        spec = max(0.0, base - reg)
        return min(reg, base), spec, (2.0 if cong else 1.0), has3

    def _pen_approx(self, cx, after):
        if not after:
            return 0.0
        cc = self.payment_mode == "count_cards"
        tot = 0.0 if cc else 1.0
        for c in after:
            if c.startswith("X"):
                tot += cx.jok[c[1]]
            elif _RK[c] == 15:
                tot += cx.heo[_SU[c]]
            elif cc:
                tot += 1.0
        mult = 1.0
        if len(after) >= self.max_cards:
            mult *= 2.0
        if "3♠" in after:
            mult *= 3.0
        return tot * mult

    # ------------------------------------------------------------------ chấm điểm
    def _after(self, cx, d):
        if d is None:
            return cx.hand, cx.counts, cx.J
        rem = set(d["cards"])
        after = [c for c in cx.hand if c not in rem]
        cnt = list(cx.counts)
        J = cx.J
        for c in d["cards"]:
            if c.startswith("X"):
                J -= 1
            else:
                cnt[_RK[c] - 3] -= 1
        return after, tuple(cnt), J

    def _sure_win(self, cx, d):
        """Đánh d (không thể bị đè) rồi còn đúng 1 tổ hợp => lượt sau đánh nốt là thắng chắc."""
        if d is None or not self.P.get("sure", True):
            return False
        after, counts, J = self._after(cx, d)
        if self._dp(cx, counts, J, True) > 1.0 + 1e-9:
            return False
        s = self._survive(cx, d["kind"], d["lo"], d["hi"], d["L"], d["hp"], cx.exposed, heo_n=d["heo"])
        return s >= self.P.get("sure_s", 0.97)

    def _ev(self, cx, d, exact):
        if self._sure_win(cx, d):
            return 1000.0 + len(d["cards"])
        P = self.P
        after, counts, J = self._after(cx, d)
        t_plan = self._dp(cx, counts, J)
        s = 0.0
        if d is not None:
            s = self._survive(cx, d["kind"], d["lo"], d["hi"], d["L"], d["hp"], cx.exposed, heo_n=d["heo"])
        t_me = max(0.0, t_plan - P["ctl"] * s)
        w_me = math.exp(-t_me / P["soft"])
        den = w_me
        for o in cx.live:
            den += math.exp(-_TEMPO[min(o["h"], 14)] * P["opp_disc"] / P["soft"])
        pw = w_me / den
        reg, spec, cong, has3 = self._pen_parts(cx, after, exact)
        pen_now = (reg + spec) * cong * (1.0 + 2.0 * has3)
        loss_later = (P["g_reg"] * reg + P["g_spec"] * spec) * cong * (1.0 + 2.0 * P["g3"] * has3)
        pimm = self._pimm(cx, d)
        ev = (1.0 - pimm) * (pw * self._W(cx, t_me) - (1.0 - pw) * loss_later) - pimm * pen_now
        if d is not None:
            ev += self._chop_terms(cx, d)
        return ev

    def _pimm(self, cx, d):
        """P(thua NGAY): đối thủ còn đúng 1 lá đè được bài mình đánh / mình bỏ qua bài họ đang giữ quyền."""
        pimm = 1.0
        for o in cx.live:
            if o["h"] != 1:
                continue
            p = 0.0
            if d is None:
                pend = cx.pending
                if cx.owner == o["seat"]:
                    others = [x for x in cx.exposed if x["seat"] != o["seat"]]
                    pp = pend or {}
                    kind, lo, hi, L = self._pending_shape(pp)
                    p = self._survive(cx, kind, lo, hi, L, _POW.get(pp.get("highest_card", ""), 0), others,
                                      heo_n=len(pp.get("used_heo") or []))
                elif not o["passed"] and pend and pend.get("combo_type") == "SINGLE":
                    pw0 = _POW.get(pend.get("highest_card", ""), 0)
                    p = self._n_stronger(cx, pw0) / cx.nu
            else:
                if not o["passed"] and d["n"] == 1:
                    p = self._n_stronger(cx, d["hp"]) / cx.nu
            pimm *= 1.0 - p
        return 1.0 - pimm

    def _pchop(self, cx, d):
        """P(bị chặt) khi đánh Heo / Hàng."""
        if d is None or not (d["heo"] > 0 or d["hang"]):
            return 0.0
        miss = 1.0
        for o in cx.live:
            p = self._p_hang_beats(cx, o["f"], d["kind"], d["hi"], d["L"], d["heo"], only_chain4=o["passed"])
            miss *= 1.0 - self.P["chop_q"] * p
        return 1.0 - miss

    def _pending_shape(self, pend):
        typ = pend.get("combo_type", "SINGLE")
        hc = pend.get("highest_card", "")
        r = _RK.get(hc, 3)
        L = pend.get("length", 1)
        if typ in _KIND_OF_TYPE:
            kind = _KIND_OF_TYPE[typ]
            return (kind, r - L + 1 if kind == "R" else r, r, L if kind == "R" else 1)
        if typ.endswith("_PAIRS_CHAIN"):
            k = L // 2
            return ("C", r - k + 1, r, k)
        return ("S", r, r, 1)

    def _reserve(self, cx, d):
        """Giá của việc DÙNG hàng này để chặt hũ nhỏ ngay bây giờ (mất cơ hội chặt hũ lớn hơn về sau).
        Càng nhỏ khi: hũ đã lớn, hàng yếu, ván sắp kết thúc (mình còn ít lá / đối thủ sắp hết bài), Heo-Joker lớn đã ra hết."""
        P = self.P
        if P["hold_w"] <= 0:
            return 0.0
        cap = {"3_PAIRS_CHAIN": P["hold_cap3"], "FOUR_OF_A_KIND": P["hold_capq"]}.get(d["typ"], P["hold_cap4"])
        # hũ tính theo đơn vị giá lá (Đếm lá: Heo đen 10 / đỏ 20); Nhất ăn tất dùng đơn vị nhỏ hơn 10 lần
        scale = 1.0 if self.payment_mode == "count_cards" else 0.1
        room = max(0.0, P["hold_T"] * scale - cx.pot)
        left = len(cx.hand) - d["n"]
        # đầu ván (ai cũng còn nhiều bài) mới đáng chờ hũ lớn; càng gần cuối càng cần nhịp, hết dự trữ
        mo = min((o["h"] for o in cx.live), default=self.max_cards)
        urg = min(1.0, max(0.0, mo - P["hold_opp"]) / 6.0) * min(1.0, max(0.0, left - 2) / 4.0)
        future = min(1.0, cx.spec_unseen / (40.0 * scale))
        return P["hold_w"] * cap * room * urg * future

    def _chop_terms(self, cx, d):
        """Rủi ro bị chặt (khi đánh Heo/Hàng/Joker lẻ) trừ đi tiền chặt được (khi mình chặt)."""
        P = self.P
        out = 0.0
        if d["heo"] > 0 or d["hang"]:
            pot_after = cx.pot + d["pot"]
            miss = 1.0
            for o in cx.live:
                p = self._p_hang_beats(cx, o["f"], d["kind"], d["hi"], d["L"], d["heo"], only_chain4=o["passed"])
                miss *= 1.0 - P["chop_q"] * p
            out -= P["chop_w"] * (1.0 - miss) * pot_after
        pend = cx.pending
        if pend and d["hang"] and cx.pot > 0 and cx.owner != self.seat:
            out -= self._reserve(cx, d)
        if pend and d["hang"] and cx.pot > 0:
            pend_hang = pend.get("combo_type") in _HANG or pend.get("used_heo")
            if pend_hang and cx.owner != self.seat:
                # bị chặt lại sau khi mình chặt
                miss = 1.0
                for o in cx.exposed:
                    p = self._p_hang_beats(cx, o["f"], d["kind"], d["hi"], d["L"], 0)
                    miss *= 1.0 - P["chop_q"] * p
                out += P["gain_w"] * miss * cx.pot
        return out

    def _choose(self, legal_actions, hand, last_combo, stack_pen):
        if not legal_actions:
            return 0
        pass_idx = None
        acts = []
        for i, a in enumerate(legal_actions):
            if a:
                acts.append((i, a))
            elif pass_idx is None:
                pass_idx = i
        if not acts:
            return pass_idx if pass_idx is not None else 0
        # đánh hết bài thì thắng ngay
        wins = [(i, a) for i, a in acts if len(a) == len(hand)]
        if wins:
            # ưu tiên kết thúc bằng 3♠ lẻ (thối: ăn x3)
            for i, a in wins:
                if a == ["3♠"]:
                    return i
            return wins[0][0]
        if len(acts) == 1 and pass_idx is None:
            return acts[0][0]
        t0 = time.perf_counter()
        cx = self._context(hand, last_combo, stack_pen)
        cands = []
        for i, a in self._prune(cx, acts):
            d = self._describe(cx, a)
            if d is not None:
                cands.append((i, d))
            if len(cands) >= 8 and time.perf_counter() - t0 > 0.25:
                break  # giới hạn thời gian: tay có nhiều Joker sinh hàng nghìn nước đi
        if not cands:
            return pass_idx if pass_idx is not None else acts[0][0]
        scored = []
        for i, d in cands:
            scored.append((self._ev(cx, d, False), i, d))
        if pass_idx is not None:
            scored.append((self._ev(cx, None, False), pass_idx, None))
        scored.sort(key=lambda x: -x[0])
        top = scored[: self.P["topk"]]
        if pass_idx is not None and not any(x[1] == pass_idx for x in top):
            top.append(next(x for x in scored if x[1] == pass_idx))
        best = None
        trace = [] if self.P.get("trace") else None
        for ev1, i, d in top:
            ev = self._ev(cx, d, True)
            if self.P["noise"]:
                ev += self.rng.uniform(-self.P["noise"], self.P["noise"])
            if trace is not None:
                trace.append((round(ev, 2), legal_actions[i]))
            if best is None or ev > best[0]:
                best = (ev, i)
        if trace is not None:
            trace.sort(key=lambda x: -x[0])
            self.trace = trace
        return best[1]

    def _prune(self, cx, acts):
        """Chế độ Joker: nước đi chứa Joker rất nhiều biến thể — chỉ giữ biến thể Joker yếu nhất và mạnh nhất."""
        if not self.joker_mode:
            return acts
        keep = []
        groups = {}
        for i, a in acts:
            js = [c for c in a if c.startswith("X")]
            if not js:
                keep.append((i, a))
                continue
            reals = tuple(sorted(c for c in a if not c.startswith("X")))
            groups.setdefault((reals, len(js)), []).append((i, a, sum(_JOKER_HEO_POW[c[1]] for c in js)))
        for g in groups.values():
            g.sort(key=lambda x: x[2])
            keep.append((g[0][0], g[0][1]))
            if len(g) > 1:
                keep.append((g[-1][0], g[-1][1]))
        return keep
