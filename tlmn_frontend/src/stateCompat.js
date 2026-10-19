// LỚP TƯƠNG THÍCH DỮ LIỆU `state` — hàm THUẦN (không đụng React/DOM), test được bằng Node.
//
// Vì sao cần? Frontend được viết cho state ĐẦY ĐỦ của Backend (xem get_game_state trong app_controller.py):
//   status, room_id, my_player_id, current_player_type, instant_win_info và, trong players_status[ghế],
//   username / type / gender / avatar / highest_balance / stats.
// Bản Backend "Core Mới" (db_helper + accumulated_rewards) lỡ bỏ các trường đó khỏi get_game_state — bản vá
// trong backend-update/ khôi phục chúng. Trong lúc chưa vá, lớp này giúp Frontend KHÔNG bị treo:
//   - bổ sung các trường thiếu bằng giá trị an toàn;
//   - suy ra những gì suy ra được (ghế Bot qua tên "Bot N", tới trắng qua nhật ký ván);
//   - KHÔNG bịa dữ liệu không có (avatar, thống kê, username của người chơi khác) — giao diện tự rơi về
//     ảnh chữ cái + "Chưa có thống kê". Backend đã gửi đủ trường thì hàm này giữ nguyên, không đổi gì.

// Bot do Backend tạo luôn tên "Bot 1", "Bot 2"… (người thật có tên hiển thị tự đặt).
export const BOT_SEAT_NAME = /^Bot \d+$/;

// Bảng tên bộ tới trắng -> power, CHỈ để dự phòng khi Backend không gửi instant_win_info (nguồn: tlmn_rules.py).
export const INSTANT_WIN_POWER = {
  'BÁT QUÁI HEO': 9,
  '6 ĐÔI THÔNG': 8,
  'SẢNH RỒNG': 7,
  '5 ĐÔI THÔNG': 6,
  '7 ĐÔI': 6,
  'TỨ QUÝ HEO': 5,
  '6 ĐÔI': 4,
  '5 ĐÔI THÔNG CÓ 3 BÍCH': 4,
  '4 ĐÔI THÔNG CÓ 3 BÍCH': 3,
  'TỨ QUÝ 3': 2,
  '3 ĐÔI THÔNG CÓ 3 BÍCH': 1,
};

const nfc = (s) => String(s ?? '').normalize('NFC');

/** Object này có phải một `state` ván đấu không (có players_status)? Phân biệt với {status:'error', message}. */
export function looksLikeState(x) {
  return Boolean(x) && typeof x === 'object' && !Array.isArray(x) && x.players_status != null && typeof x.players_status === 'object';
}

/**
 * Bổ sung type cho một ghế nếu Backend không gửi: tên "Bot N" -> bot, còn lại -> người thật.
 * `forceBot`: ghế này đã bị Bot tiếp quản giữa ván (xem takeoverSeats) -> bot dù tên là của người thật.
 */
export function normalizeSeat(seat, forceBot = false) {
  if (!seat || typeof seat !== 'object') return seat;
  if (seat.type != null && seat.type !== '') return seat;
  return { ...seat, type: forceBot || BOT_SEAT_NAME.test(nfc(seat.name).trim()) ? 'bot' : 'human' };
}

// Dòng nhật ký Backend ghi khi người thật thoát / mất kết nối giữa ván (handle_player_quit):
//   "🤖 Người chơi 1 mất kết nối/thoát trận. Bot đã tự động tiếp quản tài khoản!"   (1 = số ghế)
const TAKEOVER_LOG = /Người chơi (\d+) mất kết nối\/thoát trận\.\s*Bot đã tự động tiếp quản/;

/**
 * Các ghế đã bị Bot tiếp quản, đọc từ nhật ký ván (`logs` chỉ giữ 5 dòng cuối nên nơi gọi phải NHỚ lại các ghế
 * đã thấy — api.js làm việc đó). Chỉ cần khi Backend không gửi `type` cho từng ghế (Core Mới chưa vá); Backend
 * đã gửi `type` thì `normalizeSeat` giữ nguyên và không dùng tới danh sách này.
 */
export function takeoverSeats(logs) {
  const out = [];
  (Array.isArray(logs) ? logs : []).forEach((l) => {
    const m = TAKEOVER_LOG.exec(nfc(l));
    if (m) out.push(Number(m[1]));
  });
  return out;
}

/**
 * Ván vừa chia đã kết thúc bằng "tới trắng" mà Backend không báo instant_win_info?
 * Nhận ra bằng nhật ký ván: dòng "(Tới trắng: <tên bộ>)" / "KẾT THÚC VÁN ĐẤU DO CÓ NGƯỜI TỚI TRẮNG".
 */
export function isImplicitInstantWin(state) {
  if (!state?.is_done) return false;
  return (Array.isArray(state.logs) ? state.logs : []).some((l) => /tới trắng/i.test(nfc(l)));
}

const PAY_LINE = /(\d+)\s+trả cho\s+(\d+):\s*([\d.,]+)\s*\(([^)]*)\)/;
const parseAmount = (txt) => {
  // "50,000" hoặc "50,000.0" (dấu phẩy ngăn nghìn, dấu chấm thập phân — định dạng f"{x:,}" của Python)
  const n = parseFloat(String(txt).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Dựng instant_win_info từ NHẬT KÝ ván (dự phòng, ước lượng):
 *   "🏆 2 trả cho 0: 50,000 (Tới trắng: TỨ QUÝ HEO)" -> người 0 tới trắng bằng TỨ QUÝ HEO, người 2 trả 50,000.
 * Nhật ký chỉ giữ 5 dòng cuối, nên khi nhiều người cùng tới trắng có thể bị cắt mất dòng. Biết đủ dòng khi:
 *   số dòng "Tới trắng" = (số ghế - số người thắng) × số người thắng, và số dòng chênh lệch = C(số người thắng, 2).
 * Đủ dòng -> net_changes chính xác. Thiếu -> net_changes = 0 (không diễn hiệu ứng chip trước lúc lật bài) chứ
 * không đưa số sai; số dư thật luôn lấy từ `balance` của từng ghế.
 */
export function deriveInstantWinInfo(state) {
  const cost = Number(state?.config?.cost) || 0;
  const countCards = state?.config?.payment_mode === 'count_cards';
  const net = {};
  const players = {};
  let winLines = 0; // dòng "(Tới trắng: <bộ>)": mỗi người thua trả cho mỗi người tới trắng
  let diffLines = 0; // dòng chênh lệch giữa những người cùng tới trắng

  (Array.isArray(state?.logs) ? state.logs : []).forEach((raw) => {
    const m = PAY_LINE.exec(nfc(raw));
    if (!m) return;
    const [, payer, receiver, amountTxt, reason] = m;
    const amount = parseAmount(amountTxt);
    net[payer] = (net[payer] || 0) - amount;
    net[receiver] = (net[receiver] || 0) + amount;
    const hand = /^Tới trắng:\s*(.+)$/i.exec(reason.trim());
    if (!hand) {
      diffLines += 1;
      return;
    }
    winLines += 1;
    if (!players[receiver]) {
      const handName = hand[1].trim();
      const power = INSTANT_WIN_POWER[handName.toUpperCase()] ?? 0;
      players[receiver] = {
        hand_name: handName,
        power,
        multiplier: cost > 0 ? amount / cost : power * (countCards ? 10 : 1),
      };
    }
  });

  const seatIds = Object.keys(state?.players_status || {});
  const winners = Object.keys(players).length;
  const complete =
    winners > 0 &&
    winLines === (seatIds.length - winners) * winners &&
    diffLines === (winners * (winners - 1)) / 2;
  const net_changes = {};
  seatIds.forEach((id) => {
    net_changes[id] = complete ? Math.round(net[id] || 0) : 0;
  });

  return { has_instant_win: true, net_changes, instant_win_players: players, transaction_logs: [], derived: true };
}

/**
 * Chuẩn hoá một state Backend trả về thành dạng ĐẦY ĐỦ mà Frontend dùng.
 * @param raw   state thô (hoặc state lồng trong phản hồi /api/action)
 * @param opts  { roomId, seat, takenOver }: phòng + ghế (player_id) mà state này được yêu cầu cho; `takenOver` là
 *              tập số ghế đã biết là bị Bot tiếp quản (cộng thêm các ghế thấy trong nhật ký của chính state này)
 * Không sửa `raw`; trả về object mới. Giá trị không phải state (lỗi, require_joker_choice…) trả nguyên.
 */
export function normalizeState(raw, { roomId = null, seat = null, takenOver = null } = {}) {
  if (!looksLikeState(raw)) return raw;

  const taken = new Set([...(takenOver || []), ...takeoverSeats(raw.logs)].map(String));
  const players = {};
  Object.entries(raw.players_status).forEach(([id, p]) => {
    players[id] = normalizeSeat(p, taken.has(String(id)));
  });

  const out = {
    ...raw,
    status: raw.status ?? 'success',
    room_id: raw.room_id ?? roomId,
    my_player_id: raw.my_player_id ?? seat,
    players_status: players,
    my_hand: Array.isArray(raw.my_hand) ? raw.my_hand : [],
    legal_actions: Array.isArray(raw.legal_actions) ? raw.legal_actions : [],
    logs: Array.isArray(raw.logs) ? raw.logs : [],
  };
  out.current_player_type = raw.current_player_type ?? players[String(raw.current_turn)]?.type ?? 'bot';

  if (!('instant_win_info' in raw)) {
    out.instant_win_info = isImplicitInstantWin(out) ? deriveInstantWinInfo(out) : null;
  }
  return out;
}
