import { useEffect, useSyncExternalStore } from 'react';
import { isSoundOn, setSoundOn, subscribeSound } from '../sound';

/**
 * BẢNG CÀI ĐẶT dạng cửa sổ NỔI (giống bảng hướng dẫn): KHÔNG phủ nền và KHÔNG chặn thao tác phía sau nên ván vẫn chạy bình thường
 * khi đang mở. Nội dung:
 *  - Âm thanh: công tắc bật / tắt (chuông tới lượt), nhớ cho lần sau.
 *  - Nút "Đóng cài đặt".
 *  - Góc DƯỚI của bảng: một nút hành động nguy hiểm do nơi dùng truyền vào — "Thoát bàn" ở bàn chơi, "Đăng xuất" ở menu.
 *
 * action: { label, onClick, locked?, testId?, title? }. Esc cũng đóng bảng.
 */
export default function SettingsPanel({ open, onClose, action, side = 'right' }) {
  const soundOn = useSyncExternalStore(subscribeSound, isSoundOn, () => true);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <aside className={`tl-settings tl-settings--${side}`} role="dialog" aria-label="Cài đặt" data-testid="settings-panel">
      <header className="tl-settings__head">
        <h2 className="tl-settings__title">Cài đặt</h2>
        <button type="button" className="tl-help__close" onClick={onClose} aria-label="Đóng cài đặt" data-testid="settings-close">
          ×
        </button>
      </header>

      <div className="tl-settings__body">
        <div className="tl-settings__row">
          <span className="tl-settings__label" id="tl-sound-label">
            Âm thanh
            <span className="tl-settings__hint">Chuông nhắc khi tới lượt bạn</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={soundOn}
            aria-labelledby="tl-sound-label"
            className={`tl-switch ${soundOn ? 'tl-switch--on' : ''}`}
            onClick={() => setSoundOn(!soundOn)}
            data-testid="sound-toggle"
            data-on={soundOn ? 'true' : 'false'}
          >
            <span className="tl-switch__knob" aria-hidden="true" />
            <span className="tl-switch__text">{soundOn ? 'Bật' : 'Tắt'}</span>
          </button>
        </div>
      </div>

      <footer className="tl-settings__foot">
        <button type="button" className="tl-btn tl-btn--ghost" onClick={onClose} data-testid="settings-close-btn">
          Đóng
        </button>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={`tl-btn tl-btn--ghost tl-settings__danger ${action.locked ? 'tl-btn--locked' : ''}`}
            aria-disabled={Boolean(action.locked)}
            title={action.title}
            data-testid={action.testId}
            data-locked={action.locked ? 'true' : 'false'}
          >
            {action.locked && (
              <span className="tl-btn__lock" aria-hidden="true">
                🔒
              </span>
            )}
            {action.label}
          </button>
        )}
      </footer>
    </aside>
  );
}
