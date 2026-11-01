import { useSyncExternalStore } from 'react';
import AnimatedChip from './AnimatedChip';
import { formatChip } from '../gameFlow';
import { getPending, subscribeMoney } from '../fxMoney';

const FX_TWEEN_MS = 160; // trong lúc chip bay: mỗi bước trừ / cộng chỉ "chạy số" rất ngắn để bám sát từng chip

/**
 * Số chip của một ghế TRONG BÀN CHƠI: giảm / tăng DẦN cùng nhịp chip bay (xem fxMoney.js) thay vì nhảy một phát.
 *   hiển thị = value (số dư thật) − phần tiền chưa áp dụng của ghế `seat`
 * `plain`: chỉ in số (không tô màu xanh / đỏ, không chạy số) — dùng cho thẻ thông tin đối thủ.
 */
export default function BalanceChip({ seat, value, suffix = '', plain = false, className = '' }) {
  const pending = useSyncExternalStore(subscribeMoney, () => getPending(seat), () => 0);
  const display = (Number(value) || 0) - pending;
  if (plain) {
    return (
      <span className={`tabular-nums ${className}`}>
        {formatChip(Math.round(display))}
        {suffix}
      </span>
    );
  }
  return <AnimatedChip value={display} suffix={suffix} duration={pending !== 0 ? FX_TWEEN_MS : 800} className={className} />;
}
