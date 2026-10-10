// Hình học & kế hoạch animation cho tay bài XÒE QUẠT — toàn bộ là hàm thuần
// (không đụng React/DOM) để test được bằng Node; HandFan.jsx chỉ việc áp kết quả.
//
// Mô hình: các lá nằm trên 1 cung tròn bán kính R, tâm cung ở phía DƯỚI tay
// bài. Lá thứ i ở góc θi, trải từ -A (lá đầu) đến +A (lá cuối) và được xoay
// đúng bằng θi quanh tâm của chính nó (tương đương xoay quanh tâm cung) nên
// ra dáng quạt: lá đầu nghiêng -12°, lá cuối +12°, hai đầu thấp hơn giữa (độ
// cong). Lá sau luôn đè lên lá trước nên góc trên-trái (hạng + chất, kể cả
// chữ JOKER) của mọi lá đều lộ ra.
//
// Hệ toạ độ của 1 lá: phần tử đặt `left:50%; top:0` trong khung chứa, rồi
// `translate(x, y) rotate(rot) scale(s)` — x,y là vị trí GÓC TRÊN-TRÁI lá chưa
// xoay so với (giữa khung, mép trên khung). Luôn viết đủ 3 hàm theo cùng 1
// thứ tự để trình duyệt nội suy (WAAPI) đúng.

export const CARD_RATIO = 74 / 104; // rộng / cao — ảnh thật 74x104 (≈ 5:7)
const DEG = Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100;
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Nửa góc xòe (độ): 12° khi đủ lá, ít lá thì xòe hẹp lại cho tự nhiên. */
export function fanHalfAngleDeg(count, maxAngle = 12, perCard = 1.8) {
  if (count <= 1) return 0;
  return Math.min(maxAngle, perCard * (count - 1));
}

/**
 * Tính bố cục quạt cho `count` lá trong khung rộng `containerWidth`, lá cao
 * `cardH` (lấy từ biến CSS --hand-card-h nên đồng bộ với CSS theo vh).
 * - Độ lộ mỗi lá (bước dọc cung) ưu tiên `preferVisible`*w, tối thiểu
 *   `minVisible`*w (đủ lộ góc hạng/chất). Nếu 13-14 lá vẫn không vừa bề rộng
 *   thì THU NHỎ lá (giữ đúng tỉ lệ) cho vừa — không bao giờ tràn khung.
 */
export function computeFanLayout({
  count,
  containerWidth,
  cardH,
  maxAngle = 12,
  preferVisible = 0.5,
  minVisible = 0.32,
  margin = 2,
  liftRatio = 0.3,
}) {
  const n = Math.max(0, Math.floor(count));
  let h = cardH;
  let w = h * CARD_RATIO;
  const A = fanHalfAngleDeg(n, maxAngle) * DEG;
  const sinc = A > 0 ? Math.sin(A) / A : 1;
  // Bề rộng khung bao của 1 lá xoay góc A, chia cho w.
  const edge = Math.cos(A) + Math.sin(A) / CARD_RATIO;
  const avail = Math.max(1, containerWidth - 2 * margin);

  let step = 0;
  if (n > 1) {
    const sFit = (avail - w * edge) / ((n - 1) * sinc);
    step = Math.min(preferVisible * w, sFit);
    if (step < minVisible * w) {
      w = avail / (minVisible * (n - 1) * sinc + edge);
      h = w / CARD_RATIO;
      step = minVisible * w;
    }
  } else if (n === 1) {
    w = Math.min(w, avail);
    h = w / CARD_RATIO;
  }

  // Bán kính cung: độ dài cung giữa 2 lá liền kề = step, tổng góc = 2A.
  const radius = A > 0 ? ((n - 1) * step) / (2 * A) : h * 4;
  const thetas = [];
  for (let i = 0; i < n; i++) thetas.push(n > 1 ? A * ((2 * i) / (n - 1) - 1) : 0);

  const lift = liftRatio * h;
  let minTop = 0;
  let maxBottom = 0;
  thetas.forEach((th) => {
    const cy = radius * (1 - Math.cos(th));
    const hh = (h / 2) * Math.cos(th) + (w / 2) * Math.abs(Math.sin(th));
    minTop = Math.min(minTop, cy - hh);
    maxBottom = Math.max(maxBottom, cy + hh);
  });
  if (n === 0) {
    minTop = -h / 2;
    maxBottom = h / 2;
  }
  const y0 = lift - minTop; // toạ độ y của tâm lá giữa (θ=0) trong khung
  return {
    n,
    cardW: w,
    cardH: h,
    step,
    angleDeg: A / DEG,
    radius,
    lift,
    y0,
    thetas,
    containerHeight: Math.ceil(y0 + maxBottom + 1),
  };
}

/** Pose (toạ độ tâm + góc) của lá ở góc theta, nâng thêm `lift` px hướng RA NGOÀI cung. */
export function fanPose(layout, theta, lift = 0) {
  const { radius, cardW, cardH, y0 } = layout;
  const rr = radius + lift;
  const cx = rr * Math.sin(theta); // so với GIỮA khung (theo x)
  const cy = y0 + radius - rr * Math.cos(theta); // so với MÉP TRÊN khung
  return { cx, cy, x: cx - cardW / 2, y: cy - cardH / 2, rot: theta / DEG };
}

export function poseTransform(p, scale = 1) {
  return `translate(${r2(p.x)}px, ${r2(p.y)}px) rotate(${r2(p.rot)}deg) scale(${r2(scale)})`;
}

export const slotTransform = (layout, index, lift = 0, scale = 1) =>
  poseTransform(fanPose(layout, layout.thetas[index], lift), scale);

const frame = (layout, theta, lift, z) => {
  const f = { transform: poseTransform(fanPose(layout, theta, lift)) };
  if (z != null) f.zIndex = z;
  return f;
};

/** Đổi chỗ GẦN: trượt dọc cung tròn từ góc này sang góc kia (dịch X/Y + xoay đồng thời). */
export function arcKeyframes(layout, thetaFrom, thetaTo, { steps = 6, z } = {}) {
  const out = [];
  for (let k = 0; k <= steps; k++) {
    out.push(frame(layout, thetaFrom + (thetaTo - thetaFrom) * (k / steps), 0, z));
  }
  return out;
}

/**
 * Đổi chỗ XA: nhấc lá bổng lên (hướng ra ngoài cung), lướt ngang qua các lá
 * khác trên cung lớn hơn đồng thời xoay dần về góc đích, rồi hạ xuống nhét vào
 * khe. z-index cao trong suốt lúc di chuyển để lá luôn nằm trên các lá khác.
 */
export function liftKeyframes(layout, thetaFrom, thetaTo, { lift = layout.cardH * 0.55, glideSteps = 8, z = 200 } = {}) {
  const f = (theta, l, offset, easing) => ({ ...frame(layout, theta, l, z), offset, easing });
  const out = [f(thetaFrom, 0, 0, 'cubic-bezier(.2,.8,.3,1)'), f(thetaFrom, lift, 0.22, 'linear')];
  for (let k = 1; k <= glideSteps; k++) {
    const t = k / glideSteps;
    const theta = thetaFrom + (thetaTo - thetaFrom) * smoothstep(t);
    out.push(f(theta, lift, 0.22 + 0.56 * t, k === glideSteps ? 'ease-in' : 'linear'));
  }
  out.push(f(thetaTo, 0, 1));
  return out;
}

/** Từ cọc bài (tâm cọc đã quy về toạ độ khung: from.cx/cy) bay về ĐÚNG vị trí + góc xòe của lá. */
export function dealKeyframes(layout, theta, from, { startScale = 1, startRot = 0 } = {}) {
  const { cardW, cardH } = layout;
  const start = { x: from.cx - cardW / 2, y: from.cy - cardH / 2, rot: startRot };
  return [
    { transform: poseTransform(start, startScale), opacity: 1 },
    { transform: slotTransform(layout, layout.thetas.indexOf(theta)), opacity: 1 },
  ];
}

/** Từ chỗ lá đang nằm trên tay (kể cả đang nâng) bay thẳng tới toạ độ đích (tâm, góc, tỉ lệ) quy về khung. */
export function flyOutKeyframes(layout, theta, lift, target) {
  const { cardW, cardH } = layout;
  const end = { x: target.cx - cardW / 2, y: target.cy - cardH / 2, rot: target.rot };
  return [
    { transform: poseTransform(fanPose(layout, theta, lift), 1) },
    { transform: poseTransform(end, target.scale) },
  ];
}

/** Viewport (x,y) -> toạ độ tâm quy về khung (cx: so với giữa khung, cy: so với mép trên). */
export function toContainerPoint(point, rect) {
  return { cx: point.x - (rect.left + rect.width / 2), cy: point.y - rect.top };
}

/**
 * Kế hoạch xếp bài kiểu NGƯỜI: duyệt từ trái sang phải, mỗi lá nhấc ra rồi
 * nhét vào đúng chỗ trong phần đã xếp (insertion sort theo thứ tự `target` mà
 * Backend trả về). Mỗi bước: {card, from, to, near, shifted, order}.
 *  - near (from - to = 1): đổi chỗ với lá kế bên -> trượt dọc cung.
 *  - xa (from - to >= 2): nhấc lên, lướt qua các lá khác, hạ xuống khe.
 */
export function planInsertionMoves(start, target) {
  const rank = new Map(target.map((c, i) => [c, i]));
  const rankOf = (c) => (rank.has(c) ? rank.get(c) : target.length + 1);
  const arr = start.slice();
  const moves = [];
  for (let i = 1; i < arr.length; i++) {
    const card = arr[i];
    const rc = rankOf(card);
    let j = i;
    while (j > 0 && rankOf(arr[j - 1]) > rc) j--;
    if (j === i) continue;
    arr.splice(i, 1);
    arr.splice(j, 0, card);
    moves.push({ card, from: i, to: j, near: i - j === 1, shifted: i - j, order: arr.slice() });
  }
  return moves;
}

/** Thời lượng từng bước (ms), co lại để tổng (cả khoảng nghỉ giữa các bước) <= budgetMs. */
export function planDurations(moves, { budgetMs = 2400, gapMs = 30, near = 170, farBase = 240, farPerCard = 25, min = 90 } = {}) {
  const raw = moves.map((m) => (m.near ? near : Math.min(420, farBase + farPerCard * (m.shifted - 2))));
  const total = raw.reduce((a, b) => a + b, 0) + gapMs * moves.length;
  const k = total > budgetMs ? Math.max(0, (budgetMs - gapMs * moves.length) / raw.reduce((a, b) => a + b, 1)) : 1;
  return raw.map((d) => Math.max(min, Math.round(d * k)));
}

/** Lịch chia bài vòng tròn: tổng thời gian ~totalMs (1.5-2.5s), mỗi lá bay flightMs. */
export function dealSchedule({ players, perPlayer, flightMs = 420, totalMs = 2000 }) {
  const total = players * perPlayer;
  const stagger = total > 1 ? Math.max(18, (totalMs - flightMs) / (total - 1)) : 0;
  return { total, stagger, flightMs, duration: Math.round((total - 1) * stagger + flightMs) };
}

/** Xáo ổn định theo seed (mỗi ván cùng 1 thứ tự khi render lại) — luôn khác thứ tự đã xếp nếu có >= 2 lá. */
export function shuffleOrder(cards, seed = 1) {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = cards.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (arr.length > 1 && arr.every((c, i) => c === cards[i])) arr.push(arr.shift());
  return arr;
}
