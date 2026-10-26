// TỚI TRẮNG: chọn người mạnh nhất để chiếu đèn sân khấu và tính độ mờ nhẹ của những người còn lại.
// Hàm thuần; dữ liệu đầu vào là `instant_win_info` Backend trả về:
//   { has_instant_win, net_changes, instant_win_players: { id: { hand_name, power, highest, multiplier } }, transaction_logs }
import { cardPower } from './cardPower';

/** Điểm so sánh: power của tay bài (chính) + lá lớn nhất làm điểm phụ (<= 0.5) — đúng thứ tự Backend phân thắng thua. */
export function instantScore(entry) {
  return Number(entry?.power ?? 0) + 0.5 * (cardPower(entry?.highest) / 52);
}

// Độ rõ (1 = bình thường; GameScreen áp thành opacity của ghế). Chỉ MỜ RẤT NHẸ để màn hình vẫn sáng và người thua đọc
// rõ bài của mình lẫn bài lật ngửa của người khác: người không tới trắng còn 85%; người tới trắng yếu hơn nằm giữa 93%
// và 100% tuỳ sức mạnh tay bài.
export const DIM_FLOOR = 0.85;
export const MIN_IW = 0.93;

/**
 * @param info       state.instant_win_info
 * @param seatIds    danh sách id ghế đang có trên bàn (number | string)
 * @returns null nếu không có ai tới trắng, ngược lại:
 *   best       { id, handName, power, highest, multiplier, score }  — người mạnh nhất (được chiếu sáng)
 *   winners    mọi người tới trắng, mạnh -> yếu
 *   brightness { [id]: DIM_FLOOR..1 }  — 1 = rõ hẳn; người tới trắng yếu hơn mờ dần theo sức mạnh tay bài
 */
export function analyzeInstantWin(info, seatIds = []) {
  if (!info?.has_instant_win) return null;
  const entries = Object.entries(info.instant_win_players || {}).map(([id, e]) => ({
    id: Number(id),
    handName: e.hand_name,
    power: e.power,
    highest: e.highest,
    multiplier: e.multiplier,
    score: instantScore(e),
  }));
  if (entries.length === 0) return null;

  entries.sort((a, b) => b.score - a.score || a.id - b.id);
  const best = entries[0];
  const brightness = {};
  seatIds.forEach((id) => {
    brightness[Number(id)] = DIM_FLOOR;
  });
  entries.forEach((e) => {
    const ratio = best.score > 0 ? e.score / best.score : 1;
    brightness[e.id] = e === best ? 1 : Math.max(MIN_IW, MIN_IW + (1 - MIN_IW) * ratio ** 3);
  });
  return { best, winners: entries, brightness };
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
