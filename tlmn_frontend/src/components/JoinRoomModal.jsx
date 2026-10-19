import { useCallback, useEffect, useRef, useState } from 'react';
import { ROOM_ID_LENGTH } from '../session';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

const isTouchDevice = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);

/**
 * Popup nhập ID phòng. Hai cách nhập cùng lúc, luôn đồng bộ với nhau:
 *  1) Bàn phím số ẢO trên màn hình (cho điện thoại).
 *  2) Gõ trực tiếp từ bàn phím cơ hoặc bàn phím ảo của thiết bị: ô số bên trên là một
 *     <input inputMode="numeric"> thật (chạm vào để bật bàn phím máy). Trên máy tính ô được
 *     focus sẵn; trên điện thoại KHÔNG tự bật bàn phím máy (để khỏi che mất bàn phím số ảo).
 *     Ngoài ra Backspace / Enter / Esc và các phím số vẫn dùng được kể cả khi focus đang
 *     nằm ở nút khác.
 * Nhấn Enter (hoặc "Vào phòng") khi đã đủ 8 số -> vào phòng: màn hình chuyển sang phòng chờ của phòng đó.
 * Ô nhập KHÔNG có chữ gợi ý / ví dụ nào.
 * onSubmit(roomId) trả về chuỗi lỗi (hiện ngay trong popup) hoặc null nếu vào được phòng.
 */
export default function JoinRoomModal({ onClose, onSubmit }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const valueRef = useRef('');
  const busyRef = useRef(false); // chặn gửi hai lần (Enter + bấm nút cùng lúc)
  valueRef.current = value;

  const complete = value.length === ROOM_ID_LENGTH;

  const edit = useCallback((next) => {
    setError(null);
    setValue(next.replace(/\D/g, '').slice(0, ROOM_ID_LENGTH));
  }, []);

  const submit = useCallback(async () => {
    const id = valueRef.current;
    if (busyRef.current) return;
    if (id.length !== ROOM_ID_LENGTH) {
      setError(`ID phòng gồm ${ROOM_ID_LENGTH} chữ số.`);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const message = await onSubmit(id);
      if (message) setError(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [onSubmit]);

  useEffect(() => {
    if (!isTouchDevice()) inputRef.current?.focus();
  }, []);

  // Phím vật lý khi focus KHÔNG ở ô nhập (vd vừa bấm một phím ảo): vẫn gõ được.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.target === inputRef.current || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        edit(valueRef.current + e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        edit(valueRef.current.slice(0, -1));
      } else if (e.key === 'Enter' && (e.target?.tagName !== 'BUTTON' || e.target.closest?.('.tl-key'))) {
        // Enter khi focus đang ở một phím số ảo: vào phòng luôn (không bấm lại phím đó). Ở nút khác (Huỷ / Vào phòng)
        // thì giữ nguyên hành vi của nút.
        e.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [edit, onClose, submit]);

  const press = (key) => {
    if (key === 'clear') edit('');
    else if (key === 'back') edit(value.slice(0, -1));
    else edit(value + key);
  };

  return (
    <div className="tl-modal" role="dialog" aria-modal="true" aria-label="Nhập ID phòng" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tl-join">
        <div className="tl-join__left">
          <h2 className="tl-join__title">Nhập ID phòng</h2>
          <p className="tl-join__hint">Nhập mã {ROOM_ID_LENGTH} chữ số do chủ phòng gửi cho bạn.</p>

          {/* Ô nhập THẬT nằm phủ lên dãy ô số: chạm/click vào đâu cũng bật bàn phím thiết bị. */}
          <div className="tl-join__code" data-testid="join-code">
            {Array.from({ length: ROOM_ID_LENGTH }, (_, i) => (
              <span
                key={i}
                className={`tl-join__digit ${i === value.length && !complete ? 'tl-join__digit--cursor' : ''} ${
                  value[i] ? 'tl-join__digit--filled' : ''
                }`}
              >
                {value[i] ?? ''}
              </span>
            ))}
            <input
              ref={inputRef}
              className="tl-join__input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={ROOM_ID_LENGTH}
              value={value}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              aria-label="ID phòng"
            />
          </div>

          <p className={`tl-join__error ${error ? '' : 'tl-join__error--empty'}`} role="alert">
            {error || ' '}
          </p>

          <div className="tl-join__actions">
            <button type="button" onClick={onClose} className="tl-btn tl-btn--ghost">
              Huỷ
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!complete || busy}
              className="tl-btn tl-btn--primary"
              data-testid="join-submit"
            >
              {busy ? 'Đang vào…' : 'Vào phòng'}
            </button>
          </div>
        </div>

        <div className="tl-join__pad" role="group" aria-label="Bàn phím số">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`tl-key ${k === 'clear' || k === 'back' ? 'tl-key--fn' : ''}`}
              onClick={() => press(k)}
              aria-label={k === 'back' ? 'Xoá số cuối' : k === 'clear' ? 'Xoá hết' : `Số ${k}`}
              data-key={k}
            >
              {k === 'back' ? '⌫' : k === 'clear' ? 'Xoá' : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
