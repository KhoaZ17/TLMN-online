import { useLayoutEffect, useRef } from 'react';
import { formatChip } from '../gameFlow';

const MARGIN = 6; // chừa lề khỏi mép màn hình (px)

/**
 * Số chip cộng/trừ bay lên rồi mờ dần phía trên avatar. Nhãn mặc định canh GIỮA avatar; ghế sát mép
 * màn hình (trái/phải/góc dưới-trái) thì nhãn dài như "+110k chip" sẽ tràn ra ngoài nên đo lại và
 * dịch vào trong (biến CSS --shift-x dùng trong keyframes float-up).
 */
export default function FloatingDelta({ amount }) {
  const ref = useRef(null);
  const active = amount != null && amount !== 0;

  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.offsetParent || el?.parentElement;
    if (!el || !host) return;
    const hr = host.getBoundingClientRect();
    const half = el.offsetWidth / 2;
    const center = hr.left + hr.width / 2;
    const vw = document.documentElement.clientWidth;
    let shift = 0;
    if (center - half < MARGIN) shift = MARGIN - (center - half);
    else if (center + half > vw - MARGIN) shift = vw - MARGIN - (center + half);
    el.style.setProperty('--shift-x', `${Math.round(shift)}px`);
  }, [amount, active]);

  if (!active) return null;
  const positive = amount > 0;

  return (
    <span
      ref={ref}
      className={`pointer-events-none absolute left-1/2 top-0 z-20 whitespace-nowrap text-sm font-bold tabular-nums ${
        positive ? 'text-emerald-400' : 'text-red-400'
      }`}
      style={{ animation: 'float-up 2s ease-out forwards' }}
    >
      {positive ? '+' : ''}
      {formatChip(amount)} chip
    </span>
  );
}
