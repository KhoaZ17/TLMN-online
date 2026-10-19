import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

/**
 * Popup nhập MÃ ĐỔI THƯỞNG (giftcode) — POST /api/auth/redeem { username, code }.
 * Đây là ô nhập mã DUY NHẤT trong game (kể cả mã nhà phát triển, chỉ riêng chủ game dùng được): Frontend
 * không biết mã nào là mã gì, chỉ gửi nguyên văn và hiện đúng lời Backend trả về (mã sai / không phải của
 * bạn -> báo lỗi). Ô nhập không có chữ gợi ý hay ví dụ nào.
 * Thành công: Backend trả new_balance -> báo lên App (onRedeemed) để số chip ở menu
 * chạy lên màu xanh; popup hiện lời chúc và tự cho đóng. Mã được gửi nguyên văn
 * (Backend tự cắt khoảng trắng và đổi in hoa).
 */
export default function RedeemModal({ username, onClose, onRedeemed }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    const clean = code.trim();
    if (!clean || busy || success) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.redeem({ username, code: clean });
      if (res.status === 'success') {
        setSuccess(res.message || 'Đổi thưởng thành công!');
        onRedeemed(Number(res.new_balance));
      } else {
        setError(res.message || 'Mã đổi thưởng không hợp lệ.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tl-modal" role="dialog" aria-modal="true" aria-label="Nhập mã đổi thưởng" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="tl-card tl-redeem" onSubmit={submit}>
        <h2 className="tl-card__title">🎁 Mã đổi thưởng</h2>
        <p className="tl-card__hint">Nhập mã quà tặng để nhận chip miễn phí. Mỗi tài khoản chỉ dùng mỗi mã một lần.</p>

        <input
          ref={inputRef}
          className="tl-input tl-redeem__input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          disabled={Boolean(success)}
          aria-label="Mã đổi thưởng"
          data-testid="redeem-input"
        />

        <p className={`tl-redeem__msg ${error ? 'tl-redeem__msg--error' : success ? 'tl-redeem__msg--ok' : ''}`} role="status">
          {error || success || ' '}
        </p>

        <div className="tl-card__actions">
          <button type="button" onClick={onClose} className="tl-btn tl-btn--ghost">
            {success ? 'Đóng' : 'Huỷ'}
          </button>
          {!success && (
            <button type="submit" disabled={!code.trim() || busy} className="tl-btn tl-btn--primary" data-testid="redeem-submit">
              {busy ? 'Đang kiểm tra…' : 'Nhận quà'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
