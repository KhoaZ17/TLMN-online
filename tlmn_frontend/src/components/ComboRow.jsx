import PlayingCard from './PlayingCard';

// Độ đè giữa các lá của 1 combo (tỉ lệ theo bề rộng lá): combo càng dài đè
// càng chặt để sảnh 8-10 lá vẫn gọn (40/46/52px trên lá rộng 88px như trước).
export function comboOverlapRatio(n) {
  if (n <= 5) return 40 / 88;
  if (n <= 7) return 46 / 88;
  return 52 / 88;
}

// Mọi số đo "px chuẩn" (lệch ngẫu nhiên, bậc thang) quy theo lá cao 124px rồi
// nhân với --table-card-h, nên tự co cùng kích thước lá trên điện thoại ngang.
const BASE_H = 124;
const STAIR = 4 / BASE_H;

/**
 * Một combo đã/đang được đánh ra giữa bàn.
 *  - Cả cụm xoay + lệch NGUYÊN KHỐI quanh tâm cố định của bàn (các lá trong 1
 *    combo vẫn thẳng hàng với nhau).
 *  - Combo 2+ lá: bậc thang tung độ theo chỉ số lá.
 *  - entry.hidden: đã dựng sẵn nhưng chưa hiện — để đo toạ độ đích cho hiệu ứng
 *    bài bay (xem flight.measureComboTargets), bay xong mới hiện.
 */
export default function ComboRow({ entry, zIndex }) {
  const n = entry.cards.length;
  return (
    <div
      className="tl-cluster__entry"
      data-combo-key={entry.key}
      style={{ zIndex, opacity: entry.hidden ? 0 : 1 }}
    >
      <div
        className="tl-combo"
        style={{
          '--ov': comboOverlapRatio(n),
          transform: `translate(calc(var(--table-card-h) * ${entry.offsetX / BASE_H}), calc(var(--table-card-h) * ${
            entry.offsetY / BASE_H
          })) rotate(${entry.groupRotation ?? 0}deg)`,
        }}
      >
        {entry.cards.map((c, j) => (
          <PlayingCard
            key={`${c}-${j}`}
            card={c}
            size="table"
            data-combo-card={j}
            style={n > 1 ? { transform: `translateY(calc(var(--table-card-h) * ${j * STAIR}))` } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
