// SỐ DƯ GIẢM / TĂNG DẦN CÙNG CHIP BAY. Kho nhỏ (không phụ thuộc React) giữ "phần tiền CHƯA áp dụng" của từng ghế trong lúc hiệu ứng chip chạy.
//   hiển thị = số dư thật − phần chưa áp dụng            (BalanceChip tính; số dư thật vẫn đổi ngay trong state)
// Người trả bị trừ dần mỗi khi một chip rời avatar; người nhận được cộng dần mỗi khi một chip chạm avatar (lịch lấy từ chipFx.buildMoneyEvents).
// Hết hiệu ứng (hoặc huỷ) -> phần chưa áp dụng về 0, hiển thị = số dư thật. Mỗi lần chỉ có một hiệu ứng tiền chạy; bắt đầu cái mới thì cái cũ được xả hết.
import { pendingAt } from './chipFx';

let pending = {}; // { ghế: số tiền còn chưa áp dụng (có dấu) }
let raf = 0;
let run = null; // { events, deltas, t0, durationMs }
const subs = new Set();

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const emit = () => subs.forEach((fn) => fn());
const frame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(() => fn(now()), 16));
const unframe = (id) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

/** Phần tiền chưa áp dụng của ghế (0 khi không có hiệu ứng). Trả về SỐ nên useSyncExternalStore chỉ vẽ lại ghế nào thật sự đổi. */
export const getPending = (seat) => pending[String(seat)] ?? 0;

export function subscribeMoney(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Có hiệu ứng tiền đang chạy không (test / BalanceChip dùng để rút ngắn thời gian "chạy số"). */
export const moneyFxActive = () => run != null;

function step() {
  raf = 0;
  if (!run) return;
  const t = now() - run.t0;
  pending = pendingAt(run.events, run.deltas, t, run.durationMs);
  if (t >= run.durationMs) {
    run = null;
    pending = {};
  } else {
    raf = frame(step);
  }
  emit();
}

/**
 * Bắt đầu hiệu ứng tiền: `events` = chipFx.buildMoneyEvents(...), `deltas` = { ghế: tổng đổi }, `durationMs` = tổng thời gian hiệu ứng.
 * Gọi ĐỒNG THỜI với lúc số dư thật đổi (useLayoutEffect) để khung hình đầu tiên vẫn hiện số dư CŨ.
 */
export function startMoneyFx({ events, deltas, durationMs, at }) {
  stopMoneyFx(false);
  if (!events || !deltas || !(durationMs > 0)) return;
  run = { events, deltas: { ...deltas }, t0: at ?? now(), durationMs };
  pending = pendingAt(events, run.deltas, 0, durationMs);
  emit();
  raf = frame(step);
}

/** Dừng hiệu ứng tiền: xả hết phần chưa áp dụng (hiển thị nhảy thẳng tới số dư thật). */
export function stopMoneyFx(notify = true) {
  if (raf) unframe(raf);
  raf = 0;
  const had = run != null || Object.keys(pending).length > 0;
  run = null;
  pending = {};
  if (notify && had) emit();
}

/** Chỉ dùng cho test: đặt thời điểm hiện tại của hiệu ứng rồi tính lại (không cần đồng hồ thật). */
export function __advanceMoneyFx(ms) {
  if (!run) return;
  const t = ms;
  pending = pendingAt(run.events, run.deltas, t, run.durationMs);
  if (t >= run.durationMs) {
    run = null;
    pending = {};
  }
  emit();
}
