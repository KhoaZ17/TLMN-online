import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import PlayingCard from './PlayingCard';
import OpponentSeat from './OpponentSeat';
import JokerChoiceModal from './JokerChoiceModal';
import FloatingDelta from './FloatingDelta';
import TurnTimer from './TurnTimer';
import HandFan from './HandFan';
import DeckPile from './DeckPile';
import ComboRow from './ComboRow';
import { getSeatPositions, formatChip, getDisplayCombo, assignComboSlots } from '../gameFlow';
import { dealSchedule } from '../handFan';
import { flyBackCard, flyBotPlay, measureComboTargets, measureSeat, prefersReducedMotion, wait } from '../flight';
import { api } from '../api'; // [CLAUDE UPDATE]: Import api để gọi hàm thông báo kết thúc intro

function sameCardSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((c) => setA.has(c));
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Màn hình chơi. Bố cục (index.css, lớp tl-*):
 *   header
 *   bàn  = lưới 3x2: ghế trên (giữa) · ghế trái/phải (2 bên) · vùng bài giữa bàn
 *   tay bài = avatar (trái) · quạt bài (giữa) · nút Bỏ lượt/Đánh bài (phải)
 * Mọi kích thước theo biến CSS (vh + clamp) nên điện thoại ngang (cao 360-450px)
 * tự co nhỏ, không còn toạ độ px cố định.
 *
 * Mở màn ván mới (dealing=true, dealKey tăng): chia bài từ cọc giữa bàn ->
 * lật ngửa cùng lúc -> chờ 1 giây -> xếp bài kiểu người. Xong gọi onIntroDone
 * để App mở khoá Bot/polling. Ref imperative (flyHandToTable / flyBotToTable)
 * cho App điều khiển hiệu ứng bài bay liền mạch khi đánh bài.
 */
const GameScreen = forwardRef(function GameScreen(
  {
    gameState,
    jokerChoice,
    errorMessage,
    isSubmitting,
    thinkingBotId,
    flyingCombo,
    tableStack,
    balanceDeltas,
    dealing = false,
    dealKey = 0,
    onIntroDone,
    onPlayCards,
    onPass,
    onResolveJoker,
    onCancelJoker,
    onStartNewRound,
    onQuit,
    onDismissError,
  },
  ref
) {
  const [selectedCards, setSelectedCards] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | dealing | flipping | waiting | sorting
  const [pile, setPile] = useState({ key: 0, left: 1 });
  const [dealt, setDealt] = useState({ key: 0, counts: {} });
  const [deckGoneKey, setDeckGoneKey] = useState(0);
  const wasActiveRef = useRef(false);
  const handApi = useRef(null);
  const deckRef = useRef(null);
  const layerRef = useRef(null);
  const gameStateRef = useRef(gameState);
  const dealingRef = useRef(dealing);
  const onIntroDoneRef = useRef(onIntroDone);
  gameStateRef.current = gameState;
  dealingRef.current = dealing;
  onIntroDoneRef.current = onIntroDone;

  // CHỈ xoá lựa chọn khi một VÁN MỚI THỰC SỰ bắt đầu — is_active chuyển từ
  // false -> true. Không dựa vào gameState.round (Backend tăng num_round ngay khi
  // có người thắng, trước cả khi bấm "Ván mới") và KHÔNG xoá khi chỉ đổi lượt
  // (để giữ tính năng chọn bài chờ trước khi tới lượt).
  useEffect(() => {
    const isActiveNow = Boolean(gameState?.is_active);
    if (!wasActiveRef.current && isActiveNow) setSelectedCards([]);
    wasActiveRef.current = isActiveNow;
  }, [gameState?.is_active]);

  // ====== CHUỖI MỞ MÀN VÁN MỚI: chia -> lật -> chờ 1s -> xếp ======
  useEffect(() => {
    if (!dealKey || !dealingRef.current) return undefined;
    const gs = gameStateRef.current;
    if (!gs || !gs.is_active) return undefined;
    const apiRef = handApi.current;
    let cancelled = false;
    let timer = null;
    const flights = [];

    const finish = async () => {
      if (cancelled) return;
      // [CLAUDE UPDATE - 2026]: Gửi tín hiệu sang Backend ngay khi animation kết thúc
      // để Backend reset mốc `turn_start_time`, đảm bảo người đi đầu nhận đủ 100% thời gian.
      try {
        await api.introDone();
      } catch (err) {
        // Bỏ qua lỗi kết nối nhỏ nếu có để không làm gián đoạn game trải nghiệm
      }
      setPhase('idle');
      onIntroDoneRef.current?.();
    };
    const skip = () => {
      apiRef?.finishInstant();
      setDeckGoneKey(dealKey);
      finish();
    };

    const run = async () => {
      const ids = Object.keys(gs.players_status || {}).map(Number);
      const players = ids.length || 2;
      const botIds = ids.filter((id) => id !== 0).sort((a, b) => a - b);
      const perPlayer = (gs.my_hand || []).length || gs.players_status?.['0']?.cards_left || 13;
      if (!apiRef || prefersReducedMotion()) {
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
      const handH = apiRef.getCardSize().h;
      setPhase('dealing');

      // Bot nhận bài: lá úp bay từ cọc tới ghế, theo đúng lịch chia vòng tròn.
      const t0 = performance.now();
      botIds.forEach((id) => {
        const seat = measureSeat(id);
        if (!seat) return;
        for (let k = 0; k < perPlayer; k++) {
          flights.push(
            flyBackCard(layer, {
              from: deck,
              to: seat,
              w: seat.w,
              h: seat.h,
              startScale: deckH / Math.max(1, seat.h),
              delay: (k * players + id) * schedule.stagger,
              duration: schedule.flightMs,
            })
          );
        }
      });
      // Cọc mỏng dần + badge số lá của Bot đếm tăng dần theo từng lá chạm ghế.
      const tick = () => {
        const el = performance.now() - t0;
        const launched = Math.min(schedule.total, Math.max(0, Math.floor(el / schedule.stagger) + 1));
        const counts = {};
        botIds.forEach((id) => {
          const first = id * schedule.stagger + schedule.flightMs;
          counts[id] = el < first ? 0 : Math.min(perPlayer, Math.floor((el - first) / (players * schedule.stagger)) + 1);
        });
        setPile({ key: dealKey, left: 1 - launched / schedule.total });
        setDealt({ key: dealKey, counts });
      };
      timer = setInterval(tick, 40);
      tick();

      // Bài của Bạn: bay về ĐÚNG vị trí + góc xòe (vẫn úp).
      const ok = await apiRef.deal({ deckCenter: deck, deckScale: deckH / Math.max(1, handH), schedule, players, seat: 0 });
      if (cancelled || !ok) return;
      const rest = schedule.duration - (performance.now() - t0);
      if (rest > 0) await wait(rest);
      if (cancelled) return;
      clearInterval(timer);
      timer = null;
      setPile({ key: dealKey, left: 0 });
      setDealt({ key: dealKey, counts: Object.fromEntries(botIds.map((id) => [id, perPlayer])) });
      setDeckGoneKey(dealKey);

      setPhase('flipping');
      if (!(await apiRef.flipAll()) || cancelled) return; // bước 1: lật ngửa tất cả cùng lúc
      setPhase('waiting');
      await wait(1000); // bước 2: chờ đúng 1 giây
      if (cancelled) return;
      setPhase('sorting');
      if (!(await apiRef.sortAnimated()) || cancelled) return; // bước 3: xếp theo thứ tự Backend
      finish();
    };
    run();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      flights.forEach((a) => a.cancel());
      apiRef?.abort();
    };
  }, [dealKey]);

  // ====== API cho App: bài bay liền mạch khi đánh ======
  useImperativeHandle(
    ref,
    () => ({
      // Bạn đánh: các lá đã chọn bay từ CHỖ ĐANG NẰM trên tay tới đúng vị trí cụm bài (đã dựng ẩn) giữa bàn.
      async flyHandToTable({ entryKey, cards, combo, rot = 0 }) {
        const api = handApi.current;
        const targets = measureComboTargets(entryKey);
        if (!api || targets.length === 0) return false;
        const size = api.getCardSize();
        const slotOf = assignComboSlots(cards, combo);
        const faces = {};
        const list = cards.map((card) => {
          const j = Math.min(slotOf.get(card) ?? 0, targets.length - 1);
          if (combo[j] && combo[j] !== card) faces[card] = combo[j]; // Joker biến hình: hiện lá thật
          return { x: targets[j].x, y: targets[j].y, rot, scale: targets[j].h / size.h };
        });
        return api.flyOut({ cards, targets: list, faces: Object.keys(faces).length ? faces : null });
      },
      // Bot đánh: lá úp bay từ ghế Bot, vừa bay vừa lật, tới đúng vị trí cụm bài giữa bàn.
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

  const isDone = Boolean(gameState?.is_done);
  // BÀI CỦA BẠN (player_id = 0): chỉ đọc my_hand (đang chơi) hoặc all_hands['0']
  // (ván đã xong vì Backend trả my_hand rỗng). Bài Bot đọc riêng qua đúng khoá id.
  const myHand = isDone ? gameState?.all_hands?.['0'] ?? [] : gameState?.my_hand ?? [];

  if (!gameState) {
    return <div className="flex h-full items-center justify-center text-paper-200/70">Đang tải bàn chơi…</div>;
  }

  const effectiveSelected = selectedCards.filter((c) => myHand.includes(c));
  const legalActions = gameState.legal_actions || [];
  const isMyTurn = gameState.is_active && !isDone && gameState.current_turn === 0 && !isSubmitting && !dealing;
  // "Lượt chính thức" = tới lượt mình VÀ thật sự có nước đi. Lượt giả (đã bỏ lượt,
  // chờ 3s tự qua) thì legal_actions rỗng nên cả 2 nút ẩn.
  const hasRealTurn = isMyTurn && legalActions.length > 0;
  const canPass = legalActions.some((a) => a.length === 0);
  const isSelectionLegal = effectiveSelected.length > 0 && legalActions.some((a) => sameCardSet(a, effectiveSelected));
  const canPlay = hasRealTurn && isSelectionLegal;

  // Gợi ý lá nhỏ nhất ván đầu: người bắt buộc đi trước (bàn trống, round 1) có mọi
  // nước đi hợp lệ đều chứa lá đó -> giao của các legal_actions chính là lá cần đánh.
  let glowCards = [];
  if (hasRealTurn && gameState.round === 1 && getDisplayCombo(gameState.table).length === 0 && !canPass) {
    const moves = legalActions.filter((a) => a.length > 0);
    if (moves.length > 0) glowCards = moves[0].filter((c) => moves.every((a) => a.includes(c)));
  }

  const players = gameState.players_status || {};
  const numPlayers = Object.keys(players).length;
  const opponents = Object.entries(players).filter(([id]) => Number(id) !== 0);
  const seatPositions = getSeatPositions(numPlayers);
  const activeAreas = new Set(Object.values(seatPositions));
  const me = players['0'];
  const stack = tableStack || [];
  const deckVisible = dealing && deckGoneKey !== dealKey;
  const pileLeft = pile.key === dealKey ? pile.left : 1;
  const dealtFor = (id) => (dealt.key === dealKey ? dealt.counts[id] ?? 0 : 0);

  // Đếm ngược lượt: hiện ở avatar người đang tới lượt. Ẩn khi ván xong, khi bài
  // đang bay/chia, hoặc ngay sau khi Bạn vừa bấm đánh (đang chờ Server xử lý).
  const showTimer =
    gameState.is_active && !isDone && !flyingCombo && !dealing && !(gameState.current_turn === 0 && isSubmitting);
  const timerInfo = showTimer
    ? { baseLeft: gameState.time_left, total: gameState.time_limit ?? 30, receivedAt: gameState.__receivedAt ?? null }
    : null;
  const timerFor = (playerId) => (timerInfo && gameState.current_turn === playerId ? timerInfo : null);

  const seatEntryFor = (position) => opponents.find(([id]) => seatPositions[Number(id)] === position);
  const revealHandOf = (entry) => {
    if (!entry || !isDone) return null;
    const [id, p] = entry;
    const hand = gameState.all_hands?.[id];
    return !p.is_finished && hand && hand.length > 0 ? hand : null;
  };

  const renderSeat = (position) => {
    const entry = seatEntryFor(position);
    if (!entry) return null;
    const [id, p] = entry;
    const botId = Number(id);
    return (
      <OpponentSeat
        seatId={botId}
        name={p.name}
        cardsLeft={dealing ? dealtFor(botId) : p.cards_left}
        balance={p.balance}
        balanceDelta={balanceDeltas?.[id]}
        isCurrentTurn={gameState.is_active && !dealing && gameState.current_turn === botId}
        isPassed={p.is_passed}
        isFinished={p.is_finished}
        isThinking={thinkingBotId === botId}
        timer={timerFor(botId)}
        hideCards={Boolean(revealHandOf(entry))}
      />
    );
  };

  // Showdown: bài THẬT của người thua, lật ngửa cạnh ghế (về phía tâm bàn). Bot
  // trên: dàn ngang bên dưới ghế; Bot trái/phải: dàn dọc, ép khít.
  const renderReveal = (position) => {
    const hand = revealHandOf(seatEntryFor(position));
    if (!hand) return null;
    const vertical = position !== 'top';
    return (
      <div className={`tl-reveal ${vertical ? 'tl-reveal--col' : 'tl-reveal--row'}`}>
        {hand.map((c, i) => (
          <PlayingCard key={`${c}-${i}`} card={c} size={vertical ? 'revealSide' : 'reveal'} />
        ))}
      </div>
    );
  };

  const renderArea = (position) =>
    activeAreas.has(position) && (
      <div className={`tl-table__${position}`}>
        <div className={`tl-seatgroup tl-seatgroup--${position}`}>
          {renderSeat(position)}
          {renderReveal(position)}
        </div>
      </div>
    );

  // Chọn/bỏ chọn LUÔN được phép (kể cả chưa tới lượt) — trừ lúc đang chia/xếp bài.
  const toggleCard = (card) =>
    setSelectedCards((prev) => (prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]));

  const handleQuitClick = () => {
    if (window.confirm('Thoát bàn chơi hiện tại? Toàn bộ phiên chơi sẽ được reset.')) onQuit();
  };

  return (
    <div className="tl-screen" data-phase={dealing ? phase : 'idle'}>
      {/* Chỉ hiện khi điện thoại đang ở chế độ dọc — xem index.css */}
      <div id="rotate-overlay">
        <span className="text-5xl">🔄</span>
        <p className="text-lg font-semibold text-paper-100">Xoay ngang màn hình để chơi</p>
        <p className="text-sm text-paper-200/70">Tiến Lên Miền Nam hiển thị đẹp nhất ở chế độ ngang.</p>
      </div>

      <header className="tl-header">
        <div className="tl-header__brand">
          {/* Backend tăng num_round NGAY khi ván kết thúc nên lúc is_done số này đã là
              ván KẾ TIẾP — trừ 1 để header vẫn hiện đúng số ván vừa chơi. */}
          <span className="tl-header__round">Ván #{isDone ? Math.max(1, gameState.round - 1) : gameState.round}</span>
          <h1 className="tl-header__title">Tiến Lên Miền Nam</h1>
        </div>
        <button type="button" onClick={handleQuitClick} className="tl-btn tl-btn--ghost" style={{ opacity: 0.8 }}>
          Thoát bàn
        </button>
      </header>

      {errorMessage && (
        <div className="absolute left-1/2 top-9 z-[60] flex max-w-[80%] -translate-x-1/2 items-center justify-between gap-3 rounded-lg border border-lacquer-500/60 bg-felt-900/95 px-3 py-1.5 text-paper-100 shadow-lg" style={{ fontSize: 'var(--fs-name)' }}>
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

        {/* Vùng bài giữa bàn: TÂM cả cụm neo ở giữa vùng này; mỗi combo chỉ lệch/xoay
            ngẫu nhiên nhỏ độc lập quanh tâm cố định. */}
        <div className="tl-table__center">
          <div className="tl-cluster">
            {deckVisible && <DeckPile ref={deckRef} left={pileLeft} />}
            {stack.map((entry, i) => (
              <ComboRow key={entry.key} entry={entry} zIndex={i + 1} />
            ))}
            {stack.length === 0 && !deckVisible && (
              <p className="tl-cluster__empty">
                {gameState.is_active ? 'Bàn trống — lượt đánh tự do' : 'Chưa bắt đầu ván đấu'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="tl-handzone">
        <div className="tl-me">
          <TurnTimer timer={timerFor(0)}>B</TurnTimer>
          <FloatingDelta amount={balanceDeltas?.['0']} />
          <p className={`tl-seat__name ${gameState.current_turn === 0 && gameState.is_active && !isDone ? 'tl-seat__name--turn' : ''}`}>Bạn</p>
          <p className="tl-seat__chips">{formatChip(me?.balance)} chip</p>
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

        <div className="tl-actions">
          {isDone ? (
            <>
              <button type="button" onClick={onStartNewRound} className="tl-btn tl-btn--primary">
                Ván mới
              </button>
              <button type="button" onClick={handleQuitClick} className="tl-btn tl-btn--ghost">
                Thoát bàn
              </button>
            </>
          ) : (
            <>
              {/* Bỏ lượt: không phải lượt mình -> ẩn hẳn; tới lượt mình -> luôn hiện (kể
                  cả lượt đánh mới), chỉ bấm được khi Backend cho phép bỏ lượt. */}
              <button
                type="button"
                onClick={onPass}
                disabled={!canPass}
                className={`tl-btn tl-btn--ghost ${hasRealTurn ? '' : 'tl-btn--hidden'}`}
              >
                Bỏ lượt
              </button>
              {/* Đánh bài: chỉ hiện khi đúng lượt chính thức; chỉ SÁNG khi các lá đang chọn
                  tạo thành combo nằm trong legal_actions, còn lại mờ + khoá. */}
              <button
                type="button"
                onClick={() => onPlayCards(effectiveSelected)}
                disabled={!canPlay}
                className={`tl-btn tl-btn--primary ${hasRealTurn ? '' : 'tl-btn--hidden'} ${canPlay ? 'tl-btn--ready' : ''}`}
              >
                Đánh bài
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lớp phủ cho bài bay (chia cho Bot, Bot đánh ra bàn) */}
      <div ref={layerRef} className="tl-flight-layer" aria-hidden="true" />

      {jokerChoice && <JokerChoiceModal options={jokerChoice.options} onChoose={onResolveJoker} onCancel={onCancelJoker} />}
    </div>
  );
});

export default GameScreen;