import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from '../api';
import GameScreen from './GameScreen';
import { createStackEntry, getDisplayCombo, sameComboArray, wait } from '../gameFlow';
import { COUNTDOWN_SECONDS, detectNewMatch, newRemoteCombo, resultHoldMs } from '../matchFlow';
import { isSpectatorState, joinedAsSpectator, promotedSeat, spectatorGone } from '../lobby';
import { profileFromSeat } from '../profileStore';

const POLL_MS = 1000;
const OFFLINE_AFTER = 3;
const ROOM_CLOSED_RE = /Chưa có ván đấu|Chưa setup/i;

/**
 * KHÁN GIẢ: nhập mã vào một phòng ĐANG ĐẤU mà bàn chưa đủ chỗ (Backend: POST /api/join trả `spectator: true`).
 * Chỉ xem: không có bài trên tay, không có nút Đánh bài / Bỏ lượt; mọi ghế đều là "người khác" (GameScreen `spectator`).
 *  - Hỏi state mỗi giây bằng GET /api/state?spectate=1&username=… (Backend không bao giờ gửi bài của ai cho khán giả).
 *  - Bài người chơi đánh ra bay từ ghế ra bàn như bình thường; hết ván thì chiếu kết quả rồi đếm ngược.
 *  - Hết ván + sau RESULT_GRACE_SECONDS Backend cho khán giả ngồi vào bàn (như người vừa nhập mã giữa hai ván): state có `my_player_id`
 *    -> báo App chuyển sang GameSession (role 'resume') cùng số ghế mới. Số người trong bàn không cố định (tối đa 4).
 *  - Thoát bàn: luôn bấm được (khán giả không giữ chỗ của ai); báo POST /api/quit để Backend bỏ khỏi danh sách chờ.
 */
export default function SpectatorSession({ auth, roomId, helpOpen, onHelp, onExit, onPromote }) {
  const [gameState, setGameStateRaw] = useState(null);
  const [tableStack, setTableStack] = useState([]);
  const [matchPhase, setMatchPhaseState] = useState('play'); // play | result | countdown | waiting
  const [countdownLeft, setCountdownLeft] = useState(COUNTDOWN_SECONDS);
  const [instantReveal, setInstantReveal] = useState(false);
  const [flyingCombo, setFlyingCombo] = useState(false);
  const [dealKey, setDealKey] = useState(0);
  const [matchNumber, setMatchNumber] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [offline, setOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const uiRef = useRef(null);
  const aliveRef = useRef(true);
  const exitedRef = useRef(false);
  const quitSentRef = useRef(false);
  const pollBusy = useRef(false);
  const failRef = useRef(0);
  const rejoinRef = useRef(0);
  const gameStateRef = useRef(null);
  const phaseRef = useRef('play');
  const stackRef = useRef([]);
  const tokenRef = useRef(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onPromoteRef = useRef(onPromote);
  onPromoteRef.current = onPromote;
  stackRef.current = tableStack;

  const setPhase = useCallback((p) => {
    phaseRef.current = p;
    setMatchPhaseState(p);
  }, []);

  const leave = useCallback((opts = {}) => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    if (tokenRef.current) tokenRef.current.cancelled = true;
    onExitRef.current({ balance: null, ...opts });
  }, []);

  // ---- đồng bộ state mới ----
  const commit = useCallback(
    (next) => {
      const prev = gameStateRef.current;
      const newMatch = !prev || detectNewMatch(prev, next);
      if (newMatch) {
        setDealKey((k) => k + 1);
        if (tokenRef.current) tokenRef.current.cancelled = true;
        setInstantReveal(false);
        setCountdownLeft(COUNTDOWN_SECONDS);
        setPhase(next.is_done ? 'countdown' : 'play');
        if (next.match_number != null) setMatchNumber(Number(next.match_number));
        const snap = {};
        Object.entries(next.players_status || {}).forEach(([id, seat]) => {
          const p = profileFromSeat(seat);
          if (p) snap[id] = p;
        });
        setProfiles(snap);
        const combo = next.is_done ? [] : getDisplayCombo(next.table);
        setTableStack(combo.length > 0 ? [createStackEntry(combo)] : []);
      } else if (phaseRef.current === 'play' || phaseRef.current === 'result') {
        const combo = getDisplayCombo(next.table);
        if (combo.length === 0) {
          setTableStack([]);
        } else {
          setTableStack((stack) => {
            const top = stack[stack.length - 1];
            if (top && sameComboArray(top.cards, combo)) return top.hidden ? [...stack.slice(0, -1), { ...top, hidden: false }] : stack;
            return [...stack, createStackEntry(combo)];
          });
        }
      }
      gameStateRef.current = next;
      setGameStateRaw(next);
    },
    [setPhase]
  );

  // ---- bài của người chơi bay từ ghế ra bàn ----
  const revealRemote = useCallback(
    async (state, remote) => {
      const entry = createStackEntry(remote.combo, { hidden: true });
      flushSync(() => {
        setFlyingCombo(true);
        setTableStack((stack) => [...stack, entry]);
      });
      const flight = uiRef.current?.flyBotToTable({ botId: remote.owner, entryKey: entry.key, combo: remote.combo, rot: entry.groupRotation });
      await (flight ? flight.done : wait(300));
      if (exitedRef.current || !aliveRef.current) {
        flushSync(() => setFlyingCombo(false));
        flight?.cleanup();
        return;
      }
      state.__receivedAt = Date.now();
      flushSync(() => {
        commit(state);
        setFlyingCombo(false);
      });
      flight?.cleanup();
    },
    [commit]
  );

  // ---- hỏi state ----
  const poll = useCallback(async () => {
    if (pollBusy.current || exitedRef.current) return;
    pollBusy.current = true;
    try {
      const state = await api.getSpectatorState();
      failRef.current = 0;
      setOffline(false);
      if (exitedRef.current || !aliveRef.current) return;
      if (spectatorGone(state)) {
        // Bị dọn khỏi danh sách xem (tab bị treo lâu): thử nhập lại mã MỘT lần trước khi bỏ.
        if (rejoinRef.current < 1) {
          rejoinRef.current += 1;
          const res = await api.joinRoom({ roomId, username: auth.username });
          if (joinedAsSpectator(res)) return;
          if (res?.status === 'success' && res.seat != null) {
            quitSentRef.current = true;
            onPromoteRef.current({ roomId: String(res.room_id || roomId), seat: Number(res.seat), started: true });
            return;
          }
        }
        leave({ notice: 'Bạn không còn ở phòng xem này.' });
        return;
      }
      if (!state || state.status === 'error') {
        if (ROOM_CLOSED_RE.test(state?.message || '')) leave({ notice: 'Phòng đã đóng.' });
        else if (state?.message) setErrorMessage(state.message);
        return;
      }
      rejoinRef.current = 0;
      const seat = promotedSeat(state);
      if (seat != null) {
        // Hết ván, Backend đã cho ngồi vào bàn: vào bàn như người vừa nhập mã giữa hai ván.
        quitSentRef.current = true; // đã là người chơi, đóng tab thì GameSession lo (không còn là khán giả)
        onPromoteRef.current({ roomId: String(state.room_id || roomId), seat, started: true });
        return;
      }
      if (!isSpectatorState(state)) return;
      setErrorMessage((m) => (m && /kết nối/i.test(m) ? null : m));
      const prev = gameStateRef.current;
      const remote =
        prev && (phaseRef.current === 'play' || phaseRef.current === 'result') && !detectNewMatch(prev, state)
          ? newRemoteCombo(state, -1, stackRef.current)
          : null;
      if (remote && uiRef.current) await revealRemote(state, remote);
      else commit(state);
    } catch {
      failRef.current += 1;
      if (failRef.current >= OFFLINE_AFTER) setOffline(true);
    } finally {
      pollBusy.current = false;
    }
  }, [auth.username, commit, leave, revealRemote, roomId]);
  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    aliveRef.current = true;
    api.setSession({ roomId, playerId: null, username: auth.username });
    pollRef.current();
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasState = gameState != null;
  useEffect(() => {
    if (!hasState || flyingCombo) return undefined;
    const id = setInterval(() => pollRef.current(), POLL_MS);
    return () => clearInterval(id);
  }, [hasState, flyingCombo]);

  // Chưa có state đầu tiên thì thử lại mỗi giây (mạng chậm).
  useEffect(() => {
    if (hasState) return undefined;
    const id = setInterval(() => pollRef.current(), POLL_MS);
    return () => clearInterval(id);
  }, [hasState]);

  useEffect(() => {
    const onOnline = () => {
      failRef.current = 0;
      setOffline(false);
      pollRef.current();
    };
    const onOffline = () => setOffline(true);
    const onVisible = () => document.visibilityState === 'visible' && pollRef.current();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Đóng tab / tải lại trang: báo Backend bỏ khỏi danh sách khán giả (best-effort, một lần).
  useEffect(() => {
    const onHide = () => {
      if (quitSentRef.current || exitedRef.current) return;
      quitSentRef.current = true;
      api.quitOnUnload();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // ---- luồng kết ván: kết quả -> dọn bàn + đếm ngược (cho tới khi được ngồi vào bàn / ván mới hiện ra qua poll) ----
  const isDone = Boolean(gameState?.is_done);
  const instantMatch = Boolean(gameState?.instant_win_info?.has_instant_win);
  useEffect(() => {
    if (!isDone) return undefined;
    // Ván đã xong sẵn lúc commit đầu tiên (vào lúc sau cùng của ván) -> thẳng đếm ngược.
    const token = { cancelled: false };
    tokenRef.current = token;
    const alive = () => !token.cancelled && aliveRef.current && !exitedRef.current;
    (async () => {
      if (phaseRef.current !== 'countdown') {
        setPhase('result');
        if (instantMatch) setInstantReveal(true);
        await wait(resultHoldMs(gameStateRef.current));
        if (!alive()) return;
        stackRef.current = [];
        setTableStack([]);
      }
      setPhase('countdown');
      for (let s = COUNTDOWN_SECONDS; s > 0; s -= 1) {
        setCountdownLeft(s);
        await wait(1000);
        if (!alive()) return;
      }
      setCountdownLeft(0);
      setPhase('waiting');
    })();
    return () => {
      token.cancelled = true;
    };
  }, [isDone, dealKey, instantMatch, setPhase]);

  const handleQuit = useCallback(async () => {
    if (quitSentRef.current) {
      leave({});
      return;
    }
    quitSentRef.current = true;
    try {
      await api.quitGame({ playerId: -1 });
    } catch {
      /* rời luôn: Backend sẽ tự dọn khán giả im lặng */
    }
    leave({});
  }, [leave]);

  return (
    <GameScreen
      ref={uiRef}
      gameState={gameState}
      mySeat={-1}
      spectator
      myName={auth.displayName || auth.username}
      myProfile={null}
      profiles={profiles}
      roomId={roomId}
      matchNumber={matchNumber}
      helpOpen={helpOpen}
      offline={offline}
      jokerChoice={null}
      errorMessage={errorMessage}
      isSubmitting={false}
      thinkingBotId={null}
      flyingCombo={flyingCombo}
      tableStack={tableStack}
      dealing={false}
      dealKey={dealKey}
      matchPhase={matchPhase}
      countdownLeft={countdownLeft}
      instantReveal={instantReveal}
      lobby={null}
      waitReason={null}
      seated={Object.values(gameState?.players_status || {}).filter((p) => p.type !== 'empty' && !p.is_left).length}
      botControls={null}
      onPlayCards={() => undefined}
      onPass={() => undefined}
      onResolveJoker={() => undefined}
      onCancelJoker={() => undefined}
      onQuit={handleQuit}
      onHelp={onHelp}
      onDismissError={() => setErrorMessage(null)}
    />
  );
}
