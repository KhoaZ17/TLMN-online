import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from '../api';
import GameScreen from './GameScreen';
import { wait, computeBotThinkSeconds, getDisplayCombo, sameComboArray, createStackEntry } from '../gameFlow';
import {
  COUNTDOWN_SECONDS,
  MIN_PLAYERS_TO_START,
  botSlots,
  MAX_TABLE_SEATS,
  countHumans,
  detectNewMatch,
  isFreshMatch,
  isMySeat,
  newRemoteCombo,
  pickHostSeat,
  resultHoldMs,
  roomHostSeat,
  seatedCount,
  startNeedsPlayers,
} from '../matchFlow';
import { profileFromSeat } from '../profileStore';
import {
  LOBBY_POLL_MS,
  LOBBY_UNSUPPORTED_MESSAGE,
  isLobbyView,
  lobbyClosed,
  lobbyConfigText,
  lobbyCounts,
  lobbyKicked,
  lobbySeated,
  lobbyStarted,
  lobbySeats,
  resumeTarget,
  supportsLobby,
} from '../lobby';

const POLL_MS = 1000; // chu kỳ hỏi Backend về state
const OFFLINE_AFTER = 3; // số lần hỏi liên tiếp thất bại thì coi là mất kết nối
const STALL_TAKEOVER_MS = 8000; // Bot đứng yên quá lâu mà chủ phòng không điều khiển -> máy khác làm thay
const WAITING_TAKEOVER_MS = 8000; // chủ phòng không chia ván mới quá lâu -> người khác chia
const ROOM_CLOSED_RE = /Chưa có ván đấu|Chưa setup/i;

const stateSignature = (s) =>
  `${s.current_turn}|${Object.values(s.players_status || {})
    .map((p) => p.cards_left)
    .join(',')}|${(s.table?.last_combo_cards || []).join(',')}`;

/**
 * MỘT PHIÊN CHƠI trong một phòng: mở phòng (chủ phòng) / ngồi vào phòng (khách), phòng chờ, vòng lặp hỏi state,
 * điều khiển Bot, hiệu ứng bài bay, luồng kết ván (5 giây kết quả -> bàn dọn sạch + đếm ngược 10 giây
 * -> ván mới tự chia), thoát phòng và xử lý mất kết nối.
 *
 * Vai trò:
 *  - role 'host': người tạo phòng (chủ phòng), ngồi ghế 0. Gọi /api/setup. Chỉ 1 người thật -> /api/start ngay.
 *    Nhiều người thật -> PHÒNG CHỜ: chủ phòng + bot ngồi sẵn, ghế người thật còn lại trống; chủ phòng bấm "Bắt đầu ngay"
 *    lúc nào cũng được (ghế trống do Bot ngồi).
 *  - role 'guest': người đã nhập mã phòng (App gọi POST /api/join: Backend gán sẵn ghế `seat`); ngồi ở phòng chờ và
 *    vào bàn khi chủ phòng chia ván đầu. Nhập mã GIỮA HAI VÁN (kể cả lúc đang đếm ngược ván mới) cũng được: người thật được
 *    ưu tiên, bàn đủ mà có Bot thì một Bot bị mời ra. Đang đấu thì không vào được.
 *  - role 'resume': người bị văng (mất mạng / đóng tab) đăng nhập lại: App gọi POST /api/resume, Backend trả lại ghế cũ rồi App
 *    chuyển sang đây cùng `seat`; vào thẳng bàn (hoặc phòng chờ nếu phòng chưa chia bài).
 *  - "Máy điều khiển" = người thật có id ghế nhỏ nhất ĐANG CÒN TRONG VÁN: chỉ máy này gọi /api/bot_action, /api/start
 *    (các ván sau), /api/intro_done. Máy khác chỉ hỏi state và diễn lại nước đi (kể cả Bot) bằng hiệu ứng bài bay.
 *    Chủ phòng ban đầu KHÔNG có đặc quyền gì sau ván đầu: họ thoát thì máy của người thật kế tiếp tự làm việc đó.
 *
 * Quy tắc thoát bàn (Backend): phòng chờ -> chủ phòng thoát = huỷ phòng, khách thoát = trả ghế; đang đấu -> không được
 * bấm thoát, nhưng đóng tab / mất kết nối thì /api/quit (reason 'disconnect') để Bot đánh thay mà GIỮ CHỖ (avatar + tên giữ
 * nguyên, đăng nhập lại là vào lại đúng ghế); giữa hai ván -> bấm "Thoát bàn" là rời HẲN: ghế thành ghế TRỐNG (avatar biến mất
 * ngay, KHÔNG có Bot thay), ván sau tự bắt đầu nếu còn từ 2 người, còn 1 người thì "Chờ thêm người chơi" (người khác nhập mã
 * vào, hoặc chủ phòng bấm "+ Bot"). Hết người thật thì phòng đóng.
 *
 * Giữa hai ván Backend dồn bàn lại (bỏ ghế trống, ĐÁNH SỐ LẠI ghế): ghế của mình luôn lấy theo TÊN TÀI KHOẢN
 * (`my_player_id` trong state), xem adoptSeat.
 */
export default function GameSession({
  auth,
  roomId: roomIdProp,
  role,
  config,
  seat: seatProp,
  lobby: lobbyProp,
  started: startedProp = false,
  helpOpen,
  onHelp,
  onExit,
  onBalance,
}) {
  const creator = role === 'host';

  const [roomId, setRoomId] = useState(roomIdProp);
  const [gameState, setGameStateRaw] = useState(null);
  const [mySeat, setMySeat] = useState(creator ? 0 : seatProp ?? null);
  const [lobbyOn, setLobbyOn] = useState(!creator); // khách vào là ở phòng chờ ngay; chủ phòng chờ tới khi mở phòng xong
  const [lobbyData, setLobbyData] = useState(creator ? null : lobbyProp ?? null); // ảnh chụp phòng chờ của Backend
  const [lobbyStarting, setLobbyStarting] = useState(false);
  const [lobbyError, setLobbyError] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [jokerChoice, setJokerChoice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thinkingBotId, setThinkingBotId] = useState(null);
  // true trong lúc có bài đang bay (của Bạn hoặc của người khác) — tạm dừng polling để không lệch nhịp.
  const [flyingCombo, setFlyingCombo] = useState(false);
  const [tableStack, setTableStack] = useState([]);
  // Mở màn ván mới (chia -> lật -> chờ -> xếp bài): dealKey tăng mỗi ván mới, dealing = true tới khi
  // GameScreen báo xong (onIntroDone).
  const [dealKey, setDealKey] = useState(0);
  const [dealing, setDealing] = useState(false);
  const [matchPhase, setMatchPhaseState] = useState('play'); // play | result | countdown | waiting
  const [countdownLeft, setCountdownLeft] = useState(COUNTDOWN_SECONDS);
  const [instantReveal, setInstantReveal] = useState(false);
  const [profiles, setProfiles] = useState({}); // hồ sơ "trước ván" của từng ghế (popup đối thủ)
  const [matchNumber, setMatchNumber] = useState(null);
  const matchCounterRef = useRef(0);
  const [offline, setOffline] = useState(false);
  const [waitReason, setWaitReason] = useState(null); // null | 'players': ván trước đã xong nhưng bàn còn dưới 2 người
  const [botCtlBusy, setBotCtlBusy] = useState(false); // đang gửi lệnh thêm / bớt Bot

  const uiRef = useRef(null); // API hiệu ứng bay của GameScreen
  const aliveRef = useRef(true);
  const bootRef = useRef(false);
  const exitedRef = useRef(false);
  const quitSentRef = useRef(false);
  const lateJoinRef = useRef(false); // vào phòng khi ván đã xong (giữa hai ván): bỏ qua màn kết quả của ván mình không xem
  const freshStartRef = useRef(false); // state sắp commit là ván ĐẦU TIÊN vừa chia (mình ngồi từ phòng chờ / mình là chủ phòng)
  const lobbySeenUnstartedRef = useRef(!creator && Boolean(lobbyProp) && !lobbyProp.started); // đã từng ngồi phòng chờ CHƯA chia bài
  const countdownRef = useRef(null); // đếm ngược ván mới đang chạy ({ cancelled }), để huỷ khi có ván mới
  const resumeBusy = useRef(false);
  const seatedRef = useRef(0);
  const botBusy = useRef(false);
  const pollBusy = useRef(false);
  const lobbyBusy = useRef(false);
  const failRef = useRef(0);
  // "Thế hệ" của các hành động: một poll gửi đi TRƯỚC khi ta bắt đầu hành động mới có thể trả lời VỀ SAU;
  // so khớp thế hệ trước khi commit để loại đúng các phản hồi cũ đó.
  const actionGeneration = useRef(0);
  const gameStateRef = useRef(null);
  const mySeatRef = useRef(mySeat);
  const roomIdRef = useRef(roomId);
  const phaseRef = useRef('play');
  const stackRef = useRef([]);
  const hostRef = useRef(creator);
  const pollRef = useRef(() => undefined);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onBalanceRef = useRef(onBalance);
  onBalanceRef.current = onBalance;
  mySeatRef.current = mySeat;
  roomIdRef.current = roomId;
  stackRef.current = tableStack;

  const players = gameState?.players_status || {};
  const hostSeat = gameState ? pickHostSeat(players) : null;
  const isHost = gameState ? mySeat != null && hostSeat === mySeat : creator;
  hostRef.current = isHost;
  const seated = gameState ? seatedCount(players) : 0; // số người đang ngồi bàn (ghế trống không tính)
  seatedRef.current = seated;

  // Báo số dư của mình mỗi khi đổi (App ghi nhớ để lần đăng nhập sau nhận ra thưởng vốn hằng ngày).
  const myBalance = mySeat != null ? players[String(mySeat)]?.balance : undefined;
  useEffect(() => {
    if (myBalance != null) onBalanceRef.current?.(Number(myBalance));
  }, [myBalance]);

  const setPhase = useCallback((p) => {
    phaseRef.current = p;
    setMatchPhaseState(p);
  }, []);

  // Ghế HIỆN TẠI của mình. Giữa hai ván Backend dồn bàn lại (bỏ ghế trống, đánh số lại) nên số ghế có thể đổi; state trả về luôn
  // kèm `my_player_id` đúng theo TÊN TÀI KHOẢN (api.getState gửi username). Đổi theo ngay để mọi lời gọi sau dùng đúng số ghế.
  const adoptSeat = useCallback((state) => {
    const seat = Number(state?.my_player_id);
    if (!Number.isInteger(seat) || seat < 0 || seat === mySeatRef.current) return;
    mySeatRef.current = seat;
    setMySeat(seat);
    api.setSession({ playerId: seat });
  }, []);

  // State theo góc nhìn của mình (và tự đổi sang ghế mới nếu bàn vừa được dồn lại).
  const fetchMine = useCallback(async () => {
    const state = await api.getState(mySeatRef.current);
    if (state?.players_status) adoptSeat(state);
    return state;
  }, [adoptSeat]);

  // ---------------------------------------------------------------- rời khỏi phiên
  const leave = useCallback((opts = {}) => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    actionGeneration.current += 1;
    const gs = gameStateRef.current;
    const balance = gs?.players_status?.[String(mySeatRef.current)]?.balance;
    onExitRef.current({ balance: balance ?? null, ...opts });
  }, []);

  const leaveClosed = useCallback(
    (text) => leave({ notice: text || 'Phòng đã đóng.' }),
    [leave]
  );

  // ---------------------------------------------------------------- commit state
  // Mỗi lần state thật sự đổi:
  //  1) Ván mới: bật chuỗi chia bài, dọn bàn, chụp hồ sơ "trước ván" của từng ghế.
  //  2) Xếp CHỒNG combo mới lên bàn (không xoá combo cũ trong cùng vòng); xoá sạch khi bàn trống.
  //     Combo đã dựng sẵn ở dạng ẨN (để đo toạ độ cho hiệu ứng bay) thì chỉ cần hiện ra.
  //  Sau khi kết ván (đang dọn bàn / đếm ngược) KHÔNG dựng lại bài cũ lên bàn.
  const commit = useCallback(
    (next) => {
      if (!next?.players_status) return;
      const prev = gameStateRef.current;
      const newMatch = !prev || detectNewMatch(prev, next);
      // Vào phòng GIỮA HAI VÁN (ván vừa xong, đang đếm ngược ván mới): mình không xem ván đó nên không chia lại bài / không chiếu
      // kết quả, vào thẳng đếm ngược. Ván ĐẦU TIÊN vừa chia (kể cả tới trắng) thì không phải vào muộn.
      const lateJoin = !prev && Boolean(next.is_done) && !freshStartRef.current;
      if (!prev) freshStartRef.current = false;
      if (lateJoin) lateJoinRef.current = true;
      const intro = newMatch && isFreshMatch(next) && !lateJoin;

      if (newMatch) {
        setDealKey((k) => k + 1);
        setDealing(intro);
        setPhase('play');
        setWaitReason(null);
        if (countdownRef.current) countdownRef.current.cancelled = true; // ván mới đã bắt đầu: đếm ngược đang chạy hết ý nghĩa
        setInstantReveal(false);
        setCountdownLeft(COUNTDOWN_SECONDS);
        setJokerChoice(null);
        setErrorMessage(null);
        // Số thứ tự ván hiển thị: Backend mới gửi `match_number` (đúng cả khi mình vào / nối lại giữa chừng). Bản cũ không gửi thì
        // ĐẾM TẠI CHỖ (1, 2, 3…) chứ không dùng `round` — Backend tăng num_round 2 lần sau mỗi ván thường nên số đó nhảy cóc (1 → 3 → 5…).
        matchCounterRef.current = next.match_number != null ? Number(next.match_number) : matchCounterRef.current + 1;
        setMatchNumber(matchCounterRef.current);
        const snap = {};
        Object.entries(next.players_status).forEach(([id, seat]) => {
          const p = profileFromSeat(seat);
          if (p) snap[id] = p;
        });
        setProfiles(snap);
        // Vào giữa ván: dựng sẵn bài đang nằm trên bàn; ván mới chia: bàn trống.
        const combo = intro ? [] : getDisplayCombo(next.table);
        setTableStack(combo.length > 0 ? [createStackEntry(combo)] : []);
      } else if (phaseRef.current === 'play' || phaseRef.current === 'result') {
        const combo = getDisplayCombo(next.table);
        if (combo.length === 0) {
          setTableStack([]);
        } else {
          setTableStack((stack) => {
            const top = stack[stack.length - 1];
            if (top && sameComboArray(top.cards, combo)) {
              return top.hidden ? [...stack.slice(0, -1), { ...top, hidden: false }] : stack;
            }
            return [...stack, createStackEntry(combo)];
          });
        }
      }
      gameStateRef.current = next;
      setGameStateRaw(next);
    },
    [setPhase]
  );

  // ---------------------------------------------------------------- hiệu ứng bài của NGƯỜI KHÁC
  const revealRemote = useCallback(
    async (state, remote, gen) => {
      const entry = createStackEntry(remote.combo, { hidden: true });
      flushSync(() => {
        setFlyingCombo(true);
        setTableStack((stack) => [...stack, entry]);
      });
      const flight = uiRef.current?.flyBotToTable({
        botId: remote.owner,
        entryKey: entry.key,
        combo: remote.combo,
        rot: entry.groupRotation,
      });
      await (flight ? flight.done : wait(300));
      if (gen !== actionGeneration.current || exitedRef.current || !aliveRef.current) {
        flushSync(() => setFlyingCombo(false));
        flight?.cleanup();
        return;
      }
      state.__receivedAt = Date.now(); // làm tươi mốc thời gian để đồng hồ lượt không lệch
      flushSync(() => {
        commit(state);
        setFlyingCombo(false);
      });
      flight?.cleanup();
    },
    [commit]
  );

  // ---------------------------------------------------------------- hỏi state định kỳ
  // Ghế của mình trong state vừa nhận còn hợp lệ không? Trả về false khi đã rời / đang nối lại (nơi gọi bỏ qua state này).
  //  - Ghế đã được trả (trống) hoặc giờ thuộc người khác (bàn bị dồn lại sau khi mình mất chỗ) -> ra menu.
  //  - Bot đang đánh thay mình (bị văng nhưng tab vẫn mở: trang được khôi phục, tab bị treo, mở cùng tài khoản ở tab khác rồi đóng...)
  //    -> NỐI LẠI (POST /api/resume) để lấy lại ghế thay vì đá ra menu; không nối lại được mới ra menu.
  const checkMySeat = useCallback(
    async (state) => {
      const seat = mySeatRef.current;
      if (!isMySeat(state, seat, auth.username)) {
        leave({ notice: 'Bạn không còn ngồi ở bàn này (chỗ của bạn đã được trả lại).' });
        return false;
      }
      const me = state.players_status?.[String(seat)];
      if (me && me.type !== 'human') {
        if (resumeBusy.current) return false;
        resumeBusy.current = true;
        try {
          const r = resumeTarget(await api.resumeRoom({ username: auth.username }));
          if (r && r.roomId === String(roomIdRef.current)) {
            quitSentRef.current = false;
            setErrorMessage(null);
            return false; // state này còn ghi "Bot đánh thay": bỏ qua, nhịp sau sẽ thấy mình là người thật
          }
        } catch {
          /* mạng lỗi: coi như không nối lại được */
        } finally {
          resumeBusy.current = false;
        }
        leave({ notice: 'Bạn đã rời trận nên Bot đã thay thế vị trí của bạn.' });
        return false;
      }
      return true;
    },
    [auth.username, leave]
  );

  const poll = useCallback(async () => {
    if (pollBusy.current || exitedRef.current || mySeatRef.current == null) return;
    pollBusy.current = true;
    const gen = actionGeneration.current;
    try {
      const state = await fetchMine();
      failRef.current = 0;
      setOffline(false);
      if (gen !== actionGeneration.current || exitedRef.current || !aliveRef.current) return;
      if (!state || state.status === 'error') {
        if (ROOM_CLOSED_RE.test(state?.message || '')) {
          leaveClosed('Phòng đã đóng — có người đã thoát bàn giữa các ván.');
        } else if (state?.message) {
          setErrorMessage(state.message);
        }
        return;
      }
      if (!(await checkMySeat(state))) return;
      if (gen !== actionGeneration.current || exitedRef.current || !aliveRef.current) return;
      const prev = gameStateRef.current;
      const remote =
        prev && (phaseRef.current === 'play' || phaseRef.current === 'result') && !detectNewMatch(prev, state)
          ? newRemoteCombo(state, mySeatRef.current, stackRef.current)
          : null;
      if (remote && uiRef.current && !state.is_done === !prev?.is_done) {
        await revealRemote(state, remote, gen);
      } else if (remote && uiRef.current) {
        await revealRemote(state, remote, gen); // nước đi cuối cùng kết thúc ván cũng được diễn lại
      } else {
        commit(state);
      }
      setErrorMessage((m) => (m && /kết nối/i.test(m) ? null : m));
    } catch {
      failRef.current += 1;
      if (failRef.current >= OFFLINE_AFTER) setOffline(true);
    } finally {
      pollBusy.current = false;
    }
  }, [checkMySeat, commit, fetchMine, leaveClosed, revealRemote]);
  pollRef.current = poll;

  const hasState = gameState != null;
  useEffect(() => {
    if (!hasState || thinkingBotId != null || flyingCombo) return undefined;
    const id = setInterval(() => pollRef.current(), POLL_MS);
    return () => clearInterval(id);
  }, [hasState, thinkingBotId, flyingCombo]);

  // Mạng: mất / có lại; tab quay lại sau khi bị ẩn thì hỏi ngay.
  useEffect(() => {
    const onOnline = () => {
      failRef.current = 0;
      setOffline(false);
      pollRef.current();
    };
    const onOffline = () => setOffline(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') pollRef.current();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Đóng tab / tải lại trang = rời phòng: báo Backend (chỉ gửi đúng 1 lần). Ở phòng chờ: chủ phòng đóng tab = huỷ phòng,
  // khách đóng tab = trả ghế. Đang đấu / giữa hai ván: Bot ngồi thay và ván vẫn tiếp diễn cho những người còn lại.
  useEffect(() => {
    const onHide = () => {
      if (quitSentRef.current || exitedRef.current || mySeatRef.current == null) return;
      const gs = gameStateRef.current;
      // Đã có state: chỉ báo khi ghế của mình còn là người thật (ghế đã là Bot thì không còn gì để báo).
      if (gs && gs.players_status?.[String(mySeatRef.current)]?.type !== 'human') return;
      quitSentRef.current = true;
      api.quitOnUnload();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // Trang được khôi phục (nút Back / bộ nhớ đệm trang) sau khi đã lỡ báo "bị văng" -> nối lại để lấy lại ghế từ Bot.
  useEffect(() => {
    const onShow = (e) => {
      if (!e.persisted || exitedRef.current || !quitSentRef.current) return;
      api
        .resumeRoom({ username: auth.username })
        .then((res) => {
          if (resumeTarget(res)) {
            quitSentRef.current = false;
            pollRef.current();
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [auth.username]);

  // ---------------------------------------------------------------- phòng chờ
  // Hỏi Backend mỗi giây: ai đã ngồi vào ghế nào (và "điểm danh" là mình còn ở phòng). Khi ván đầu được chia (chủ phòng bấm
  // bắt đầu) thì lấy state rồi vào bàn. Phòng bị huỷ / mình mất ghế thì rời ra menu.
  const hasStateNow = gameState != null;
  const lobbyActive = lobbyOn && !hasStateNow;
  useEffect(() => {
    if (!lobbyActive) return undefined;
    let stopped = false;
    const tick = async () => {
      if (lobbyBusy.current || exitedRef.current || mySeatRef.current == null) return;
      lobbyBusy.current = true;
      try {
        // Truyền phòng + ghế + tài khoản tường minh: lần hỏi đầu tiên chạy ngay lúc dựng, trước cả bước khởi động phiên.
        const res = await api.getLobby({ roomId: roomIdRef.current, playerId: mySeatRef.current, username: auth.username });
        if (stopped || exitedRef.current || !aliveRef.current) return;
        failRef.current = 0;
        setOffline(false);
        if (lobbyClosed(res)) {
          leave({ notice: creator ? 'Phòng đã đóng.' : 'Chủ phòng đã huỷ phòng hoặc phòng đã hết hạn.' });
          return;
        }
        if (lobbyKicked(res)) {
          leave({ notice: 'Bạn không còn ở trong phòng chờ này.' });
          return;
        }
        if (!isLobbyView(res)) return; // phản hồi lạ: hỏi lại ở nhịp sau
        setLobbyData(res);
        if (!res.started) lobbySeenUnstartedRef.current = true;
        if (res.started) {
          // Chủ phòng bắt đầu khi còn ghế trống -> Backend đánh số lại ghế cho liền mạch (không thêm Bot): lấy đúng ghế mới của mình.
          if (res.seat != null && Number(res.seat) !== mySeatRef.current) {
            mySeatRef.current = Number(res.seat);
            setMySeat(Number(res.seat));
            api.setSession({ roomId: roomIdRef.current, playerId: Number(res.seat), username: auth.username });
          }
          const mine = await fetchMine();
          if (stopped || exitedRef.current || !aliveRef.current) return;
          if (mine?.status === 'success' && mine.players_status) {
            if (!(await checkMySeat(mine))) return;
            // Đã ngồi phòng chờ CHƯA chia bài rồi chủ phòng bắt đầu -> ván đầu tiên vừa chia. Vào sau khi đã chia (nhập mã giữa
            // hai ván, nối lại phòng) thì không phải ván đầu: vào thẳng bàn.
            freshStartRef.current = lobbySeenUnstartedRef.current;
            setLobbyOn(false);
            commit(mine);
          }
        }
      } catch {
        failRef.current += 1;
        if (failRef.current >= OFFLINE_AFTER) setOffline(true);
      } finally {
        lobbyBusy.current = false;
      }
    };
    tick();
    const id = setInterval(tick, LOBBY_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [lobbyActive, creator, auth.username, checkMySeat, commit, fetchMine, leave]);

  // ---------------------------------------------------------------- khởi động phiên
  const startFirstMatch = useCallback(async () => {
    // Ván đầu tiên: Backend chỉ nhận lệnh từ ghế chủ phòng; ghế người thật còn trống thì bỏ trống (không thêm Bot).
    const res = await api.startGame({ playerId: mySeatRef.current ?? 0 });
    if (res?.status === 'error') throw new Error(res.message || 'Không chia được bài.');
    // start_new_match trả state theo góc nhìn ghế 0: lấy lại đúng góc nhìn của mình (và ghế mới nếu bàn vừa được dồn lại).
    const mine = await fetchMine();
    if (mine?.status !== 'success') throw new Error(mine?.message || 'Không lấy được trạng thái ván.');
    freshStartRef.current = true; // ván đầu tiên vừa chia: kể cả tới trắng cũng phải chia bài + chiếu kết quả như thường
    return mine;
  }, [fetchMine]);

  useEffect(() => {
    aliveRef.current = true;
    if (bootRef.current) {
      return () => {
        aliveRef.current = false;
      };
    }
    bootRef.current = true;

    const bootHost = async () => {
      api.setSession({ roomId: roomIdProp, playerId: 0, username: auth.username });
      let setup;
      try {
        setup = await api.setupGame({ ...config, room_id: roomIdProp });
      } catch (err) {
        leave({ error: err.message });
        return;
      }
      if (!aliveRef.current) return;
      if (!setup || setup.status !== 'success') {
        leave({ error: setup?.message || 'Không mở được phòng.' });
        return;
      }
      const rid = String(setup.room_id || roomIdProp);
      api.setSession({ roomId: rid, playerId: 0, username: auth.username });
      setRoomId(rid);
      if ((config.num_humans || 1) > 1) {
        if (!supportsLobby(setup)) {
          // Máy chủ bản cũ không có phòng chờ nên bạn bè sẽ không vào được: đóng phòng vừa mở (không để lại phòng "ma") và báo cập nhật.
          try {
            await api.quitGame({ playerId: 0 });
          } catch {
            /* bỏ qua */
          }
          leave({ error: LOBBY_UNSUPPORTED_MESSAGE });
          return;
        }
        // Nhiều người thật: phòng CHỜ — chủ phòng + bot ngồi sẵn, ghế người thật còn lại trống chờ người nhập mã.
        // Lấy ngay ảnh chụp phòng để lần vẽ đầu đã đủ ghế; sau đó vòng hỏi phòng chờ (bên trên) lo phần còn lại.
        try {
          const first = await api.getLobby({ roomId: rid, playerId: 0, username: auth.username });
          if (aliveRef.current && isLobbyView(first)) setLobbyData(first);
        } catch {
          /* vòng hỏi phòng chờ sẽ lấy lại */
        }
        if (!aliveRef.current) return;
        lobbySeenUnstartedRef.current = true;
        setLobbyOn(true);
        return;
      }
      try {
        commit(await startFirstMatch());
      } catch (err) {
        leave({ error: err.message });
      }
    };

    const bootGuest = () => {
      // Backend đã gán ghế khi nhập mã (POST /api/join; App chuyển sang đây cùng số ghế + ảnh chụp phòng chờ).
      // Từ đây vòng hỏi phòng chờ lo phần còn lại: chủ phòng bấm bắt đầu thì vào bàn, phòng bị huỷ thì ra menu.
      if (seatProp == null) {
        leave({ notice: 'Không vào được phòng này. Hãy nhập lại mã phòng.' });
        return;
      }
      api.setSession({ roomId: roomIdProp, playerId: seatProp, username: auth.username });
      mySeatRef.current = seatProp;
      setLobbyOn(true);
    };

    if (creator) bootHost();
    else bootGuest();
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chủ phòng (nhiều người thật) bấm "Bắt đầu ngay" ở phòng chờ.
  const handleLobbyStart = useCallback(async () => {
    setLobbyStarting(true);
    setLobbyError(null);
    try {
      const mine = await startFirstMatch();
      setLobbyOn(false);
      commit(mine);
    } catch (err) {
      setLobbyError(err.message);
    } finally {
      setLobbyStarting(false);
    }
  }, [commit, startFirstMatch]);

  // ---------------------------------------------------------------- chia ván mới sau đếm ngược
  // Trả về: 'started' (đã vào ván mới) | 'need_players' (bàn còn dưới 2 người) | 'closed' | 'stopped' | 'retry' (thử mãi chưa được).
  const startNext = useCallback(async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (exitedRef.current || !aliveRef.current) return 'stopped';
      try {
        // Người khác đã chia ván mới rồi thì thôi (tránh chia đè lên ván đang chơi — hoặc lên một ván tới trắng
        // vừa chia, ván đó xong ngay nên không còn is_active/!is_done để nhận ra, phải so với ván đang xem).
        const cur = await fetchMine();
        const known = gameStateRef.current;
        if (cur?.status === 'success' && ((cur.is_active && !cur.is_done) || (known && detectNewMatch(known, cur)))) {
          commit(cur);
          return 'started';
        }
        if (cur?.status === 'error' && ROOM_CLOSED_RE.test(cur.message || '')) {
          leaveClosed('Phòng đã đóng — có người đã thoát bàn giữa các ván.');
          return 'closed';
        }
        const res = await api.startGame();
        if (res?.status === 'error') {
          if (ROOM_CLOSED_RE.test(res.message || '')) {
            leaveClosed('Phòng đã đóng — có người đã thoát bàn giữa các ván.');
            return 'closed';
          }
          // Backend không tự thêm Bot: bàn còn dưới 2 người thì phải chờ người khác nhập mã vào (hoặc chủ phòng thêm Bot).
          if (startNeedsPlayers(res)) return 'need_players';
          await wait(1500);
          continue;
        }
        const mine = await fetchMine();
        if (mine?.status === 'success') {
          commit(mine);
          return 'started';
        }
      } catch {
        await wait(1500);
      }
    }
    if (aliveRef.current && !exitedRef.current) {
      setErrorMessage('Chưa chia được ván mới. Đang thử lại…');
      setPhase('waiting');
    }
    return 'retry';
  }, [commit, fetchMine, leaveClosed, setPhase]);

  // Đếm ngược 10 giây giữa bàn rồi chia ván mới (chỉ "máy điều khiển" gọi /api/start; máy khác chờ ván mới hiện ra qua poll).
  // Bàn còn dưới 2 người thì dừng ở "Chờ thêm người chơi" (xem WaitingForPlayers): có người vào / chủ phòng thêm Bot đủ 2 người
  // thì effect bên dưới đếm ngược lại. Mỗi lần chạy có một "thẻ" để huỷ khi ván mới đã bắt đầu.
  const runCountdown = useCallback(async () => {
    if (countdownRef.current) countdownRef.current.cancelled = true;
    const token = { cancelled: false };
    countdownRef.current = token;
    const alive = () => !token.cancelled && aliveRef.current && !exitedRef.current;
    setWaitReason(null);
    setPhase('countdown');
    for (let s = COUNTDOWN_SECONDS; s > 0; s -= 1) {
      if (seatedRef.current < MIN_PLAYERS_TO_START) {
        setWaitReason('players'); // không đủ người thì đếm ngược vô nghĩa
        setPhase('waiting');
        return;
      }
      setCountdownLeft(s);
      await wait(1000);
      if (!alive()) return;
    }
    setCountdownLeft(0);
    if (hostRef.current) {
      const result = await startNext();
      if (!alive()) return;
      if (result === 'need_players') {
        setWaitReason('players');
        setPhase('waiting');
      }
    } else {
      setPhase('waiting');
    }
  }, [setPhase, startNext]);

  // ---------------------------------------------------------------- luồng kết ván
  // kết quả (5s; "tới trắng" thì lật bài + chiếu đèn) -> dọn bàn + đếm ngược 10s ở giữa bàn -> ván mới.
  // Người vào phòng GIỮA HAI VÁN (lateJoinRef) không xem ván vừa xong nên bỏ qua màn kết quả, vào thẳng đếm ngược.
  const isDone = Boolean(gameState?.is_done);
  const instantMatch = Boolean(gameState?.instant_win_info?.has_instant_win);
  useEffect(() => {
    if (!isDone || dealing) return undefined;
    let cancelled = false;
    const sleep = async (ms) => {
      await wait(ms);
      return !cancelled && aliveRef.current && !exitedRef.current;
    };
    (async () => {
      if (lateJoinRef.current) {
        lateJoinRef.current = false;
      } else {
        setPhase('result');
        if (instantMatch) setInstantReveal(true);
        if (!(await sleep(resultHoldMs(gameStateRef.current)))) return; // hết bài 5s; tới trắng 5s + 0,5–5s theo power
      }
      stackRef.current = [];
      setTableStack([]); // dọn sạch bàn
      await runCountdown();
    })();
    return () => {
      cancelled = true;
      if (countdownRef.current) countdownRef.current.cancelled = true;
    };
  }, [isDone, dealKey, dealing, instantMatch, setPhase, runCountdown]);

  // "Chờ thêm người chơi" mà có người vào / chủ phòng thêm Bot cho đủ 2 người -> đếm ngược lại rồi chia ván mới.
  useEffect(() => {
    if (matchPhase !== 'waiting' || waitReason !== 'players' || seated < MIN_PLAYERS_TO_START) return;
    runCountdown();
  }, [matchPhase, waitReason, seated, runCountdown]);

  // Khách chờ ván mới quá lâu (chủ phòng treo máy / tab bị ẩn) -> người khác chia hộ. (Đang "chờ thêm người" thì không có gì để chia.)
  useEffect(() => {
    if (matchPhase !== 'waiting' || isHost || waitReason === 'players') return undefined;
    const t = setTimeout(async () => {
      const result = await startNext();
      if (result === 'need_players' && aliveRef.current && !exitedRef.current) {
        setWaitReason('players');
        setPhase('waiting');
      }
    }, WAITING_TAKEOVER_MS);
    return () => clearTimeout(t);
  }, [matchPhase, isHost, waitReason, startNext, setPhase]);

  // ---------------------------------------------------------------- chủ phòng thêm / bớt Bot
  // Chỉ chủ phòng (Backend kiểm tra theo tài khoản), ở phòng chờ hoặc giữa hai ván. Backend không bao giờ tự thêm Bot.
  const handleBots = useCallback(
    async (action) => {
      if (botCtlBusy) return;
      setBotCtlBusy(true);
      try {
        const res = await api.manageBots({ roomId: roomIdRef.current, username: auth.username, action });
        if (!res || res.status !== 'success') {
          setErrorMessage(
            res?.message || 'Máy chủ chưa hỗ trợ thêm / bớt Bot. Hãy cập nhật server.py và app_controller.py bản mới (xem README).'
          );
          return;
        }
        setErrorMessage(null);
        if (res.lobby?.players) setLobbyData({ status: 'success', ...res.lobby });
        pollRef.current(); // thấy ghế đổi ngay, không đợi nhịp hỏi kế tiếp
      } catch (err) {
        setErrorMessage(err.message);
      } finally {
        setBotCtlBusy(false);
      }
    },
    [auth.username, botCtlBusy]
  );

  // ---------------------------------------------------------------- điều khiển Bot (chỉ chủ phòng)
  // Bot = ghế có type 'bot' (kể cả ghế của người đã thoát, Bot đánh thay). Một người xem: gọi
  // /api/bot_action NGAY để biết nước đi, giữ "Đang suy nghĩ…" 1.5 + (số_lá-1)*0.35 giây rồi mới bay bài.
  // Nhiều người xem: "nghĩ" TRƯỚC rồi mới gọi Backend, để mọi máy thấy nước đi cùng lúc.
  useEffect(() => {
    const gs = gameState;
    if (!gs || !gs.is_active || gs.is_done || dealing || matchPhase !== 'play' || !isHost) return undefined;
    const botId = gs.current_turn;
    const seat = gs.players_status?.[String(botId)];
    if (!seat || seat.type !== 'bot' || botId === mySeat) return undefined;
    if (botBusy.current) return undefined;

    let cancelled = false;
    botBusy.current = true;
    actionGeneration.current += 1; // vô hiệu hoá mọi poll đã gửi trước đó
    const oldCardsLeft = seat.cards_left ?? 0;
    const multi = countHumans(gs.players_status) > 1;
    setThinkingBotId(botId);

    const run = async () => {
      try {
        if (multi) {
          await wait(Math.round((1.5 + Math.random() * 1.2) * 1000));
          if (cancelled) return;
        }
        const res = await api.triggerBotAction();
        if (cancelled) return;
        if (!res || res.status === 'error') {
          setThinkingBotId(null); // vd ván vừa kết thúc: để polling lo
          botBusy.current = false;
          return;
        }
        // Backend trả state theo góc nhìn của Bot vừa đánh -> lấy lại state theo góc nhìn CỦA MÌNH.
        const mine = await api.getState(mySeatRef.current);
        if (cancelled) return;
        if (mine?.status !== 'success') {
          setThinkingBotId(null);
          botBusy.current = false;
          return;
        }
        const newLeft = mine.players_status?.[String(botId)]?.cards_left ?? 0;
        const didPlay = newLeft < oldCardsLeft;
        const rawCombo =
          didPlay && mine.table?.last_combo_owner === botId ? mine.table.last_combo_cards || [] : [];
        const playedCombo = rawCombo.length > 0 ? getDisplayCombo(mine.table) : [];

        if (!multi) {
          const totalSeconds = computeBotThinkSeconds({ passed: !didPlay, comboLength: rawCombo.length });
          let remainingMs = Math.round(totalSeconds * 1000);
          while (remainingMs > 0) {
            const step = Math.min(500, remainingMs);
            // eslint-disable-next-line no-await-in-loop
            await wait(step);
            if (cancelled) return;
            remainingMs -= step;
          }
        }
        setThinkingBotId(null);
        mine.__receivedAt = Date.now(); // đồng hồ lượt không lệch sau thời gian "nghĩ"

        if (playedCombo.length === 0) {
          commit(mine);
          botBusy.current = false;
          return;
        }
        // Dựng sẵn cụm bài ở dạng ẨN, đo toạ độ đích, bay từ ghế Bot tới đó, rồi hiện.
        const entry = createStackEntry(playedCombo, { hidden: true });
        flushSync(() => {
          setFlyingCombo(true);
          setTableStack((stack) => [...stack, entry]);
        });
        const flight = uiRef.current?.flyBotToTable({
          botId,
          entryKey: entry.key,
          combo: playedCombo,
          rot: entry.groupRotation,
        });
        await (flight ? flight.done : wait(300));
        flushSync(() => {
          commit(mine);
          setFlyingCombo(false);
        });
        flight?.cleanup();
        botBusy.current = false;
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err.message);
          setThinkingBotId(null);
        }
        botBusy.current = false;
      }
    };
    run();

    return () => {
      cancelled = true;
      botBusy.current = false;
      setThinkingBotId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.current_turn, gameState?.is_active, gameState?.is_done, gameState?.round, dealing, matchPhase, isHost, mySeat]);

  // Máy khách: tới lượt Bot mà chủ phòng không điều khiển (treo máy / tab bị ẩn) quá 8 giây -> gọi hộ.
  const signature = gameState ? stateSignature(gameState) : '';
  useEffect(() => {
    const gs = gameStateRef.current;
    if (isHost || !gs || !gs.is_active || gs.is_done || dealing || matchPhase !== 'play') return undefined;
    const cur = gs.players_status?.[String(gs.current_turn)];
    if (!cur || cur.type !== 'bot') return undefined;
    const t = setTimeout(async () => {
      const latest = gameStateRef.current;
      if (!latest || exitedRef.current || stateSignature(latest) !== signature) return;
      try {
        await api.triggerBotAction();
      } catch {
        /* thử lại ở lần poll sau */
      }
    }, STALL_TAKEOVER_MS);
    return () => clearTimeout(t);
  }, [signature, isHost, dealing, matchPhase]);

  // ---------------------------------------------------------------- hành động của chính mình
  const showError = (res) => {
    setErrorMessage(res?.message || 'Đã có lỗi xảy ra.');
  };

  // Áp state trực tiếp (không hiệu ứng bay): bỏ lượt, các nhánh lỗi / chọn Joker dùng chung.
  const applyResult = useCallback(
    (res) => {
      if (!res) return;
      if (res.status === 'require_joker_choice') {
        setJokerChoice({ options: res.options, cardsToPlay: res.cards_to_play });
        return;
      }
      if (res.status === 'error') {
        showError(res);
        return;
      }
      commit(res.status === 'success' ? res.state : res);
      setJokerChoice(null);
      setErrorMessage(null);
    },
    [commit]
  );

  // ĐÁNH BÀI của chính mình: dựng sẵn cụm bài ẨN trên bàn, đo toạ độ thật, cho các lá đang chọn bay MƯỢT
  // từ chỗ đang nằm trên tay (Joker lật nửa vòng rồi hiện lá thật) — bay xong mới cập nhật state trong
  // CÙNG 1 lần vẽ nên không có khoảnh khắc chớp / biến mất.
  const revealPlay = useCallback(
    async (res, cardsPlayed) => {
      if (!res) return;
      if (res.status === 'require_joker_choice') {
        setJokerChoice({ options: res.options, cardsToPlay: res.cards_to_play });
        return;
      }
      if (res.status === 'error') {
        showError(res);
        return;
      }
      const nextState = res.status === 'success' ? res.state : res;
      const combo = getDisplayCombo(nextState.table);
      setErrorMessage(null);
      setJokerChoice(null);

      if (combo.length > 0 && cardsPlayed?.length && uiRef.current) {
        const entry = createStackEntry(combo, { hidden: true });
        flushSync(() => {
          setFlyingCombo(true);
          setTableStack((stack) => [...stack, entry]);
        });
        await uiRef.current.flyHandToTable({
          entryKey: entry.key,
          cards: cardsPlayed,
          combo,
          rot: entry.groupRotation,
        });
      }
      flushSync(() => {
        commit(nextState);
        setFlyingCombo(false);
      });
    },
    [commit]
  );

  const handlePlayCards = async (cards) => {
    setIsSubmitting(true);
    actionGeneration.current += 1;
    try {
      await revealPlay(await api.playAction({ cardsToPlay: cards }), cards);
    } catch (err) {
      uiRef.current?.recallHand();
      flushSync(() => setFlyingCombo(false));
      setErrorMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePass = async () => {
    setIsSubmitting(true);
    actionGeneration.current += 1;
    try {
      applyResult(await api.playAction({ cardsToPlay: [] }));
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveJoker = async (optionIndex) => {
    if (!jokerChoice) return;
    setIsSubmitting(true);
    actionGeneration.current += 1;
    try {
      await revealPlay(
        await api.playAction({ cardsToPlay: jokerChoice.cardsToPlay, chosenOptionIndex: optionIndex }),
        jokerChoice.cardsToPlay
      );
    } catch (err) {
      uiRef.current?.recallHand();
      flushSync(() => setFlyingCombo(false));
      setErrorMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIntroDone = useCallback(() => {
    setDealing(false);
    if (hostRef.current) api.introDone().catch(() => undefined); // chủ phòng báo: bắt đầu tính giờ lượt
  }, []);

  // Thoát bàn (nút đã bị khoá khi đang đấu; nơi duy nhất còn gọi được lúc đó là mất kết nối).
  //  - Phòng chờ: chủ phòng thoát = huỷ phòng; khách thoát = trả ghế cho người khác.
  //  - Giữa hai ván: rời HẲN — ghế thành ghế TRỐNG (không có Bot thay). Ván sau tự bắt đầu cho những người còn lại nếu còn từ
  //    2 người, còn 1 người thì "Chờ thêm người chơi"; hết người thật thì phòng đóng.
  // Chỉ gửi ĐÚNG MỘT lần, và chỉ khi ghế còn là của người thật.
  const handleQuit = useCallback(async () => {
    if (exitedRef.current) return;
    const gs = gameStateRef.current;
    const seat = mySeatRef.current;
    try {
      if (!quitSentRef.current && seat != null) {
        const me = gs?.players_status?.[String(seat)];
        if (!gs || me?.type === 'human') {
          quitSentRef.current = true;
          await api.quitGame({ playerId: seat });
        }
      }
    } catch {
      /* vẫn thoát dù gọi API lỗi */
    }
    leave({});
  }, [leave]);

  // ---------------------------------------------------------------- hiển thị
  const me = mySeat != null ? players[String(mySeat)] : null;
  const myName = me?.name || auth.username;
  const guestThinking =
    !isHost && gameState && gameState.is_active && !gameState.is_done && !dealing && !flyingCombo && matchPhase === 'play'
      ? (() => {
          const cur = players[String(gameState.current_turn)];
          return cur?.type === 'bot' && gameState.current_turn !== mySeat ? gameState.current_turn : null;
        })()
      : null;

  // Nút "− Bot / + Bot" của CHỦ PHÒNG (ghế `host_seat`) giữa hai ván: Backend không bao giờ tự thêm Bot, muốn có Bot thì chủ phòng
  // bấm. Chỉ hiện ở lúc đếm ngược giữa bàn và ở "Chờ thêm người chơi" (lúc đang đấu Backend từ chối nên không hiện).
  const slots = botSlots(players);
  const isRoomHost = Boolean(gameState) && mySeat != null && roomHostSeat(gameState) === mySeat;
  const botControls = {
    canAdd: slots.canAdd,
    canRemove: slots.canRemove,
    busy: botCtlBusy,
    onAdd: () => handleBots('add'),
    onRemove: () => handleBots('remove'),
  };
  const showBotControls = isRoomHost && (matchPhase === 'countdown' || (matchPhase === 'waiting' && waitReason === 'players'));

  // Phòng chờ: danh sách ghế do Backend báo (chủ phòng / bot / người đã vào / chỗ trống). Chủ phòng = ghế `host_seat`.
  const lobbySeatList = lobbyData ? lobbySeats(lobbyData, mySeat) : [];
  const lobbyIsHost = lobbyData ? Number(lobbyData.host_seat) === mySeat : creator;
  const lobbyCountsNow = lobbyCounts(lobbySeatList);
  const lobbyBotControls = {
    canAdd: lobbySeated(lobbyCountsNow) < MAX_TABLE_SEATS,
    canRemove: lobbyCountsNow.bots > 0,
    busy: botCtlBusy || lobbyStarting,
    onAdd: () => handleBots('add'),
    onRemove: () => handleBots('remove'),
  };
  // Nối lại / nhập mã vào phòng ĐÃ chia bài (giữa hai ván): không chớp màn phòng chờ trong lúc lấy state
  // (chỉ hiện nếu Backend báo phòng chưa chia).
  const joinedStarted = (role === 'resume' && startedProp) || (role === 'guest' && lobbyStarted(lobbyProp));
  const hideLobby = joinedStarted && !(lobbyData && !lobbyData.started);
  const lobby =
    lobbyOn && !gameState && !hideLobby
      ? {
          roomId,
          seats: lobbySeatList,
          counts: lobbyCountsNow,
          configText: lobbyConfigText(lobbyData?.config || config),
          isHost: lobbyIsHost,
          botControls: lobbyIsHost && lobbyData ? lobbyBotControls : null,
          loading: !lobbyData,
          starting: lobbyStarting,
          error: lobbyError,
          onStart: lobbyIsHost ? handleLobbyStart : undefined,
        }
      : null;

  return (
    <GameScreen
      ref={uiRef}
      gameState={gameState}
      mySeat={mySeat ?? 0}
      myName={myName}
      myProfile={mySeat != null ? profiles[mySeat] ?? null : null}
      profiles={profiles}
      roomId={roomId}
      matchNumber={matchNumber}
      helpOpen={helpOpen}
      offline={offline}
      jokerChoice={jokerChoice}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      thinkingBotId={thinkingBotId ?? guestThinking}
      flyingCombo={flyingCombo}
      tableStack={tableStack}
      dealing={dealing}
      dealKey={dealKey}
      onIntroDone={handleIntroDone}
      matchPhase={matchPhase}
      countdownLeft={countdownLeft}
      instantReveal={instantReveal}
      lobby={lobby}
      waitReason={waitReason}
      seated={seated}
      botControls={showBotControls ? botControls : null}
      onPlayCards={handlePlayCards}
      onPass={handlePass}
      onResolveJoker={handleResolveJoker}
      onCancelJoker={() => setJokerChoice(null)}
      onQuit={handleQuit}
      onHelp={onHelp}
      onDismissError={() => setErrorMessage(null)}
    />
  );
}
