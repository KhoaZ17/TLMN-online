import PlayingCard from './PlayingCard';
import FloatingDelta from './FloatingDelta';
import TurnTimer from './TurnTimer';
import Avatar from './Avatar';
import AnimatedChip from './AnimatedChip';
import { avatarLabel } from '../gameFlow';

/**
 * Ghế của một người chơi KHÁC (Bot hoặc người thật) — KHÔNG khung/viền/nền chữ nhật: chỉ avatar tròn
 * (kèm vòng đếm ngược khi tới lượt), tên, số chip, và 1 lá úp + badge số lá còn lại.
 * Mọi kích thước theo biến CSS (--avatar, --seat-card-h, --fs-*), tự thu nhỏ trên điện thoại ngang.
 *
 * - human: người thật -> bấm vào avatar mở popup thông tin (Bot KHÔNG bấm được).
 * - replaced: người thật đã thoát / mất kết nối giữa ván, Bot đang đánh thay: VẪN giữ nguyên avatar,
 *   tên và vị trí (không làm gãy cấu trúc bàn), chỉ đổi nhãn thành "Bot đang đánh thay" — không bấm được.
 * - cardsLeft: số lá HIỂN THỊ (lúc đang chia bài GameScreen đếm tăng dần).
 * - hideCards: ẩn lá úp + badge (ván xong và bài thật được lật ngửa bên cạnh / đã dọn bàn).
 * - isEmpty: ghế TRỐNG (người chơi đã rời bàn, không có bot thay thế).
 * - Ô chứa lá úp ([data-seat-cards]) LUÔN có mặt để làm đích bay của bài chia và điểm xuất phát
 *   của bài đối thủ đánh ra, kể cả khi chưa có lá nào.
 */
export default function OpponentSeat({
  seatId,
  name,
  displayName,
  human = false,
  profile,
  cardsLeft,
  balance,
  balanceDelta,
  isCurrentTurn,
  isPassed,
  isFinished,
  isThinking,
  timer,
  hideCards = false,
  isEmpty = false,
  replaced = false,
  infoOpen = false,
  onAvatarClick,
}) {
  const shownName = displayName || name;
  const photo = human || replaced; // người thật (kể cả đã bị Bot thay) hiện ảnh/hình bóng thay vì chữ số

  if (isEmpty) {
    return (
      <div className="tl-seat tl-seat--empty" data-seat={seatId} data-empty="true">
        <div className="tl-seat__id">
          <div className="tl-avatar-hit" data-avatar={seatId}>
            <div className="tl-seat__ghost" aria-hidden="true" />
          </div>
          <p className="tl-seat__name">Trống</p>
          <p className="tl-seat__chips">Chờ người chơi</p>
        </div>
        <div className="tl-seat__cards" data-seat-cards={seatId} style={{ height: 0 }} />
        <div className="tl-seat__status" />
      </div>
    );
  }

  const avatarProps = human
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `Xem thông tin ${shownName}`,
        'aria-expanded': infoOpen,
        'data-avatar-human': 'true',
        onClick: (e) => {
          e.stopPropagation();
          onAvatarClick?.(seatId);
        },
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAvatarClick?.(seatId);
          }
        },
      }
    : {};

  return (
    <div className="tl-seat" data-seat={seatId} data-replaced={replaced ? 'true' : undefined}>
      <div className="tl-seat__id">
        {/* Avatar + vòng đếm ngược lượt (chỉ hiện khi tới lượt người này) */}
        <div
          className={`tl-avatar-hit ${human ? 'tl-avatar-hit--human' : ''} ${infoOpen ? 'tl-avatar-hit--open' : ''}`}
          data-avatar={seatId}
          {...avatarProps}
        >
          <TurnTimer timer={timer} underlay={Boolean(profile)}>
            <Avatar profile={profile} human={photo} letter={avatarLabel(shownName)} />
          </TurnTimer>
          {replaced && (
            <span className="tl-seat__botbadge" aria-hidden="true">
              🤖
            </span>
          )}
        </div>
        <FloatingDelta amount={balanceDelta} />
        <p className={`tl-seat__name ${isCurrentTurn ? 'tl-seat__name--turn' : ''}`}>{shownName}</p>
        <p className="tl-seat__chips">
          <AnimatedChip value={balance} suffix=" chip" />
        </p>
      </div>

      {/* Bài đối thủ LUÔN úp khi ván đang diễn ra — chỉ hiện số lượng qua badge tròn, tuyệt đối
          không lộ mặt bài. Khi ván xong, bài THẬT được lật ngửa riêng ở GameScreen (renderReveal). */}
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
            {replaced ? 'Bot đang đánh thay…' : 'Đang suy nghĩ…'}
          </span>
        )}
        {!isFinished && !isThinking && isPassed && <span>{replaced ? 'Bot đánh thay · bỏ lượt' : 'Đã bỏ lượt'}</span>}
        {!isFinished && !isThinking && !isPassed && replaced && (
          <span className="tl-seat__replaced" data-testid="bot-replace-label">
            Bot đang đánh thay
          </span>
        )}
      </div>
    </div>
  );
}
