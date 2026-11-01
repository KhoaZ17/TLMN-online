// THƯỞNG VỐN HẰNG NGÀY của Backend: khi đăng nhập, nếu số dư <= 0 và đã sang ngày mới thì Backend tự cộng
// 50.000 chip. Phản hồi đăng nhập CHƯA có cờ riêng báo việc này nên Frontend tự nhận ra bằng cách so số dư
// lần trước (đã nhớ) với số dư mới. Nếu sau này Backend thêm trường `daily_bonus` (số chip được tặng) thì
// truyền vào `explicit` là chính xác tuyệt đối.
//
// Hàm THUẦN — test được bằng Node.

/** Số hợp lệ hoặc null — LƯU Ý: Number(null) === 0 nên phải loại null/'' trước (nếu không "chưa biết" bị hiểu là 0). */
const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Số chip Backend tặng mỗi ngày khi hết tiền (server.py: `balance += 50000.0`). Chỉ dùng để NHẬN RA thưởng
 * khi Backend chưa báo bằng trường `daily_bonus` — đổi con số này nếu bạn đổi mức thưởng ở Backend.
 */
export const DAILY_BONUS_AMOUNT = 50000;

/**
 * Số chip thưởng vốn hằng ngày vừa nhận (0 = không có).
 *  - explicit > 0: Backend báo thẳng.
 *  - ngược lại: lần trước hết tiền (last <= 0) mà số dư tăng đúng bằng mức thưởng ngày -> là thưởng ngày.
 *    (Tăng bằng số khác — vd nhập mã quà tặng ở máy khác — không bị báo nhầm là thưởng ngày; số chip ở menu vẫn
 *    chạy tới giá trị mới.)
 */
export function detectDailyBonus({ last, balance, explicit = 0, expected = DAILY_BONUS_AMOUNT }) {
  const e = Math.round(toNum(explicit) || 0);
  if (e > 0) return e;
  const l = toNum(last);
  const b = toNum(balance);
  if (l == null || b == null) return 0;
  return l <= 0 && Math.abs(b - l - expected) < 1 ? Math.round(b - l) : 0;
}

/**
 * Giá trị để số chip ở menu "chạy" từ đó tới số dư mới (null = hiện thẳng, không chạy).
 * Có thưởng -> chạy từ số dư trước khi được tặng; không thì chạy từ số dư lần trước nếu khác số mới
 * (vd Bot đánh thay bạn giữa ván làm số dư đổi, hoặc nạp chip bằng mã).
 */
export function balanceAnimationStart({ last, balance, bonus = 0 }) {
  const b = toNum(balance);
  if (b == null) return null;
  if (bonus > 0) return Math.round(b - bonus);
  const l = toNum(last);
  if (l == null || Math.round(l) === Math.round(b)) return null;
  return Math.round(l);
}

/** Lời nhắn thông báo thưởng vốn. */
export function bonusMessage(amount) {
  const n = Math.round(amount).toLocaleString('vi-VN');
  return `Số dư của bạn đã hết, sang ngày mới hệ thống tặng thêm ${n} chip tiền vốn.`;
}
