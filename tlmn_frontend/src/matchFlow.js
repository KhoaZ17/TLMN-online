// Các hàm THUẦN phục vụ luồng ván / phòng nhiều người (không đụng React/DOM) — test được bằng Node.
import { getDisplayCombo } from './gameFlow';
import { BOT_SEAT_NAME } from './stateCompat';
import { bestInstantPower, instantExtraMs } from './instantWin';

export const HOLD_RESULT_MS = 5000; // giữ màn hình kết quả (ván kết thúc bằng cách hết bài)

/**
 * Giữ màn hình kết quả bao lâu (ms)? Hết bài -> HOLD_RESULT_MS. "Tới trắng" -> HOLD_RESULT_MS + giờ cộng thêm 0,5–5 giây tuỳ
 * power của tay bài mạnh nhất, theo thang cố định power 1–9 chung cho cả hai chế độ (xem instantWin.instantExtraMs).
 * Mọi máy trong phòng tính ra cùng một con số vì cùng đọc state.
 */
export function resultHoldMs(state) {
  const info = state?.instant_win_info;
  if (!info?.has_instant_win) return HOLD_RESULT_MS;
  return HOLD_RESULT_MS + instantExtraMs(bestInstantPower(info));
}
export const COUNTDOWN_SECONDS = 10; // đếm ngược ở giữa bàn trước ván mới
export const BOT_NAME_RE = /^bot\b/i;

/** Bàn tối đa 4 người (khớp MAX_PLAYERS của Backend). */
export const MAX_TABLE_SEATS = 4;

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
 * Hai bảng bài lúc ván xong có là CÙNG MỘT ván không? Chỉ so những ghế có bài ở CẢ HAI bên: giữa hai ván chủ phòng bớt / thêm
 * Bot thì Backend ẩn / hiện bài của ghế đó (ghế trống không có bài) — đó KHÔNG phải ván mới. Hai ván "tới trắng" liên tiếp thì
 * mọi ghế được chia lại nên chắc chắn lệch ở các ghế chung.
 */
export function sameFinishedHands(prevHands, nextHands) {
  if (!prevHands || !nextHands) return handsSignature(prevHands) === handsSignature(nextHands);
  const shared = Object.keys(prevHands).filter(
    (id) => (prevHands[id] || []).length > 0 && (nextHands[id] || []).length > 0
  );
  if (shared.length === 0) return handsSignature(prevHands) === handsSignature(nextHands);
  return shared.every((id) => prevHands[id].join(',') === nextHands[id].join(','));
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
  if (prev.is_done && next.is_done && !sameFinishedHands(prev.all_hands, next.all_hands)) return true;
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

// ---------------------------------------------------------------------------------------------------------------------
// GHẾ TRỐNG, BOT THÊM / BỚT, ĐỔI SỐ GHẾ GIỮA CÁC VÁN
//
// Backend không bao giờ tự thay người đã rời bàn bằng Bot. Người chủ động thoát giữa hai ván để lại một GHẾ TRỐNG
// (state: type 'empty' + is_left) cho tới khi có người nhập mã phòng vào, hoặc chủ phòng bấm "＋ Bot". Tới lúc chia ván mới,
// ghế còn trống bị bỏ đi và những người đang ngồi được ĐÁNH SỐ LẠI liền mạch (cùng một người có thể đổi số ghế), nên mọi thứ
// gắn với số ghế (số dư ván trước, ghế của mình) phải nhận ra người qua TÊN TÀI KHOẢN chứ không qua số ghế.
// ---------------------------------------------------------------------------------------------------------------------

/** Ít nhất bao nhiêu người (thật + Bot) đang ngồi thì mới chia ván được. Dưới mức này bàn phải chờ người vào / chủ phòng thêm Bot. */
export const MIN_PLAYERS_TO_START = 2;

/** Ghế TRỐNG: người ngồi đã rời giữa hai ván và chưa ai vào thay (Backend: type 'empty', is_left true). */
export const isEmptySeat = (seat) => Boolean(seat) && (seat.type === 'empty' || Boolean(seat.is_left));

/** Số người (thật + Bot, kể cả Bot đang đánh thay người bị văng) đang ngồi bàn; ghế trống không tính. */
export const seatedCount = (players) => Object.values(players || {}).filter((p) => !isEmptySeat(p)).length;

/** Bàn còn dưới MIN_PLAYERS_TO_START người -> chưa chia ván mới được. */
export const needsPlayers = (players) => seatedCount(players) < MIN_PLAYERS_TO_START;

/** Phản hồi POST /api/start báo bàn còn dưới 2 người (Backend: code 'need_players'; ván đầu: câu "Cần ít nhất 2 người chơi…"). */
export const startNeedsPlayers = (res) =>
  Boolean(res) && res.status === 'error' && (res.code === 'need_players' || /Cần ít nhất \d+ người chơi/i.test(res.message || ''));

/**
 * Thêm / bớt Bot được không? `open` = số ghế trống (Bot chỉ ngồi được vào ghế trống); `plainBots` = số Bot THẬT, không tính ghế
 * Bot đang đánh thay người bị văng (ghế đó còn của người kia) — Backend chỉ cho bớt Bot thật.
 */
export function botSlots(players) {
  let open = 0;
  let plainBots = 0;
  let total = 0;
  Object.values(players || {}).forEach((p) => {
    total += 1;
    if (isEmptySeat(p)) open += 1;
    else if (p.type === 'bot' && !isReplacedSeat(p)) plainBots += 1;
  });
  const seated = total - open;
  // Số người trong phòng KHÔNG cố định theo lúc tạo phòng: bàn nào cũng mở rộng được tới MAX_TABLE_SEATS (Backend tự mở thêm ghế),
  // nên chỉ khi đã đủ 4 người đang ngồi mới hết thêm Bot được.
  return { open, plainBots, seated, canAdd: seated < MAX_TABLE_SEATS, canRemove: plainBots > 0 };
}

/** Ghế CHỦ PHÒNG trong state: Backend gửi `host_seat`; bản cũ không gửi thì lấy người thật có ghế nhỏ nhất. */
export const roomHostSeat = (state) =>
  state?.host_seat != null ? Number(state.host_seat) : pickHostSeat(state?.players_status);

/** Danh tính của người ngồi ở một ghế (tên tài khoản; không có thì tên hiển thị). Ghế trống -> ''. */
export const seatIdentity = (seat) => (seat && !isEmptySeat(seat) ? String(seat.username || seat.name || '') : '');

/** Danh tính của mọi ghế: { số ghế: danh tính }. */
export function identitiesOf(players) {
  const out = {};
  Object.entries(players || {}).forEach(([id, p]) => {
    out[id] = seatIdentity(p);
  });
  return out;
}

/**
 * Đưa số dư của lần trước sang SỐ GHẾ HIỆN TẠI theo danh tính. Bàn được dồn lại giữa các ván thì số ghế đổi, so sánh theo số ghế
 * sẽ ra "chênh lệch" giả (người này bị tính tiền của người kia). Người mới vào (chưa có số dư trước) -> không có mục nào.
 */
export function alignBalances(prevBalances, prevWho, nextWho) {
  const byWho = {};
  Object.keys(prevBalances || {}).forEach((id) => {
    const who = prevWho?.[id];
    if (who) byWho[who] = prevBalances[id];
  });
  const out = {};
  Object.keys(nextWho || {}).forEach((id) => {
    const who = nextWho[id];
    if (who && byWho[who] != null) out[id] = byWho[who];
  });
  return out;
}

/**
 * Mình còn ngồi đúng ghế `seat` không? Ghế đã được trả (trống) hoặc giờ thuộc người khác (bàn bị dồn lại sau khi mình mất chỗ)
 * -> false. Backend cũ không gửi `username` từng ghế -> không kiểm tra được thì coi là còn.
 */
export function isMySeat(state, seat, username) {
  const me = state?.players_status?.[String(seat)];
  if (!me || isEmptySeat(me)) return false;
  if (me.username && username && me.username !== username) return false;
  return true;
}

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
