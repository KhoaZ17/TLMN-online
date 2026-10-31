import BotControls from './BotControls';
import { MIN_PLAYERS_TO_START } from '../matchFlow';
import { formatRoomId } from '../session';

/**
 * "Chờ thêm người chơi": ván trước đã xong nhưng bàn chỉ còn DƯỚI 2 người (người kia đã thoát giữa hai ván) nên chưa chia ván mới
 * được — và Backend không bao giờ tự thay người đã đi bằng Bot. Hiện giữa bàn: số người đang ngồi, mã phòng để bạn bè nhập vào,
 * và (với chủ phòng) hai nút thêm / bớt Bot. Có người vào hoặc chủ phòng thêm Bot đủ 2 người thì đếm ngược 10 giây rồi chia ván mới.
 */
export default function WaitingForPlayers({ roomId, seated, controls }) {
  return (
    <div className="tl-waiting" role="status" aria-live="polite" data-testid="waiting-players">
      <p className="tl-waiting__title">
        Chờ thêm người chơi{' '}
        <span className="tl-waiting__count" data-testid="waiting-count">
          {seated}/{MIN_PLAYERS_TO_START}
        </span>
      </p>
      <p className="tl-waiting__hint">
        Bạn bè nhập mã phòng{' '}
        <b className="tl-waiting__code" data-testid="waiting-room-id">
          {formatRoomId(roomId)}
        </b>{' '}
        để vào{controls ? ', hoặc thêm Bot.' : '.'}
      </p>
      {controls && <BotControls {...controls} variant="row" />}
    </div>
  );
}
