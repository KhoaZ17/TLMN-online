import { useMemo, useState } from 'react';
import HelpButton from './HelpButton';
import { formatChip } from '../gameFlow';
import { formatRoomId, generateRoomId } from '../session';

/**
 * Màn "TẠO PHÒNG": chế độ Joker, hình thức trả tiền (Đếm lá / Nhất ăn tất), số
 * người thật, số bot, mức cược. Phòng có từ 2 đến 4 người (người thật + bot).
 *  - Chỉ 1 người thật: mở phòng xong là chia bài luôn.
 *  - Nhiều người thật: phòng đi vào PHÒNG CHỜ. Người tạo phòng (chủ phòng) và các bot ngồi sẵn, bạn bè tự nhập mã
 *    phòng để vào ghế còn trống — KHÔNG phải nhập tên tài khoản của ai ở đây.
 * Mã phòng (6 chữ số) được sinh tự động; KHÔNG còn ô "số tiền khởi tạo": tiền chơi của mỗi người
 * được Backend lấy thẳng từ số dư tài khoản. Payload gửi /api/setup chỉ gồm:
 * room_id, joker_mode, payment_mode, num_bots, num_humans, cost, player_accounts (chỉ có chủ phòng).
 */
const PAYMENT_OPTIONS = [
  { value: 'count_cards', label: 'Đếm lá', hint: 'Trả theo số lá còn lại' },
  { value: 'winner_takes_all', label: 'Nhất ăn tất', hint: 'Người về nhất ăn hết' },
];
const COST_PRESETS = [1000, 5000, 10000, 50000, 100000];
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

function Segmented({ options, value, onChange, testId }) {
  return (
    <div className="flex gap-2" role="radiogroup" data-testid={testId}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
          className={`tl-seg ${value === opt.value ? 'tl-seg--on' : ''}`}
          data-value={opt.value}
        >
          {opt.label}
          {opt.hint && <span className="tl-seg__hint">{opt.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export default function SetupScreen({ auth, initial, onSubmit, onBack, onHelp, loading, errorMessage }) {
  // `initial`: lựa chọn của lần mở phòng trước (khi quay lại form sau một lỗi) — mã phòng thì luôn sinh mới.
  const init = initial || {};
  const [jokerMode, setJokerMode] = useState(Boolean(init.joker_mode));
  const [paymentMode, setPaymentMode] = useState(init.payment_mode || 'count_cards');
  const [numHumans, setNumHumans] = useState(init.num_humans || 1);
  const [numBots, setNumBots] = useState(init.num_bots ?? 3);
  const [cost, setCost] = useState(init.cost || 1000);
  const [localError, setLocalError] = useState(null);
  const [roomId, setRoomId] = useState(() => generateRoomId());

  // Giữ tổng số người trong [2, 4]: đổi số người thật thì số bot tự co lại cho vừa.
  const setHumans = (n) => {
    setNumHumans(n);
    setNumBots((b) => Math.max(Math.max(0, MIN_PLAYERS - n), Math.min(b, MAX_PLAYERS - n)));
  };

  const botOptions = useMemo(() => {
    const lo = Math.max(0, MIN_PLAYERS - numHumans);
    const hi = MAX_PLAYERS - numHumans;
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ value: lo + i, label: String(lo + i) }));
  }, [numHumans]);

  const total = numHumans + numBots;
  const costNum = Math.max(0, Math.floor(Number(cost) || 0));
  const needBalance = costNum * (paymentMode === 'count_cards' ? 10 : 1);
  const lowBalance = costNum > 0 && auth.balance < needBalance;

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError(null);
    if (costNum < 1) return setLocalError('Mức cược phải từ 1 chip trở lên.');

    // Chỉ chủ phòng có tài khoản lúc mở phòng; người thật còn lại vào sau bằng mã phòng (ghế trống ở phòng chờ).
    onSubmit({
      room_id: roomId,
      joker_mode: jokerMode,
      payment_mode: paymentMode,
      num_bots: numBots,
      num_humans: numHumans,
      cost: costNum,
      player_accounts: [auth.username],
    });
  };

  const shownError = localError || errorMessage;

  return (
    // Body bị khoá không cuộn nên màn này tự có vùng cuộn RIÊNG: điện thoại ngang
    // cao ~360px vẫn kéo được xuống nút "Mở phòng".
    <div className="relative h-full overflow-y-auto overscroll-contain">
      <div className="tl-create">
        <header className="tl-create__bar">
          <button type="button" onClick={onBack} className="tl-btn tl-btn--ghost" data-testid="create-back">
            ‹ Quay lại
          </button>
          <HelpButton onClick={onHelp} />
        </header>

        <form onSubmit={handleSubmit} className="tl-card tl-create__card" data-testid="create-form">
          <div className="mb-4 text-center">
            <p className="text-xs uppercase tracking-widest text-gold-300/80">Phòng mới</p>
            <h1 className="mt-1 font-sans text-2xl font-extrabold text-paper-100">Tạo phòng</h1>
          </div>

          <div className="tl-roomcode" data-testid="room-code">
            <span className="tl-roomcode__label">Mã phòng (tự động)</span>
            <span className="tl-roomcode__digits" data-testid="room-code-value" aria-label={`Mã phòng ${roomId}`}>
              {formatRoomId(roomId)}
            </span>
            <button
              type="button"
              className="tl-roomcode__refresh"
              onClick={() => setRoomId(generateRoomId())}
              aria-label="Đổi sang mã phòng khác"
              title="Đổi mã khác"
              data-testid="room-code-refresh"
            >
              ⟳
            </button>
          </div>

          {shownError && (
            <div className="mb-3 rounded-lg border border-lacquer-500/60 bg-lacquer-600/20 px-3 py-2 text-sm text-paper-100" role="alert">
              {shownError}
            </div>
          )}

          <div className="tl-create__grid">
            <label className="tl-toggle">
              <span>
                <span className="block text-paper-100">Chế độ Joker</span>
                <span className="block text-xs text-paper-200/60">14 lá mỗi người, Joker thay được mọi lá</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="tl-switch"
                checked={jokerMode}
                onChange={(e) => setJokerMode(e.target.checked)}
                data-testid="opt-joker"
              />
            </label>

            <div>
              <span className="tl-label">Hình thức trả tiền</span>
              <Segmented options={PAYMENT_OPTIONS} value={paymentMode} onChange={setPaymentMode} testId="opt-payment" />
            </div>

            <div>
              <span className="tl-label">
                Người chơi thật <span className="text-paper-200/50">(gồm bạn)</span>
              </span>
              <Segmented
                options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
                value={numHumans}
                onChange={setHumans}
                testId="opt-humans"
              />
            </div>

            <div>
              <span className="tl-label">
                Số bot <span className="text-paper-200/50">· tổng {total} người</span>
              </span>
              <Segmented options={botOptions} value={numBots} onChange={setNumBots} testId="opt-bots" />
            </div>
          </div>

          <p className="tl-create__note" data-testid="lobby-note">
            {numHumans > 1
              ? `Phòng sẽ chờ bạn bè: ${numBots > 0 ? `bạn và ${numBots} bot` : 'bạn'} ngồi sẵn, ${numHumans - 1} người còn lại chọn “Nhập ID phòng” và gõ mã phòng ở trên để vào. Bạn bấm bắt đầu khi sẵn sàng — chỗ chưa có người sẽ để trống, không có Bot thế vào.`
              : 'Chỉ có mình bạn là người thật nên ván sẽ bắt đầu ngay khi mở phòng.'}
          </p>

          <div className="mt-3">
            <label className="tl-label" htmlFor="cost-input">
              Mức cược (chip / đơn vị)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="cost-input"
                type="number"
                min={1}
                inputMode="numeric"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="tl-input tl-create__cost tabular-nums"
                data-testid="opt-cost"
              />
              <div className="flex flex-wrap gap-1.5">
                {COST_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCost(c)}
                    className={`tl-chipbtn ${costNum === c ? 'tl-chipbtn--on' : ''}`}
                  >
                    {formatChip(c)}
                  </button>
                ))}
              </div>
            </div>
            {lowBalance && (
              <p className="mt-1.5 text-xs text-amber-300/90">
                Số dư của bạn ({formatChip(auth.balance)}) thấp hơn mức nên có cho ván này ({formatChip(needBalance)}) — bạn vẫn
                chơi được nhưng có thể không đủ chip để trả.
              </p>
            )}
          </div>

          <div className="tl-create__actions">
            <button type="submit" disabled={loading} className="tl-btn tl-btn--primary tl-btn--lg w-full" data-testid="create-submit">
              {loading ? 'Đang mở phòng…' : numHumans > 1 ? 'Mở phòng chờ' : 'Mở phòng và chơi ngay'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
