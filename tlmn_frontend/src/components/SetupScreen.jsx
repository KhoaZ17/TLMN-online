import { useState } from 'react';

const DEFAULTS = {
  joker_mode: false,
  payment_mode: 'count_cards',
  num_bots: 3,
  cost: 1000,
  starting_balance: 500000,
};

const PAYMENT_OPTIONS = [
  { value: 'count_cards', label: 'Đếm lá' },
  { value: 'winner_takes_all', label: 'Nhất ăn tất' },
];

export default function SetupScreen({ onSubmit, loading, errorMessage }) {
  const [form, setForm] = useState(DEFAULTS);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      joker_mode: form.joker_mode,
      payment_mode: form.payment_mode,
      num_bots: Number(form.num_bots),
      cost: Number(form.cost) || undefined,
      starting_balance: Number(form.starting_balance) || undefined,
    });
  };

  return (
    // Body bị khoá không cuộn (để màn hình game không có thanh cuộn), nên màn
    // hình thiết lập tự có vùng cuộn RIÊNG: điện thoại ngang cao ~360px vẫn
    // kéo được xuống nút "Vào bàn" thay vì bị cắt mất.
    <div className="relative h-full overflow-y-auto overscroll-contain">
      <div className="relative flex min-h-full items-center justify-center px-4 py-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(212,175,106,0.10) 0%, rgba(11,46,35,0) 60%)',
        }}
      />

      <form
        onSubmit={handleSubmit}
        className="tl-setup-card relative w-full max-w-md rounded-2xl border border-gold-500/40 bg-felt-800/90 shadow-2xl shadow-black/50"
      >
        <div className="mb-6 text-center">
          <p className="text-sm text-gold-300/80">Bàn bài</p>
          <h1 className="mt-1 font-sans text-3xl font-extrabold text-paper-100">Tiến Lên Miền Nam</h1>
          <p className="mt-2 text-sm text-paper-200/70">Thiết lập bàn chơi trước khi vào ván đầu tiên.</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-lacquer-500/60 bg-lacquer-600/20 px-4 py-3 text-sm text-paper-100">
            {errorMessage}
          </div>
        )}

        <div className="space-y-5">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-felt-600 bg-felt-900/60 px-4 py-3">
            <span>
              <span className="block text-paper-100">Chế độ Joker</span>
              <span className="block text-xs text-paper-200/60">14 lá mỗi người, có Joker mang chất</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-gold-400"
              checked={form.joker_mode}
              onChange={(e) => update('joker_mode', e.target.checked)}
            />
          </label>

          <div>
            <span className="mb-2 block text-sm text-paper-200/80">Hình thức trả tiền</span>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => update('payment_mode', opt.value)}
                  className={`rounded-xl border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-felt-800 ${
                    form.payment_mode === opt.value
                      ? 'border-gold-400 bg-gold-400/15 text-gold-300'
                      : 'border-felt-600 bg-felt-900/60 text-paper-200/70 hover:border-felt-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 flex items-center justify-between text-sm text-paper-200/80">
              <span>Số lượng Bot</span>
              <span className="tabular-nums text-paper-100">
                {form.num_bots} bot · {Number(form.num_bots) + 1} người chơi
              </span>
            </label>
            <input
              type="range"
              min={1}
              max={3}
              step={1}
              value={form.num_bots}
              onChange={(e) => update('num_bots', e.target.value)}
              className="w-full accent-gold-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm text-paper-200/80">Mức cược (chip/đơn vị)</span>
              <input
                type="number"
                min={1}
                value={form.cost}
                onChange={(e) => update('cost', e.target.value)}
                className="w-full rounded-lg border border-felt-600 bg-felt-900/60 px-3 py-2 tabular-nums text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-paper-200/80">Số dư ban đầu</span>
              <input
                type="number"
                min={1}
                value={form.starting_balance}
                onChange={(e) => update('starting_balance', e.target.value)}
                className="w-full rounded-lg border border-felt-600 bg-felt-900/60 px-3 py-2 tabular-nums text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              />
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-8 w-full rounded-xl bg-lacquer-600 py-3 font-semibold text-paper-100 transition-colors hover:bg-lacquer-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-felt-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Đang vào bàn…' : 'Vào bàn'}
        </button>
      </form>
      </div>
    </div>
  );
}
