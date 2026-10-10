import { getCardImagePath, cardBackImagePath, describeCard } from '../cardMapper';

// Lá bài TĨNH (giữa bàn, ghế Bot, showdown). Kích thước đến từ biến CSS trong
// index.css (lớp .pc--sm / --table / --reveal / --revealSide) nên tự co theo
// chiều cao màn hình, luôn đúng tỉ lệ ảnh thật 74x104 — không còn px cứng.
// Bài TRÊN TAY Bạn (xoè quạt, lật 3D, chọn/rê chuột) do HandFan.jsx đảm nhiệm.
export default function PlayingCard({ card, faceDown = false, size = 'table', style, className = '', ...rest }) {
  const src = faceDown ? cardBackImagePath() : getCardImagePath(card);
  const alt = faceDown ? 'Lá úp' : describeCard(card);
  return (
    <div className={`pc pc--${size} ${className}`} style={style} {...rest}>
      <img src={src} alt={alt} draggable={false} />
    </div>
  );
}
