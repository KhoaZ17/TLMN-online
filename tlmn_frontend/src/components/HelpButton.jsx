/**
 * Nút tròn có dấu "?" ở giữa — mở bảng hướng dẫn. Có mặt ở menu chính lẫn trong
 * bàn chơi (kể cả lúc đang đánh); kích thước theo biến CSS nên tự co trên điện thoại.
 */
export default function HelpButton({ onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tl-help-btn ${className}`}
      aria-label="Hướng dẫn chơi"
      title="Hướng dẫn chơi"
    >
      <span aria-hidden="true">?</span>
    </button>
  );
}
