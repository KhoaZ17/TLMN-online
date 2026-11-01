import { useEffect, useRef } from 'react';
import { playChime } from '../sound';

/**
 * Banner nổi bật "Đã đến lượt bạn đánh bài!" — hiện khi tới LƯỢT THẬT của mình (không phải lượt giả
 * tự qua sau 3 giây) trong lúc Bạn đang mở bảng hướng dẫn hoặc popup thông tin đối thủ. Trận đấu và
 * đồng hồ đếm ngược vẫn chạy bình thường bên dưới; banner tự tắt ngay khi hết lượt / đóng popup.
 * Phát tiếng chuông (và rung nhẹ trên điện thoại) đúng 1 lần ở thời điểm banner vừa hiện.
 */
export default function TurnBanner({ show }) {
  const wasShown = useRef(false);

  useEffect(() => {
    if (show && !wasShown.current) playChime();
    wasShown.current = show;
  }, [show]);

  if (!show) return null;
  return (
    <div className="tl-turnbanner" role="alert" aria-live="assertive" data-testid="turn-banner">
      <span className="tl-turnbanner__bell" aria-hidden="true">
        🔔
      </span>
      Đã đến lượt bạn đánh bài!
    </div>
  );
}
