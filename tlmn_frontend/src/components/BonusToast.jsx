import { useEffect, useRef } from 'react';
import { flyCoinsBetween } from '../chipFx';
import { bonusMessage } from '../bonus';

/**
 * Thẻ thông báo THƯỞNG VỐN HẰNG NGÀY (Backend cộng bù khi đăng nhập lúc hết tiền + sang ngày mới).
 * Hiện ở giữa-trên màn hình menu: quà 🎁 + số chip được tặng; vài đồng xu bay từ quà vào ô số dư
 * (số chip ở menu cùng lúc "chạy" tăng màu xanh). Tự đóng sau vài giây hoặc bấm vào để đóng.
 */
const SHOW_MS = 7000;
const COIN_DELAY_MS = 450;

export default function BonusToast({ amount, layerRef, onClose }) {
  const iconRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let flight = null;
    const fly = setTimeout(() => {
      const target = document.querySelector('[data-balance-target]');
      flight = flyCoinsBetween(layerRef?.current, iconRef.current, target, { count: 10, gain: true });
    }, COIN_DELAY_MS);
    const close = setTimeout(() => closeRef.current?.(), SHOW_MS);
    return () => {
      clearTimeout(fly);
      clearTimeout(close);
      flight?.cancel();
    };
  }, [layerRef]);

  const shown = Math.round(amount).toLocaleString('vi-VN');
  return (
    <div className="tl-bonus" role="status" aria-live="polite" data-testid="bonus-toast" onClick={() => closeRef.current?.()}>
      <span ref={iconRef} className="tl-bonus__icon" aria-hidden="true">
        🎁
      </span>
      <span className="tl-bonus__body">
        <span className="tl-bonus__title">Quà vốn hằng ngày</span>
        <span className="tl-bonus__amount" data-testid="bonus-amount">
          +{shown} chip
        </span>
        <span className="tl-bonus__text">{bonusMessage(amount)}</span>
      </span>
      <button
        type="button"
        className="tl-bonus__close"
        aria-label="Đóng thông báo"
        onClick={(e) => {
          e.stopPropagation();
          closeRef.current?.();
        }}
      >
        ×
      </button>
    </div>
  );
}
