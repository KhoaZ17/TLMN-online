import { getCardImagePath, cardBackImagePath, describeCard } from '../cardMapper';

// Lá bài TĨNH (giữa bàn, ghế đối thủ, lật bài kết ván). Kích thước đến từ biến CSS trong
// index.css (lớp .pc--sm / --table / --reveal / --revealSide) nên tự co theo chiều cao
// màn hình, luôn đúng tỉ lệ ảnh thật 74x104 — không còn px cứng.
// Bài TRÊN TAY Bạn (xoè quạt, lật 3D, chọn/rê chuột) do HandFan.jsx đảm nhiệm.
//
// flipIn: lá hiện ra ở dạng ÚP rồi tự lật ngửa (xoay 3D) sau `delay` ms — dùng khi lật bài của
// mọi người lúc "tới trắng" hoặc khi ván kết thúc.
export default function PlayingCard({
  card,
  faceDown = false,
  size = 'table',
  style,
  className = '',
  flipIn = false,
  delay = 0,
  ...rest
}) {
  if (flipIn && !faceDown) {
    return (
      <div className={`pc pc--${size} pc--flipin ${className}`} style={{ ...style, '--d': `${delay}ms` }} {...rest}>
        <div className="tl-hcard__flip tl-hcard__flip--auto">
          <img className="tl-face" src={cardBackImagePath()} alt="" draggable={false} />
          <img className="tl-face tl-face--front" src={getCardImagePath(card)} alt={describeCard(card)} draggable={false} />
        </div>
      </div>
    );
  }
  const src = faceDown ? cardBackImagePath() : getCardImagePath(card);
  const alt = faceDown ? 'Lá úp' : describeCard(card);
  return (
    <div className={`pc pc--${size} ${className}`} style={style} {...rest}>
      <img src={src} alt={alt} draggable={false} />
    </div>
  );
}
