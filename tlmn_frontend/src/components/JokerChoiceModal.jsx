export default function JokerChoiceModal({ options, onChoose, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      {/* max-h-[80vh] + flex-col: tiêu đề/nút Huỷ luôn cố định, chỉ phần
          lưới lựa chọn cuộn riêng khi danh sách dài — modal không bao giờ
          tràn hết chiều cao màn hình. */}
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-gold-500/50 bg-felt-800 p-6 shadow-2xl">
        <h2 className="shrink-0 font-sans text-lg font-semibold text-paper-100">Chọn cách ghép Joker</h2>
        <p className="mt-1 shrink-0 text-sm text-paper-200/70">
          Bộ bài này ghép được nhiều cách khác nhau. Chọn một cách để đánh:
        </p>

        {/* Lưới 2-3 cột (tuỳ bề rộng) thay vì 1 cột dọc dài — gọn hơn nhiều
            khi có nhiều cách ghép (vd sảnh dài nhiều Joker). */}
        <div className="mt-4 grid flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {options.map((opt) => (
            <button
              key={opt.option_id}
              type="button"
              onClick={() => onChoose(opt.option_id)}
              className="rounded-xl border border-felt-600 bg-felt-900/60 px-3 py-3 text-left text-sm text-paper-100 transition-colors hover:border-gold-400 hover:bg-gold-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-felt-800"
            >
              {opt.description || `Cách ghép #${opt.option_id + 1}`}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full shrink-0 rounded-xl border border-felt-600 py-2 text-sm text-paper-200/70 transition-colors hover:border-lacquer-500 hover:text-lacquer-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-felt-800"
        >
          Huỷ, chọn lại bài khác
        </button>
      </div>
    </div>
  );
}
