const R = 44;
const CIRC = 2 * Math.PI * R;

/**
 * Đếm ngược Ở GIỮA BÀN sau khi bàn đã được dọn sạch (10 giây): ai ở lại thì tự vào ván mới.
 * Ván mới tự chia khi đếm về 0 — KHÔNG ai (kể cả chủ phòng ban đầu) phải bấm gì hay giữ quyền bắt đầu.
 */
export default function CenterCountdown({ left, total }) {
  const fraction = Math.max(0, Math.min(1, left / total));
  const label = left > 0 ? 'Ván mới bắt đầu sau' : 'Đang chia bài…';
  return (
    <div className="tl-countdown" role="timer" aria-live="polite" data-testid="center-countdown">
      <div className="tl-countdown__ring">
        <svg viewBox="0 0 100 100" className="tl-countdown__svg">
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="#d4af6a"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - fraction)}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <span className="tl-countdown__num" data-testid="countdown-number">
          {left > 0 ? left : '…'}
        </span>
      </div>
      <span className="tl-countdown__label">{label}</span>
    </div>
  );
}
