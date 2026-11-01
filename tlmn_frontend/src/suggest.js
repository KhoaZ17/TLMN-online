// GỢI Ý ĐÁNH BÀI THÔNG MINH — hàm thuần (không đụng React/DOM) để test được bằng Node.
//
// Khi tới lượt Bạn VÀ trên bàn đang có bài cần đè, mỗi lần Bạn CHỌN một lá, hệ thống
// tự chọn luôn các lá còn lại của một nước đi hợp lệ (lấy từ legal_actions của Backend):
//   A. "Mở rộng": các nước đi chứa TẤT CẢ lá đang chọn + lá vừa bấm.
//   B. "Chuyển hướng": nếu A không có, các nước đi chứa lá vừa bấm (bỏ lựa chọn cũ).
//   C. "Chọn tay": nếu B cũng không có, chỉ đơn giản thêm lá vừa bấm.
// Trong nhiều ứng viên, ưu tiên (theo thứ tự):
//   1. cùng số lá với bộ bài đang nằm trên bàn,  2. ít Joker hơn,
//   3. ít lá hơn,  4. lá lớn nhất nhỏ nhất (đánh nước "nhẹ" nhất đủ đè).
// Chạy tốt ở chế độ Joker vì chỉ làm việc trên chính các nước đi Backend đã cho phép.
//
// Bỏ chọn một lá do HỆ THỐNG tự thêm => tắt gợi ý trong phần còn lại của lượt đó
// (GameScreen đặt lại cờ này khi một lượt mới tới Bạn). Bỏ chọn lá do chính Bạn bấm
// thì chỉ gỡ cả cụm gợi ý đi kèm, gợi ý vẫn bật.
import { cardPower, isJoker } from './cardPower';

const jokerCount = (action) => action.reduce((n, c) => n + (isJoker(c) ? 1 : 0), 0);
const topPower = (action) => action.reduce((m, c) => Math.max(m, cardPower(c)), 0);
const sumPower = (action) => action.reduce((s, c) => s + cardPower(c), 0);

/** Xếp ứng viên tốt nhất lên đầu (không thay đổi mảng gốc). */
export function rankActions(actions, tableLength) {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => {
      const ma = a.action.length === tableLength ? 0 : 1;
      const mb = b.action.length === tableLength ? 0 : 1;
      return (
        ma - mb ||
        jokerCount(a.action) - jokerCount(b.action) ||
        a.action.length - b.action.length ||
        topPower(a.action) - topPower(b.action) ||
        sumPower(a.action) - sumPower(b.action) ||
        a.index - b.index
      );
    })
    .map((x) => x.action);
}

/** Có nên gợi ý lúc này không: tới lượt, bàn có bài, có nước đánh thật, và chưa bị tắt trong lượt này. */
export function canSuggest({ isMyTurn, tableLength, legalActions, disabled }) {
  if (!isMyTurn || disabled || tableLength <= 0) return false;
  return (legalActions || []).some((a) => a.length > 0);
}

/**
 * Bạn bấm CHỌN lá `clicked` (chưa nằm trong `selected`).
 * Trả về { selected, auto, mode }:
 *   selected — danh sách lá được chọn sau thao tác
 *   auto     — những lá do hệ thống TỰ thêm (không gồm lá bạn đã bấm)
 *   mode     — 'extend' | 'switch' | 'plain'
 */
export function suggestOnSelect({ clicked, selected, legalActions, tableLength }) {
  const moves = (legalActions || []).filter((a) => a.length > 0);
  const base = [...selected, clicked];

  const supersets = moves.filter((a) => base.every((c) => a.includes(c)));
  if (supersets.length > 0) {
    const best = rankActions(supersets, tableLength)[0];
    return { selected: best.slice(), auto: best.filter((c) => !base.includes(c)), mode: 'extend' };
  }

  const containing = moves.filter((a) => a.includes(clicked));
  if (containing.length > 0) {
    const best = rankActions(containing, tableLength)[0];
    return { selected: best.slice(), auto: best.filter((c) => c !== clicked), mode: 'switch' };
  }

  return { selected: base, auto: [], mode: 'plain' };
}

/**
 * Bạn bấm BỎ CHỌN lá `card`. `auto` là các lá hệ thống đã tự thêm trước đó.
 * Trả về { selected, auto, disable } — disable=true nghĩa là tắt gợi ý cho hết lượt này.
 */
export function suggestOnUnselect({ card, selected, auto }) {
  if (auto.includes(card)) {
    return { selected: selected.filter((c) => c !== card), auto: [], disable: true };
  }
  if (auto.length > 0) {
    return { selected: selected.filter((c) => c !== card && !auto.includes(c)), auto: [], disable: false };
  }
  return { selected: selected.filter((c) => c !== card), auto: [], disable: false };
}
