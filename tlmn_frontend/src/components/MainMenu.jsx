import AnimatedChip from './AnimatedChip';
import Avatar from './Avatar';
import HelpButton from './HelpButton';
import { displayNameOf } from '../profileStore';
import { formatPlayerId, ROOM_ID_LENGTH } from '../session';

/**
 * Menu chính: HAI ô lớn kiểu chọn màn chơi — "Tạo phòng" và "Nhập ID phòng".
 * Thanh trên cùng: tài khoản (tên + số chip thật), Đăng xuất và nút ? Hướng dẫn.
 */
function Tile({ icon, title, subtitle, accent, onClick, testId }) {
  return (
    <button type="button" onClick={onClick} className={`tl-tile tl-tile--${accent}`} data-testid={testId}>
      <span className="tl-tile__glow" aria-hidden="true" />
      <span className="tl-tile__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tl-tile__title">{title}</span>
      <span className="tl-tile__sub">{subtitle}</span>
      <span className="tl-tile__go" aria-hidden="true">
        Vào ngay ›
      </span>
    </button>
  );
}

export default function MainMenu({ auth, profile, onCreateRoom, onJoinRoom, onRedeem, onOpenProfile, onLogout, onHelp, notice, lowFunds }) {
  const shownName = displayNameOf(profile, auth.username);
  return (
    <div className="tl-menu">
      <header className="tl-menu__bar">
        {/* Góc TRÊN-TRÁI: nút avatar tròn -> mở hồ sơ dạng thẻ căn cước. */}
        <div className="tl-menu__user">
          <button
            type="button"
            className="tl-menu__avatar"
            onClick={onOpenProfile}
            aria-label="Mở hồ sơ người chơi"
            title="Hồ sơ của bạn"
            data-testid="open-profile"
          >
            <Avatar profile={profile} letter={shownName.slice(0, 1).toUpperCase()} />
          </button>
          <span className="min-w-0">
            <span className="tl-menu__name">{shownName}</span>
            {auth.playerId && (
              <span className="tl-menu__id" title="ID người chơi của bạn" data-testid="menu-player-id">
                ID {formatPlayerId(auth.playerId)}
              </span>
            )}
            <span className="tl-menu__chips" data-balance-target data-testid="menu-balance">
              <AnimatedChip value={auth.balance} suffix=" chip" />
            </span>
          </span>
        </div>
        {/* Dấu ? luôn nằm sát GÓC TRÊN BÊN PHẢI màn hình. */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onRedeem} className="tl-btn tl-btn--gold" data-testid="open-redeem">
            🎁 Mã quà tặng
          </button>
          <button type="button" onClick={onLogout} className="tl-btn tl-btn--ghost">
            Đăng xuất
          </button>
          <HelpButton onClick={onHelp} />
        </div>
      </header>

      <div className="tl-menu__body">
        <div className="tl-menu__heading">
          <p className="tl-menu__eyebrow">Sảnh chờ</p>
          <h1 className="tl-menu__title">Tiến Lên Miền Nam</h1>
        </div>

        {notice && (
          <p className="tl-menu__notice" role="status" data-testid="menu-notice">
            {notice}
          </p>
        )}
        {lowFunds && (
          <p className="tl-menu__notice tl-menu__notice--warn" role="status" data-testid="low-funds">
            Bạn đã hết chip. Đăng nhập vào ngày mới để nhận 50.000 chip tiền vốn, hoặc bấm “🎁 Mã quà tặng” để nhận thêm.
          </p>
        )}

        <div className="tl-menu__tiles">
          <Tile
            accent="red"
            icon="♠"
            title="Tạo phòng"
            subtitle="Chọn chế độ, số bot, mức cược rồi mở bàn mới"
            onClick={onCreateRoom}
            testId="tile-create"
          />
          <Tile
            accent="gold"
            icon="#"
            title="Nhập ID phòng"
            subtitle={`Vào bàn của bạn bè bằng mã phòng ${ROOM_ID_LENGTH} chữ số`}
            onClick={onJoinRoom}
            testId="tile-join"
          />
        </div>
      </div>
    </div>
  );
}
