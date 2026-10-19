// HIỆU ỨNG CHIP: mỗi lần số dư đổi (chặt, hết ván, tới trắng...) chip bay từ người MẤT sang người ĐƯỢC.
//  - planCoinFlows(deltas): hàm thuần, lên kế hoạch "ai gửi cho ai bao nhiêu đồng xu" (test được bằng Node)
//  - runChipFx(layer, deltas): vẽ đồng xu bay (WAAPI) trên lớp phủ cố định + nháy viền avatar xanh/đỏ
import { prefersReducedMotion } from './flight';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * deltas: { [seatId]: số chip thay đổi }. Trả về mảng { from, to, count }, trong đó from/to là id ghế
 * hoặc 'table' (giữa bàn) khi chỉ có người được hoặc chỉ có người mất.
 */
export function planCoinFlows(deltas) {
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
      winners.forEach((w) => flows.push({ from: l.id, to: w.id, count: Math.max(2, Math.round((total * w.d) / gain)) }));
    });
  } else if (winners.length) {
    winners.forEach((w) => flows.push({ from: 'table', to: w.id, count: coinsFor(w.d) }));
  } else {
    losers.forEach((l) => flows.push({ from: l.id, to: 'table', count: coinsFor(l.d) }));
  }
  return flows;
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

function pulse(anchor, kind) {
  const el = anchor === 'table' ? null : document.querySelector(`[data-avatar="${anchor}"]`);
  if (!el || !el.animate) return;
  const c = kind === 'gain' ? '52, 211, 153' : '248, 113, 113';
  el.animate(
    [
      { boxShadow: `0 0 0 0 rgba(${c}, 0.9)` },
      { boxShadow: `0 0 0 10px rgba(${c}, 0)`, offset: 1 },
    ],
    { duration: 900, easing: 'ease-out' }
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

/**
 * Chạy hiệu ứng cho một lần đổi số dư. Trả về { done, cancel }.
 * Chỉ gọi khi có DOM (GameScreen); giảm chuyển động -> chỉ nháy viền, không bay xu.
 */
export function runChipFx(layer, deltas) {
  const flows = planCoinFlows(deltas);
  const running = [];
  const finish = [];
  const reduced = prefersReducedMotion();

  flows.forEach((flow, fi) => {
    const from = centerOf(flow.from);
    const to = centerOf(flow.to);
    if (!from || !to) return;
    const size = clamp(Math.min(from.size, to.size) * 0.34, 10, 22);
    if (!reduced && layer) {
      for (let k = 0; k < flow.count; k++) {
        const arc = { x: (Math.random() - 0.5) * 60, y: -20 - Math.random() * 40 };
        const c = flyCoin(layer, from, to, { delay: fi * 90 + k * 70, duration: 700, size, arc });
        running.push(c.anim);
        finish.push(c.done);
      }
    }
    const arriveAt = reduced ? 0 : fi * 90 + flow.count * 70 + 600;
    const t1 = setTimeout(() => pulse(flow.to, 'gain'), arriveAt);
    const t2 = setTimeout(() => pulse(flow.from, 'loss'), reduced ? 0 : fi * 90);
    finish.push(new Promise((res) => setTimeout(res, arriveAt + 50)));
    running.push({ cancel: () => (clearTimeout(t1), clearTimeout(t2)) });
  });

  return {
    done: Promise.all(finish),
    cancel: () => running.forEach((a) => a.cancel?.()),
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
