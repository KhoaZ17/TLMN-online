import { useId } from 'react';

/**
 * Lớp BĂNG phủ lên avatar của người bị CÓNG: mặt băng mờ xanh bò TỪ VIỀN VÀO TÂM (đóng băng từ từ), vết nứt lan dần, tinh thể
 * băng nhô quanh viền, vài cột băng rủ xuống, tia lấp lánh; hết hiệu ứng thì băng TAN (mờ dần, cột băng co lại, nhỏ giọt) rồi biến
 * mất — toàn bộ chạy theo đồng hồ --ice-total trong index.css. Chỉ là trang trí (không chặn chuột); đặt BÊN TRONG `.tl-avatar-hit` (khung tròn, position: relative).
 * Tinh thể vẽ bằng SVG toạ độ 0..100 trùng với khung avatar nhưng cho phép tràn ra ngoài viền (overflow: visible).
 */

// Tinh thể quanh viền: [góc (độ, 0 = bên phải, chiều kim đồng hồ), độ dài, nửa bề rộng chân]
const SHARDS = [
  [-112, 15, 5.2],
  [-82, 11, 4],
  [-52, 13, 4.6],
  [-18, 9, 3.6],
  [18, 11, 4.2],
  [58, 14, 4.6],
  [82, 19, 5.4], // cột băng rủ xuống chính giữa phía dưới
  [104, 15, 4.8],
  [128, 11, 4],
  [160, 10, 3.8],
  [196, 12, 4.2],
  [-146, 9, 3.4],
];

const rad = (d) => (d * Math.PI) / 180;
const fix = (n) => Math.round(n * 100) / 100;

function shardPoints([angle, len, half]) {
  const a = rad(angle);
  const cx = 50 + 48 * Math.cos(a);
  const cy = 50 + 48 * Math.sin(a);
  const tx = 50 + (48 + len) * Math.cos(a);
  const ty = 50 + (48 + len) * Math.sin(a);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const p1 = [cx + nx * half, cy + ny * half];
  const p2 = [cx - nx * half, cy - ny * half];
  return `${fix(p1[0])},${fix(p1[1])} ${fix(tx)},${fix(ty)} ${fix(p2[0])},${fix(p2[1])}`;
}

const SHARD_POINTS = SHARDS.map(shardPoints);

export default function IceOverlay() {
  const gid = `ice${useId().replace(/[^a-zA-Z0-9]/g, '')}`; // id riêng cho từng avatar (nhiều người cùng bị cóng)
  return (
    <span className="tl-ice" data-testid="ice" aria-hidden="true">
      <span className="tl-ice__shell" />
      <svg className="tl-ice__svg" viewBox="0 0 100 100" focusable="false">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.98" />
            <stop offset="1" stopColor="#9fd8f6" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {/* mảng sáng trên mặt băng */}
        <polygon points="12,38 30,14 42,26 24,48" fill="#fff" opacity="0.34" />
        <polygon points="58,10 86,24 70,40" fill="#fff" opacity="0.28" />
        <polygon points="64,66 88,58 80,84 66,88" fill="#fff" opacity="0.2" />
        {/* vết nứt */}
        <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" opacity="0.85">
          <path className="tl-ice__crack" pathLength="1" d="M16 24 L34 38 L30 54 L46 66 L44 84" strokeWidth="1.5" />
          <path className="tl-ice__crack" pathLength="1" d="M34 38 L52 30 L62 14" strokeWidth="1.2" />
          <path className="tl-ice__crack" pathLength="1" d="M72 28 L62 48 L78 62 L72 84" strokeWidth="1.4" />
          <path className="tl-ice__crack" pathLength="1" d="M46 66 L62 74" strokeWidth="1" />
        </g>
        {/* tinh thể + cột băng quanh viền */}
        <g fill={`url(#${gid})`} stroke="#e9f8ff" strokeWidth="0.9" strokeLinejoin="round">
          {SHARD_POINTS.map((pts, i) => (
            <polygon key={pts} points={pts} className="tl-ice__shard" style={{ '--i': i }} />
          ))}
        </g>
        {/* tia lấp lánh */}
        <path className="tl-ice__glint tl-ice__glint--a" d="M80 20 L82 26 L88 28 L82 30 L80 36 L78 30 L72 28 L78 26 Z" fill="#fff" />
        <path className="tl-ice__glint tl-ice__glint--b" d="M24 70 L25.6 74.4 L30 76 L25.6 77.6 L24 82 L22.4 77.6 L18 76 L22.4 74.4 Z" fill="#fff" />
      </svg>
      {/* nước băng tan nhỏ giọt ở giai đoạn cuối */}
      <i className="tl-ice__drip" style={{ '--dx': '30%', '--dd': '0s' }} />
      <i className="tl-ice__drip" style={{ '--dx': '52%', '--dd': '0.18s' }} />
      <i className="tl-ice__drip" style={{ '--dx': '70%', '--dd': '0.06s' }} />
    </span>
  );
}
