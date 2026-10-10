import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from './api';
import SetupScreen from './components/SetupScreen';
import GameScreen from './components/GameScreen';
import {
  wait,
  computeBotThinkSeconds,
  getDisplayCombo,
  sameComboArray,
  createStackEntry,
} from './gameFlow';

export default function App() {
  const [screen, setScreen] = useState('setup');
  const [gameState, setGameStateRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [jokerChoice, setJokerChoice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thinkingBotId, setThinkingBotId] = useState(null);
  const [thinkingSecondsLeft, setThinkingSecondsLeft] = useState(null);
  // true trong lúc có bài đang bay (của Bạn hoặc của Bot) — để tạm dừng polling/đồng hồ.
  const [flyingCombo, setFlyingCombo] = useState(false);
  const [tableStack, setTableStack] = useState([]);
  const [balanceDeltas, setBalanceDeltas] = useState(null);
  // Mở màn ván mới (chia -> lật -> chờ -> xếp bài): dealKey tăng mỗi ván mới,
  // dealing = true cho tới khi GameScreen báo xong (onIntroDone). Trong lúc đó Bot
  // chưa được đánh và Bạn chưa bấm được gì.
  const [dealKey, setDealKey] = useState(0);
  const [dealing, setDealing] = useState(false);
  const botBusy = useRef(false);
  const gameStateRef = useRef(null);
  gameStateRef.current = gameState;
  const uiRef = useRef(null); // API hiệu ứng bay của GameScreen
  // "Thế hệ" hiện tại của các hành động — tăng lên mỗi khi bắt đầu MỘT hành
  // động mới (đánh bài/bỏ lượt/tới lượt Bot). Một poll đã gửi đi TRƯỚC đó có
  // thể trả lời VỀ SAU, ngay giữa lúc Bot đang "suy nghĩ" hoặc bài đang bay —
  // áp thẳng kết quả cũ đó đè lên state đang được quản lý thủ công có thể làm UI
  // giật/lệch. So khớp "thế hệ" trước khi commit để loại đúng các phản hồi cũ này.
  const actionGenerationRef = useRef(0);

  // Bọc setGameState — làm 3 việc mỗi lần state thật sự đổi:
  // 1) Ván mới (is_active false -> true): bật chuỗi chia bài.
  // 2) Xếp CHỒNG combo mới lên bàn (không xoá combo cũ trong cùng vòng đấu); xoá
  //    sạch khi bàn thật sự trống. Nếu combo này đã được dựng sẵn ở dạng ẨN (để đo
  //    toạ độ cho hiệu ứng bay) thì chỉ cần hiện nó ra.
  // 3) Ván vừa kết thúc (is_done false -> true): tính chênh lệch số dư để bắn
  //    hiệu ứng tiền bay lên tại avatar, tự xoá sau ~2 giây.
  const commitGameState = useCallback((nextState) => {
    const prev = gameStateRef.current;

    if (nextState?.is_active && !prev?.is_active) {
      setDealKey((k) => k + 1);
      setDealing(true);
    }

    const combo = getDisplayCombo(nextState.table);
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

    if (nextState?.is_done && prev && !prev.is_done) {
      const deltas = {};
      const prevPlayers = prev.players_status || {};
      const nextPlayers = nextState.players_status || {};
      Object.keys(nextPlayers).forEach((id) => {
        const before = prevPlayers[id]?.balance;
        const after = nextPlayers[id].balance;
        if (before == null) return;
        const diff = Math.round(after - before);
        if (diff !== 0) deltas[id] = diff;
      });
      if (Object.keys(deltas).length > 0) {
        setBalanceDeltas(deltas);
        setTimeout(() => setBalanceDeltas(null), 2200);
      }
    }
    setGameStateRaw(nextState);
  }, []);

  // Áp state trực tiếp (không hiệu ứng bay) — dùng cho polling, bắt đầu ván,
  // ván mới, và các nhánh lỗi/joker-choice dùng chung cho mọi hành động.
  const applyResult = useCallback(
    (res) => {
      if (!res) return;
      if (res.status === 'require_joker_choice') {
        setJokerChoice({ options: res.options, cardsToPlay: res.cards_to_play });
        return;
      }
      if (res.status === 'error') {
        setErrorMessage(res.message || 'Đã có lỗi xảy ra.');
        return;
      }
      const nextState = res.status === 'success' ? res.state : res;
      commitGameState(nextState);
      setJokerChoice(null);
      setErrorMessage(null);
    },
    [commitGameState]
  );

  // Hành động ĐÁNH BÀI của chính người chơi: dựng sẵn cụm bài ở dạng ẨN trên bàn,
  // đo toạ độ thật của từng lá, cho các lá đang chọn bay MƯỢT từ đúng chỗ đang nằm
  // trên tay tới đó — chỉ SAU KHI bay xong mới cập nhật state (tay bài mất lá, cụm
  // bài hiện) trong CÙNG 1 lần vẽ nên không có khoảnh khắc chớp/biến mất.
  const revealPlay = useCallback(
    async (res, cardsPlayed) => {
      if (!res) return;
      if (res.status === 'require_joker_choice') {
        setJokerChoice({ options: res.options, cardsToPlay: res.cards_to_play });
        return;
      }
      if (res.status === 'error') {
        setErrorMessage(res.message || 'Đã có lỗi xảy ra.');
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
        commitGameState(nextState);
        setFlyingCombo(false);
      });
    },
    [commitGameState]
  );

  // Polling GET /api/state mỗi 1 giây khi ván đang diễn ra — TẠM DỪNG trong
  // lúc Bot đang "suy nghĩ" hoặc có hiệu ứng bài bay (bất kể của Bạn hay
  // Bot), để tránh state bị lộ sớm hoặc lệch nhịp animation. Đồng hồ 30s vẫn
  // chạy: khi polling hoạt động lại thì time_left thật từ Backend tiếp quản.
  useEffect(() => {
    if (screen !== 'game' || !gameState?.is_active) return undefined;
    if (thinkingBotId != null || flyingCombo) return undefined;

    const id = setInterval(async () => {
      const myGeneration = actionGenerationRef.current;
      try {
        const state = await api.getState();
        // Trong lúc chờ phản hồi, có thể một hành động khác đã bắt đầu và đang
        // tự quản lý state riêng — bỏ qua kết quả poll cũ này.
        if (actionGenerationRef.current !== myGeneration) return;
        if (state.status === 'error') {
          setErrorMessage(state.message);
          return;
        }
        commitGameState(state);
      } catch (err) {
        if (actionGenerationRef.current !== myGeneration) return;
        setErrorMessage(err.message);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [screen, gameState?.is_active, thinkingBotId, flyingCombo, commitGameState]);

  // Tới lượt Bot: gọi /api/bot_action NGAY để biết trước nước đi, nhưng CHƯA cập
  // nhật UI. Hiện "Đang suy nghĩ…" trong 1.5 + (số_lá-1)*0.35 giây (bỏ lượt: 1.5s),
  // sau đó các lá bay từ ghế Bot tới đúng chỗ giữa bàn (vừa bay vừa lật) rồi mới
  // commit state thật. Chưa chạy khi đang chia bài (dealing).
  useEffect(() => {
    if (!gameState || !gameState.is_active || gameState.is_done) return undefined;
    if (gameState.current_turn === 0) return undefined;
    if (dealing) return undefined;
    if (botBusy.current) return undefined;

    let cancelled = false;
    botBusy.current = true;
    actionGenerationRef.current += 1; // vô hiệu hoá mọi poll đã gửi trước đó
    const botId = gameState.current_turn;
    const oldCardsLeft = gameState.players_status?.[String(botId)]?.cards_left ?? 0;
    setThinkingBotId(botId);
    setThinkingSecondsLeft(null);

    const run = async () => {
      let res;
      try {
        res = await api.triggerBotAction();
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err.message);
          setThinkingBotId(null);
        }
        botBusy.current = false;
        return;
      }
      if (cancelled) return;

      if (res.status === 'error' || res.status === 'require_joker_choice') {
        applyResult(res);
        setThinkingBotId(null);
        botBusy.current = false;
        return;
      }

      const nextState = res.status === 'success' ? res.state : res;
      const newCardsLeft = nextState.players_status?.[String(botId)]?.cards_left ?? 0;
      const didPlay = newCardsLeft < oldCardsLeft;
      const rawCombo =
        didPlay && nextState.table?.last_combo_owner === botId ? nextState.table.last_combo_cards || [] : [];
      const playedCombo = rawCombo.length > 0 ? getDisplayCombo(nextState.table) : [];

      // delay = 1.5 + (số_lá - 1) * 0.35 giây (bỏ lượt: 1.5s cố định).
      const totalSeconds = computeBotThinkSeconds({ passed: !didPlay, comboLength: rawCombo.length });
      let remainingMs = Math.round(totalSeconds * 1000);
      while (remainingMs > 0) {
        setThinkingSecondsLeft(Math.ceil(remainingMs / 1000));
        const step = Math.min(1000, remainingMs);
        // eslint-disable-next-line no-await-in-loop
        await wait(step);
        if (cancelled) return;
        remainingMs -= step;
      }
      setThinkingBotId(null);
      setThinkingSecondsLeft(null);

      // SỬA ĐỒNG HỒ LỆCH 2S: làm tươi thời điểm nhận State ngay sau khi Bot "nghĩ" xong.
      if (nextState) {
        nextState.__receivedAt = Date.now();
      }

      if (playedCombo.length === 0) {
        commitGameState(nextState);
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
        commitGameState(nextState);
        setFlyingCombo(false);
      });
      flight?.cleanup();
      botBusy.current = false;
    };

    run();

    return () => {
      cancelled = true;
      botBusy.current = false;
      setThinkingBotId(null);
      setThinkingSecondsLeft(null);
    };
  }, [
    gameState?.current_turn,
    gameState?.is_active,
    gameState?.is_done,
    gameState?.round,
    dealing,
    applyResult,
    commitGameState,
  ]);

  const handleSetupSubmit = async (config) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const setupRes = await api.setupGame(config);
      if (setupRes.status === 'error') {
        setErrorMessage(setupRes.message);
        return;
      }
      const startRes = await api.startGame();
      if (startRes.status === 'error') {
        setErrorMessage(startRes.message);
        return;
      }
      commitGameState(startRes);
      setScreen('game');
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayCards = async (cards) => {
    setIsSubmitting(true);
    actionGenerationRef.current += 1; // vô hiệu hoá mọi poll đã gửi trước đó
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
    actionGenerationRef.current += 1; // vô hiệu hoá mọi poll đã gửi trước đó
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
    actionGenerationRef.current += 1; // vô hiệu hoá mọi poll đã gửi trước đó
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

  const handleCancelJoker = () => setJokerChoice(null);

  const handleStartNewRound = async () => {
    try {
      applyResult(await api.startGame());
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  const handleQuit = async () => {
    try {
      await api.quitGame();
    } catch {
      // vẫn đưa UI về màn hình Setup dù gọi API lỗi
    } finally {
      actionGenerationRef.current += 1; // vô hiệu hoá mọi poll đã gửi trước đó
      setGameStateRaw(null);
      setJokerChoice(null);
      setErrorMessage(null);
      setThinkingBotId(null);
      setThinkingSecondsLeft(null);
      setFlyingCombo(false);
      setDealing(false);
      setTableStack([]);
      setBalanceDeltas(null);
      setIsSubmitting(false);
      botBusy.current = false;
      setScreen('setup');
    }
  };

  return (
    <div className="game-container h-screen w-screen overflow-hidden bg-felt-950 text-paper-100">
      {screen === 'setup' ? (
        <SetupScreen onSubmit={handleSetupSubmit} loading={loading} errorMessage={errorMessage} />
      ) : (
        <GameScreen
          ref={uiRef}
          gameState={gameState}
          jokerChoice={jokerChoice}
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          thinkingBotId={thinkingBotId}
          flyingCombo={flyingCombo}
          tableStack={tableStack}
          balanceDeltas={balanceDeltas}
          dealing={dealing}
          dealKey={dealKey}
          onIntroDone={() => setDealing(false)}
          onPlayCards={handlePlayCards}
          onPass={handlePass}
          onResolveJoker={handleResolveJoker}
          onCancelJoker={handleCancelJoker}
          onStartNewRound={handleStartNewRound}
          onQuit={handleQuit}
          onDismissError={() => setErrorMessage(null)}
        />
      )}
    </div>
  );
}
