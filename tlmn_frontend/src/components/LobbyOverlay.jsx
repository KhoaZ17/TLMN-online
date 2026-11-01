import { useState } from 'react';
import Avatar from './Avatar';
import { avatarLabel } from '../gameFlow';
import BotControls from './BotControls';
import { lobbyCanStart, lobbyStatusText } from '../lobby';

/**
 * PHÒNG CHỜ của phòng có NHIỀU người thật. Hiện mã phòng 6 chữ số, cấu hình phòng và BÀN CHƠI đang có ai ngồi:
 * chủ phòng (có nhãn "Chủ phòng"), các bot đã ngồi sẵn, và ghế người thật còn TRỐNG (đang chờ người nhập mã).
 * Danh sách ghế do Backend báo (GET /api/lobby, hỏi mỗi giây) nên bạn bè vừa vào là thấy ngay.
 *  - Chủ phòng: bấm "Bắt đầu ngay" khi đã có từ 2 người (ghế còn trống thì bỏ trống, KHÔNG có Bot thế vào), thêm / bớt Bot bằng
 *    "+ Bot" / "− Bot" (Backend không bao giờ tự thêm Bot), hoặc "Huỷ phòng".
 *  - Khách: chờ chủ phòng bắt đầu, hoặc "Rời phòng" để trả ghế cho người khác.
 * Từ khi ván đầu được chia, phòng không nhận thêm người; các ván sau tự đếm ngược rồi tự chia.
 */
function Seat({ seat }) {
  const open = seat.kind === 'open';
  const bot = seat.kind === 'bot';
  const title = open ? 'Chỗ trống' : seat.name || `Người chơi ${seat.seat + 1}`;
  const tag = open ? 'Đang chờ người vào' : seat.isHost ? 'Chủ phòng' : bot ? 'Bot' : 'Người chơi';
  return (
    <li
      className={`tl-lobby__seat tl-lobby__seat--${seat.kind} ${seat.isMe ? 'tl-lobby__seat--me' : ''} ${
        seat.isHost ? 'tl-lobby__seat--host' : ''
      }`}
      data-testid={`lobby-seat-${seat.seat}`}
      data-kind={seat.kind}
      data-host={seat.isHost ? 'true' : 'false'}
    >
      <span className="tl-lobby__avatar" aria-hidden="true">
        {open ? (
          <span className="tl-lobby__dots">
            <i />
            <i />
            <i />
          </span>
        ) : bot ? (
          <Avatar human={false} letter={avatarLabel(seat.name)} />
        ) : (
          <Avatar profile={{ avatar: seat.avatar, gender: seat.gender }} />
        )}
      </span>
      <span className="tl-lobby__seat-name" title={title}>
        {title}
      </span>
      <span className="tl-lobby__seat-tag">
        {tag}
        {seat.isMe && !open ? ' · Bạn' : ''}
      </span>
    </li>
  );
}

export default function LobbyOverlay({
  roomId,
  seats,
  counts,
  configText,
  isHost,
  loading,
  starting,
  error,
  botControls = null,
  onStart,
  onLeave,
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* trình duyệt chặn clipboard: bỏ qua */
    }
  };

  const list = seats || [];
  return (
    <div className="tl-lobby" role="dialog" aria-label="Phòng chờ" data-testid="lobby">
      <div className="tl-lobby__card">
        <p className="tl-lobby__eyebrow">{isHost ? 'Phòng của bạn đã sẵn sàng' : 'Bạn đã vào phòng'}</p>
        <div className="tl-lobby__code" aria-label={`Mã phòng ${roomId}`} data-testid="lobby-room-id">
          {String(roomId)
            .split('')
            .map((d, i) => (
              <span key={i} className="tl-lobby__digit">
                {d}
              </span>
            ))}
        </div>
        {configText && (
          <p className="tl-lobby__config" data-testid="lobby-config">
            {configText}
          </p>
        )}

        {list.length > 0 && (
          <ul className="tl-lobby__seats" style={{ '--n': list.length }} aria-label="Các ghế trong phòng" data-testid="lobby-seats">
            {list.map((s) => (
              <Seat key={`${s.seat}-${s.kind}-${s.name}`} seat={s} />
            ))}
          </ul>
        )}

        <p className="tl-lobby__hint" role="status" aria-live="polite" data-testid="lobby-status">
          {loading ? 'Đang tải phòng chờ…' : lobbyStatusText({ isHost, counts })}
        </p>
        {error && (
          <p className="tl-lobby__error" role="alert" data-testid="lobby-error">
            {error}
          </p>
        )}
        <div className="tl-lobby__actions">
          <button type="button" className="tl-btn tl-btn--ghost" onClick={onLeave} data-testid="lobby-leave">
            {isHost ? 'Huỷ phòng' : 'Rời phòng'}
          </button>
          <button type="button" className="tl-btn tl-btn--gold" onClick={copy}>
            {copied ? 'Đã chép ✓' : 'Sao chép mã'}
          </button>
          {isHost && botControls && <BotControls {...botControls} variant="inline" />}
          {isHost && (
            <button
              type="button"
              className="tl-btn tl-btn--primary"
              onClick={onStart}
              disabled={starting || !lobbyCanStart(counts)}
              data-testid="lobby-start"
            >
              {starting ? 'Đang chia bài…' : 'Bắt đầu ngay'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
