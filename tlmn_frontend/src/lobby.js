// Các hàm THUẦN của PHÒNG CHỜ (không đụng React/DOM) — test được bằng Node.
//
// Quy trình phòng (Backend: POST /api/setup, POST /api/join, GET /api/lobby, POST /api/start, POST /api/quit):
//  1. Chủ phòng tạo phòng, chọn số người thật + số bot.
//  2. Chỉ 1 người thật -> chia bài ngay. Nhiều người thật -> phòng CHỜ: chủ phòng và các bot đã ngồi sẵn,
//     ghế người thật còn lại đang TRỐNG; bạn bè nhập mã phòng để ngồi vào ghế trống (màn hình họ chuyển sang phòng chờ).
//  3. Chủ phòng bấm "Bắt đầu ngay" lúc nào tuỳ ý, miễn có từ 2 người ngồi. Ghế còn trống thì BỎ TRỐNG (không tự thêm Bot cho đủ chỗ):
//     bàn chỉ gồm những người đang ngồi. Từ lúc phòng đã chia bài, người nhập mã chỉ được vào XEM (khán giả) rồi ngồi vào từ ván sau.
//  4. Các ván sau tự đếm ngược rồi tự chia; không ai (kể cả chủ phòng ban đầu) giữ quyền bắt đầu. Chủ phòng thoát thì ván vẫn tiếp diễn.
import { formatChip } from './gameFlow';
import { MIN_PLAYERS_TO_START } from './matchFlow';
import { MODES, fromApiGender } from './profileStore';

export const LOBBY_POLL_MS = 1000; // chu kỳ "điểm danh" + hỏi phòng chờ
export { MIN_PLAYERS_TO_START }; // ít nhất 2 người (người thật + bot) đang ngồi thì mới chia bài được

/** Lời nhắn khi máy chủ chưa có API phòng chờ (server.py / app_controller.py bản cũ). */
export const LOBBY_UNSUPPORTED_MESSAGE =
  'Máy chủ chưa hỗ trợ phòng nhiều người thật. Hãy cập nhật server.py và app_controller.py bản mới (xem README) rồi chạy lại máy chủ.';

/** Phản hồi POST /api/setup có hỗ trợ phòng chờ không? Bản mới luôn trả `open_seats` (mảng, có thể rỗng). */
export const supportsLobby = (setupRes) => Boolean(setupRes) && Array.isArray(setupRes.open_seats);

/** Phản hồi của Backend nói phòng không còn (chủ phòng đã huỷ / hết hạn / không tồn tại). */
export const lobbyClosed = (res) => Boolean(res) && res.status === 'error' && res.code === 'closed';

/** Phản hồi của Backend nói mình không còn ngồi ở phòng chờ này (ghế đã được giải phóng). */
export const lobbyKicked = (res) => Boolean(res) && res.status === 'error' && res.code === 'kicked';

/**
 * Phản hồi POST /api/resume của người vừa đăng nhập lại: nếu còn ghế trong một phòng thì trả { roomId, seat, started }, không thì null.
 * Máy chủ bản cũ không có đường này (404 / không có `status`) -> null (không phải lỗi: chỉ là không có phòng để vào lại).
 */
export function resumeTarget(res) {
  if (!res || res.status !== 'success' || res.resumed !== true || res.seat == null || !res.room_id) return null;
  const seat = Number(res.seat);
  if (!Number.isInteger(seat) || seat < 0) return null;
  return { roomId: String(res.room_id), seat, started: Boolean(res.started) };
}

/** Nhập mã vào phòng ĐANG ĐẤU: Backend cho vào làm khán giả (chỉ xem, không có ghế). */
export const joinedAsSpectator = (res) => Boolean(res) && res.status === 'success' && res.spectator === true && res.seat == null;

/** State của khán giả (chưa có ghế): không bài trên tay. */
export const isSpectatorState = (state) => Boolean(state) && state.status !== 'error' && (state.spectating === true || state.my_player_id == null);

/** Khán giả vừa được ngồi vào bàn (state thường có số ghế): trả số ghế, không thì null. */
export function promotedSeat(state) {
  if (!state || state.status === 'error' || state.spectating === true) return null;
  const seat = Number(state.my_player_id);
  return state.my_player_id != null && Number.isInteger(seat) && seat >= 0 ? seat : null;
}

/** Khán giả bị dọn khỏi danh sách (im lặng quá lâu) / phòng không còn là phòng của mình. */
export const spectatorGone = (res) => Boolean(res) && res.status === 'error' && res.code === 'not_spectating';

/** Phòng đã chia ván rồi (người vào giữa chừng / nối lại phải vào thẳng bàn chứ không ngồi phòng chờ). */
export const lobbyStarted = (lobby) => Boolean(lobby) && Boolean(lobby.started);

/** Phản hồi là một PHÒNG CHỜ hợp lệ (có danh sách ghế). */
export const isLobbyView = (res) => Boolean(res) && res.status === 'success' && Boolean(res.players);

/**
 * Lời báo lỗi khi vào phòng bằng mã (POST /api/join) không thành công; null nếu vào được.
 * Backend trả { status: 'error', code, message }: not_found | in_progress | full | no_account.
 * Máy chủ bản cũ không có đường dẫn này (404 / 405 -> không có `status`) nên báo cần cập nhật.
 */
export function joinFailureMessage(res) {
  if (res && res.status === 'success' && (res.seat != null || res.spectator === true)) return null;
  if (res && res.status === 'error' && res.message) return res.message;
  return LOBBY_UNSUPPORTED_MESSAGE;
}

/** Danh sách ghế theo thứ tự 0..n-1 từ ảnh chụp phòng chờ của Backend (`players` khoá theo số ghế). */
export function lobbySeats(lobby, mySeat = null) {
  const players = lobby?.players || {};
  const hostSeat = Number(lobby?.host_seat ?? 0);
  return Object.keys(players)
    .map(Number)
    .sort((a, b) => a - b)
    .map((seat) => {
      const p = players[String(seat)] || {};
      const kind = p.type === 'open' ? 'open' : p.type === 'bot' ? 'bot' : 'human';
      return {
        seat,
        kind,
        name: kind === 'open' ? '' : String(p.name || p.username || '').trim(),
        avatar: typeof p.avatar === 'string' && p.avatar ? p.avatar : null,
        gender: fromApiGender(p.gender),
        isHost: seat === hostSeat,
        isMe: mySeat != null && seat === Number(mySeat),
      };
    });
}

/** Đếm số ghế theo loại. */
export function lobbyCounts(seats) {
  const list = seats || [];
  return {
    total: list.length,
    humans: list.filter((s) => s.kind === 'human').length,
    bots: list.filter((s) => s.kind === 'bot').length,
    open: list.filter((s) => s.kind === 'open').length,
  };
}

/** "Đếm lá · Joker · Cược 1k" — tóm tắt cấu hình phòng. */
export function lobbyConfigText(config) {
  if (!config) return '';
  const mode = MODES.find((m) => m.id === config.payment_mode)?.label || '';
  const stake = Number(config.cost) > 0 ? `Cược ${formatChip(config.cost)}` : '';
  return [mode, config.joker_mode ? 'Joker' : '', stake].filter(Boolean).join(' · ');
}

/** Số người (thật + bot) đang ngồi, không tính ghế trống. */
export const lobbySeated = (counts) => Math.max(0, (counts?.total || 0) - (counts?.open || 0));

/** Chủ phòng bấm "Bắt đầu ngay" được chưa? Cần ít nhất MIN_PLAYERS_TO_START người đang ngồi (ghế trống không tính). */
export const lobbyCanStart = (counts) => lobbySeated(counts) >= MIN_PLAYERS_TO_START;

/** Dòng hướng dẫn dưới danh sách ghế (khác nhau giữa chủ phòng và khách). */
export function lobbyStatusText({ isHost, counts }) {
  const open = counts?.open || 0;
  if (isHost) {
    if (!lobbyCanStart(counts)) {
      return `Cần ít nhất ${MIN_PLAYERS_TO_START} người để bắt đầu — bạn bè nhập mã phòng để vào, hoặc bấm “+ Bot” để thêm Bot.`;
    }
    return open > 0
      ? `Còn ${open} chỗ trống — bạn bè nhập mã phòng để vào (hoặc bấm “+ Bot”). Bấm “Bắt đầu ngay” lúc nào cũng được; chỗ chưa có người sẽ để trống, bàn chỉ gồm những người đang ngồi.`
      : 'Đã đủ người. Bấm “Bắt đầu ngay” khi mọi người sẵn sàng.';
  }
  return open > 0
    ? `Đang chờ chủ phòng bắt đầu — còn ${open} chỗ trống. Chủ phòng bắt đầu sớm thì chỗ trống sẽ bỏ trống, không có Bot thay.`
    : 'Đã đủ người. Đang chờ chủ phòng bắt đầu ván đầu tiên…';
}
