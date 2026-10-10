// Các hàm điều phối nhịp độ Bot, bố cục ghế ngồi và hiển thị bài trên bàn.

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Thời lượng hiệu ứng "bay bài" (ms) — 0.2-0.4s theo yêu cầu nhịp độ mới.
// Rút ngắn gần như tức thời nếu người dùng bật "giảm chuyển động".
export const FLIGHT_MS =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 60 : 300;

/**
 * Thời gian Bot "suy nghĩ" (giây) trước khi lộ nước đi, TỈ LỆ THUẬN với số lá
 * sắp đánh: delay = 1.5 + (số_lá - 1) * 0.35  (1 lá -> 1.5s, 11 lá -> 5.0s).
 * Bỏ lượt: cố định 1.5s (không có "số lá" để tính).
 */
export function computeBotThinkSeconds({ passed, comboLength = 1 }) {
  if (passed) return 1.5;
  const n = Math.max(1, comboLength);
  return 1.5 + (n - 1) * 0.35;
}

/**
 * Vị trí ghế của từng Bot quanh bàn theo player_id, tuỳ tổng số người chơi.
 * Luôn ngược chiều kim đồng hồ và Bot 1 (player_id 1) luôn ở bên PHẢI Bạn:
 *  - 2 người (Bạn + 1 Bot): Bot 1 -> trên (đối diện)
 *  - 3 người (Bạn + 2 Bot): Bot 1 -> phải, Bot 2 -> trái
 *  - 4 người (Bạn + 3 Bot): Bot 1 -> phải, Bot 2 -> trên, Bot 3 -> trái
 */
export function getSeatPositions(numPlayers) {
  if (numPlayers <= 2) return { 1: 'top' };
  if (numPlayers === 3) return { 1: 'right', 2: 'left' };
  return { 1: 'right', 2: 'top', 3: 'left' };
}

export function getSeatDirection(playerId, numPlayers) {
  return getSeatPositions(numPlayers)[playerId] || 'top';
}

/**
 * Mảng bài để HIỂN THỊ cho bộ bài đang đứng trên bàn (table.*). Ưu tiên
 * table.last_combo_details.transformed_cards — Joker đã được backend "biến
 * hình" thành lá thật (vd Joker -> 3♠) — nếu có; nếu không (bàn trống, hoặc
 * backend cũ chưa trả trường này) thì dùng last_combo_cards gốc.
 */
export function getDisplayCombo(table) {
  if (!table) return [];
  const transformed = table.last_combo_details?.transformed_cards;
  if (Array.isArray(transformed) && transformed.length > 0) return transformed;
  return table.last_combo_cards || [];
}

/** So sánh 2 mảng chuỗi bài theo đúng thứ tự — dùng để biết bàn có "đổi combo" thật hay chỉ là poll lặp lại. */
export function sameComboArray(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((c, i) => c === b[i]);
}

/**
 * Lệch nhẹ NGẪU NHIÊN ĐỘC LẬP quanh TÂM CỐ ĐỊNH của bàn cho mỗi combo mới —
 * KHÔNG cộng dồn theo combo trước (đã thử cách cộng dồn nhưng dễ trôi dạt
 * về một góc trông mất thẩm mỹ). Trọng tâm mọi combo luôn neo tại tâm bàn
 * (xem cách GameScreen render: flex items-center justify-center của khung
 * cha, tương đương top:50%/left:50%/translate(-50%,-50%)); giá trị trả về
 * ở đây chỉ là độ "xô lệch" nhỏ để tạo cảm giác lớp bài chồng tự nhiên.
 */
export function randomStackOffset() {
  return {
    x: Math.round((Math.random() - 0.5) * 36), // -18..18px
    y: Math.round((Math.random() - 0.5) * 26), // -13..13px
  };
}

/**
 * Góc xoay ngẫu nhiên (độ), áp dụng cho CẢ CỤM combo/lá đơn khi hạ xuống bàn
 * (xoay nguyên khối ở khung cha) — không xoay riêng từng lá bên trong 1
 * combo, nên các lá trong cùng 1 combo vẫn thẳng hàng với nhau, chỉ cả cụm
 * nghiêng nhẹ tự nhiên: -8..+8°.
 */
export function randomGroupRotation() {
  return Math.round((Math.random() * 16 - 8) * 10) / 10; // -8.0 .. 8.0
}

/**
 * Tạo 1 mục của chồng bài trên bàn: vị trí lệch + góc xoay ngẫu nhiên được chốt
 * NGAY LÚC TẠO (không random lại mỗi lần render). `hidden` = dựng sẵn nhưng chưa
 * hiện, để đo toạ độ đích cho hiệu ứng bài bay rồi bay xong mới hiện.
 */
export function createStackEntry(cards, { hidden = false } = {}) {
  const offset = randomStackOffset();
  return {
    key: `${Date.now()}-${Math.random()}`,
    cards,
    offsetX: offset.x,
    offsetY: offset.y,
    groupRotation: randomGroupRotation(),
    hidden,
  };
}

/**
 * Ghép các lá Bạn vừa chọn trên tay với từng ô của combo hiển thị trên bàn.
 * Lá giống hệt thì về đúng ô của nó; Joker đã "biến hình" (bàn hiện lá thật,
 * ví dụ X♠ -> 5♦) thì nhận các ô còn lại theo thứ tự. Trả về Map lá -> chỉ số ô.
 */
export function assignComboSlots(cards, combo) {
  const slotOf = new Map();
  const used = new Set();
  combo.forEach((c, j) => {
    if (cards.includes(c) && !slotOf.has(c)) {
      slotOf.set(c, j);
      used.add(j);
    }
  });
  const freeSlots = combo.map((_, j) => j).filter((j) => !used.has(j));
  cards
    .filter((c) => !slotOf.has(c))
    .forEach((c, k) => slotOf.set(c, freeSlots[k] ?? freeSlots[freeSlots.length - 1] ?? 0));
  return slotOf;
}

/**
 * Format số tiền/chip theo hệ thống k, M, B, T.
 * - Làm tròn xuống tối đa 2 chữ số thập phân.
 * - Tự động bỏ các số 0 thừa đằng sau dấu phẩy (vd: 477.00k -> 477k, 477.50k -> 477.5k).
 */
export function formatChip(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '0';
  const num = Number(amount);
  if (num === 0) return '0';

  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  const units = [
    { value: 1e12, symbol: 'T' },
    { value: 1e9,  symbol: 'B' },
    { value: 1e6,  symbol: 'M' },
    { value: 1e3,  symbol: 'k' },
  ];

  for (const { value, symbol } of units) {
    if (abs >= value) {
      // + 1e-9 để tránh lỗi làm tròn số thực trong JS (floating-point precision issue)
      const val = Math.floor((abs / value + 1e-9) * 100) / 100;
      return `${sign}${val}${symbol}`;
    }
  }

  const val = Math.floor((abs + 1e-9) * 100) / 100;
  return `${sign}${val}`;
}
