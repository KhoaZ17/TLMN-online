import { useLayoutEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { MODES, formatRate, winRate } from '../profileStore';
import { formatChip } from '../gameFlow';

const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};
const overlapArea = (a, b) => {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};

/** Những vùng KHÔNG nên che: các lá đang nằm trên bàn, tay bài của mình, ghế các người chơi khác. */
function collectAvoid(seatId) {
  const out = [];
  document.querySelectorAll('.tl-cluster [data-combo-card]').forEach((el) => out.push(rectOf(el)));
  document.querySelectorAll('.tl-hand .tl-hcard').forEach((el) => out.push(rectOf(el)));
  document.querySelectorAll('[data-seat]').forEach((el) => {
    if (el.getAttribute('data-seat') !== String(seatId)) out.push(rectOf(el));
  });
  return out;
}

/** Chọn vị trí popup sát avatar sao cho ít che bài/ghế khác nhất và luôn nằm trọn trong màn hình. */
export function choosePlacement(anchor, size, viewport, avoid, gap = 8) {
  const { w, h } = size;
  const cx = anchor.left + (anchor.right - anchor.left) / 2;
  const cy = anchor.top + (anchor.bottom - anchor.top) / 2;
  const cands = [
    { left: anchor.right + gap, top: cy - h / 2 },
    { left: anchor.left - gap - w, top: cy - h / 2 },
    { left: cx - w / 2, top: anchor.bottom + gap },
    { left: cx - w / 2, top: anchor.top - gap - h },
    { left: anchor.right + gap, top: anchor.top },
    { left: anchor.left - gap - w, top: anchor.top },
  ];
  const m = 4;
  let best = null;
  cands.forEach((c, i) => {
    const left = Math.min(Math.max(m, c.left), Math.max(m, viewport.w - w - m));
    const top = Math.min(Math.max(m, c.top), Math.max(m, viewport.h - h - m));
    const rect = { left, top, right: left + w, bottom: top + h };
    const moved = Math.abs(left - c.left) + Math.abs(top - c.top);
    const cover = avoid.reduce((s, a) => s + overlapArea(rect, a), 0) + overlapArea(rect, anchor) * 4;
    const score = cover * 10 + moved * 2 + i; // ưu tiên chạm ít bài nhất, rồi ít bị đẩy lệch, rồi thứ tự ưa thích
    if (!best || score < best.score) best = { score, left, top };
  });
  return best;
}

/**
 * Popup xem THÔNG TIN đối thủ (người chơi thật) — chỉ để đọc: KHÔNG có nút nào, không chặn chuột
 * (pointer-events: none) nên bấm bất kỳ đâu xuyên qua nó. Thống kê là số liệu TRƯỚC ván đang chơi
 * (GameSession chụp lại lúc ván bắt đầu). Nhỏ gọn và tự dời chỗ để không che bài trên bàn.
 */
export default function PlayerInfoPopup({ seatId, name, displayName, profile, balance }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const place = () => {
      const anchorEl = document.querySelector(`[data-avatar="${seatId}"]`);
      const pop = ref.current;
      if (!anchorEl || !pop) return;
      const best = choosePlacement(
        rectOf(anchorEl),
        { w: pop.offsetWidth, h: pop.offsetHeight },
        { w: window.innerWidth, h: window.innerHeight },
        collectAvoid(seatId)
      );
      if (best) setPos((p) => (p && Math.abs(p.left - best.left) < 1 && Math.abs(p.top - best.top) < 1 ? p : { left: best.left, top: best.top }));
    };
    place();
    window.addEventListener('resize', place);
    const timer = setInterval(place, 400); // bàn thay đổi (bài hạ xuống) thì tự né lại
    return () => {
      window.removeEventListener('resize', place);
      clearInterval(timer);
    };
  }, [seatId]);

  const highest = Math.max(profile?.highest_balance || 0, balance || 0);
  const hasStats = Boolean(profile?.stats) && profile.statsKnown !== false;
  const sub = displayName && displayName.toLowerCase() !== String(name).toLowerCase() ? `@${name}` : null;

  return (
    <div
      ref={ref}
      className="tl-pinfo"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      role="status"
      aria-label={`Thông tin ${displayName || name}`}
      data-testid="player-info"
      data-seat-info={seatId}
    >
      <div className="tl-pinfo__head">
        <span className="tl-pinfo__avatar">
          <Avatar profile={profile} letter={(displayName || name || '?').slice(0, 1).toUpperCase()} />
        </span>
        <span className="min-w-0">
          <b className="tl-pinfo__name">{displayName || name}</b>
          {sub && <span className="tl-pinfo__sub">{sub}</span>}
        </span>
      </div>

      <div className="tl-pinfo__kv">
        <span>Chip hiện tại</span>
        <b>{formatChip(balance)}</b>
      </div>
      {hasStats ? (
        <>
          <div className="tl-pinfo__kv">
            <span>Kỷ lục số dư</span>
            <b>{formatChip(highest)}</b>
          </div>
          <table className="tl-pinfo__stats">
            <thead>
              <tr>
                <th aria-hidden="true" />
                {MODES.map((m) => (
                  <th key={m.id}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Số ván</th>
                {MODES.map((m) => (
                  <td key={m.id}>{profile.stats[m.id].played}</td>
                ))}
              </tr>
              <tr>
                <th>Tỷ lệ thắng</th>
                {MODES.map((m) => {
                  return <td key={m.id}>{formatRate(winRate(profile.stats[m.id]))}</td>;
                })}
              </tr>
            </tbody>
          </table>
          <p className="tl-pinfo__note">Số liệu tính đến trước ván này</p>
        </>
      ) : (
        <p className="tl-pinfo__note">Chưa có thống kê của người chơi này.</p>
      )}
    </div>
  );
}
