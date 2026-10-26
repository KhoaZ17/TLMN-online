import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import PlayingCard from './PlayingCard';
import OpponentSeat from './OpponentSeat';
import JokerChoiceModal from './JokerChoiceModal';
import FloatingDelta from './FloatingDelta';
import TurnTimer from './TurnTimer';
import HandFan from './HandFan';
import DeckPile from './DeckPile';
import ComboRow from './ComboRow';
import HelpButton from './HelpButton';
import Avatar from './Avatar';
import AnimatedChip from './AnimatedChip';
import PlayerInfoPopup from './PlayerInfoPopup';
import SpotlightOverlay from './SpotlightOverlay';
import CenterCountdown from './CenterCountdown';
import BotControls from './BotControls';
import WaitingForPlayers from './WaitingForPlayers';
import LobbyOverlay from './LobbyOverlay';
import TurnBanner from './TurnBanner';
import { getSeatPositions, getDisplayCombo, assignComboSlots, avatarLabel } from '../gameFlow';
import { dealSchedule } from '../handFan';
import { flyBackCard, flyBotPlay, measureComboTargets, measureSeat, prefersReducedMotion, wait } from '../flight';
import { analyzeInstantWin, DIM_FLOOR } from '../instantWin';
import { canSuggest, suggestOnSelect, suggestOnUnselect } from '../suggest';
import { runChipFx } from '../chipFx';
import { COUNTDOWN_SECONDS, alignBalances, diffBalances, identitiesOf, isReplacedSeat } from '../matchFlow';
import { displayNameOf, MODES, profileFromSeat } from '../profileStore';

function sameCardSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((c) => setA.has(c));
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const modeLabel = (id) => MODES.find((m) => m.id === id)?.label || '';

/**
 * Màn hình chơi. Bố cục (index.css, lớp tl-*):
 *   header (Ván · tên phòng · nút ? và Thoát bàn ở góc trên-phải)
 *   bàn  = lưới 3x2: ghế trên (giữa) · ghế trái/phải (2 bên) · vùng bài giữa bàn
 *   tay bài = avatar (trái) · quạt bài (giữa) · nút Bỏ lượt/Đánh bài (phải)
 *
 * GÓC NHÌN TƯƠNG ĐỐI: `mySeat` là ghế của người đang cầm máy — luôn nằm ở DƯỚI CÙNG; các ghế còn
 * lại tự xoay vào phải / trên / trái theo vòng lượt (gameFlow.getSeatPositions).
 *
 * Mở màn ván mới (dealing=true, dealKey tăng): chia bài từ cọc giữa bàn -> lật ngửa cùng lúc ->
 * chờ ngắn -> xếp bài kiểu người. Xong gọi onIntroDone. Ref imperative (flyHandToTable /
 * flyBotToTable / recallHand) cho GameSession điều khiển hiệu ứng bài bay liền mạch.
 *
 * Kết ván (matchPhase): 'result' (giữ kết quả, lật bài / chiếu đèn tới trắng) -> 'countdown'
 * (bàn đã dọn sạch, đếm ngược giữa bàn) -> ván mới. KHÔNG còn nút "Ván mới / Thoát bàn" ở góc dưới.
 *
 * QUY TẮC THOÁT BÀN: khi ván đang diễn ra (is_active && !is_done) nút "Thoát bàn" bị KHOÁ — rời đi
 * (đóng tab / mất mạng) thì GameSession gọi /api/quit và Bot đánh thay, ghế giữ nguyên avatar + tên
 * với nhãn "Bot đang đánh thay". Chỉ thoát tự do khi ván chưa bắt đầu hoặc đã kết thúc.
 */
const GameScreen = forwardRef(function GameScreen(
  {
    gameState,
    mySeat = 0,
    myName = 'Bạn',
    myProfile = null,
    profiles = {},
    roomId = null,
    matchNumber = null,
    helpOpen = false,
    offline = false,
    jokerChoice,
    errorMessage,
    isSubmitting,
    thinkingBotId,
    flyingCombo,
    tableStack,
    dealing = false,
    dealKey = 0,
    onIntroDone,
    matchPhase = 'play',
    countdownLeft = COUNTDOWN_SECONDS,
    instantReveal = false,
    lobby = null,
    waitReason = null,
    seated = 0,
    botControls = null,
    onPlayCards,
    onPass,
    onResolveJoker,
    onCancelJoker,
    onQuit,
    onHelp,
    onDismissError,
    onInfoOpenChange,
  },
  ref
) {
  const [selectedCards, setSelectedCards] = useState([]);
  const [autoCards, setAutoCards] = useState([]); // lá do HỆ THỐNG tự chọn (gợi ý)
  const [suggestOff, setSuggestOff] = useState(false); // tắt gợi ý trong phần còn lại của lượt này
  const [phase, setPhase] = useState('idle'); // idle | dealing | flipping | waiting | sorting
  const [pile, setPile] = useState({ key: 0, left: 1 });
  const [dealt, setDealt] = useState({ key: 0, counts: {} });
  const [deckGoneKey, setDeckGoneKey] = useState(0);
  const [deltas, setDeltas] = useState(null);
  const [infoSeat, setInfoSeat] = useState(null);
  const [hint, setHint] = useState(null);
  const hintTimer = useRef(0);
  const handApi = useRef(null);
  const deckRef = useRef(null);
  const layerRef = useRef(null);
  const screenRef = useRef(null);
  const prevShown = useRef(null);
  const deltaTimer = useRef(0);
  const fxRef = useRef(null);
  const gameStateRef = useRef(gameState);
  const dealingRef = useRef(dealing);
  const onIntroDoneRef = useRef(onIntroDone);
  const mySeatRef = useRef(mySeat);
  gameStateRef.current = gameState;
  dealingRef.current = dealing;
  onIntroDoneRef.current = onIntroDone;
  mySeatRef.current = mySeat;

  const gs = gameState;
  const players = gs?.players_status || {};
  const ids = Object.keys(players)
    .map(Number)
    .sort((a, b) => a - b);
  const isDone = Boolean(gs?.is_done);
  const info = gs?.instant_win_info;
  const instantMatch = Boolean(info?.has_instant_win);
  const clearedTable = matchPhase === 'countdown' || matchPhase === 'waiting';

  // Số dư ĐANG HIỂN THỊ: ván mở màn bằng "tới trắng" thì giữ số dư TRƯỚC ván cho tới khi lật bài,
  // để hiệu ứng chip bay đúng lúc người xem đã thấy ai tới trắng.
  const shown = {};
  ids.forEach((id) => {
    const b = Number(players[id].balance) || 0;
    shown[id] = isDone && instantMatch && !instantReveal ? b - (Number(info.net_changes?.[id]) || 0) : b;
  });
  // Giữa hai ván Backend dồn bàn lại và đánh số lại ghế -> số dư phải so theo NGƯỜI (tên tài khoản), không theo số ghế.
  const who = identitiesOf(players);
  const shownKey = ids.map((id) => `${id}:${who[id]}:${shown[id]}`).join('|');

  const iw = useMemo(
    () => (instantReveal && isDone ? analyzeInstantWin(info, ids) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instantReveal, isDone, info, ids.join(',')]
  );
  // Đèn sân khấu + độ mờ của từng ghế CHỈ tồn tại trong lúc chiếu kết quả (matchPhase 'result'). Sang đếm ngược / chờ ván
  // mới là GỠ HẲN, không "tắt dần": lớp đèn bị gỡ khỏi DOM, ghế và tay bài không còn style nào (không filter, không
  // opacity, không transition) nên không thể sót lại bất kỳ vệt tối nào trong lúc đếm ngược, trên mọi trình duyệt.
  const spotlightOn = Boolean(iw) && matchPhase === 'result';

  // Ván mới thật sự bắt đầu -> xoá lựa chọn, bật lại gợi ý, đóng popup thông tin.
  useEffect(() => {
    if (!dealKey) return;
    setSelectedCards([]);
    setAutoCards([]);
    setSuggestOff(false);
    setInfoSeat(null);
  }, [dealKey]);

  // ====== MỖI LẦN SỐ DƯ ĐỔI: số chạy xanh/đỏ, "+x" bay lên, chip bay từ người mất sang người được ======
  useEffect(() => {
    const prev = prevShown.current;
    prevShown.current = { shown, who };
    if (!prev || ids.length === 0) return;
    const d = diffBalances(alignBalances(prev.shown, prev.who, who), shown);
    if (Object.keys(d).length === 0) return;
    setDeltas(d);
    clearTimeout(deltaTimer.current);
    deltaTimer.current = setTimeout(() => setDeltas(null), 2300);
    fxRef.current?.cancel?.();
    fxRef.current = runChipFx(layerRef.current, d, { cost: gs?.config?.cost, paymentMode: gs?.config?.payment_mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);
  useEffect(() => () => clearTimeout(deltaTimer.current), []);

  // ====== CHUỖI MỞ MÀN VÁN MỚI: chia -> lật -> chờ ngắn -> xếp ======
  useEffect(() => {
    if (!dealKey || !dealingRef.current) return undefined;
    const g = gameStateRef.current;
    if (!g || (!g.is_active && !g.is_done)) return undefined; // tới trắng: ván xong ngay lúc chia
    const hand = handApi.current;
    let cancelled = false;
    let timer = null;
    const flights = [];

    const finish = () => {
      if (cancelled) return;
      setPhase('idle');
      onIntroDoneRef.current?.();
    };
    const skip = () => {
      hand?.finishInstant();
      setDeckGoneKey(dealKey);
      finish();
    };

    const run = async () => {
      const me = mySeatRef.current;
      const seatIds = Object.entries(g.players_status || {})
        .filter(([, p]) => p.type !== 'empty' && !p.is_left)
        .map(([id]) => Number(id))
        .sort((a, b) => a - b);
      const players = seatIds.length || 2;
      const others = seatIds.filter((id) => id !== me);
      const perPlayer = g.players_status?.[me]?.cards_left || (g.my_hand || []).length || 13;
      if (!hand || prefersReducedMotion()) {
        skip();
        return;
      }
      await nextFrame(); // chắc chắn cọc bài + quạt đã được layout
      if (cancelled) return;
      const deck = deckRef.current?.getCenter();
      const layer = layerRef.current;
      if (!deck || !layer) {
        skip();
        return;
      }
      const schedule = dealSchedule({ players, perPlayer });
      const deckH = deckRef.current.getCardHeight();
      const handH = hand.getCardSize().h;
      setPhase('dealing');

      // Các ghế khác nhận bài: lá úp bay từ cọc tới ghế, theo đúng lịch chia vòng tròn.
      const t0 = performance.now();
      others.forEach((id) => {
        const seat = measureSeat(id);
        if (!seat) return;
        const slot = seatIds.indexOf(id);
        for (let k = 0; k < perPlayer; k++) {
          flights.push(
            flyBackCard(layer, {
              from: deck,
              to: seat,
              w: seat.w,
              h: seat.h,
              startScale: deckH / Math.max(1, seat.h),
              delay: (k * players + slot) * schedule.stagger,
              duration: schedule.flightMs,
            })
          );
        }
      });
      // Cọc mỏng dần + badge số lá của các ghế đếm tăng dần theo từng lá chạm ghế.
      const tick = () => {
        const el = performance.now() - t0;
        const launched = Math.min(schedule.total, Math.max(0, Math.floor(el / schedule.stagger) + 1));
        const counts = {};
        others.forEach((id) => {
          const slot = seatIds.indexOf(id);
          const first = slot * schedule.stagger + schedule.flightMs;
          counts[id] = el < first ? 0 : Math.min(perPlayer, Math.floor((el - first) / (players * schedule.stagger)) + 1);
        });
        setPile({ key: dealKey, left: 1 - launched / schedule.total });
        setDealt({ key: dealKey, counts });
      };
      timer = setInterval(tick, 40);
      tick();

      // Bài của Bạn: bay về ĐÚNG vị trí + góc xòe (vẫn úp).
      const ok = await hand.deal({
        deckCenter: deck,
        deckScale: deckH / Math.max(1, handH),
        schedule,
        players,
        seat: Math.max(0, seatIds.indexOf(me)),
      });
      if (cancelled || !ok) return;
      const rest = schedule.duration - (performance.now() - t0);
      if (rest > 0) await wait(rest);
      if (cancelled) return;
      clearInterval(timer);
      timer = null;
      setPile({ key: dealKey, left: 0 });
      setDealt({ key: dealKey, counts: Object.fromEntries(others.map((id) => [id, perPlayer])) });
      setDeckGoneKey(dealKey);

      setPhase('flipping');
      if (!(await hand.flipAll()) || cancelled) return; // bước 1: lật ngửa tất cả cùng lúc
      setPhase('waiting');
      await wait(420); // bước 2: nhìn bài một nhịp ngắn
      if (cancelled) return;
      setPhase('sorting');
      if (!(await hand.sortAnimated()) || cancelled) return; // bước 3: xếp theo thứ tự Backend
      finish();
    };
    run();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      flights.forEach((a) => a.cancel());
      hand?.abort();
    };
  }, [dealKey]);

  // ====== API cho GameSession: bài bay liền mạch khi đánh ======
  useImperativeHandle(
    ref,
    () => ({
      // Bạn đánh: (1) Joker đang chọn LẬT NỬA VÒNG sang mặt úp rồi lật ra lá thật nó thay thế,
      // (2) các lá đã chọn bay từ CHỖ ĐANG NẰM trên tay tới đúng vị trí cụm bài (đã dựng ẩn) giữa bàn.
      async flyHandToTable({ entryKey, cards, combo, rot = 0 }) {
        const hand = handApi.current;
        const targets = measureComboTargets(entryKey);
        if (!hand || targets.length === 0) return false;
        const size = hand.getCardSize();
        const slotOf = assignComboSlots(cards, combo);
        const faces = {};
        const list = cards.map((card) => {
          const j = Math.min(slotOf.get(card) ?? 0, targets.length - 1);
          if (combo[j] && combo[j] !== card) faces[card] = combo[j]; // Joker biến hình: lá thật
          return { x: targets[j].x, y: targets[j].y, rot, scale: targets[j].h / size.h };
        });
        if (Object.keys(faces).length > 0 && !prefersReducedMotion()) {
          if (!(await hand.transformJokers({ map: faces }))) return false;
        }
        return hand.flyOut({
          cards,
          targets: list,
          faces: Object.keys(faces).length > 0 ? faces : undefined,
        });
      },
      // Ghế khác đánh (Bot hoặc người thật): lá úp bay từ ghế, vừa bay vừa lật, tới đúng vị trí cụm bài.
      flyBotToTable({ botId, entryKey, combo, rot = 0 }) {
        const targets = measureComboTargets(entryKey);
        const seat = measureSeat(botId);
        if (!layerRef.current || !seat || targets.length === 0) {
          return { done: Promise.resolve(), cleanup: () => undefined };
        }
        const { w, h } = targets[0];
        return flyBotPlay(layerRef.current, {
          from: { x: seat.x, y: seat.y },
          cards: combo,
          targets,
          w,
          h,
          startScale: Math.min(1, seat.h / h),
          rot,
          duration: 380,
        });
      },
      recallHand() {
        handApi.current?.recall();
      },
    }),
    []
  );

  const myHand = !gs || clearedTable ? [] : isDone ? gs.all_hands?.[mySeat] ?? [] : gs.my_hand ?? [];
  const effectiveSelected = selectedCards.filter((c) => myHand.includes(c));
  const legalActions = gs?.legal_actions || [];
  const isMyTurn = Boolean(
    gs && gs.is_active && !isDone && matchPhase === 'play' && gs.current_turn === mySeat && !isSubmitting && !dealing
  );
  // "Lượt chính thức" = tới lượt mình VÀ thật sự có nước đi. Lượt giả (đã bỏ lượt, chờ 3s tự qua)
  // thì legal_actions rỗng nên cả 2 nút ẩn.
  const hasRealTurn = isMyTurn && legalActions.length > 0;
  const tableLength = getDisplayCombo(gs?.table).length;

  // Lượt MỚI tới Bạn: bật lại gợi ý (việc tắt gợi ý chỉ có hiệu lực trong đúng lượt đó).
  useEffect(() => {
    if (hasRealTurn) {
      setSuggestOff(false);
      setAutoCards([]);
    }
  }, [hasRealTurn]);

  // Popup thông tin: nhấp VÙNG TRỐNG bất kỳ -> đóng (avatar người thật khác tự xử lý chuyển đổi);
  // thông báo trạng thái mở/đóng để GameSession biết hiện banner "đến lượt".
  useEffect(() => {
    onInfoOpenChange?.(infoSeat != null);
  }, [infoSeat, onInfoOpenChange]);
  useEffect(() => {
    if (infoSeat == null) return undefined;
    const onDown = (e) => {
      if (e.target?.closest?.('[data-avatar-human="true"]')) return;
      setInfoSeat(null);
    };
    const onKey = (e) => e.key === 'Escape' && setInfoSeat(null);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [infoSeat]);
  useEffect(() => () => onInfoOpenChange?.(false), [onInfoOpenChange]);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  // Ván đang diễn ra -> KHOÁ nút thoát (mất kết nối thì mở khoá để không bị kẹt).
  const quitLocked = Boolean(gs?.is_active && !isDone) && !offline;
  const humanCount = ids.filter((id) => players[id].type === 'human').length;

  const showHint = (text) => {
    setHint(text);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 3200);
  };

  const handleQuitClick = () => {
    if (quitLocked) {
      showHint('🔒 Ván đang diễn ra nên chưa thể thoát bàn. Nếu bạn mất kết nối, Bot sẽ đánh thay và giữ chỗ cho bạn.');
      return;
    }
    let message = 'Thoát bàn chơi?';
    if (!gs) {
      message = lobby?.isHost
        ? 'Huỷ phòng này? Những người đã vào phòng sẽ bị đưa ra ngoài.'
        : 'Rời phòng chờ này? Chỗ của bạn sẽ được trả lại cho người khác.';
    } else if (humanCount > 1) {
      message =
        'Thoát bàn bây giờ: bạn rời hẳn bàn này, chỗ của bạn sẽ để trống (không có Bot thay). Ván sau vẫn tự bắt đầu cho những người còn lại nếu còn từ 2 người. Bạn vẫn muốn thoát?';
    } else {
      message = 'Thoát bàn chơi? Bạn là người thật cuối cùng ở bàn nên phòng sẽ đóng.';
    }
    if (window.confirm(message)) onQuit();
  };

  const renderHeader = () => (
    <header className="tl-header">
      <div className="tl-header__brand">
        {gs && (
          /* Backend tăng num_round NGAY khi ván kết thúc nên lúc is_done số này đã là ván KẾ TIẾP —
             trừ 1 để header vẫn hiện đúng số ván vừa chơi. */
          <span className="tl-header__round" data-testid="round-label">
            Ván #{matchNumber ?? (isDone ? Math.max(1, gs.round - 1) : gs.round)}
          </span>
        )}
        <h1 className="tl-header__title">Tiến Lên Miền Nam</h1>
        {roomId && (
          <span className="tl-header__room" data-testid="room-id">
            Phòng {roomId}
          </span>
        )}
        {gs?.config && (
          <span className="tl-header__meta">
            {modeLabel(gs.config.payment_mode)}
            {gs.config.joker_mode ? ' · Joker' : ''}
          </span>
        )}
      </div>
      {/* Góc TRÊN-PHẢI: nút ? nằm BÊN TRÁI nút Thoát bàn. */}
      <div className="tl-header__right">
        <HelpButton onClick={onHelp} />
        <button
          type="button"
          onClick={handleQuitClick}
          className={`tl-btn tl-btn--ghost ${quitLocked ? 'tl-btn--locked' : ''}`}
          aria-disabled={quitLocked}
          title={quitLocked ? 'Ván đang diễn ra — không thể thoát bàn' : 'Thoát bàn'}
          data-testid="quit"
          data-locked={quitLocked ? 'true' : 'false'}
        >
          {quitLocked && (
            <span className="tl-btn__lock" aria-hidden="true">
              🔒
            </span>
          )}
          Thoát bàn
        </button>
      </div>
    </header>
  );

  if (!gs) {
    return (
      <div className="tl-screen" ref={screenRef} data-phase="idle">
        <div id="rotate-overlay">
          <span className="text-5xl">🔄</span>
          <p className="text-lg font-semibold text-paper-100">Xoay ngang màn hình để chơi</p>
        </div>
        {renderHeader()}
        {lobby ? (
          <LobbyOverlay {...lobby} onLeave={onQuit} />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center text-paper-200/70">Đang tải bàn chơi…</div>
        )}
        {errorMessage && <div className="tl-toast">{errorMessage}</div>}
      </div>
    );
  }

  const canPass = legalActions.some((a) => a.length === 0);
  const isSelectionLegal = effectiveSelected.length > 0 && legalActions.some((a) => sameCardSet(a, effectiveSelected));
  const canPlay = hasRealTurn && isSelectionLegal;

  // Gợi ý lá nhỏ nhất ván đầu: người bắt buộc đi trước (bàn trống, round 1) có mọi nước đi hợp lệ
  // đều chứa lá đó -> giao của các legal_actions chính là lá cần đánh.
  let glowCards = [];
  if (hasRealTurn && gs.round === 1 && tableLength === 0 && !canPass) {
    const moves = legalActions.filter((a) => a.length > 0);
    if (moves.length > 0) glowCards = moves[0].filter((c) => moves.every((a) => a.includes(c)));
  }

  // ---- Chọn / bỏ chọn lá (kèm GỢI Ý THÔNG MINH khi tới lượt và bàn đang có bài) ----
  const toggleCard = (card) => {
    const cur = effectiveSelected;
    if (cur.includes(card)) {
      const r = suggestOnUnselect({ card, selected: cur, auto: autoCards.filter((c) => cur.includes(c)) });
      setSelectedCards(r.selected);
      setAutoCards(r.auto);
      if (r.disable) setSuggestOff(true); // bỏ lá tự gợi ý => tắt gợi ý cho hết lượt này
      return;
    }
    if (canSuggest({ isMyTurn: hasRealTurn, tableLength, legalActions, disabled: suggestOff })) {
      const r = suggestOnSelect({ clicked: card, selected: cur, legalActions, tableLength });
      setSelectedCards(r.selected);
      setAutoCards(r.auto);
      return;
    }
    setSelectedCards([...cur, card]);
  };

  const numPlayers = ids.length;
  const seatPositions = getSeatPositions(numPlayers, mySeat, ids);
  const activeAreas = new Set(Object.values(seatPositions));
  const stack = tableStack || [];
  const deckVisible = dealing && deckGoneKey !== dealKey;
  const pileLeft = pile.key === dealKey ? pile.left : 1;
  const dealtFor = (id) => (dealt.key === dealKey ? dealt.counts[id] ?? 0 : 0);
  const me = players[mySeat];

  const profileOf = (id) => {
    const p = players[id];
    if (!p) return null;
    const live = p.type === 'human' || isReplacedSeat(p);
    return live ? profiles[id] || (id === mySeat ? myProfile : null) || profileFromSeat(p) : null;
  };
  const nameOf = (id) => {
    const p = players[id];
    if (!p) return '';
    if (id === mySeat) return myName;
    return p.type === 'human' || isReplacedSeat(p) ? displayNameOf(profileOf(id), p.name) : p.name;
  };

  // Đếm ngược lượt: hiện ở avatar người đang tới lượt. Ẩn khi ván xong, khi bài đang bay/chia, hoặc
  // ngay sau khi Bạn vừa bấm đánh (đang chờ Server xử lý).
  const showTimer =
    gs.is_active && !isDone && !flyingCombo && !dealing && !(gs.current_turn === mySeat && isSubmitting);
  const timerInfo = showTimer
    ? { baseLeft: gs.time_left, total: gs.time_limit ?? 30, receivedAt: gs.__receivedAt ?? null }
    : null;
  const timerFor = (playerId) => (timerInfo && gs.current_turn === playerId ? timerInfo : null);

  const seatIdFor = (position) => ids.find((id) => id !== mySeat && seatPositions[id] === position);

  // Bài THẬT lật ngửa cạnh ghế: ván thường -> người thua còn bài; "tới trắng" -> bài của MỌI người.
  const revealHandOf = (id) => {
    if (id == null || !isDone || clearedTable) return null;
    const hand = gs.all_hands?.[id];
    if (!hand || hand.length === 0) return null;
    if (instantMatch) return instantReveal && id !== mySeat ? hand : null;
    return !players[id].is_finished && id !== mySeat ? hand : null;
  };

  // Người không tới trắng chỉ MỜ NHẸ (opacity, không dùng filter: trình duyệt điện thoại hay kẹt lại filter sau khi
  // hết hiệu ứng). Có transition khi MỜ DẦN vào; lúc kết thúc style bị bỏ hẳn nên trở về 100% ngay.
  const dimOf = (id) => (spotlightOn ? iw.brightness[id] ?? DIM_FLOOR : 1);
  const dimStyle = (id) => (spotlightOn && dimOf(id) < 1 ? { opacity: dimOf(id), transition: 'opacity 0.5s ease' } : undefined);

  const renderSeat = (position) => {
    const id = seatIdFor(position);
    if (id == null) return null;
    const p = players[id];
    const human = p.type === 'human';
    return (
      <OpponentSeat
        seatId={id}
        name={p.name}
        displayName={nameOf(id)}
        human={human}
        profile={profileOf(id)}
        cardsLeft={dealing ? dealtFor(id) : p.cards_left}
        balance={shown[id]}
        balanceDelta={deltas?.[id]}
        isCurrentTurn={gs.is_active && !dealing && !isDone && gs.current_turn === id}
        isPassed={p.is_passed}
        isFinished={p.is_finished}
        isThinking={thinkingBotId === id}
        timer={timerFor(id)}
        hideCards={clearedTable || Boolean(revealHandOf(id))}
        isEmpty={p.type === 'empty' || Boolean(p.is_left)}
        replaced={isReplacedSeat(p)}
        infoOpen={infoSeat === id}
        onAvatarClick={(seat) => setInfoSeat((cur) => (cur === seat ? null : seat))}
      />
    );
  };

  const renderReveal = (position) => {
    const hand = revealHandOf(seatIdFor(position));
    if (!hand) return null;
    const vertical = position !== 'top';
    return (
      <div className={`tl-reveal ${vertical ? 'tl-reveal--col' : 'tl-reveal--row'}`}>
        {hand.map((c, i) => (
          <PlayingCard key={`${c}-${i}`} card={c} size={vertical ? 'revealSide' : 'reveal'} flipIn delay={i * 26} />
        ))}
      </div>
    );
  };

  const renderArea = (position) =>
    activeAreas.has(position) && (
      <div className={`tl-table__${position}`}>
        <div className={`tl-seatgroup tl-seatgroup--${position}`} style={dimStyle(seatIdFor(position))}>
          {renderSeat(position)}
          {renderReveal(position)}
        </div>
      </div>
    );

  const infoPlayer = infoSeat != null ? players[infoSeat] : null;
  const showInfo = infoPlayer && infoPlayer.type === 'human' && infoSeat !== mySeat;

  return (
    <div className="tl-screen" ref={screenRef} data-phase={dealing ? phase : 'idle'} data-match-phase={matchPhase}>
      {/* Chỉ hiện khi điện thoại đang ở chế độ dọc — xem index.css */}
      <div id="rotate-overlay">
        <span className="text-5xl">🔄</span>
        <p className="text-lg font-semibold text-paper-100">Xoay ngang màn hình để chơi</p>
        <p className="text-sm text-paper-200/70">Tiến Lên Miền Nam hiển thị đẹp nhất ở chế độ ngang.</p>
      </div>

      {renderHeader()}

      {errorMessage && (
        <div className="tl-toast" role="alert">
          <span>{errorMessage}</span>
          <button type="button" onClick={onDismissError} className="text-paper-200/60 hover:text-paper-100" aria-label="Đóng thông báo lỗi">
            ✕
          </button>
        </div>
      )}

      <div className="tl-table">
        {renderArea('top')}
        {renderArea('left')}
        {renderArea('right')}

        {/* Vùng bài giữa bàn: TÂM cả cụm neo ở giữa vùng này; mỗi combo chỉ lệch/xoay ngẫu nhiên
            nhỏ độc lập quanh tâm cố định. */}
        <div className="tl-table__center">
          <div className="tl-cluster">
            {deckVisible && <DeckPile ref={deckRef} left={pileLeft} />}
            {stack.map((entry, i) => (
              <ComboRow key={entry.key} entry={entry} zIndex={i + 1} />
            ))}
            {stack.length === 0 && !deckVisible && !clearedTable && !(isDone && matchPhase === 'result') && (
              <p className="tl-cluster__empty">{gs.is_active ? 'Bàn trống — lượt đánh tự do' : 'Chưa bắt đầu ván đấu'}</p>
            )}
          </div>

          {/* Tới trắng: chữ vàng phát sáng giữa bàn với tên tay bài mạnh nhất. */}
          {spotlightOn && (
            <div className="tl-iw-text" role="status" data-testid="iw-text">
              <span className="tl-iw-text__eyebrow">Tới trắng!</span>
              <span className="tl-iw-text__name">{iw.best.handName}</span>
              <span className="tl-iw-text__who">
                {nameOf(iw.best.id)} · ×{iw.best.multiplier}
              </span>
            </div>
          )}
          {matchPhase === 'countdown' && (
            <>
              <CenterCountdown left={countdownLeft} total={COUNTDOWN_SECONDS} />
              {botControls && <BotControls {...botControls} variant="edges" />}
            </>
          )}
          {matchPhase === 'waiting' && waitReason === 'players' && (
            <WaitingForPlayers roomId={roomId} seated={seated} controls={botControls} />
          )}
          {matchPhase === 'waiting' && waitReason !== 'players' && (
            <div className="tl-result" role="status">
              <span>Đang chờ ván mới…</span>
            </div>
          )}
        </div>
      </div>

      <div className="tl-handzone" style={dimStyle(mySeat)} data-testid="handzone">
        <div className="tl-me" data-me="true">
          <div className="tl-avatar-hit" data-avatar={mySeat}>
            <TurnTimer timer={timerFor(mySeat)} underlay={Boolean(myProfile)}>
              <Avatar profile={myProfile} letter={avatarLabel(myName)} />
            </TurnTimer>
          </div>
          <FloatingDelta amount={deltas?.[mySeat]} />
          <p className={`tl-seat__name ${gs.current_turn === mySeat && gs.is_active && !isDone ? 'tl-seat__name--turn' : ''}`}>
            {myName}
          </p>
          <p className="tl-seat__chips">
            <AnimatedChip value={shown[mySeat] ?? me?.balance} suffix=" chip" />
          </p>
        </div>

        <HandFan
          ref={handApi}
          hand={myHand}
          introKey={dealKey}
          introActive={dealing}
          selected={effectiveSelected}
          glowCards={glowCards}
          interactive={!dealing && !isDone}
          onToggle={toggleCard}
        />

        {/* Chỉ còn nút của LƯỢT CHƠI. Hết ván không còn nút "Ván mới" / "Thoát bàn" ở góc dưới phải. */}
        <div className="tl-actions">
          {!isDone && (
            <>
              {/* Bỏ lượt: không phải lượt mình -> ẩn hẳn; tới lượt mình -> luôn hiện (kể cả lượt đánh
                  mới), chỉ bấm được khi Backend cho phép bỏ lượt. */}
              <button
                type="button"
                onClick={onPass}
                disabled={!canPass}
                className={`tl-btn tl-btn--ghost ${hasRealTurn ? '' : 'tl-btn--hidden'}`}
                data-testid="pass"
              >
                Bỏ lượt
              </button>
              {/* Đánh bài: chỉ hiện khi đúng lượt chính thức; chỉ SÁNG khi các lá đang chọn tạo thành
                  combo nằm trong legal_actions, còn lại mờ + khoá. */}
              <button
                type="button"
                onClick={() => onPlayCards(effectiveSelected)}
                disabled={!canPlay}
                className={`tl-btn tl-btn--primary ${hasRealTurn ? '' : 'tl-btn--hidden'} ${canPlay ? 'tl-btn--ready' : ''}`}
                data-testid="play"
              >
                Đánh bài
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tới trắng: chùm đèn sân khấu rọi vào người mạnh nhất. Chỉ có mặt trong lúc chiếu kết quả; sang đếm ngược là gỡ hẳn. */}
      {spotlightOn && <SpotlightOverlay hostRef={screenRef} bestId={iw.best.id} mySeat={mySeat} />}

      {/* Popup thông tin đối thủ (chỉ người thật; chỉ đọc, không nút). */}
      {showInfo && (
        <PlayerInfoPopup
          key={infoSeat}
          seatId={infoSeat}
          name={infoPlayer.username || infoPlayer.name}
          displayName={nameOf(infoSeat)}
          profile={profileOf(infoSeat)}
          balance={shown[infoSeat]}
        />
      )}

      {/* Lớp phủ cho bài bay (chia cho đối thủ, đối thủ đánh ra bàn) và chip bay */}
      <div ref={layerRef} className="tl-flight-layer" aria-hidden="true" />

      {jokerChoice && <JokerChoiceModal options={jokerChoice.options} onChoose={onResolveJoker} onCancel={onCancelJoker} />}
      {lobby && <LobbyOverlay {...lobby} onLeave={onQuit} />}

      {offline && (
        <div className="tl-offline" role="alert" data-testid="offline-banner">
          <span className="tl-offline__dot" aria-hidden="true" />
          Mất kết nối tới máy chủ — đang thử kết nối lại…
        </div>
      )}
      {hint && (
        <div className="tl-toast tl-toast--hint" role="status" data-testid="quit-hint">
          <span>{hint}</span>
        </div>
      )}

      {/* Đang đọc hướng dẫn / xem thông tin đối thủ mà tới LƯỢT THẬT của mình -> banner nổi bật. */}
      <TurnBanner show={hasRealTurn && (helpOpen || infoSeat != null)} />
    </div>
  );
});

export default GameScreen;
