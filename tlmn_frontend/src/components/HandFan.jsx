import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { cardBackImagePath, getCardImagePath, describeCard } from '../cardMapper';
import {
  computeFanLayout,
  slotTransform,
  dealKeyframes,
  flyOutKeyframes,
  arcKeyframes,
  liftKeyframes,
  planInsertionMoves,
  planDurations,
  shuffleOrder,
  toContainerPoint,
} from '../handFan';
import { wait } from '../flight';

const settle = (anim) => anim.finished.catch(() => undefined); // bị cancel thì coi như xong
export const FLIP_MS = 300; // thời gian lật ngửa cả tay bài (khớp transition .tl-hcard__flip trong index.css)

// Đồng bộ thứ tự đang hiển thị với bài trên tay mà Backend trả về: giữ nguyên
// thứ tự hiện có (lá đã đánh ra thì bỏ đi), chỉ khi có lá MỚI mới dùng thứ tự Backend.
function reconcile(prev, hand) {
  const inHand = new Set(hand);
  const kept = prev.filter((c) => inHand.has(c));
  if (kept.length === hand.length) return kept.length === prev.length ? prev : kept;
  return hand.slice();
}

/**
 * Tay bài của Bạn dạng XÒE QUẠT (lá đầu -12°, lá cuối +12°, hai đầu thấp hơn
 * giữa) — mỗi lá là 1 phần tử DOM riêng (key = tên lá) để animate được từng lá.
 *
 * Hình học nằm hết ở ../handFan.js (đã test). Component này lo:
 *  - đo khung chứa + chiều cao lá (đọc từ biến CSS --hand-card-h qua phần tử dò)
 *  - chọn / rê chuột (state JS, KHÔNG dùng CSS :hover) — lá chọn nảy ra ngoài cung
 *  - API imperative cho chuỗi mở màn ván mới và đánh bài:
 *      deal()          bài úp bay từ cọc bài về ĐÚNG vị trí + góc xòe
 *      flipAll()       lật ngửa tất cả cùng lúc (xoay 3D)
 *      sortAnimated()  xếp theo thứ tự Backend như người thật (gần: trượt dọc
 *                      cung; xa: nhấc lên, lướt qua, xoay, hạ xuống khe)
 *      flyOut()        các lá đã chọn bay từ CHỖ ĐANG NẰM tới toạ độ đích
 *      recall()/finishInstant()/abort()
 */
const HandFan = forwardRef(function HandFan(
  { hand, introKey = 0, introActive = false, selected, glowCards, auraCards, interactive = true, onToggle },
  ref
) {
  const containerRef = useRef(null);
  const probeRef = useRef(null);
  const cardEls = useRef(new Map());
  const live = useRef(new Set()); // animation đang chạy (để huỷ khi abort)
  const epochRef = useRef(0); // tăng khi huỷ -> các chuỗi async đang chạy tự dừng
  const busyRef = useRef(false);

  const [size, setSize] = useState({ w: 0, cardH: 100 });
  const [order, setOrder] = useState(hand);
  const [faceUp, setFaceUp] = useState(true);
  const [dealHidden, setDealHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(null);
  const [faceOverrides, setFaceOverrides] = useState(null);

  const selectedSet = useMemo(() => new Set(selected || []), [selected]);
  const glowSet = useMemo(() => new Set(glowCards || []), [glowCards]);
  const auraSet = useMemo(() => new Set(auraCards || []), [auraCards]); // lá 3♠ thối: aura ĐỎ (kết ván)
  const handKey = hand.join('|');

  // Chiều cao khung quạt GIỮ CỐ ĐỊNH theo bố cục 13-14 lá (không co lại khi đánh bớt
  // bài) — nếu không, khu vực tay bài thấp xuống vài px mỗi lần đánh, vùng bàn giãn
  // ra làm cụm bài vừa hạ xuống bị xê dịch. Quạt ít lá thì dịch xuống sát đáy khung.
  const layout = useMemo(() => {
    const args = { containerWidth: size.w || 600, cardH: size.cardH };
    const cur = computeFanLayout({ count: order.length, ...args });
    const stableH = Math.max(
      cur.containerHeight,
      computeFanLayout({ count: 13, ...args }).containerHeight,
      computeFanLayout({ count: 14, ...args }).containerHeight
    );
    return { ...cur, y0: cur.y0 + (stableH - cur.containerHeight), containerHeight: stableH };
  }, [order.length, size.w, size.cardH]);

  // Ref luôn trỏ tới giá trị mới nhất để các hàm async (API imperative) không bị "cũ".
  const layoutRef = useRef(layout);
  const orderRef = useRef(order);
  const handRef = useRef(hand);
  const selectedRef = useRef(selectedSet);
  layoutRef.current = layout;
  orderRef.current = order;
  handRef.current = hand;
  selectedRef.current = selectedSet;

  const track = (anim) => {
    live.current.add(anim);
    return anim;
  };
  const clearLive = () => {
    live.current.forEach((a) => {
      try {
        a.cancel();
      } catch {
        /* đã huỷ */
      }
    });
    live.current.clear();
  };
  const abortAll = () => {
    epochRef.current += 1;
    clearLive();
  };

  // Đo bề rộng khung + chiều cao lá thật (biến CSS --hand-card-h, tính theo vh).
  useLayoutEffect(() => {
    const el = containerRef.current;
    const probe = probeRef.current;
    if (!el || !probe) return undefined;
    const measure = () =>
      setSize((prev) => {
        const w = el.clientWidth;
        const cardH = probe.getBoundingClientRect().height || prev.cardH;
        return Math.abs(prev.w - w) < 0.5 && Math.abs(prev.cardH - cardH) < 0.5 ? prev : { w, cardH };
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(probe);
    return () => ro.disconnect();
  }, []);

  // Bài trên tay đổi (đánh ra / nhận thêm): đồng bộ thứ tự; kết thúc cả đợt "bay ra".
  useLayoutEffect(() => {
    if (introActive) return;
    setOrder((prev) => reconcile(prev, hand));
    if (busyRef.current) {
      busyRef.current = false;
      clearLive();
      setBusy(false);
      setFaceOverrides(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey, introActive]);

  // Ván mới: xáo thứ tự (lúc úp chưa ai thấy), úp hết và ẩn — TRƯỚC khi trình
  // duyệt vẽ nên không có khoảnh khắc "lộ bài đã xếp" nào.
  // CHỈ khi thật sự có màn chia bài (introActive): người nối lại / vào giữa ván cũng đổi introKey nhưng KHÔNG có màn chia bài nào
  // chạy để hiện bài ra, nên nếu úp + ẩn ở đây thì tay bài sẽ vô hình mãi (DOM vẫn có đủ lá).
  useLayoutEffect(() => {
    if (!introKey || !introActive) return;
    abortAll();
    busyRef.current = true;
    setOrder(shuffleOrder(handRef.current, introKey * 7919 + 17));
    setFaceUp(false);
    setDealHidden(true);
    setBusy(true);
    setFaceOverrides(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introKey]);

  useLayoutEffect(() => () => abortAll(), []);

  useImperativeHandle(
    ref,
    () => {
      const handle = {
      getCardSize: () => ({ w: layoutRef.current.cardW, h: layoutRef.current.cardH }),

      // 1) Chia bài: bài úp bay từ cọc về đúng vị trí & góc xòe, so le theo lịch chia vòng tròn.
      async deal({ deckCenter, deckScale = 1, schedule, players = 1, seat = 0 }) {
        const ep = epochRef.current;
        const L = layoutRef.current;
        const from = toContainerPoint(deckCenter, containerRef.current.getBoundingClientRect());
        const anims = orderRef.current
          .map((card, i) => {
            const el = cardEls.current.get(card);
            if (!el) return null;
            const kf = dealKeyframes(L, L.thetas[i], from, {
              startScale: deckScale,
              startRot: (Math.random() - 0.5) * 36,
            });
            return track(
              el.animate(kf, {
                duration: schedule.flightMs,
                delay: (i * players + seat) * schedule.stagger,
                easing: 'cubic-bezier(.2,.75,.25,1)',
                fill: 'forwards',
              })
            );
          })
          .filter(Boolean);
        await Promise.all(anims.map(settle));
        if (epochRef.current !== ep) return false;
        flushSync(() => setDealHidden(false)); // lộ lá thật đúng chỗ, rồi mới bỏ animation giữ vị trí
        anims.forEach((a) => a.cancel());
        return true;
      },

      // 2) Lật ngửa tất cả cùng lúc.
      async flipAll() {
        const ep = epochRef.current;
        flushSync(() => setFaceUp(true));
        await wait(FLIP_MS + 30);
        return epochRef.current === ep;
      },

      // 3) Xếp bài kiểu người: từng lá nhấc ra rồi nhét vào khe, theo thứ tự Backend.
      //    opts.target: thứ tự đích riêng (kết ván: arranged_hand của Backend); opts.budgetMs: tổng thời gian tối đa.
      async sortAnimated(opts) {
        const ep = epochRef.current;
        if (opts) {
          // ngoài màn chia bài (kết ván) lá không ở chế độ "bận": tắt transition CSS để không trượt đôi với animation
          busyRef.current = true;
          flushSync(() => setBusy(true));
        }
        const moves = planInsertionMoves(orderRef.current, opts?.target ?? handRef.current);
        const durs = planDurations(moves, opts?.budgetMs ? { budgetMs: opts.budgetMs } : undefined);
        for (let m = 0; m < moves.length; m++) {
          if (epochRef.current !== ep) return false;
          const mv = moves[m];
          const L = layoutRef.current;
          const before = orderRef.current.slice();
          // DOM nhảy ngay tới vị trí cuối của bước này, rồi animation chạy từ vị trí cũ -> mới.
          flushSync(() => setOrder(mv.order));
          orderRef.current = mv.order;
          const anims = [];
          const el = cardEls.current.get(mv.card);
          if (el) {
            const kf = mv.near
              ? arcKeyframes(L, L.thetas[mv.from], L.thetas[mv.to], { z: 200 })
              : liftKeyframes(L, L.thetas[mv.from], L.thetas[mv.to]);
            anims.push(
              track(el.animate(kf, { duration: durs[m], easing: mv.near ? 'ease-in-out' : 'linear' }))
            );
          }
          // Các lá bị đẩy sang phải 1 ô trượt dọc cung.
          for (let k = mv.to; k < mv.from; k++) {
            const other = cardEls.current.get(before[k]);
            if (!other) continue;
            anims.push(
              track(
                other.animate(arcKeyframes(L, L.thetas[k], L.thetas[k + 1]), {
                  duration: Math.round(durs[m] * (mv.near ? 1 : 0.85)),
                  easing: 'ease-in-out',
                })
              )
            );
          }
          // eslint-disable-next-line no-await-in-loop
          await Promise.all(anims.map(settle));
          // eslint-disable-next-line no-await-in-loop
          await wait(12);
        }
        if (epochRef.current !== ep) return false;
        busyRef.current = false;
        flushSync(() => setBusy(false));
        return true;
      },

      // 4) Đánh bài: các lá đã chọn bay từ CHỖ ĐANG NẰM (kể cả đang nâng) tới toạ độ đích
      //    (viewport) — giữ nguyên vị trí cuối cho tới khi nơi gọi cập nhật tay bài.
      async flyOut({ cards, targets, faces, duration = 340 }) {
        const ep = epochRef.current;
        const L = layoutRef.current;
        const rect = containerRef.current.getBoundingClientRect();
        busyRef.current = true;
        flushSync(() => {
          setBusy(true);
          if (faces !== undefined) setFaceOverrides(faces); // undefined = giữ lá Joker đã biến hình
        });
        const gap = cards.length > 1 ? Math.min(26, 120 / (cards.length - 1)) : 0;
        const anims = cards
          .map((card, i) => {
            const idx = orderRef.current.indexOf(card);
            const el = cardEls.current.get(card);
            if (idx < 0 || !el) return null;
            const t = targets[i];
            const lift = selectedRef.current.has(card) ? L.lift : 0;
            const kf = flyOutKeyframes(L, L.thetas[idx], lift, {
              ...toContainerPoint(t, rect),
              rot: t.rot ?? 0,
              scale: t.scale ?? 1,
            });
            return track(
              el.animate(
                kf.map((k) => ({ ...k, zIndex: 300 + i })),
                { duration, delay: i * gap, easing: 'cubic-bezier(.25,.85,.3,1)', fill: 'forwards' }
              )
            );
          })
          .filter(Boolean);
        await Promise.all(anims.map(settle));
        return epochRef.current === ep;
      },

      // 5) Joker BIẾN HÌNH (sau khi Bạn chọn cách ghép): lá Joker đang chọn lật NỬA VÒNG sang mặt
      //    úp (card_back), đổi mặt trước thành lá thật nó thay thế (transformed_cards), rồi lật tiếp
      //    để lộ lá thật — kèm quầng sáng vàng. map: { 'X♦': '4♦', ... }.
      async transformJokers({ map, duration = 900 }) {
        const ep = epochRef.current;
        const entries = Object.entries(map || {}).filter(([joker]) => cardEls.current.get(joker));
        if (entries.length === 0) return true;
        const flips = entries.map(([joker]) => {
          const el = cardEls.current.get(joker);
          const flip = el.querySelector('.tl-hcard__flip');
          flip.style.transition = 'none';
          el.classList.add('tl-hcard--morph');
          return { el, flip };
        });
        const half = Math.round(duration * 0.45);
        const run = (from, to, ms, easing) =>
          flips.map(({ flip }) =>
            track(flip.animate([{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }], { duration: ms, easing, fill: 'forwards' }))
          );
        const first = run(180, 360, half, 'cubic-bezier(.45,0,.55,1)');
        await Promise.all(first.map(settle));
        if (epochRef.current !== ep) return false;
        flushSync(() => setFaceOverrides((cur) => ({ ...(cur || {}), ...map }))); // đang úp nên không ai thấy đổi ảnh
        const second = run(360, 540, duration - half, 'cubic-bezier(.2,.8,.3,1)');
        await Promise.all(second.map(settle));
        [...first, ...second].forEach((a) => a.cancel()); // rotateY(540°) ≡ 180° nên không giật
        flips.forEach(({ el, flip }) => {
          flip.style.transition = '';
          el.classList.remove('tl-hcard--morph');
        });
        return epochRef.current === ep;
      },

      // Server từ chối nước đi: đưa các lá đang bay về lại tay.
      recall() {
        clearLive();
        busyRef.current = false;
        setBusy(false);
        setFaceOverrides(null);
      },

      // Bỏ qua mọi animation (giảm chuyển động / huỷ giữa chừng): hiện thẳng bài đã xếp, ngửa.
      finishInstant() {
        abortAll();
        busyRef.current = false;
        setOrder(handRef.current.slice());
        setFaceUp(true);
        setDealHidden(false);
        setBusy(false);
        setFaceOverrides(null);
      },

      abort: abortAll,
      };

      // 6) KẾT VÁN (máy người THUA, ván thường): Joker (chỉ chế độ Joker) xoay sang mặt úp rồi lật thành lá cho tiền phạt lớn
      //    nhất (<= jokerMs), nghỉ một nhịp, rồi cả tay bài xếp theo cụm phạt nặng nhất (<= sortBudgetMs).
      //    map: { 'X♦': '4♦' }; target: arranged_hand. instant: chỉ hiện thẳng kết quả (giảm chuyển động).
      //    onMorphed: gọi ngay sau khi Joker đã lật xong (để hiện aura đỏ nếu Joker hoá thành 3♠).
      handle.endShow = async ({ map, target, jokerMs = 900, gapMs = 150, sortBudgetMs = 1500, instant = false, onMorphed }) => {
        const ep = epochRef.current;
        const hasMap = map && Object.keys(map).length > 0;
        if (instant) {
          flushSync(() => {
            if (hasMap) setFaceOverrides((cur) => ({ ...(cur || {}), ...map }));
            if (target) setOrder(target.slice());
          });
          if (target) orderRef.current = target.slice();
          onMorphed?.();
          return true;
        }
        if (hasMap) {
          const ok = await handle.transformJokers({ map, duration: jokerMs });
          if (!ok || epochRef.current !== ep) return false;
        }
        onMorphed?.();
        if (!target) return true;
        await wait(gapMs);
        if (epochRef.current !== ep) return false;
        return handle.sortAnimated({ target, budgetMs: sortBudgetMs });
      };
      return handle;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const setEl = (card) => (el) => {
    if (el) cardEls.current.set(card, el);
    else cardEls.current.delete(card);
  };

  return (
    <div
      ref={containerRef}
      className="tl-hand"
      style={{ height: layout.containerHeight }}
      data-fan-n={order.length}
      data-fan-angle={layout.angleDeg}
    >
      {/* Phần tử dò: đọc chiều cao lá thật từ biến CSS --hand-card-h (tính theo vh). */}
      <div
        ref={probeRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 'var(--hand-card-h)', visibility: 'hidden', pointerEvents: 'none' }}
      />
      {order.map((card, i) => {
        const isSelected = selectedSet.has(card);
        const lift = isSelected ? layout.lift : interactive && hover === card ? layout.lift * 0.2 : 0;
        const front = getCardImagePath(faceOverrides?.[card] ?? card);
        return (
          <button
            key={card}
            ref={setEl(card)}
            type="button"
            className={`tl-hcard ${auraSet.has(card) ? 'tl-hcard--aura' : ''}`}
            data-hand-card={card}
            data-aura={auraSet.has(card) ? 'true' : undefined}
            disabled={!interactive}
            aria-pressed={interactive ? isSelected : undefined}
            aria-label={describeCard(card)}
            onClick={interactive ? () => onToggle?.(card) : undefined}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(card)}
            onPointerLeave={() => setHover((h) => (h === card ? null : h))}
            style={{
              width: layout.cardW,
              height: layout.cardH,
              zIndex: i + 1,
              transform: slotTransform(layout, i, lift),
              transition: busy ? 'none' : 'transform 140ms ease-out',
              opacity: dealHidden ? 0 : 1,
              cursor: interactive ? 'pointer' : 'default',
              // Joker vừa hoá thành 3♠ thì aura hiện gần như ngay (lá thật 3♠ thì có nhịp chờ 0,5s như bài của người khác)
              ...(card.startsWith('X') && auraSet.has(card) ? { '--aura-d': '-480ms' } : null),
            }}
          >
            <div className={`tl-hcard__flip ${faceUp ? 'tl-hcard__flip--up' : ''}`}>
              <img className="tl-face" src={cardBackImagePath()} alt="" draggable={false} />
              <img
                className={`tl-face tl-face--front ${isSelected ? 'tl-face--selected' : ''} ${
                  glowSet.has(card) && !isSelected ? 'tl-face--glow' : ''
                }`}
                src={front}
                alt={describeCard(card)}
                draggable={false}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
});

export default HandFan;
