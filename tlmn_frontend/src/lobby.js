// Các hàm THUẦN của PHÒNG CHỜ (không đụng React/DOM) — test được bằng Node.
//
// Quy trình phòng (Backend: POST /api/setup, POST /api/join, GET /api/lobby, POST /api/start, POST /api/quit):
//  1. Chủ phòng tạo phòng, chọn số người thật + số bot.
//  2. Chỉ 1 người thật -> chia bài ngay. Nhiều người thật -> phòng CHỜ: chủ phòng và các bot đã ngồi sẵn,
//     ghế người thật còn lại đang TRỐNG; bạn bè nhập mã phòng để ngồi vào ghế trống (màn hình họ chuyển sang phòng chờ).
//  3. Chủ phòng bấm "Bắt đầu ngay" lúc nào tuỳ ý (ghế còn trống do Bot ngồi). Từ lúc phòng đã chia bài, KHÔNG ai vào thêm được.
//  4. Các ván sau tự đếm ngược rồi tự chia; không ai (kể cả chủ phòng ban đầu) giữ quyền bắt đầu. Chủ phòng thoát thì ván vẫn tiếp diễn.
import { formatChip } from './gameFlow';
import { MODES, fromApiGender } from './profileStore';

export const LOBBY_POLL_MS = 1000; // chu kỳ "điểm danh" + hỏi phòng chờ

/** Lời nhắn khi máy chủ chưa có API phòng chờ (server.py / app_controller.py bản cũ). */
export const LOBBY_UNSUPPORTED_MESSAGE =
  'Máy chủ chưa hỗ trợ phòng nhiều người thật. Hãy cập nhật server.py và app_controller.py bản mới (xem README) rồi chạy lại máy chủ.';

/** Phản hồi POST /api/setup có hỗ trợ phòng chờ không? Bản mới luôn trả `open_seats` (mảng, có thể rỗng). */
export const supportsLobby = (setupRes) => Boolean(setupRes) && Array.isArray(setupRes.open_seats);

/** Phản hồi của Backend nói phòng không còn (chủ phòng đã huỷ / hết hạn / không tồn tại). */
export const lobbyClosed = (res) => Boolean(res) && res.status === 'error' && res.code === 'closed';

/** Phản hồi của Backend nói mình không còn ngồi ở phòng chờ này (ghế đã được giải phóng). */
export const lobbyKicked = (res) => Boolean(res) && res.status === 'error' && res.code === 'kicked';

/** Phản hồi là một PHÒNG CHỜ hợp lệ (có danh sách ghế). */
export const isLobbyView = (res) => Boolean(res) && res.status === 'success' && Boolean(res.players);

/**
 * Lời báo lỗi khi vào phòng bằng mã (POST /api/join) không thành công; null nếu vào được.
 * Backend trả { status: 'error', code, message }: not_found | in_progress | full | no_account.
 * Máy chủ bản cũ không có đường dẫn này (404 / 405 -> không có `status`) nên báo cần cập nhật.
 */
export function joinFailureMessage(res) {
  if (res && res.status === 'success' && res.seat != null) return null;
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

/** Dòng hướng dẫn dưới danh sách ghế (khác nhau giữa chủ phòng và khách). */
export function lobbyStatusText({ isHost, counts }) {
  const open = counts?.open || 0;
  if (isHost) {
    return open > 0
      ? `Còn ${open} chỗ trống — bạn bè nhập mã phòng để vào. Bấm “Bắt đầu ngay” lúc nào cũng được, chỗ chưa có người sẽ do Bot ngồi.`
      : 'Đã đủ người. Bấm “Bắt đầu ngay” khi mọi người sẵn sàng.';
  }
  return open > 0
    ? `Đang chờ chủ phòng bắt đầu — còn ${open} chỗ trống, chỗ chưa có người sẽ do Bot ngồi.`
    : 'Đã đủ người. Đang chờ chủ phòng bắt đầu ván đầu tiên…';
}
