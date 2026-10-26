import { useState } from 'react';
import { api } from '../api';
import { formatPlayerId, loadSavedUsername, saveUsername } from '../session';
import { formatChip } from '../gameFlow';
import HelpButton from './HelpButton';
import PasswordInput from './PasswordInput';

const MODES = [
  { id: 'login', label: 'Đăng nhập' },
  { id: 'register', label: 'Đăng ký' },
];

const inputCls =
  'w-full rounded-lg border border-felt-600 bg-felt-900/60 px-3 py-2 text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // trình duyệt chặn clipboard: bỏ qua
  }
}

/**
 * Đăng nhập / Đăng ký (POST /api/auth/login, /api/auth/register).
 * - Đăng ký xong KHÔNG vào thẳng game: hiện "thẻ chào mừng" với ID người chơi 10 chữ số do Backend cấp
 *   (có nút sao chép) và một ô nhập mã quà tặng; bấm "Vào game" mới đăng nhập.
 * - Các ô nhập KHÔNG có chữ gợi ý / ví dụ nào (không placeholder): người chơi tự nhập mọi thứ.
 * - Form đăng nhập / đăng ký không có ô mã nào. Ô "Mã quà tặng" chỉ có ở thẻ chào mừng ngay sau khi đăng ký, và (như ô mã ở
 *   menu chính) gọi cùng một đường POST /api/auth/redeem: Backend quyết định mã nào hợp lệ cho tài khoản nào —
 *   Frontend không biết mã nào là mã gì.
 * - Chỉ tên đăng nhập được nhớ lại (localStorage) cho lần sau; mật khẩu không bao giờ lưu.
 */
export default function AuthScreen({ onAuthed, onHelp }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState(loadSavedUsername);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [registered, setRegistered] = useState(null); // { username, playerId, balance }
  const [copied, setCopied] = useState(false);
  const [gift, setGift] = useState('');
  const [giftMsg, setGiftMsg] = useState(null); // { kind: 'ok' | 'error', text }
  const [giftBusy, setGiftBusy] = useState(false);

  const isRegister = mode === 'register';

  const switchMode = (next) => {
    setMode(next);
    setError(null);
  };

  const doLogin = async (name, pass) => {
    const res = await api.login({ username: name, password: pass });
    if (res.status !== 'success') {
      setError(res.message || 'Đăng nhập không thành công.');
      return false;
    }
    saveUsername(res.username || name);
    await onAuthed({
      username: res.username || name,
      password: pass,
      playerId: res.player_id != null ? String(res.player_id) : '',
      balance: Number(res.balance) || 0,
      profile: res.profile || null,
      message: res.message,
      // Backend tự cộng vốn hằng ngày (hết tiền + sang ngày mới) nhưng chưa có cờ riêng: nếu sau này có
      // trường daily_bonus thì dùng luôn; không thì App tự nhận ra qua số dư lần trước.
      dailyBonus: Number(res.daily_bonus) || 0,
    });
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    const name = username.trim();
    if (!name || !password) {
      setError('Vui lòng nhập đủ tên tài khoản và mật khẩu.');
      return;
    }
    if (isRegister && password !== confirm) {
      setError('Mật khẩu nhập lại chưa khớp.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isRegister) {
        const reg = await api.register({ username: name, password });
        if (reg.status !== 'success') {
          setError(reg.message || 'Đăng ký không thành công.');
          return;
        }
        saveUsername(name);
        setCopied(false);
        setGift('');
        setGiftMsg(null);
        setRegistered({
          username: name,
          playerId: reg.player_id != null ? String(reg.player_id) : '',
          balance: Number(reg.balance) || 0,
        });
        return;
      }
      await doLogin(name, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const enterGame = async () => {
    if (!registered || loading) return;
    setLoading(true);
    setError(null);
    try {
      const ok = await doLogin(registered.username, password);
      if (!ok) {
        setRegistered(null);
        setMode('login');
      }
    } catch (err) {
      setError(err.message);
      setRegistered(null);
      setMode('login');
    } finally {
      setLoading(false);
    }
  };

  const redeemNow = async (e) => {
    e.preventDefault();
    const code = gift.trim();
    if (!code || giftBusy || !registered) return;
    setGiftBusy(true);
    setGiftMsg(null);
    try {
      const res = await api.redeem({ username: registered.username, code });
      if (res.status === 'success') {
        setRegistered((r) => ({ ...r, balance: Number(res.new_balance) || r.balance }));
        setGiftMsg({ kind: 'ok', text: res.message || 'Đổi thưởng thành công!' });
        setGift('');
      } else {
        setGiftMsg({ kind: 'error', text: res.message || 'Mã đổi thưởng không hợp lệ.' });
      }
    } catch (err) {
      setGiftMsg({ kind: 'error', text: err.message });
    } finally {
      setGiftBusy(false);
    }
  };

  return (
    <div className="relative h-full overflow-y-auto overscroll-contain">
      <div className="absolute right-3 top-3 z-10">
        <HelpButton onClick={onHelp} />
      </div>
      <div className="relative flex min-h-full items-center justify-center px-4 py-4">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(212,175,106,0.10) 0%, rgba(11,46,35,0) 60%)',
          }}
        />

        {registered ? (
          <div className="tl-setup-card tl-auth tl-auth--done relative rounded-2xl border border-gold-500/40 bg-felt-800/90 shadow-2xl shadow-black/50" data-testid="register-done">
            <div className="tl-auth__head">
            <div className="tl-auth__brand mb-3 text-center">
              <p className="text-sm text-emerald-300/90">✓ Đăng ký thành công!</p>
              <h1 className="mt-1 text-xl font-extrabold text-paper-100">Chào {registered.username}</h1>
            </div>

            <div className="tl-idbox">
              <span className="tl-idbox__label">ID người chơi của bạn</span>
              <span className="tl-idno" data-testid="register-player-id" aria-label={`ID người chơi ${registered.playerId}`}>
                {formatPlayerId(registered.playerId)}
              </span>
              <button
                type="button"
                className="tl-idbox__copy"
                onClick={async () => {
                  setCopied(await copyText(registered.playerId));
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? 'Đã chép ✓' : 'Sao chép ID'}
              </button>
            </div>
            <p className="mt-2 text-center text-sm text-paper-200/80">
              Số dư khởi điểm: <b className="text-gold-300">{formatChip(registered.balance)} chip</b>
            </p>
            </div>

            <div className="tl-auth__main">
            <form onSubmit={redeemNow} className="tl-auth__gift mt-3 rounded-xl border border-felt-600 bg-felt-900/60 p-3">
              <span className="mb-1 block text-xs text-paper-200/70">Có mã quà tặng? Nhập để nhận chip ngay</span>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={gift}
                  onChange={(e) => {
                    setGift(e.target.value.toUpperCase());
                    setGiftMsg(null);
                  }}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Mã quà tặng"
                  data-testid="register-gift"
                />
                <button type="submit" disabled={!gift.trim() || giftBusy} className="tl-btn tl-btn--gold" data-testid="register-gift-submit">
                  {giftBusy ? '…' : 'Nhận'}
                </button>
              </div>
              <p
                className={`mt-1.5 min-h-[1.1em] text-xs ${giftMsg?.kind === 'error' ? 'text-red-300' : 'text-emerald-300'}`}
                role="status"
              >
                {giftMsg?.text || ' '}
              </p>
            </form>

            {error && (
              <div className="mt-3 rounded-lg border border-lacquer-500/60 bg-lacquer-600/20 px-3 py-2 text-sm text-paper-100">{error}</div>
            )}

            <button
              type="button"
              onClick={enterGame}
              disabled={loading}
              className="tl-auth__submit mt-4 w-full rounded-xl bg-lacquer-600 py-2.5 font-semibold text-paper-100 transition-colors hover:bg-lacquer-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-felt-800 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="register-enter"
            >
              {loading ? 'Đang vào…' : 'Vào game'}
            </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="tl-setup-card tl-auth relative rounded-2xl border border-gold-500/40 bg-felt-800/90 shadow-2xl shadow-black/50"
          >
            <div className="tl-auth__head">
            <div className="tl-auth__brand mb-4 text-center">
              <p className="text-sm text-gold-300/80">Chào mừng đến với</p>
              <h1 className="mt-1 text-2xl font-extrabold text-paper-100">Tiến Lên Miền Nam</h1>
            </div>

            <div className="tl-auth__tabs mb-4 grid grid-cols-2 gap-1 rounded-xl bg-felt-900/70 p-1" role="tablist">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.id}
                  onClick={() => switchMode(m.id)}
                  className={`rounded-lg py-1.5 text-sm font-semibold transition-colors ${
                    mode === m.id ? 'bg-gold-400/20 text-gold-300' : 'text-paper-200/60 hover:text-paper-100'
                  }`}
                  data-testid={`tab-${m.id}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            </div>

            <div className="tl-auth__main">
            {error && (
              <div className="mb-3 rounded-lg border border-lacquer-500/60 bg-lacquer-600/20 px-3 py-2 text-sm text-paper-100" role="alert">
                {error}
              </div>
            )}

            <div className="tl-auth__fields">
              <label className="block">
                <span className="mb-1 block text-sm text-paper-200/80">Tên tài khoản</span>
                <input
                  className={inputCls}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={24}
                  data-testid="auth-username"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-paper-200/80">Mật khẩu</span>
                {/* key={mode}: đổi tab Đăng nhập <-> Đăng ký thì ô mật khẩu tự ẨN lại. */}
                <PasswordInput
                  key={mode}
                  className={inputCls}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  testId="auth-password"
                />
              </label>
              {isRegister && (
                <label className="block">
                  <span className="mb-1 block text-sm text-paper-200/80">Nhập lại mật khẩu</span>
                  <PasswordInput
                    className={inputCls}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    testId="auth-confirm"
                  />
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="tl-auth__submit mt-5 w-full rounded-xl bg-lacquer-600 py-2.5 font-semibold text-paper-100 transition-colors hover:bg-lacquer-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-felt-800 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="auth-submit"
            >
              {loading ? 'Đang xử lý…' : isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}
            </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
