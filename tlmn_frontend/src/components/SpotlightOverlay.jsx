import { useLayoutEffect, useState } from 'react';

/**
 * ĐÈN SÂN KHẤU khi có người "tới trắng": chùm sáng rọi từ trên xuống người mạnh nhất, vầng sáng dưới
 * chân, và lớp tối viền (vignette) khoét tròn quanh người đó. Độ tối của từng người còn lại do
 * GameScreen áp trực tiếp lên ghế (filter: brightness) theo sức mạnh tay bài — xem instantWin.js.
 * Toàn bộ chỉ là lớp trang trí: pointer-events: none, không che thao tác.
 *
 * hostRef  — phần tử .tl-screen (hệ toạ độ của lớp phủ)
 * bestId   — id ghế được chiếu sáng; mySeat — id ghế của mình (nằm ở dưới cùng)
 */
export default function SpotlightOverlay({ hostRef, bestId, mySeat }) {
  const [geo, setGeo] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const host = hostRef.current;
      if (!host) return;
      const hr = host.getBoundingClientRect();
      let el = null;
      if (bestId === mySeat) el = host.querySelector('.tl-hand');
      else {
        const seat = host.querySelector(`[data-seat="${bestId}"]`);
        el = seat?.closest('.tl-seatgroup') || seat;
      }
      if (!el) return;
      const r = el.getBoundingClientRect();
      const next = {
        x: r.left + r.width / 2 - hr.left,
        y: r.top + r.height / 2 - hr.top,
        w: r.width,
        h: r.height,
        top: r.top - hr.top,
        bottom: r.bottom - hr.top,
      };
      setGeo((g) => (g && Math.abs(g.x - next.x) < 1 && Math.abs(g.y - next.y) < 1 && Math.abs(g.w - next.w) < 1 ? g : next));
    };
    measure();
    window.addEventListener('resize', measure);
    const timer = setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(timer);
    };
  }, [hostRef, bestId, mySeat]);

  if (!geo) return null;
  const rx = Math.max(geo.w * 1.1, 150);
  const ry = Math.max(geo.h * 1.3, 110);
  const beamW = Math.max(geo.w * 2.2, 170);
  const poolW = Math.max(geo.w * 1.6, 190);
  const poolH = Math.max(geo.h * 0.5, 36);

  return (
    <div className="tl-spot" aria-hidden="true" data-testid="spotlight" data-best={bestId}>
      <div
        className="tl-spot__vignette"
        style={{
          background: `radial-gradient(ellipse ${rx}px ${ry}px at ${geo.x}px ${geo.y}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.6) 100%)`,
        }}
      />
      <div
        className="tl-spot__beam"
        style={{ left: geo.x - beamW / 2, width: beamW, height: Math.max(20, geo.bottom - 4) }}
      />
      <div
        className="tl-spot__pool"
        style={{ left: geo.x - poolW / 2, top: geo.bottom - poolH * 0.55, width: poolW, height: poolH }}
      />
    </div>
  );
}
