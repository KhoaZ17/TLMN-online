/**
 * Hai nút của CHỦ PHÒNG để thêm / bớt Bot ngay trong phòng: "− Bot" và "+ Bot".
 *  - "+ Bot": một Bot ngồi vào bàn (vào ghế trống; hết ghế trống thì Backend mở rộng thêm một ghế). Bàn nào cũng tới được 4 người,
 *    bất kể lúc tạo phòng chọn mấy người; chỉ khi đã đủ 4 người đang ngồi thì nút mờ.
 *  - "− Bot": một Bot THẬT rời bàn, ghế đó thành ghế trống cho bạn bè nhập mã vào (hết Bot thì nút mờ).
 * Backend KHÔNG bao giờ tự thêm Bot thay người đã rời: muốn có Bot thì chủ phòng bấm nút này. Chỉ có ở phòng chờ và giữa hai ván
 * (lúc đang đấu Backend từ chối); nơi dùng chỉ hiện cho chủ phòng.
 *
 * variant:
 *  - 'row'    : một hàng hai nút (màn "Chờ thêm người chơi").
 *  - 'inline' : hai nút nằm thẳng trong hàng nút của phòng chờ (display: contents).
 *  - 'edges'  : lớp phủ trải hết vùng giữa bàn, "− Bot" sát mép trái và "+ Bot" sát mép phải, ngang hàng với vòng đếm ngược
 *               (vòng đếm ngược đã chiếm gần hết chiều cao vùng giữa bàn ở điện thoại ngang nên không đặt nút dưới nó được).
 */
export default function BotControls({ canAdd, canRemove, busy = false, onAdd, onRemove, variant = 'row' }) {
  return (
    <div className={`tl-botctl tl-botctl--${variant}`} role="group" aria-label="Thêm hoặc bớt Bot" data-testid="bot-controls">
      <button
        type="button"
        className="tl-btn tl-btn--ghost tl-botctl__btn"
        onClick={onRemove}
        disabled={busy || !canRemove}
        aria-label="Bớt một Bot"
        title={canRemove ? 'Bớt một Bot khỏi bàn' : 'Không có Bot nào để bớt'}
        data-testid="bot-remove"
      >
        <span className="tl-botctl__sign" aria-hidden="true">
          −
        </span>{' '}
        Bot
      </button>
      <button
        type="button"
        className="tl-btn tl-btn--ghost tl-botctl__btn"
        onClick={onAdd}
        disabled={busy || !canAdd}
        aria-label="Thêm một Bot"
        title={canAdd ? 'Thêm một Bot vào bàn' : 'Bàn đã đủ 4 người, không thêm Bot được nữa'}
        data-testid="bot-add"
      >
        <span className="tl-botctl__sign" aria-hidden="true">
          +
        </span>{' '}
        Bot
      </button>
    </div>
  );
}
