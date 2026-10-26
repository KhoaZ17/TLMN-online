// HỒ SƠ NGƯỜI CHƠI: tên trong game, giới tính, ảnh đại diện, kỷ lục số dư, số ván / thắng
// theo từng chế độ (Đếm lá, Nhất ăn tất). Mọi dữ liệu nằm ở Backend (tlmn_user_database.db):
//   - POST /api/auth/login        -> { player_id, balance, profile: {...} }  (hồ sơ của chính mình)
//   - POST /api/auth/update_profile -> lưu tên / giới tính / ảnh
//   - GET  /api/state             -> players_status[ghế] có name, username, gender, avatar,
//                                    highest_balance, stats (hồ sơ của MỌI người trên bàn)
// Frontend chỉ chuẩn hoá về một dạng duy nhất để các component dùng chung.
import { api } from './api';
import { isReplacedSeat } from './matchFlow';

export const MODES = [
  { id: 'count_cards', label: 'Đếm lá' },
  { id: 'winner_takes_all', label: 'Nhất ăn tất' },
];
export const MAX_NAME_LENGTH = 20;

// Backend lưu giới tính bằng chữ tiếng Việt ('Nam' | 'Nữ'); Frontend dùng 'male' | 'female'.
export const toApiGender = (g) => (g === 'female' ? 'Nữ' : 'Nam');
export const fromApiGender = (g) => {
  const s = String(g ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase();
  return s === 'nữ' || s === 'nu' || s === 'female' || s === 'f' ? 'female' : 'male';
};

const emptyStats = () => ({
  count_cards: { played: 0, wins: 0 },
  winner_takes_all: { played: 0, wins: 0 },
});

export const defaultProfile = (username = '') => ({
  player_id: '',
  username,
  display_name: username,
  gender: 'male',
  avatar: null,
  balance: 0,
  highest_balance: 0,
  stats: emptyStats(),
});

const toCount = (v) => Math.max(0, Math.floor(Number(v) || 0));

/**
 * Chuẩn hoá một hồ sơ từ Backend (login.profile hoặc players_status[ghế]) về:
 * { player_id, username, display_name, gender: 'male'|'female', avatar: string|null,
 *   balance, highest_balance, stats: { count_cards: {played, wins}, winner_takes_all: {...} } }
 * Backend gọi số ván thắng là `won`; chấp nhận cả `wins`.
 */
export function normalizeProfile(raw, username = '') {
  const stats = emptyStats();
  MODES.forEach(({ id }) => {
    const s = raw?.stats?.[id];
    stats[id] = { played: toCount(s?.played), wins: toCount(s?.won ?? s?.wins) };
  });
  const uname = String(raw?.username || username || '');
  const shown = String(raw?.display_name ?? raw?.name ?? '').trim();
  return {
    player_id: raw?.player_id != null ? String(raw.player_id) : '',
    username: uname,
    display_name: (shown || uname).slice(0, 40),
    gender: fromApiGender(raw?.gender),
    avatar: typeof raw?.avatar === 'string' && raw.avatar ? raw.avatar : null,
    balance: Number(raw?.balance) || 0,
    highest_balance: Number(raw?.highest_balance) || 0,
    stats,
    // false: Backend không gửi thống kê của người này -> popup ghi "Chưa có thống kê" thay vì hiện số 0 sai.
    statsKnown: Boolean(raw?.stats),
  };
}

/**
 * Hồ sơ của người ngồi ở một ghế (players_status[id]). Bot thật không có hồ sơ -> null; ghế của người
 * đã thoát giữa ván (Bot đánh thay) vẫn giữ hồ sơ để hiện đúng avatar / tên.
 */
export function profileFromSeat(seat) {
  if (!seat || (seat.type !== 'human' && !isReplacedSeat(seat))) return null;
  return normalizeProfile({ ...seat, display_name: seat.name }, seat.username || seat.name);
}

/** Tên hiển thị: tên trong game nếu có, không thì tên đăng nhập. */
export const displayNameOf = (profile, fallback = '') =>
  String(profile?.display_name || '').trim() || profile?.username || fallback;

/** Tỉ lệ thắng (%) làm tròn 1 chữ số thập phân; null nếu chưa chơi ván nào. */
export const winRate = (stat) =>
  stat && stat.played > 0 ? Math.round((stat.wins / stat.played) * 1000) / 10 : null;

/** 66.7 -> "66,7%"; 50 -> "50%"; null -> "—". */
export const formatRate = (rate) =>
  rate == null ? '—' : `${rate.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

/**
 * Đăng nhập NGẦM (không mã nhà phát triển) để làm tươi số dư + hồ sơ: dùng khi mở thẻ hồ sơ và khi
 * rời bàn. Không bao giờ throw — lỗi mạng/sai mật khẩu trả về null (nơi gọi giữ dữ liệu cũ).
 */
export async function fetchAccount({ username, password }) {
  try {
    const res = await api.login({ username, password });
    if (res?.status !== 'success') return null;
    const profile = normalizeProfile(
      { ...(res.profile || {}), player_id: res.player_id ?? res.profile?.player_id, balance: res.balance },
      res.username || username
    );
    return { profile, balance: Number(res.balance) || 0 };
  } catch {
    return null;
  }
}

/**
 * Lưu thay đổi hồ sơ của chính mình. patch = { displayName?, gender?, avatar? } (avatar: data URL mới,
 * '' để xoá ảnh, undefined để giữ nguyên). Trả về { profile } khi thành công, { profile: current, error }
 * khi thất bại.
 */
export async function saveProfile({ username, password, current, patch }) {
  const displayName =
    patch.displayName !== undefined ? patch.displayName.trim().slice(0, MAX_NAME_LENGTH) : current.display_name;
  const gender = patch.gender || current.gender;
  try {
    const res = await api.updateProfile({
      username,
      password,
      displayName: patch.displayName !== undefined ? displayName : undefined,
      gender: toApiGender(gender),
      avatar: patch.avatar,
    });
    if (res?.status !== 'success') {
      return { profile: current, error: res?.message || 'Không lưu được hồ sơ.' };
    }
    return {
      profile: {
        ...current,
        display_name: displayName || current.username,
        gender,
        avatar: patch.avatar === undefined ? current.avatar : patch.avatar || null,
      },
    };
  } catch (err) {
    return { profile: current, error: err.message || 'Không lưu được hồ sơ.' };
  }
}
