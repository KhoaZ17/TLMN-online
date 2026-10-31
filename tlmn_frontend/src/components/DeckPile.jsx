import { forwardRef, useImperativeHandle, useRef } from 'react';
import PlayingCard from './PlayingCard';

const LAYERS = 8;

/**
 * Cọc bài úp ở giữa bàn lúc chia. `left` (0..1) là tỉ lệ bài còn lại: các lớp
 * trên cùng biến mất dần nên cọc MỎNG DẦN theo từng lá bay đi. Các lớp lệch
 * nhẹ + xoay rất nhỏ để trông như 1 cọc bài thật chứ không phải 1 lá dày.
 * getCenter() trả về tâm cọc (toạ độ viewport) làm điểm xuất phát của bài bay.
 */
const DeckPile = forwardRef(function DeckPile({ left = 1 }, ref) {
  const rootRef = useRef(null);
  useImperativeHandle(
    ref,
    () => ({
      getCenter() {
        const r = rootRef.current?.getBoundingClientRect();
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
      },
      getCardHeight() {
        return rootRef.current?.offsetHeight ?? 0;
      },
    }),
    []
  );

  const visible = Math.max(0, Math.min(LAYERS, Math.ceil(left * LAYERS - 1e-6)));
  return (
    <div className="tl-deck" ref={rootRef} aria-hidden="true" data-deck-layers={visible}>
      {Array.from({ length: visible }, (_, k) => (
        <PlayingCard
          key={k}
          faceDown
          size="table"
          style={{
            transform: `translate(${(k * -0.9).toFixed(1)}px, ${(k * -1.2).toFixed(1)}px) rotate(${(((k * 37) % 7) - 3) * 0.35}deg)`,
          }}
        />
      ))}
    </div>
  );
});

export default DeckPile;
