// HIỆU ỨNG CHIP BAY (kiểu ban đầu): mỗi lần số dư đổi (chặt, hết ván, tới trắng...) một dây đồng xu bay từ người MẤT sang người ĐƯỢC,
// avatar nháy viền đỏ (mất) / xanh (được). Khác bản đầu ở đúng một điểm: SỐ DƯ giảm / tăng DẦN trong lúc xu bay, như tiền bay vào túi:
//   - mỗi đồng xu RỜI avatar người mất thì số dư người mất giảm một phần,
//   - mỗi đồng xu CHẠM avatar người được thì số dư người được tăng một phần,
//   tổng các phần đúng bằng số tiền đổi (xem fxMoney.js, BalanceChip.jsx).
//  - planClassicFlows / buildClassicMoney: hàm thuần (test được bằng Node)
//  - runChipFx(layer, deltas): vẽ đồng xu (WAAPI) trên lớp phủ cố định, nháy viền avatar, trả về lịch tiền để fxMoney chạy
import { prefersReducedMotion } from './flight';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const FLIGHT_MS = 700; // thời gian bay của một đồng xu
export const CHIP_GAP_MS = 70; // hai đồng xu liên tiếp trong một dây cách nhau
export const FLOW_GAP_MS = 90; // dây sau xuất phát sau dây trước
export const DEPART_AT = 0.12; // phần của chuyến bay lúc xu đã hiện rõ và rời avatar
export const LAND_AT = 0.92; // phần của chuyến bay lúc xu chạm avatar đích
export const PULSE_AFTER_MS = 600; // viền avatar nhận nháy sau đồng xu cuối chừng này

/**
 * deltas: { [ghế]: số chip đổi }. Trả về mảng { from, to, count, amount }: from / to là id ghế hoặc 'table' (giữa bàn) khi chỉ có
 * người được hoặc chỉ có người mất; `amount` (>= 0) là số TIỀN của dây đó, chia đều cho các xu của dây. Tổng amount các dây rời
 * khỏi một ghế = đúng số tiền ghế đó mất; tổng các dây đến một ghế = đúng số tiền ghế đó được.
 */
export function planClassicFlows(deltas) {
  const entries = Object.entries(deltas || {})
    .map(([id, d]) => ({ id, d: Number(d) }))
    .filter((e) => e.d !== 0 && Number.isFinite(e.d));
  const winners = entries.filter((e) => e.d > 0);
  const losers = entries.filter((e) => e.d < 0);
  const maxAbs = Math.max(1, ...entries.map((e) => Math.abs(e.d)));
  const coinsFor = (amount) => clamp(Math.round((Math.abs(amount) / maxAbs) * 10), 3, 10);

  const flows = [];
  if (winners.length && losers.length) {
    const gain = winners.reduce((s, w) => s + w.d, 0);
    losers.forEach((l) => {
      const total = coinsFor(l.d);
      winners.forEach((w) =>
        flows.push({
          from: l.id,
          to: w.id,
          count: Math.max(2, Math.round((total * w.d) / gain)),
          amount: (Math.abs(l.d) * w.d) / gain,
        })
      );
    });
  } else if (winners.length) {
    winners.forEach((w) => flows.push({ from: 'table', to: w.id, count: coinsFor(w.d), amount: w.d }));
  } else {
    losers.forEach((l) => flows.push({ from: l.id, to: 'table', count: coinsFor(l.d), amount: Math.abs(l.d) }));
  }
  return flows;
}

/** Thời điểm (ms, tính từ lúc bắt đầu hiệu ứng) xu thứ `k` của dây thứ `fi` xuất phát. */
export const chipStartMs = (fi, k) => fi * FLOW_GAP_MS + k * CHIP_GAP_MS;

/** Tổng thời gian của hiệu ứng (tới lúc viền avatar nhận nháy xong). */
export function classicTotalMs(flows) {
  return flows.reduce((m, f, fi) => Math.max(m, fi * FLOW_GAP_MS + f.count * CHIP_GAP_MS + PULSE_AFTER_MS + 50), 0);
}

/**
 * Lịch tiền theo từng đồng xu, cùng dạng với chipFx.buildMoneyEvents: { [ghế]: [{ t, amount }] } (amount có dấu: âm = mất).
 * Phần của đồng xu cuối mỗi dây là phần còn lại nên tổng mỗi ghế đúng bằng số đổi (không lệch do làm tròn).
 */
export function buildClassicMoney(flows) {
  const raw = {};
  const push = (id, t, amount) => {
    if (id === 'table') return;
    (raw[id] = raw[id] || []).push({ t, amount });
  };
  flows.forEach((f, fi) => {
    let given = 0;
    for (let k = 0; k < f.count; k++) {
      const part = k === f.count - 1 ? f.amount - given : f.amount / f.count;
      given += part;
      const t0 = chipStartMs(fi, k);
      push(f.from, t0 + FLIGHT_MS * DEPART_AT, -part);
      push(f.to, t0 + FLIGHT_MS * LAND_AT, part);
    }
  });
  const out = {};
  Object.entries(raw).forEach(([id, list]) => {
    out[id] = list.sort((a, b) => a.t - b.t);
  });
  return out;
}

/** Tổng đổi của từng ghế suy từ các dây (để khớp với deltas ban đầu). */
export function flowDeltas(flows) {
  const d = {};
  flows.forEach((f) => {
    if (f.from !== 'table') d[f.from] = (d[f.from] || 0) - f.amount;
    if (f.to !== 'table') d[f.to] = (d[f.to] || 0) + f.amount;
  });
  return d;
}

function centerOf(anchor) {
  const el = anchor === 'table' ? document.querySelector('.tl-table__center') : document.querySelector(`[data-avatar="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, r.height) };
}

function pulse(anchor, kind) {
  const el = anchor === 'table' ? null : document.querySelector(`[data-avatar="${anchor}"]`);
  if (!el || !el.animate) return;
  const c = kind === 'gain' ? '52, 211, 153' : '248, 113, 113';
  el.animate([{ boxShadow: `0 0 0 0 rgba(${c}, 0.9)` }, { boxShadow: `0 0 0 10px rgba(${c}, 0)`, offset: 1 }], { duration: 900, easing: 'ease-out' });
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
      { transform: pos(from, 0, 0, 1), opacity: 1, offset: DEPART_AT },
      { transform: pos({ x: mx, y: my }, arc.x, arc.y, 1.1), opacity: 1, offset: 0.55 },
      { transform: pos(to, 0, 0, 0.8), opacity: 1, offset: LAND_AT },
      { transform: pos(to, 0, 0, 0.4), opacity: 0 },
    ],
    { duration, delay, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'both' }
  );
  const done = anim.finished.catch(() => undefined).then(() => el.remove());
  return { anim, done };
}

/**
 * Chạy hiệu ứng cho một lần đổi số dư. Trả về { done, cancel, money, deltas, totalMs }:
 * `money` + `deltas` + `totalMs` đưa cho fxMoney.startMoneyFx để số dư giảm / tăng dần cùng xu bay.
 * Giảm chuyển động -> không bay xu, chỉ nháy viền và số dư đổi một lần (money = null).
 */
export function runChipFx(layer, deltas) {
  const flows = planClassicFlows(deltas);
  const running = [];
  const finish = [];
  const reduced = prefersReducedMotion();
  const usable = [];

  flows.forEach((flow, fi) => {
    const from = centerOf(flow.from);
    const to = centerOf(flow.to);
    if (!from || !to) return;
    usable.push({ ...flow, fi });
    const size = clamp(Math.min(from.size, to.size) * 0.34, 10, 22);
    if (!reduced && layer) {
      for (let k = 0; k < flow.count; k++) {
        const arc = { x: (Math.random() - 0.5) * 60, y: -20 - Math.random() * 40 };
        const c = flyCoin(layer, from, to, { delay: chipStartMs(fi, k), duration: FLIGHT_MS, size, arc });
        running.push(c.anim);
        finish.push(c.done);
      }
    }
    const arriveAt = reduced ? 0 : fi * FLOW_GAP_MS + flow.count * CHIP_GAP_MS + PULSE_AFTER_MS;
    const t1 = setTimeout(() => pulse(flow.to, 'gain'), arriveAt);
    const t2 = setTimeout(() => pulse(flow.from, 'loss'), reduced ? 0 : fi * FLOW_GAP_MS);
    finish.push(new Promise((res) => setTimeout(res, arriveAt + 50)));
    running.push({ cancel: () => (clearTimeout(t1), clearTimeout(t2)) });
  });

  // Ghế nào có tiền đổi mà KHÔNG có xu nào bay qua (không đo được avatar) thì số dư đổi một lần, không "treo" phần chưa áp dụng.
  const planned = flowDeltas(usable);
  const money = !reduced && layer && usable.length ? buildClassicMoney(usable) : null;
  const moneyDeltas = {};
  Object.entries(planned).forEach(([id, v]) => {
    if (Math.abs(v) > 1e-9) moneyDeltas[id] = v;
  });

  return {
    done: Promise.all(finish),
    cancel: () => running.forEach((a) => a.cancel?.()),
    money,
    deltas: moneyDeltas,
    totalMs: classicTotalMs(usable),
  };
}
