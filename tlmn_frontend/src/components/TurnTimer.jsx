import { useEffect, useRef, useState } from 'react';

/**
 * Avatar tròn + vòng đếm ngược lượt chơi bao quanh (của người đang tới lượt).
 * Kích thước lấy từ biến CSS --avatar (2.75rem trên máy tính, 2.5rem khi điện
 * thoại ngang) — vẽ SVG theo hệ toạ độ 100x100 nên vòng đếm co giãn theo.
 *
 * timer = { baseLeft, total, receivedAt } lấy từ state của Backend:
 *   - baseLeft:   time_left lúc nhận state (giây, đã làm tròn xuống)
 *   - total:      time_limit của lượt này (30s thường / 15s chặt tự do / 3s lượt giả)
 *   - receivedAt: thời điểm Frontend NHẬN state (xem api.js)
 * Còn lại = baseLeft - (thời gian đã trôi kể từ receivedAt) — tự chạy mượt
 * giữa 2 lần poll và cả lúc polling tạm dừng; mỗi lần có state mới (props
 * đổi) thì tự đồng bộ lại theo Server, nên luôn reset đúng khi sang lượt mới.
 *
 * timer = null -> không phải lượt của người này: chỉ vẽ avatar thường.
 */
const R = 46;
const STROKE = 6;
const CIRC = 2 * Math.PI * R;

export default function TurnTimer({ timer, children }) {
  const [, setTick] = useState(0);
  const fallbackStartRef = useRef(Date.now());
  const active = Boolean(timer);

  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [active]);

  let remaining = 0;
  let fraction = 0;
  if (timer) {
    const start = timer.receivedAt ?? fallbackStartRef.current;
    const elapsed = (Date.now() - start) / 1000;
    const total = Math.max(1, timer.total ?? 30, timer.baseLeft ?? 0);
    remaining = Math.max(0, (timer.baseLeft ?? total) - elapsed);
    fraction = Math.min(1, remaining / total);
  }

  const urgent = active && remaining <= 5;
  const color = !active ? 'transparent' : urgent ? '#ff4d4f' : fraction <= 0.4 ? '#f59e0b' : '#D4AF6A';

  return (
    <div
      className="relative shrink-0"
      style={{ width: 'var(--avatar)', height: 'var(--avatar)' }}
      role={active ? 'timer' : undefined}
      aria-label={active ? `Còn ${Math.ceil(remaining)} giây` : undefined}
    >
      {active && (
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={STROKE} />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - fraction)}
            style={{ transition: 'stroke-dashoffset 200ms linear, stroke 300ms ease' }}
          />
        </svg>
      )}
      <div
        className={`absolute flex items-center justify-center rounded-full bg-felt-700 font-semibold text-paper-100 ${
          urgent ? 'animate-pulse' : ''
        }`}
        style={{ inset: '9%', fontSize: 'calc(var(--avatar) * 0.3)' }}
      >
        {active ? (
          <span
            className="tabular-nums font-extrabold leading-none"
            style={{ color, fontSize: 'calc(var(--avatar) * 0.38)' }}
          >
            {Math.ceil(remaining)}
          </span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
