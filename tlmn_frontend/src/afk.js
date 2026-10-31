// AFK = "treo máy": người chơi để hết giờ hai lượt thật liên tiếp (hoặc máy không phản hồi) nên Bot đánh giúp. Ghế vẫn là người thật
// (Backend báo players_status[ghế].is_afk = true). Người đó "quay lại" khi chạm màn hình / bấm phím / mở lại tab / nối lại mạng:
// Frontend báo POST /api/afk_back để Backend trả quyền đánh.

/** Lớp mờ ẩn tạm bao lâu sau khi báo "đã quay lại" (đủ cho Backend xoá cờ + một nhịp hỏi state). */
export const AFK_WAKE_HIDE_MS = 2200;
/** Giữa hai lần báo quay lại tối thiểu bao lâu (chạm liên tục không bắn liên tục lên Backend). */
export const AFK_WAKE_THROTTLE_MS = 900;

const seatOf = (state, seat) => state?.players_status?.[String(seat)] ?? state?.players_status?.[seat] ?? null;

/** Ghế `seat` đang được Bot đánh giúp (người thật treo máy)? Chỉ tính khi ván đang chạy. */
export function isAfkSeat(state, seat) {
  if (!state || seat == null || !state.is_active || state.is_done) return false;
  const p = seatOf(state, seat);
  return Boolean(p && p.type === 'human' && p.is_afk === true);
}

/**
 * Có hiện lớp mờ + "Bot đang đánh" không? Cần đúng ván đang chạy ở pha chơi, và chưa vừa báo "quay lại"
 * (`wakeUntil` là mốc thời gian ms còn đang ẩn tạm; 0 / quá hạn thì không ẩn).
 */
export function afkOverlayOn(state, seat, matchPhase, wakeUntil = 0, now = Date.now()) {
  if (matchPhase !== 'play') return false;
  if (!isAfkSeat(state, seat)) return false;
  return !(wakeUntil && now < wakeUntil);
}

/**
 * Nước đi của CHÍNH MÌNH mà máy này không tự đánh (Bot đánh giúp lúc AFK, hoặc đánh từ một tab khác của cùng tài khoản):
 * state mới có combo của ghế mình nằm trên bàn mà chồng bài chưa có. Trả về { combo, cards } (cards = các lá rời khỏi tay mình,
 * Joker giữ tên gốc) hoặc null. Cần tay bài cũ (`prevHand`) để biết lá nào đã bay đi; không khớp số lá thì null (dựng thẳng, không diễn lại).
 */
export function ownRemotePlay(prevState, state, mySeat, stack, displayCombo) {
  const owner = state?.table?.last_combo_owner;
  if (!prevState || owner == null || Number(owner) !== Number(mySeat)) return null;
  const combo = displayCombo || [];
  if (combo.length === 0) return null;
  const top = stack[stack.length - 1];
  if (top && top.cards.length === combo.length && top.cards.every((c, i) => c === combo[i])) return null;
  const before = Array.isArray(prevState.my_hand) ? prevState.my_hand : [];
  if (before.length === 0) return null;
  const nowHand =
    Array.isArray(state.my_hand) && state.my_hand.length > 0
      ? state.my_hand
      : Array.isArray(state.all_hands?.[mySeat])
        ? state.all_hands[mySeat]
        : Array.isArray(state.all_hands?.[String(mySeat)])
          ? state.all_hands[String(mySeat)]
          : [];
  const keep = new Set(nowHand);
  const cards = before.filter((c) => !keep.has(c));
  if (cards.length === 0 || cards.length !== combo.length) return null;
  return { combo, cards };
}
