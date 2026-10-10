import PlayingCard from './PlayingCard';
import FloatingDelta from './FloatingDelta';
import TurnTimer from './TurnTimer';
import { formatChip } from '../gameFlow';

/**
 * Ghế Bot — KHÔNG còn khung/viền/nền chữ nhật: chỉ avatar tròn (kèm vòng đếm
 * ngược khi tới lượt), tên, số chip, và 1 lá úp + badge số lá còn lại.
 * Mọi kích thước theo biến CSS (--avatar, --seat-card-h, --fs-*), tự thu nhỏ
 * trên điện thoại ngang.
 *
 * - cardsLeft: số lá HIỂN THỊ (lúc đang chia bài GameScreen đếm tăng dần).
 * - hideCards: ẩn lá úp + badge (khi ván xong và bài thật của Bot được lật
 *   ngửa bên cạnh — xem GameScreen).
 * - Ô chứa lá úp ([data-seat-cards]) LUÔN có mặt để làm đích bay của bài chia
 *   và điểm xuất phát của bài Bot đánh ra, kể cả khi chưa có lá nào.
 */
export default function OpponentSeat({
  seatId,
  name,
  cardsLeft,
  balance,
  balanceDelta,
  isCurrentTurn,
  isPassed,
  isFinished,
  isThinking,
  timer,
  hideCards = false,
}) {
  const number = name?.match(/\d+/)?.[0] ?? '?';

  return (
    <div className="tl-seat" data-seat={seatId}>
      <div className="tl-seat__id">
        {/* Avatar + vòng đếm ngược lượt (chỉ hiện khi tới lượt Bot này) */}
        <TurnTimer timer={timer}>{number}</TurnTimer>
        <FloatingDelta amount={balanceDelta} />
        <p className={`tl-seat__name ${isCurrentTurn ? 'tl-seat__name--turn' : ''}`}>{name}</p>
        <p className="tl-seat__chips">{formatChip(balance)} chip</p>
      </div>

      {/* Bài Bot LUÔN úp khi ván đang diễn ra — chỉ hiện số lượng qua badge
          tròn, tuyệt đối không lộ mặt bài. Nếu ván xong và Bot này thua, bài
          THẬT của họ được lật ngửa riêng ở GameScreen (renderReveal). */}
      <div
        className="tl-seat__cards"
        data-seat-cards={seatId}
        style={hideCards ? { height: 0, overflow: 'visible' } : undefined}
      >
        {cardsLeft > 0 && !hideCards && (
          <>
            <PlayingCard faceDown size="sm" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            <span className="tl-badge">{cardsLeft}</span>
          </>
        )}
      </div>

      <div className="tl-seat__status">
        {isFinished && <span style={{ color: '#e3c989' }}>Đã về</span>}
        {!isFinished && isThinking && (
          <span className="tabular-nums inline-flex items-center gap-1" style={{ color: '#e3c989' }}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-300" />
            Đang suy nghĩ…
          </span>
        )}
        {!isFinished && !isThinking && isPassed && <span>Đã bỏ lượt</span>}
      </div>
    </div>
  );
}
