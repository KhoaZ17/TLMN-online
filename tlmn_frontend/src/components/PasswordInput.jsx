import { useState } from 'react';

/**
 * Ô nhập mật khẩu CÓ NÚT HÌNH CON MẮT để xem / ẩn mật khẩu đang gõ (dùng ở đăng nhập và đăng ký).
 *  - Mặc định luôn ẨN. Bấm mắt -> hiện chữ (mắt gạch chéo = bấm để ẩn lại). Trạng thái này chỉ nằm trong ô nhập này:
 *    không lưu ở đâu cả, và ô tự ẩn lại khi đổi giữa tab Đăng nhập / Đăng ký (xem `key` ở nơi dùng).
 *  - Nút là `type="button"` nên không bao giờ gửi form; `onMouseDown` giữ nguyên con trỏ trong ô (bấm mắt không làm mất focus).
 *  - Có `aria-label` + `aria-pressed` cho trình đọc màn hình; vùng bấm rộng 2,75rem × toàn chiều cao ô nên dễ chạm trên điện thoại.
 *  - Không có chữ gợi ý / ví dụ nào trong ô (quy tắc chung của mọi ô nhập).
 */
const ICON = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
};

function EyeIcon() {
  return (
    <svg {...ICON}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...ICON}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function PasswordInput({ value, onChange, autoComplete, className = '', testId }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative" data-testid={testId ? `${testId}-wrap` : undefined}>
      <input
        className={`${className} pr-12`}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        data-testid={testId}
        data-shown={shown ? 'true' : 'false'}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShown((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-paper-200/70 transition-colors hover:text-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
        aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        aria-pressed={shown}
        title={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
