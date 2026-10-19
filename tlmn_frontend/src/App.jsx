import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import AuthScreen from './components/AuthScreen';
import BonusToast from './components/BonusToast';
import GameSession from './components/GameSession';
import HelpModal from './components/HelpModal';
import JoinRoomModal from './components/JoinRoomModal';
import MainMenu from './components/MainMenu';
import ProfileModal from './components/ProfileModal';
import RedeemModal from './components/RedeemModal';
import SetupScreen from './components/SetupScreen';
import { balanceAnimationStart, detectDailyBonus } from './bonus';
import { flyCoinsBetween } from './chipFx';
import { joinFailureMessage } from './lobby';
import { fetchAccount, normalizeProfile } from './profileStore';
import { generateRoomId, loadLastBalance, saveLastBalance } from './session';

const COUNT_UP_DELAY_MS = 500; // chờ menu hiện xong rồi số chip mới bắt đầu "chạy"

/**
 * KHUNG ỨNG DỤNG: Đăng nhập -> Menu (Tạo phòng / Nhập ID phòng) -> Bàn chơi.
 *
 *  screen 'auth'   AuthScreen          Đăng nhập / Đăng ký (+ ID người chơi 10 số, mã quà tặng)
 *  screen 'menu'   MainMenu            2 ô lớn, hồ sơ (avatar góc trái), mã quà tặng, "?" góc phải
 *  screen 'create' SetupScreen         Form tạo phòng: mã 8 số tự sinh, chế độ, Joker, số người thật + bot, mức cược
 *  screen 'game'   GameSession         Toàn bộ vòng đời một phòng: phòng chờ, các ván, thoát (xem GameSession.jsx)
 *
 * Phòng nhiều người: chủ phòng tạo phòng (ngồi sẵn cùng các bot), bạn bè chọn "Nhập ID phòng", gõ mã rồi Enter ->
 * Backend gán ghế (POST /api/join) và màn hình của họ chuyển sang phòng chờ. Phòng đã vào ván thì không ai vào thêm được.
 *
 * Số dư: lấy từ Backend (đăng nhập / đăng nhập ngầm khi mở hồ sơ hoặc rời bàn). Mỗi lần số dư đổi (thưởng
 * vốn hằng ngày, mã quà tặng, kết quả ván) số chip ở menu "chạy" tới giá trị mới, xanh khi tăng, đỏ khi giảm.
 * Mật khẩu chỉ nằm trong bộ nhớ của tab này (không ghi localStorage) để đăng nhập ngầm làm tươi hồ sơ.
 */
export default function App() {
  const [screen, setScreen] = useState('auth'); // auth | menu | create | game
  const [auth, setAuth] = useState(null); // { username, password, playerId, balance }
  const [profile, setProfile] = useState(null);
  const [shownBalance, setShownBalance] = useState(0); // số chip đang HIỂN THỊ ở menu (chạy tới auth.balance)
  const [modal, setModal] = useState(null); // null | 'join' | 'redeem' | 'profile'
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [bonus, setBonus] = useState(null); // { amount, key } thưởng vốn hằng ngày vừa nhận
  const [room, setRoom] = useState(null); // { roomId, role: 'host' | 'guest', config, key }
  const [lastConfig, setLastConfig] = useState(null); // giữ lại lựa chọn khi quay lại form tạo phòng
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const authRef = useRef(null);
  authRef.current = auth;
  const fxLayerRef = useRef(null);
  const countTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(countTimer.current), []);

  // Luôn nhớ số dư mới nhất của tài khoản: lần đăng nhập sau so sánh để nhận ra thưởng vốn hằng ngày.
  useEffect(() => {
    if (auth) saveLastBalance(auth.username, auth.balance);
  }, [auth?.username, auth?.balance]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Cho số chip ở menu chạy từ `from` tới `real` (from = null: hiện thẳng, không chạy). */
  const showBalance = useCallback((real, from = null) => {
    window.clearTimeout(countTimer.current);
    if (from != null && Math.round(from) !== Math.round(real)) {
      setShownBalance(from);
      countTimer.current = window.setTimeout(() => setShownBalance(real), COUNT_UP_DELAY_MS);
    } else {
      setShownBalance(real);
    }
  }, []);

  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // ---------------------------------------------------------------- đăng nhập / đăng xuất
  const handleAuthed = useCallback(
    (info) => {
      const last = loadLastBalance(info.username);
      const amount = detectDailyBonus({
        last,
        balance: info.balance,
        explicit: info.dailyBonus,
      });
      setAuth({ username: info.username, password: info.password, playerId: info.playerId, balance: info.balance });
      setProfile(
        normalizeProfile({ ...(info.profile || {}), player_id: info.playerId, balance: info.balance }, info.username)
      );
      saveLastBalance(info.username, info.balance); // lưu ngay con số THẬT, trước khi hiệu ứng chạy
      showBalance(info.balance, balanceAnimationStart({ last, balance: info.balance, bonus: amount }));
      setBonus(amount > 0 ? { amount, key: Date.now() } : null);
      setNotice(null);
      setCreateError(null);
      setLastConfig(null);
      setScreen('menu');
    },
    [showBalance]
  );

  const handleLogout = useCallback(() => {
    window.clearTimeout(countTimer.current);
    setModal(null);
    setRoom(null);
    setAuth(null);
    setProfile(null);
    setNotice(null);
    setBonus(null);
    setScreen('auth');
  }, []);

  /**
   * Đăng nhập NGẦM để lấy số dư + hồ sơ mới nhất (mở thẻ hồ sơ, rời bàn). Backend cũng cộng vốn hằng ngày
   * ở bước này nếu hết tiền + sang ngày mới -> hiện thông báo thưởng giống lúc đăng nhập.
   */
  const refreshAccount = useCallback(async () => {
    const before = authRef.current;
    if (!before) return null;
    const res = await fetchAccount({ username: before.username, password: before.password });
    const cur = authRef.current;
    if (!res || !cur || cur.username !== before.username) return null;
    setProfile(res.profile);
    if (Math.round(res.balance) !== Math.round(cur.balance)) {
      const amount = detectDailyBonus({ last: cur.balance, balance: res.balance });
      setAuth((a) => (a && a.username === cur.username ? { ...a, balance: res.balance } : a));
      showBalance(res.balance, balanceAnimationStart({ last: cur.balance, balance: res.balance, bonus: amount }));
      if (amount > 0) setBonus({ amount, key: Date.now() });
    }
    return res;
  }, [showBalance]);

  // ---------------------------------------------------------------- mã quà tặng
  const handleRedeemed = useCallback(
    (newBalance) => {
      const nb = Number(newBalance);
      const cur = authRef.current;
      if (!cur || !Number.isFinite(nb)) return;
      setAuth((a) => (a ? { ...a, balance: nb } : a));
      setProfile((p) => (p ? { ...p, balance: nb, highest_balance: Math.max(p.highest_balance || 0, nb) } : p));
      showBalance(nb, cur.balance);
      // Xu bay từ hộp thoại vào ô số dư (nếu đang hiện).
      flyCoinsBetween(
        fxLayerRef.current,
        document.querySelector('.tl-redeem'),
        document.querySelector('[data-balance-target]'),
        { count: 9, gain: nb >= cur.balance }
      );
    },
    [showBalance]
  );

  // ---------------------------------------------------------------- tạo phòng / vào phòng
  const handleSetupSubmit = useCallback(async (config) => {
    setCreating(true);
    setCreateError(null);
    try {
      // Backend không kiểm tra trùng mã phòng (mở phòng mới sẽ GHI ĐÈ phòng cũ) nên tự kiểm tra trước.
      const { room: taken, rooms } = await api.findRoom(config.room_id);
      const roomId = taken ? generateRoomId(rooms.map((r) => r.room_id)) : config.room_id;
      setLastConfig(config);
      setNotice(null);
      setRoom({ roomId, role: 'host', config: { ...config, room_id: roomId }, key: Date.now() });
      setScreen('game');
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }, []);

  // Nhập mã phòng + Enter: Backend gán cho tài khoản này một ghế người thật còn trống (POST /api/join), rồi màn hình
  // chuyển ngay sang phòng chờ của phòng đó. Phòng đang trong ván / đã đủ người / không có thì Backend báo lỗi.
  // Trả về chuỗi lỗi (hiện trong popup) hoặc null nếu vào được phòng.
  const handleJoin = useCallback(async (roomId) => {
    const cur = authRef.current;
    if (!cur) return 'Bạn chưa đăng nhập.';
    try {
      const res = await api.joinRoom({ roomId, username: cur.username });
      const failure = joinFailureMessage(res);
      if (failure) return failure;
      setModal(null);
      setNotice(null);
      setRoom({
        roomId: String(res.room_id || roomId),
        role: 'guest',
        config: null,
        seat: Number(res.seat),
        lobby: res.lobby || null,
        key: Date.now(),
      });
      setScreen('game');
      return null;
    } catch (err) {
      return err.message;
    }
  }, []);

  // GameSession báo đã rời phòng: { balance (số dư lúc cuối), notice, error }.
  const handleExit = useCallback(
    ({ balance, notice: message, error } = {}) => {
      const cur = authRef.current;
      setRoom(null);
      setHelpOpen(false);
      if (cur && balance != null && Number.isFinite(Number(balance))) {
        const nb = Number(balance);
        setAuth((a) => (a ? { ...a, balance: nb } : a));
        showBalance(nb, cur.balance); // menu hiện số dư trước ván rồi chạy tới số dư sau ván
      }
      if (error) {
        setCreateError(error);
        setScreen('create');
        return;
      }
      setNotice(message || null);
      setScreen('menu');
      refreshAccount(); // số dư / thống kê chính thức từ Backend
    },
    [refreshAccount, showBalance]
  );

  // Giữ số dư lần cuối ngay cả khi đóng tab giữa ván (xem bonus.js: so sánh ở lần đăng nhập sau).
  const handleSessionBalance = useCallback((balance) => {
    const cur = authRef.current;
    if (cur) saveLastBalance(cur.username, balance);
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const lowFunds = Boolean(auth) && auth.balance <= 0;

  return (
    <div className="game-container h-screen w-screen overflow-hidden bg-felt-950 text-paper-100">
      {screen === 'auth' && <AuthScreen onAuthed={handleAuthed} onHelp={toggleHelp} />}

      {screen === 'menu' && auth && (
        <MainMenu
          auth={{ ...auth, balance: shownBalance }}
          profile={profile}
          notice={notice}
          lowFunds={lowFunds}
          onCreateRoom={() => {
            setCreateError(null);
            setScreen('create');
          }}
          onJoinRoom={() => setModal('join')}
          onRedeem={() => setModal('redeem')}
          onOpenProfile={() => setModal('profile')}
          onLogout={handleLogout}
          onHelp={toggleHelp}
        />
      )}

      {screen === 'create' && auth && (
        <SetupScreen
          auth={auth}
          initial={lastConfig}
          loading={creating}
          errorMessage={createError}
          onSubmit={handleSetupSubmit}
          onBack={() => {
            setCreateError(null);
            setScreen('menu');
          }}
          onHelp={toggleHelp}
        />
      )}

      {screen === 'game' && auth && room && (
        <GameSession
          key={room.key}
          auth={auth}
          roomId={room.roomId}
          role={room.role}
          config={room.config}
          seat={room.seat}
          lobby={room.lobby}
          helpOpen={helpOpen}
          onHelp={toggleHelp}
          onExit={handleExit}
          onBalance={handleSessionBalance}
        />
      )}

      {screen === 'menu' && bonus && (
        <BonusToast key={bonus.key} amount={bonus.amount} layerRef={fxLayerRef} onClose={() => setBonus(null)} />
      )}

      {screen === 'menu' && modal === 'join' && <JoinRoomModal onClose={closeModal} onSubmit={handleJoin} />}
      {screen === 'menu' && modal === 'redeem' && auth && (
        <RedeemModal username={auth.username} onClose={closeModal} onRedeemed={handleRedeemed} />
      )}
      {screen === 'menu' && modal === 'profile' && auth && profile && (
        <ProfileModal auth={auth} profile={profile} onClose={closeModal} onSaved={setProfile} onRefresh={refreshAccount} />
      )}

      <HelpModal open={helpOpen} onClose={closeHelp} />
      <div ref={fxLayerRef} className="tl-fx-layer" aria-hidden="true" />
    </div>
  );
}
