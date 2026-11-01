import { useLayoutEffect, useState } from 'react';

/**
 * ĐÈN SÂN KHẤU khi có người "tới trắng": chùm sáng rọi từ trên xuống từng người tới trắng, vầng sáng dưới chân và một lớp tối
 * viền rất nhẹ (vignette) khoét tròn quanh người mạnh nhất. Có NHIỀU người cùng tới trắng thì mỗi người một chùm đèn: người
 * mạnh nhất (is_top_winner) chói nhất, người tới trắng phụ chiếu yếu hơn (strength thấp: chùm hẹp hơn, mờ hơn). Độ mờ của
 * từng ghế do GameScreen áp trực tiếp (opacity) — xem instantWin.js. Toàn bộ chỉ là lớp trang trí: pointer-events: none.
 *
 * Component này CHỈ được gắn vào DOM trong lúc chiếu kết quả; hết giờ chiếu GameScreen gỡ hẳn nó (không có hiệu ứng
 * "tắt dần" nào còn sót lại trong lúc đếm ngược).
 *
 * hostRef  — phần tử .tl-screen (hệ toạ độ của lớp phủ)
 * lights   — [{ id, strength }]: ghế được chiếu và độ mạnh đèn (1 = chói nhất, nhỏ hơn = yếu hơn); mySeat — id ghế của mình
 */
const measureSeat = (host, id, mySeat) => {
  const hr = host.getBoundingClientRect();
  let el = null;
  if (id === mySeat) el = host.querySelector('.tl-hand');
  else {
    const seat = host.querySelector(`[data-seat="${id}"]`);
    el = seat?.closest('.tl-seatgroup') || seat;
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2 - hr.left,
    y: r.top + r.height / 2 - hr.top,
    w: r.width,
    h: r.height,
    top: r.top - hr.top,
    bottom: r.bottom - hr.top,
  };
};

const sameGeo = (a, b) =>
  a.length === b.length &&
  a.every((g, i) => g.id === b[i].id && Math.abs(g.x - b[i].x) < 1 && Math.abs(g.y - b[i].y) < 1 && Math.abs(g.w - b[i].w) < 1);

export default function SpotlightOverlay({ hostRef, lights = [], mySeat }) {
  const [geos, setGeos] = useState([]);
  const key = lights.map((l) => `${l.id}:${l.strength}`).join(',');

  useLayoutEffect(() => {
    const measure = () => {
      const host = hostRef.current;
      if (!host) return;
      const next = lights
        .map((l) => {
          const g = measureSeat(host, l.id, mySeat);
          return g ? { ...g, id: l.id, strength: l.strength } : null;
        })
        .filter(Boolean);
      setGeos((cur) => (sameGeo(cur, next) ? cur : next));
    };
    measure();
    window.addEventListener('resize', measure);
    const timer = setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostRef, key, mySeat]);

  if (geos.length === 0) return null;
  const lead = geos.reduce((a, b) => (b.strength > a.strength ? b : a), geos[0]);
  const rx = Math.max(lead.w * 1.1, 150);
  const ry = Math.max(lead.h * 1.3, 110);

  return (
    <div className="tl-spot" aria-hidden="true" data-testid="spotlight" data-best={lead.id} data-count={geos.length}>
      <div
        className="tl-spot__vignette"
        style={{
          background: `radial-gradient(ellipse ${rx}px ${ry}px at ${lead.x}px ${lead.y}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 68%, rgba(0,0,0,0.1) 100%)`,
        }}
      />
      {geos.map((g) => {
        const k = g.strength;
        const beamW = Math.max(g.w * 2.2, 170) * (0.72 + 0.28 * k);
        const poolW = Math.max(g.w * 1.6, 190) * (0.72 + 0.28 * k);
        const poolH = Math.max(g.h * 0.5, 36);
        return (
          <div
            key={g.id}
            className={`tl-spot__light ${k < 1 ? 'tl-spot__light--soft' : ''}`}
            style={{ opacity: k }}
            data-testid="spot-light"
            data-seat={g.id}
            data-strength={k}
          >
            <div className="tl-spot__beam" style={{ left: g.x - beamW / 2, width: beamW, height: Math.max(20, g.bottom - 4) }} />
            <div
              className="tl-spot__pool"
              style={{ left: g.x - poolW / 2, top: g.bottom - poolH * 0.55, width: poolW, height: poolH }}
            />
          </div>
        );
      })}
    </div>
  );
}
