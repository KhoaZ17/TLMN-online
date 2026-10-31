/**
 * KHÍ LẠNH quanh tay bài thua (của người bị CÓNG) khi bài được trải ngửa trên bàn: sương băng xanh trắng dày cuộn quanh cụm bài,
 * lớp sương nằm sát mặt bàn, hạt băng kết tinh lấp lánh rơi xuống và quầng xanh lạnh. Cả lớp hiện dần, giữ, rồi tan theo cùng đồng
 * hồ --ice-total với băng phủ bài/avatar. Trang trí thuần CSS (không chặn chuột), đặt BÊN TRONG `.tl-reveal` (position: relative).
 * vertical: cụm bài xếp dọc (ghế trái / phải) -> sương dao động theo chiều dọc.
 */
const WISPS = [0, 1, 2, 3, 4, 5];
const MOTES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export default function ColdAir({ vertical = false }) {
  return (
    <span className={`tl-cold ${vertical ? 'tl-cold--col' : 'tl-cold--row'}`} data-testid="cold-air" aria-hidden="true">
      <i className="tl-cold__halo" />
      <i className="tl-cold__fog" />
      {WISPS.map((i) => (
        <i key={`w${i}`} className={`tl-cold__w tl-cold__w--${i}`} />
      ))}
      {MOTES.map((i) => (
        <b key={`m${i}`} className={`tl-cold__m tl-cold__m--${i}`} />
      ))}
    </span>
  );
}
