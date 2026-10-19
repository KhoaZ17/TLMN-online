// Các hàm THUẦN phục vụ luồng ván / phòng nhiều người (không đụng React/DOM) — test được bằng Node.
import { getDisplayCombo } from './gameFlow';
import { BOT_SEAT_NAME } from './stateCompat';

export const HOLD_RESULT_MS = 5000; // giữ màn hình kết quả
export const COUNTDOWN_SECONDS = 10; // đếm ngược ở giữa bàn trước ván mới
export const BOT_NAME_RE = /^bot\b/i;

export const INITIAL_CARDS = (jokerMode) => (jokerMode ? 14 : 13);

/** Chữ ký bộ bài của mọi người khi ván xong — để phân biệt 2 ván liên tiếp cùng kết thúc bằng "tới trắng". */
export function handsSignature(allHands) {
  if (!allHands) return '';
  return Object.keys(allHands)
    .sort()
    .map((id) => `${id}:${(allHands[id] || []).join(',')}`)
    .join('|');
}

/**
 * Có phải MỘT VÁN MỚI vừa bắt đầu không (so state trước và state sau)?
 *  - lần đầu thấy state (prev = null) -> do nơi gọi quyết định (isFreshMatch)
 *  - ván trước xong -> ván sau chưa xong
 *  - is_active false -> true (kể cả ván mở màn bằng "tới trắng", is_done = true ngay)
 *  - cả hai cùng xong nhưng bộ bài khác nhau (2 lần tới trắng liên tiếp)
 *  - BỎ LỠ một đoạn (tab bị ẩn / mạng chậm nên không thấy lúc ván trước xong): ván mới đã chia
 *    (bài đầy đủ, bàn trống) hoặc `round` đã tăng trong khi ván cũ chưa kịp báo xong; hoặc ván vừa xong ngay
 *    bằng "tới trắng" trong khi ta còn đang xem một ván chưa xong (tới trắng chỉ xảy ra lúc chia bài).
 */
export function detectNewMatch(prev, next) {
  if (!next) return false;
  if (!prev) return false;
  if (prev.is_done && !next.is_done) return true;
  if (!prev.is_active && next.is_active) return true;
  if (prev.is_done && next.is_done && handsSignature(prev.all_hands) !== handsSignature(next.all_hands)) return true;
  if (!prev.is_done && !next.is_done) {
    if (isFreshMatch(next) && !isFreshMatch(prev)) return true;
    if ((Number(next.round) || 0) > (Number(prev.round) || 0)) return true;
  }
  if (!prev.is_done && next.is_done && next.instant_win_info?.has_instant_win) return true;
  return false;
}

/**
 * State vừa nhận là một ván VỪA MỚI chia (chưa ai đánh) — dùng cho người vào phòng giữa chừng.
 * Ván "tới trắng" xong ngay lúc chia: Backend cũ giữ is_active = true, Backend Core Mới đặt is_active = false
 * (is_done = true) — cả hai đều là ván mới chia (mọi người còn đủ bài, bàn trống) nên đều được nhận ra.
 */
export function isFreshMatch(state) {
  if (!state || (!state.is_active && !state.is_done)) return false;
  const init = INITIAL_CARDS(state.config?.joker_mode);
  const players = Object.values(state.players_status || {});
  if (players.length === 0) return false;
  const noCombo = (state.table?.last_combo_cards || []).length === 0;
  const fullHands = players.every((p) => p.cards_left === init);
  return noCombo && fullHands;
}

export const isBotName = (name) => BOT_NAME_RE.test(name || '');

// Bot "thật" do Backend tạo luôn có username dạng bot_<số ghế>.
const REAL_BOT_USERNAME = /^bot_\d+$/i;

/**
 * Ghế của một NGƯỜI THẬT đã thoát/mất kết nối giữa ván: Backend đổi type thành 'bot' để Bot đánh
 * thay nhưng GIỮ NGUYÊN username / tên / avatar -> trên bàn vẫn hiện đúng người đó, chỉ kèm nhãn
 * "Bot đang đánh thay". Nhận ra bằng: type 'bot' mà username là một tài khoản (không phải bot_<n>).
 * Core Mới chưa vá không gửi username: khi đó dựa vào tên — Bot thật luôn tên "Bot N", còn ghế type 'bot'
 * mang tên người thật (type do stateCompat suy ra từ nhật ký "Bot đã tự động tiếp quản") là ghế bị thay.
 */
export const isReplacedSeat = (seat) => {
  if (!seat || seat.type !== 'bot') return false;
  if (seat.username) return !REAL_BOT_USERNAME.test(String(seat.username));
  const name = String(seat.name ?? '').normalize('NFC').trim();
  return name !== '' && !BOT_SEAT_NAME.test(name);
};

/**
 * Ghế "máy điều khiển" = người thật CÒN TRONG VÁN có id nhỏ nhất (chỉ máy này điều khiển Bot / gọi start các ván sau).
 * Không phải đặc quyền của chủ phòng ban đầu: họ thoát (ghế thành Bot) thì người thật kế tiếp tự đảm nhiệm.
 */
export function pickHostSeat(players) {
  const ids = Object.entries(players || {})
    .filter(([, p]) => p.type === 'human' && !p.is_left)
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
  return ids.length ? ids[0] : 0;
}

export const countHumans = (players) =>
  Object.values(players || {}).filter((p) => p.type === 'human' && !p.is_left).length;

export function balancesOf(state) {
  const out = {};
  Object.entries(state?.players_status || {}).forEach(([id, p]) => {
    out[id] = Number(p.balance) || 0;
  });
  return out;
}

/** Chênh lệch số dư từng ghế (đã làm tròn, bỏ ghế không đổi). */
export function diffBalances(prev, next) {
  const out = {};
  Object.keys(next || {}).forEach((id) => {
    if (prev?.[id] == null) return;
    const d = Math.round(next[id] - prev[id]);
    if (d !== 0) out[id] = d;
  });
  return out;
}

/**
 * Người THẮNG ván này (để ghi thống kê / hiện banner): ván thường -> người về nhất
 * (is_finished); tới trắng -> người mạnh nhất. Trả về id (number) hoặc null.
 */
export function winnerOf(state, bestInstantId = null) {
  if (!state?.is_done) return null;
  if (state.instant_win_info?.has_instant_win) return bestInstantId;
  const hit = Object.entries(state.players_status || {}).find(([, p]) => p.is_finished);
  return hit ? Number(hit[0]) : null;
}

/** Combo vừa đánh ra bởi ghế khác (không phải mình) mà chồng bài trên bàn chưa có. */
export function newRemoteCombo(state, mySeat, stack) {
  const combo = getDisplayCombo(state?.table);
  const owner = state?.table?.last_combo_owner;
  if (combo.length === 0 || owner == null || owner === mySeat) return null;
  const top = stack[stack.length - 1];
  if (top && top.cards.length === combo.length && top.cards.every((c, i) => c === combo[i])) return null;
  return { owner: Number(owner), combo };
}
