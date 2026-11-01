// Lưu cục bộ những thứ NHẸ và an toàn: chỉ tên đăng nhập (để điền sẵn lần sau).
// Mật khẩu chỉ nằm trong bộ nhớ của tab đang mở, không bao giờ ghi vào localStorage.
const USERNAME_KEY = 'tlmn.username';

// Số dư cuối cùng ta thấy của từng tài khoản (chỉ là một con số, không nhạy cảm) — để lần đăng nhập
// sau nhận ra việc Backend tự cộng vốn hằng ngày (hết tiền + sang ngày mới -> +50k) và báo cho người chơi.
const BALANCE_PREFIX = 'tlmn.lastBalance.';

export function loadLastBalance(username) {
  try {
    const raw = window.localStorage.getItem(BALANCE_PREFIX + String(username).toLowerCase());
    return raw == null ? null : Number(raw);
  } catch {
    return null;
  }
}

export function saveLastBalance(username, balance) {
  try {
    if (username && Number.isFinite(Number(balance))) {
      window.localStorage.setItem(BALANCE_PREFIX + String(username).toLowerCase(), String(Math.round(Number(balance))));
    }
  } catch {
    /* trình duyệt chặn storage: bỏ qua */
  }
}

/** Mã phòng của Backend luôn gồm đúng 6 chữ số (0-9). */
export const ROOM_ID_LENGTH = 6;
/** ID người chơi (player_id) của tài khoản gồm đúng 10 chữ số. */
export const PLAYER_ID_LENGTH = 10;

export function loadSavedUsername() {
  try {
    return window.localStorage.getItem(USERNAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveUsername(name) {
  try {
    window.localStorage.setItem(USERNAME_KEY, name);
  } catch {
    /* trình duyệt chặn storage: bỏ qua */
  }
}

/** Mã phòng 6 chữ số (không bắt đầu bằng 0 cho dễ đọc), không trùng với các phòng đang tồn tại. */
export function generateRoomId(existing = []) {
  const taken = new Set(existing.map(String));
  for (let i = 0; i < 50; i++) {
    const id = String(10 ** (ROOM_ID_LENGTH - 1) + Math.floor(Math.random() * 9 * 10 ** (ROOM_ID_LENGTH - 1)));
    if (!taken.has(id)) return id;
  }
  return String(Date.now()).slice(-ROOM_ID_LENGTH).padStart(ROOM_ID_LENGTH, '1');
}

/** "1234567890" -> "1234 567 890" cho dễ đọc (chỉ để HIỂN THỊ; khi sao chép vẫn là 10 số liền). */
export function formatPlayerId(id) {
  const s = String(id ?? '').replace(/\D/g, '');
  if (s.length !== PLAYER_ID_LENGTH) return s;
  return `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
}

/** "123456" -> "123 456" (chỉ để hiển thị). */
export function formatRoomId(id) {
  const s = String(id ?? '');
  return s.length === ROOM_ID_LENGTH ? `${s.slice(0, 3)} ${s.slice(3)}` : s;
}
