import { useEffect, useRef, useState } from 'react';
import { formatChip } from '../gameFlow';

/**
 * Số chip "chạy" mượt tới giá trị mới (đếm tăng/giảm ~0.8s) và nhuộm xanh khi
 * tăng, đỏ khi giảm trong lúc chạy. Lần render đầu hiện thẳng giá trị, không chạy.
 */
export default function AnimatedChip({ value, suffix = '', duration = 800, className = '' }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(target);
  const [dir, setDir] = useState(0);
  const shownRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return undefined;
    setDir(target > from ? 1 : -1);
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - k) ** 3;
      const v = k >= 1 ? target : from + (target - from) * eased;
      shownRef.current = v;
      setShown(v);
      if (k < 1) rafRef.current = requestAnimationFrame(tick);
      else setTimeout(() => setDir(0), 350);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  const color = dir > 0 ? '#34d399' : dir < 0 ? '#f87171' : undefined;
  return (
    <span className={`tabular-nums ${className}`} style={color ? { color, transition: 'color 200ms' } : { transition: 'color 400ms' }}>
      {formatChip(Math.round(shown))}
      {suffix}
    </span>
  );
}
