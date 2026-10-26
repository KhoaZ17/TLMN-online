// HIỆU ỨNG CHIP: mỗi lần số dư đổi (chặt, hết ván, tới trắng...) chip bay từ người MẤT sang người ĐƯỢC.
//  - planCoinFlows(deltas, ctx): hàm thuần, lên kế hoạch "ai gửi cho ai bao nhiêu đồng chip" (test được bằng Node)
//  - runChipFx(layer, deltas, ctx): vẽ chip bay (WAAPI) trên lớp phủ cố định + nháy viền avatar xanh/đỏ
//
// SỐ CHIP BAY = SỐ TIỀN NGƯỜI THUA TRẢ, tính bằng "đơn vị chip":
//   Đếm lá     : 1 chip = 1 lần tiền cược      (trả 45 lần cược      -> 45 chip)
//   Nhất ăn tất: 1 tụ (= 1 lần cược) = 10 chip (trả 3,5 tụ = 3,5 lần cược -> 35 chip)
// Thời gian: chip bay trong 1,5–2,3 giây (từ lúc chip đầu tiên rời ghế tới lúc chip cuối chạm đích): ít chip thì 1,5 giây, từ 100 chip
// trở lên là 2,3 giây (các chip được rải đều trong khoảng đó nên nhiều chip vẫn không kéo dài hơn). Vòng sáng ở người nhận chỉ
// loé thêm một nhịp ngắn ngay sau đó, nên TOÀN BỘ hiệu ứng luôn nằm trong 1,5–2,5 giây.
import { prefersReducedMotion } from './flight';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Số chip bay cho MỖI 1 lần tiền cược (1 tụ ở Nhất ăn tất), theo hình thức trả tiền. */
export const CHIPS_PER_STAKE = { count_cards: 1, winner_takes_all: 10 };

export const FX_MIN_MS = 1500; // chip bay ngắn nhất (rất ít chip)
export const FX_MAX_MS = 2300; // chip bay dài nhất (từ FX_FULL_AT chip trở lên)
export const FX_TOTAL_MAX_MS = 2500; // cả hiệu ứng (kể cả vòng sáng cuối) không bao giờ vượt quá
const FX_SHORT_AT = 10; // từ ngần này chip trở xuống: FX_MIN_MS
const FX_FULL_AT = 100; // từ ngần này chip trở lên: FX_MAX_MS
const GLOW_MS = 300; // vòng sáng quanh avatar (xanh = nhận, đỏ = mất)

// Chặn để máy yếu không phải vẽ hàng nghìn chip (ván cóng + thối 3 bích nhân hệ số có thể ra mấy trăm đơn vị).
export const MAX_CHIPS_PER_FLOW = 150; // một người trả cho một người
export const MAX_CHIPS_TOTAL = 300; // cả lần đổi số dư; vượt thì thu nhỏ đều mọi luồng

/** Chip bay trong bao lâu (ms) khi có `totalChips` chip: 1500 -> 2300, tăng đều từ 10 đến 100 chip. */
export function fxDurationMs(totalChips) {
  const k = clamp(((Number(totalChips) || 0) - FX_SHORT_AT) / (FX_FULL_AT - FX_SHORT_AT), 0, 1);
  return Math.round(FX_MIN_MS + (FX_MAX_MS - FX_MIN_MS) * k);
}

/** Một đồng chip bay hết quãng đường mất bao lâu (ms): 800 khi hiệu ứng ngắn nhất, 1000 khi dài nhất. */
export function flightMsFor(windowMs) {
  return Math.round(800 + 0.25 * (windowMs - FX_MIN_MS));
}

/** Toàn bộ hiệu ứng (ms) tính cả vòng sáng ở người nhận: luôn trong [1500, 2500]. */
export function fxTotalMs(totalChips) {
  const w = fxDurationMs(totalChips);
  return Math.round(w - 0.1 * flightMsFor(w) + GLOW_MS); // vòng sáng bắt đầu lúc chip cuối sắp chạm đích
}

/** Chia `total` chip cho các phần theo tỉ lệ `weights`, tổng đúng bằng `total` (phần dư chia theo số lẻ lớn nhất). */
function allocate(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((s, v) => s + v, 0);
  raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .forEach(({ i }) => {
      if (left > 0) {
        out[i] += 1;
        left -= 1;
      }
    });
  return out;
}

function capFlows(flows) {
  flows.forEach((f) => {
    f.count = Math.min(f.count, MAX_CHIPS_PER_FLOW);
  });
  const total = flows.reduce((s, f) => s + f.count, 0);
  if (total > MAX_CHIPS_TOTAL) {
    const k = MAX_CHIPS_TOTAL / total;
    flows.forEach((f) => {
      f.count = Math.max(1, Math.floor(f.count * k));
    });
  }
  return flows;
}

/**
 * deltas: { [seatId]: số chip thay đổi }. ctx: { cost, paymentMode } (state.config) để quy ra "đơn vị chip".
 * Trả về mảng { from, to, count }, trong đó from/to là id ghế hoặc 'table' (giữa bàn) khi chỉ có người được hoặc chỉ có người mất.
 * Mỗi người thua gửi ĐÚNG số đơn vị mình mất; nhiều người thắng thì chia theo phần ăn của từng người. Không biết `cost`
 * (Backend quá cũ không gửi config) thì dự phòng: số chip tỉ lệ với số tiền, từ 3 tới 10.
 */
export function planCoinFlows(deltas, { cost = 0, paymentMode = 'count_cards' } = {}) {
  const entries = Object.entries(deltas || {})
    .map(([id, d]) => ({ id, d: Number(d) }))
    .filter((e) => e.d !== 0 && Number.isFinite(e.d));
  const winners = entries.filter((e) => e.d > 0);
  const losers = entries.filter((e) => e.d < 0);
  const stake = Number(cost);
  const perStake = CHIPS_PER_STAKE[paymentMode] ?? CHIPS_PER_STAKE.count_cards;
  const maxAbs = Math.max(1, ...entries.map((e) => Math.abs(e.d)));
  const chipsFor = (amount) =>
    stake > 0
      ? Math.max(1, Math.round((Math.abs(amount) / stake) * perStake))
      : clamp(Math.round((Math.abs(amount) / maxAbs) * 10), 3, 10);

  const flows = [];
  if (winners.length && losers.length) {
    losers.forEach((l) => {
      const shares = allocate(chipsFor(l.d), winners.map((w) => w.d));
      winners.forEach((w, i) => {
        if (shares[i] > 0) flows.push({ from: l.id, to: w.id, count: shares[i] });
      });
    });
  } else if (winners.length) {
    winners.forEach((w) => flows.push({ from: 'table', to: w.id, count: chipsFor(w.d) }));
  } else {
    losers.forEach((l) => flows.push({ from: l.id, to: 'table', count: chipsFor(l.d) }));
  }
  return capFlows(flows);
}

function centerOf(anchor) {
  const el =
    anchor === 'table'
      ? document.querySelector('.tl-table__center')
      : document.querySelector(`[data-avatar="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, r.height) };
}

function pulse(anchor, kind, duration = GLOW_MS) {
  const el = anchor === 'table' ? null : document.querySelector(`[data-avatar="${anchor}"]`);
  if (!el || !el.animate) return;
  const c = kind === 'gain' ? '52, 211, 153' : '248, 113, 113';
  el.animate(
    [
      { boxShadow: `0 0 0 0 rgba(${c}, 0.9)` },
      { boxShadow: `0 0 0 12px rgba(${c}, 0)`, offset: 1 },
    ],
    { duration, easing: 'ease-out' }
  );
}

function flyCoin(layer, from, to, { delay, duration, size, arc }) {
  const el = document.createElement('div');
  el.className = 'tl-coin';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.opacity = '0';
  layer.appendChild(el);
  const pos = (p, dx = 0, dy = 0, s = 1) => `translate(${(p.x - size / 2 + dx).toFixed(1)}px, ${(p.y - size / 2 + dy).toFixed(1)}px) scale(${s})`;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const anim = el.animate(
    [
      { transform: pos(from, 0, 0, 0.5), opacity: 0 },
      { transform: pos(from, 0, 0, 1), opacity: 1, offset: 0.12 },
      { transform: pos({ x: mx, y: my }, arc.x, arc.y, 1.1), opacity: 1, offset: 0.55 },
      { transform: pos(to, 0, 0, 0.8), opacity: 1, offset: 0.92 },
      { transform: pos(to, 0, 0, 0.4), opacity: 0 },
    ],
    { duration, delay, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'both' }
  );
  const done = anim.finished.catch(() => undefined).then(() => el.remove());
  return { anim, done };
}

/** Điểm lệch ngẫu nhiên quanh `p` (bán kính r) để nhiều chip không chồng khít thành một đồng. */
const scatter = (p, r) => ({ ...p, x: p.x + (Math.random() - 0.5) * 2 * r, y: p.y + (Math.random() - 0.5) * 2 * r });

/** Cỡ đồng chip (px): to hơn hẳn bản cũ (10–22px), theo cỡ avatar, sàn 24px, trần 38px. */
export function chipSizeFor(avatarSize) {
  return Math.round(clamp((Number(avatarSize) || 0) * 0.6, 24, 38));
}

/**
 * Chạy hiệu ứng cho một lần đổi số dư. Trả về { done, cancel, duration, flows }.
 * `ctx` = { cost, paymentMode } lấy từ state.config. Chỉ gọi khi có DOM (GameScreen); giảm chuyển động -> chỉ nháy viền, không bay chip.
 * Mọi luồng chạy SONG SONG, chip của từng luồng được rải đều theo thời gian nên tổng thời gian chỉ phụ thuộc số chip (fxDurationMs).
 * Trả về thêm `duration` (chip bay bao lâu) và `totalMs` (cả hiệu ứng, kể cả vòng sáng).
 */
export function runChipFx(layer, deltas, ctx = {}) {
  const flows = planCoinFlows(deltas, ctx);
  const total = flows.reduce((s, f) => s + f.count, 0);
  const duration = fxDurationMs(total); // chip bay bao lâu
  const flight = flightMsFor(duration);
  const running = [];
  const finish = [];
  const reduced = prefersReducedMotion();

  const spread = Math.max(0, duration - flight); // khoảng thời gian rải điểm xuất phát của chip
  const flowStep = flows.length > 1 ? Math.min(60, spread / (2 * flows.length)) : 0; // các luồng lệch nhau chút cho tự nhiên
  const coinSpread = Math.max(0, spread - flowStep * (flows.length - 1));

  flows.forEach((flow, fi) => {
    const from = centerOf(flow.from);
    const to = centerOf(flow.to);
    if (!from || !to) return;
    const size = chipSizeFor(Math.min(from.size, to.size));
    const lastDelay = fi * flowStep + (flow.count > 1 ? coinSpread : 0); // chip cuối của luồng này rời ghế lúc này
    if (!reduced && layer) {
      for (let k = 0; k < flow.count; k++) {
        const delay = fi * flowStep + (flow.count > 1 ? (k * coinSpread) / (flow.count - 1) : 0);
        const arc = { x: (Math.random() - 0.5) * 70, y: -24 - Math.random() * 46 };
        const c = flyCoin(layer, scatter(from, size * 0.4), scatter(to, size * 0.3), { delay, duration: flight, size, arc });
        running.push(c.anim);
        finish.push(c.done);
      }
    }
    const arriveAt = reduced ? 0 : Math.round(lastDelay + flight * 0.9);
    const t1 = setTimeout(() => pulse(flow.to, 'gain'), arriveAt);
    const t2 = setTimeout(() => pulse(flow.from, 'loss'), reduced ? 0 : Math.round(fi * flowStep));
    running.push({ cancel: () => (clearTimeout(t1), clearTimeout(t2)) });
  });
  // `done` chỉ xong khi hết cả hiệu ứng (kể cả vòng sáng cuối).
  const totalMs = reduced ? GLOW_MS : fxTotalMs(total);
  finish.push(new Promise((res) => setTimeout(res, totalMs)));

  return {
    done: Promise.all(finish),
    cancel: () => running.forEach((a) => a.cancel?.()),
    duration: reduced ? 0 : duration,
    totalMs,
    flows,
  };
}

/**
 * Xu bay từ phần tử `fromEl` tới `toEl` (dùng ngoài bàn chơi: thưởng vốn hằng ngày, đổi mã quà tặng -> ô số
 * dư ở menu). Chạm đích thì nháy sáng `toEl`. Giảm chuyển động hoặc thiếu phần tử -> không làm gì.
 */
export function flyCoinsBetween(layer, fromEl, toEl, { count = 9, gain = true } = {}) {
  const none = { done: Promise.resolve(), cancel() {} };
  if (!layer || !fromEl || !toEl || prefersReducedMotion()) return none;
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, r.height) };
  };
  const from = rect(fromEl);
  const to = rect(toEl);
  const size = 20;
  const flights = [];
  for (let k = 0; k < count; k++) {
    const arc = { x: (Math.random() - 0.5) * 90, y: -30 - Math.random() * 50 };
    flights.push(flyCoin(layer, from, to, { delay: k * 85, duration: 820, size, arc }));
  }
  const rgb = gain ? '52, 211, 153' : '248, 113, 113';
  const glow = setTimeout(() => {
    toEl.animate?.(
      [
        { boxShadow: `0 0 0 0 rgba(${rgb}, 0.85)` },
        { boxShadow: `0 0 0 14px rgba(${rgb}, 0)`, offset: 1 },
      ],
      { duration: 1000, easing: 'ease-out' }
    );
  }, 600 + count * 85);
  return {
    done: Promise.all(flights.map((f) => f.done)),
    cancel: () => {
      clearTimeout(glow);
      flights.forEach((f) => f.anim.cancel());
    },
  };
}
