// TỚI TRẮNG: chọn người mạnh nhất để chiếu đèn sân khấu và tính độ mờ nhẹ của những người còn lại.
// Hàm thuần; dữ liệu đầu vào là `instant_win_info` Backend trả về:
//   { has_instant_win, net_changes, instant_win_players: { id: { hand_name, power, highest, multiplier } }, transaction_logs }
import { cardPower } from './cardPower';

/** Điểm so sánh: power của tay bài (chính) + lá lớn nhất làm điểm phụ (<= 0.5) — đúng thứ tự Backend phân thắng thua. */
export function instantScore(entry) {
  return Number(entry?.power ?? 0) + 0.5 * (cardPower(entry?.highest) / 52);
}

// Độ rõ (1 = bình thường; GameScreen áp thành opacity của ghế). Chỉ MỜ RẤT NHẸ để màn hình vẫn sáng và người thua đọc
// rõ bài của mình lẫn bài lật ngửa của người khác: người không tới trắng còn 85%; người tới trắng PHỤ (không phải người mạnh
// nhất) nằm giữa 93% và 97% tuỳ sức mạnh tay bài — luôn mờ hơn người mạnh nhất (100%) một chút, nhưng rõ hơn người thua.
export const DIM_FLOOR = 0.85;
export const MIN_IW = 0.93;
export const SECOND_IW_MAX = 0.97;
// Độ mạnh của chùm đèn: người mạnh nhất = 1; người tới trắng phụ chiếu yếu hơn.
export const SECOND_LIGHT = 0.5;

/**
 * @param info       state.instant_win_info — mỗi người trong instant_win_players có thể kèm `is_top_winner` (Backend báo ai là người
 *                   tới trắng MẠNH NHẤT; nhiều người cùng bậc thì đều true). Không có cờ này (Backend cũ / suy ra từ nhật ký) thì
 *                   người mạnh nhất tự xác định theo power + lá lớn nhất.
 * @param seatIds    danh sách id ghế đang có trên bàn (number | string)
 * @returns null nếu không có ai tới trắng, ngược lại:
 *   best       { id, handName, power, highest, multiplier, score, isTop }  — người mạnh nhất (chữ giữa bàn nói về người này)
 *   winners    mọi người tới trắng, mạnh -> yếu (mỗi mục có isTop)
 *   topIds     id của những người tới trắng mạnh nhất (thường 1 người)
 *   lights     [{ id, strength }] — đèn chiếu: người mạnh nhất strength 1 (sáng chói), người phụ SECOND_LIGHT (đèn yếu hơn)
 *   brightness { [id]: DIM_FLOOR..1 }  — 1 = rõ hẳn; người tới trắng phụ 0,93–0,97; người không tới trắng 0,85
 */
export function analyzeInstantWin(info, seatIds = []) {
  if (!info?.has_instant_win) return null;
  const raw = Object.entries(info.instant_win_players || {}).map(([id, e]) => ({
    id: Number(id),
    handName: e.hand_name,
    power: e.power,
    highest: e.highest,
    multiplier: e.multiplier,
    score: instantScore(e),
    flag: e.is_top_winner,
  }));
  if (raw.length === 0) return null;

  raw.sort((a, b) => b.score - a.score || a.id - b.id);
  const flagged = raw.filter((e) => e.flag === true);
  let topIds;
  if (flagged.length > 0) topIds = flagged.map((e) => e.id);
  else if (info.top_winner_id != null && raw.some((e) => e.id === Number(info.top_winner_id))) topIds = [Number(info.top_winner_id)];
  else topIds = [raw[0].id];
  const entries = raw.map(({ flag, ...e }) => ({ ...e, isTop: topIds.includes(e.id) }));
  // Người mạnh nhất để ghi chữ giữa bàn: trong số người "top", lấy người điểm cao nhất.
  const best = entries.find((e) => e.isTop) || entries[0];

  const brightness = {};
  seatIds.forEach((id) => {
    brightness[Number(id)] = DIM_FLOOR;
  });
  entries.forEach((e) => {
    if (e.isTop) {
      brightness[e.id] = 1;
      return;
    }
    const ratio = best.score > 0 ? Math.min(1, e.score / best.score) : 1;
    brightness[e.id] = MIN_IW + (SECOND_IW_MAX - MIN_IW) * ratio ** 3;
  });
  const lights = entries.map((e) => ({ id: e.id, strength: e.isTop ? 1 : SECOND_LIGHT }));
  return { best, winners: entries, topIds, lights, brightness };
}

// ---------------------------------------------------------------------------------------------------------------------
// THỜI GIAN XEM KẾT QUẢ "TỚI TRẮNG"
// Ván kết thúc bằng cách HẾT BÀI: kết quả giữ 5 giây (matchFlow.HOLD_RESULT_MS). Ván "tới trắng": 5 giây + thời gian cộng thêm
// tăng dần theo power của tay bài MẠNH NHẤT trên bàn, theo THANG CỐ ĐỊNH DÙNG CHUNG cho cả hai chế độ: power 1 cộng 0,5 giây,
// power 9 (cao nhất của bảng luật, Bát quái Heo ở chế độ Joker) cộng 5 giây, ở giữa tăng đều (tuyến tính, mỗi bậc 0,5625 giây).
// Cùng một power thì cùng thời gian dù chơi chế độ nào; chế độ Thường chỉ có power tới 7 nên tối đa cộng 3,875 giây.
// ---------------------------------------------------------------------------------------------------------------------
export const INSTANT_EXTRA_MIN_MS = 500;
export const INSTANT_EXTRA_MAX_MS = 5000;
export const INSTANT_POWER_MIN = 1;
export const INSTANT_POWER_MAX = 9;

/** Thời gian cộng thêm (ms) cho một tay tới trắng có `power`. Power ngoài khoảng [1, 9] được kẹp vào khoảng đó. */
export function instantExtraMs(power) {
  const p = Math.min(INSTANT_POWER_MAX, Math.max(INSTANT_POWER_MIN, Number(power) || INSTANT_POWER_MIN));
  const ratio = (p - INSTANT_POWER_MIN) / (INSTANT_POWER_MAX - INSTANT_POWER_MIN);
  return Math.round(INSTANT_EXTRA_MIN_MS + (INSTANT_EXTRA_MAX_MS - INSTANT_EXTRA_MIN_MS) * ratio);
}

/** Power cao nhất trong số những người tới trắng (0 nếu ván không có tới trắng). */
export function bestInstantPower(info) {
  if (!info?.has_instant_win) return 0;
  return Math.max(0, ...Object.values(info.instant_win_players || {}).map((e) => Number(e?.power) || 0));
}
