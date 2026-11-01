/**
 * Thông tin KẾT VÁN dành cho giao diện (hiệu ứng cóng, aura đỏ 3♠ thối, nhãn "ĐÚT 3♠", animation kết ván).
 * Chỉ đọc state của Backend, không có phụ thuộc React nên test được bằng Node.
 *
 * Quy ước dữ liệu (Backend):
 *   players_status[id].is_cong                 hết ván mà vẫn giữ nguyên số lá lúc chia (chưa đánh được lá nào)
 *   all_hands_penalty_details[id]              (khoá chuỗi) { penalty_amount, is_thoi_3_spade, highlighted_cards,
 *                                              joker_transformations, arranged_hand, arranged_groups }
 *   winning_play                               { owner, combo_type, cards, played_cards, is_dut_3_spade }
 * Ván "tới trắng" KHÔNG có cóng / thối 3♠ / ĐÚT 3♠ (mọi người đều "giữ nguyên bài" nên is_cong luôn true — phải bỏ qua).
 */

export const THOI_3 = '3♠';

const isInstantMatch = (gs) => Boolean(gs?.instant_win_info?.has_instant_win);
const isSeatEmpty = (p) => !p || p.type === 'empty' || Boolean(p.is_left);

/** Số lá lúc chia: 13 (thường) hoặc 14 (Joker). */
export const dealtCount = (gs) => (gs?.config?.joker_mode ? 14 : 13);

/**
 * Tập số ghế bị CÓNG (giữ nguyên toàn bộ bài khi ván kết thúc). Dùng `is_cong` của Backend; Backend cũ chưa có trường này thì
 * tự tính từ `all_hands` (còn đủ 13/14 lá). Ván chưa xong hoặc ván tới trắng -> rỗng.
 */
export function congSeats(gs) {
  const out = new Set();
  if (!gs?.is_done || isInstantMatch(gs)) return out;
  const players = gs.players_status || {};
  const full = dealtCount(gs);
  Object.keys(players).forEach((key) => {
    const p = players[key];
    if (isSeatEmpty(p)) return;
    const flag = p.is_cong;
    const hand = gs.all_hands?.[key] ?? gs.all_hands?.[Number(key)];
    const byHand = Array.isArray(hand) && hand.length === full;
    if (flag === true || (flag == null && byHand)) out.add(Number(key));
  });
  return out;
}

/** Chi tiết phạt của một ghế (khoá chuỗi hoặc số đều được) hoặc null. */
export function penaltyOf(gs, id) {
  const all = gs?.all_hands_penalty_details;
  if (!all || typeof all !== 'object') return null;
  return all[String(id)] ?? all[Number(id)] ?? null;
}

/** Ghế đang "thối 3♠" (còn lá 3♠ — thật hoặc Joker hoá thành — trên tay khi ván kết thúc). Ván tới trắng -> rỗng. */
export function thoiSeats(gs) {
  const out = new Set();
  if (!gs?.is_done || isInstantMatch(gs)) return out;
  Object.keys(gs.players_status || {}).forEach((key) => {
    const d = penaltyOf(gs, key);
    if (d?.is_thoi_3_spade) out.add(Number(key));
  });
  return out;
}

/** Người thắng đánh hết bài bằng ĐÚNG MỘT lá 3♠ đơn (Backend: winning_play.is_dut_3_spade). */
export function dutInfo(gs) {
  if (!gs?.is_done || isInstantMatch(gs)) return null;
  const w = gs.winning_play;
  if (w !== undefined) {
    if (!w || !w.is_dut_3_spade) return null;
    return { owner: Number(w.owner), card: THOI_3 };
  }
  // Backend chưa trả winning_play: suy ra từ nước đánh cuối trên bàn — người đánh nó đã hết bài và nó là đúng một lá 3♠ thật.
  const t = gs.table;
  const owner = t?.last_combo_owner;
  const cards = t?.last_combo_cards;
  if (owner == null || !Array.isArray(cards) || cards.length !== 1 || cards[0] !== THOI_3) return null;
  const st = gs.players_status?.[owner] ?? gs.players_status?.[String(owner)];
  if (!st || Number(st.cards_left) !== 0) return null;
  return { owner: Number(owner), card: THOI_3 };
}

/**
 * Hiệu ứng kết ván đang bật cho từng ghế — CHỈ trong lúc chiếu kết quả (`matchPhase === 'result'`); sang đếm ngược ván
 * mới là gỡ hết. Các hiệu ứng độc lập, không loại trừ nhau (một người vừa cóng vừa thối 3♠ thì có cả băng lẫn aura đỏ).
 *   { frozen:Set, thoi:Set, dut: {owner,card}|null }
 */
export function endEffects(gs, matchPhase) {
  if (matchPhase !== 'result') return { frozen: new Set(), thoi: new Set(), dut: null };
  return { frozen: congSeats(gs), thoi: thoiSeats(gs), dut: dutInfo(gs) };
}

const sameCards = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const x = a.slice().sort();
  const y = b.slice().sort();
  return x.every((c, i) => c === y[i]);
};

export const isJokerCard = (c) => typeof c === 'string' && c.startsWith('X');

/**
 * Tay bài của `id` lúc kết ván, XẾP theo kịch bản phạt nặng nhất của Backend (arranged_hand) — dùng cho cả hai góc nhìn:
 *   order  thứ tự các lá (cùng đúng tập lá với `hand`; sai tập thì dùng nguyên `hand`, không bao giờ làm mất / thêm lá)
 *   faces  { 'X♦': '4♦', ... } lá Joker hoá thân thành lá nào (chỉ Joker có trong tay; ván không Joker -> {})
 *   aura   Set các lá phải có AURA ĐỎ (3♠ thối; Joker hoá thành 3♠ cũng có) — rỗng nếu không thối 3♠
 *   groups arranged_groups của Backend (kind + cards) nếu hợp lệ, không thì []
 * Trả null nếu không có chi tiết phạt (người thắng, ghế trống, ván tới trắng, Backend cũ).
 */
export function endHandOf(gs, id, hand) {
  if (!gs?.is_done || isInstantMatch(gs)) return null;
  const d = penaltyOf(gs, id);
  if (!d || !Array.isArray(hand) || hand.length === 0) return null;
  const order = sameCards(d.arranged_hand, hand) ? d.arranged_hand.slice() : hand.slice();
  const inHand = new Set(hand);
  const faces = {};
  if (gs.config?.joker_mode && d.joker_transformations && typeof d.joker_transformations === 'object') {
    Object.entries(d.joker_transformations).forEach(([joker, face]) => {
      if (inHand.has(joker) && isJokerCard(joker) && typeof face === 'string' && face) faces[joker] = face;
    });
  }
  const aura = new Set();
  if (d.is_thoi_3_spade) {
    (Array.isArray(d.highlighted_cards) ? d.highlighted_cards : []).forEach((c) => {
      if (inHand.has(c) && (c === THOI_3 || faces[c] === THOI_3)) aura.add(c);
    });
    if (aura.size === 0 && inHand.has(THOI_3)) aura.add(THOI_3);
  }
  const groups = Array.isArray(d.arranged_groups) && sameCards(d.arranged_groups.flatMap((g) => g.cards || []), hand) ? d.arranged_groups : [];
  return { order, faces, aura, groups, jokerCount: Object.keys(faces).length, thoi: Boolean(d.is_thoi_3_spade) };
}

/** Thời gian (ms) của từng bước animation kết ván trên máy người THUA (tổng luôn <= 5 giây, kể cả khi bước nào cũng dùng hết). */
export const END_SHOW = { startMs: 350, jokerMs: 900, gapMs: 150, sortBudgetMs: 1500 };
export const END_SHOW_MAX_MS = END_SHOW.startMs + END_SHOW.jokerMs + END_SHOW.gapMs + END_SHOW.sortBudgetMs;
