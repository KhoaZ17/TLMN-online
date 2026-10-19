// Hiệu ứng BAY dùng lớp phủ (.tl-flight-layer, position:fixed): chia bài cho Bot
// và Bot đánh bài ra bàn. Mọi toạ độ là toạ độ VIEWPORT lấy trực tiếp từ DOM
// bằng getBoundingClientRect nên bài luôn bay từ đúng chỗ tới đúng chỗ, bất kể
// kích thước màn hình / CSS. Phần xoay-xòe quạt của bài Bạn nằm ở HandFan.

import { cardBackImagePath, getCardImagePath } from './cardMapper';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// Luôn đủ 3 hàm theo cùng thứ tự để WAAPI nội suy đúng.
const poseStr = (cx, cy, w, h, rot = 0, scale = 1) =>
  `translate(${(cx - w / 2).toFixed(2)}px, ${(cy - h / 2).toFixed(2)}px) rotate(${rot}deg) scale(${scale})`;

function makeImg(src, className) {
  const img = new Image();
  img.className = className;
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
}

/** Tạo 1 lá bay 2 mặt: mặt SAU hiện khi lật 0°, mặt TRƯỚC hiện khi lật 180°. */
export function spawnFlyCard(layer, { w, h, front = null }) {
  const el = document.createElement('div');
  el.className = 'tl-fly';
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.opacity = '0'; // chỉ hiện trong khoảng animation (keyframes có opacity 1)
  const flip = document.createElement('div');
  flip.className = 'tl-hcard__flip';
  flip.appendChild(makeImg(cardBackImagePath(), 'tl-face'));
  if (front) flip.appendChild(makeImg(getCardImagePath(front), 'tl-face tl-face--front'));
  el.appendChild(flip);
  layer.appendChild(el);
  return { el, flip };
}

/** Chia 1 lá úp từ cọc bài tới ghế Bot (thu nhỏ dần cho khớp cỡ lá ở ghế rồi mờ đi khi chạm). */
export function flyBackCard(layer, { from, to, w, h, startScale = 1, delay = 0, duration = 420 }) {
  const { el } = spawnFlyCard(layer, { w, h });
  const rot0 = (Math.random() - 0.5) * 36;
  const anim = el.animate(
    [
      { transform: poseStr(from.x, from.y, w, h, rot0, startScale), opacity: 1, offset: 0, easing: 'cubic-bezier(.2,.75,.25,1)' },
      { transform: poseStr(to.x, to.y, w, h, 0, 1), opacity: 1, offset: 0.85, easing: 'linear' },
      { transform: poseStr(to.x, to.y, w, h, 0, 1), opacity: 0, offset: 1 },
    ],
    { delay, duration, easing: 'linear', fill: 'forwards' }
  );
  anim.addEventListener('finish', () => el.remove());
  anim.addEventListener('cancel', () => el.remove());
  return anim;
}

/**
 * Bot đánh bài: các lá úp bay từ ghế Bot tới ĐÚNG vị trí (tâm + góc xoay) của
 * cụm bài trên bàn, vừa bay vừa lật ngửa (xoay 3D). Trả về {done, cleanup}:
 * gọi cleanup() SAU KHI đã hiện cụm bài thật trên bàn (cùng 1 frame) — lá bay
 * giữ nguyên ở vị trí cuối tới lúc đó nên không có khoảnh khắc "trống".
 */
export function flyBotPlay(layer, { from, cards, targets, w, h, startScale = 1, rot = 0, duration = 360, stagger = 22 }) {
  const items = cards.map((card, i) => {
    const { el, flip } = spawnFlyCard(layer, { w, h, front: card });
    const delay = i * stagger;
    const move = el.animate(
      [
        { transform: poseStr(from.x, from.y, w, h, 0, startScale), opacity: 1 },
        { transform: poseStr(targets[i].x, targets[i].y, w, h, rot, 1), opacity: 1 },
      ],
      { duration, delay, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'forwards' }
    );
    const turn = flip.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], {
      duration,
      delay,
      easing: 'ease-in-out',
      fill: 'forwards',
    });
    return { el, move, turn };
  });
  const settle = (a) => a.finished.catch(() => undefined);
  return {
    done: Promise.all(items.flatMap((it) => [settle(it.move), settle(it.turn)])),
    cleanup: () =>
      items.forEach((it) => {
        it.move.cancel();
        it.turn.cancel();
        it.el.remove();
      }),
  };
}

/** Toạ độ (viewport) + kích thước THẬT (chưa xoay) của từng lá trong 1 combo đã dựng trên bàn. */
export function measureComboTargets(key) {
  const nodes = Array.from(document.querySelectorAll(`[data-combo-key="${key}"] [data-combo-card]`));
  nodes.sort((a, b) => Number(a.dataset.comboCard) - Number(b.dataset.comboCard));
  return nodes.map((n) => {
    const r = n.getBoundingClientRect(); // tâm hộp bao = tâm lá (xoay quanh tâm nên đối xứng)
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: n.offsetWidth, h: n.offsetHeight };
  });
}

/** Ô lá úp của ghế Bot (đích của bài chia / điểm xuất phát của bài Bot đánh). */
export function measureSeat(seatId) {
  const el = document.querySelector(`[data-seat-cards="${seatId}"]`) || document.querySelector(`[data-seat="${seatId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cardH = el.offsetHeight || r.height;
  return {
    x: r.left + r.width / 2,
    y: r.top + (r.height > 4 ? r.height / 2 : 0),
    w: el.offsetWidth || r.width,
    h: cardH,
  };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
