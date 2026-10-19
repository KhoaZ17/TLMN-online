// TỚI TRẮNG: chọn người mạnh nhất để chiếu đèn sân khấu và tính độ tối của những người còn lại.
// Hàm thuần; dữ liệu đầu vào là `instant_win_info` Backend trả về:
//   { has_instant_win, net_changes, instant_win_players: { id: { hand_name, power, highest, multiplier } }, transaction_logs }
import { cardPower } from './cardPower';

/** Điểm so sánh: power của tay bài (chính) + lá lớn nhất làm điểm phụ (<= 0.5) — đúng thứ tự Backend phân thắng thua. */
export function instantScore(entry) {
  return Number(entry?.power ?? 0) + 0.5 * (cardPower(entry?.highest) / 52);
}

export const DIM_FLOOR = 0.18; // người không tới trắng gần như chìm hẳn
const MIN_IW = 0.2;

/**
 * @param info       state.instant_win_info
 * @param seatIds    danh sách id ghế đang có trên bàn (number | string)
 * @returns null nếu không có ai tới trắng, ngược lại:
 *   best       { id, handName, power, highest, multiplier, score }  — người mạnh nhất (được chiếu sáng)
 *   winners    mọi người tới trắng, mạnh -> yếu
 *   brightness { [id]: 0..1 }  — 1 = sáng hẳn; người tới trắng yếu hơn tối dần theo sức mạnh tay bài
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
