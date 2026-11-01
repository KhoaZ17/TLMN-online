import { looksLikeState, normalizeState, takeoverSeats } from './stateCompat';

function resolveBaseUrl() {
  const override = import.meta.env.VITE_API_BASE_URL;
  if (override) return override.replace(/\/$/, '');

  // Bản build production (phục vụ tĩnh bởi chính FastAPI, xem server.py):
  // trang và API cùng gốc, nên window.location.origin luôn đúng dù mở từ
  // máy tính hay điện thoại trong cùng mạng LAN — không còn cần sửa tay IP.
  if (import.meta.env.PROD) {
    return window.location.origin;
  }

  // Chế độ dev (`npm run dev`): Frontend (Vite, cổng 5173) và Backend
  // (FastAPI, cổng 8000) chạy ở 2 cổng khác nhau nên KHÔNG thể dùng thẳng
  // window.location.origin. Dùng đúng hostname đang truy cập (localhost hoặc
  // IP LAN của máy chạy Vite) nhưng luôn trỏ sang cổng 8000, để vẫn test
  // được từ điện thoại cùng WiFi trong lúc code (chạy `npm run dev -- --host`).
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

const BASE_URL = resolveBaseUrl();
let afkBackSupport = null; // null = chưa dò

// Phiên chơi hiện tại: phòng nào, mình ngồi ghế (player_id) số mấy, tài khoản nào. Mọi lời gọi game
// bên dưới tự gắn room_id / player_id / username này — component không phải truyền lại.
let session = { roomId: 'default', playerId: 0, username: '' };
export const setSession = (patch) => {
  session = { ...session, ...patch };
};
export const getSession = () => ({ ...session });

const query = (extra = {}) =>
  new URLSearchParams({ room_id: session.roomId, ...extra }).toString();

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (err) {
    throw new Error(`Không kết nối được tới backend (${BASE_URL}). Backend FastAPI đã chạy chưa?`);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`Backend trả về dữ liệu không hợp lệ (HTTP ${res.status}).`);
  }

  // Đóng dấu thời điểm NHẬN state. Vòng đếm ngược lượt (TurnTimer) tính
  // "còn lại = time_left - thời gian đã trôi kể từ lúc nhận", nên vẫn chạy
  // mượt giữa 2 lần poll và cả lúc polling tạm dừng (Bot đang "suy nghĩ"),
  // kể cả khi state bị giữ lại vài giây trước khi hiển thị.
  const stamp = Date.now();
  if (data && typeof data === 'object') {
    if (data.state && typeof data.state === 'object') data.state.__receivedAt = stamp;
    else if ('players_status' in data) data.__receivedAt = stamp;
  }
  return data;
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

// Chuẩn hoá state trong phản hồi (xem stateCompat.js): Backend gửi đủ trường thì giữ nguyên; thiếu (bản
// Core Mới chưa vá) thì bổ sung status / room_id / my_player_id / type từng ghế / instant_win_info.
// `res` là state thô (GET /api/state, POST /api/start) hoặc { status, state } (POST /api/action, /api/bot_action).
//
// Ghế đã bị Bot tiếp quản (người thật thoát giữa ván), nhớ theo phòng: Backend chỉ ghi chuyện đó vào `logs` (5 dòng
// cuối) và Core Mới chưa vá không gửi `type` từng ghế — nhớ lại để Frontend vẫn biết ghế đó giờ do Bot đánh.
const takenOverByRoom = new Map(); // room_id -> Set<số ghế>
const takenOverOf = (roomId) => {
  const key = String(roomId);
  if (!takenOverByRoom.has(key)) takenOverByRoom.set(key, new Set());
  return takenOverByRoom.get(key);
};
const forgetTakeovers = (roomId) => takenOverByRoom.delete(String(roomId));

const withState = (res, seat = session.playerId) => {
  if (!res || typeof res !== 'object') return res;
  const normalize = (raw) => {
    const takenOver = takenOverOf(session.roomId);
    takeoverSeats(raw.logs).forEach((id) => takenOver.add(id));
    return normalizeState(raw, { roomId: session.roomId, seat, takenOver });
  };
  if (res.state && typeof res.state === 'object') {
    res.state = normalize(res.state);
    return res;
  }
  return looksLikeState(res) ? normalize(res) : res;
};

export const api = {
  // ---- Phiên chơi hiện tại (phòng + ghế) ----
  setSession,
  getSession,

  // ---- Tài khoản ----
  register({ username, password }) {
    return post('/api/auth/register', { username, password });
  },
  login({ username, password }) {
    return post('/api/auth/login', { username, password });
  },

  // Mã đổi thưởng (giftcode): Backend trả { status, message, new_balance }. Đây là nơi DUY NHẤT nhập mã
  // (kể cả mã nhà phát triển — Backend tự biết mã nào là mã gì và chỉ chủ game mới được nhận).
  redeem({ username, code }) {
    return post('/api/auth/redeem', { username, code });
  },

  // Cập nhật hồ sơ: POST /api/auth/update_profile. Trường nào là null thì Backend GIỮ NGUYÊN, nên
  // avatar === undefined -> không đổi ảnh, avatar === '' -> xoá ảnh, chuỗi data URL -> ảnh mới.
  // `password` là trường phụ: Backend bản vá dùng để xác thực, Backend cũ bỏ qua.
  updateProfile({ username, password, displayName, gender, avatar }) {
    return post('/api/auth/update_profile', {
      username,
      password: password || null,
      display_name: displayName ?? null,
      gender: gender ?? null,
      avatar: avatar === undefined ? null : avatar,
    });
  },

  // ---- Phòng ----
  listRooms() {
    return request('/api/rooms', { method: 'GET' });
  },
  // Tìm một phòng theo mã. Trả về { rooms, room } — room = null nếu chưa có ai mở phòng đó.
  // (Backend tự TẠO phòng rỗng khi ai đó gọi /api/state với mã lạ, nên phải kiểm tra qua đây:
  // phòng thật có num_players > 0.)
  async findRoom(roomId) {
    const res = await request('/api/rooms', { method: 'GET' });
    const rooms = Array.isArray(res?.rooms) ? res.rooms : [];
    return { rooms, room: rooms.find((r) => String(r.room_id) === String(roomId)) || null };
  },
  // payload.room_id: mã phòng 6 số (nếu bỏ trống Backend tự sinh và trả về trong `room_id`).
  setupGame(payload) {
    forgetTakeovers(payload.room_id || session.roomId); // phòng được cấu hình lại -> quên các ghế Bot tiếp quản cũ
    return post('/api/setup', { ...payload, room_id: payload.room_id || session.roomId });
  },
  // Vào phòng bằng mã (khách): Backend gán cho tài khoản này một ghế. NGƯỜI THẬT ĐƯỢC ƯU TIÊN: còn ghế trống thì ngồi ghế đó,
  // bàn đã đủ mà có Bot thì một Bot bị mời ra nhường chỗ. Vào được ở phòng chờ và GIỮA HAI VÁN (kể cả lúc đếm ngược ván mới).
  // Thành công: { status: 'success', seat, host_seat, lobby }; phòng ĐANG ĐẤU mà bàn chưa đủ chỗ thì vào làm KHÁN GIẢ:
  // { status: 'success', spectator: true, seat: null, lobby } (chỉ xem, ván sau được ngồi vào). Lỗi: { status: 'error', code, message }
  // với code = not_found | full | no_account (| in_progress ở Backend cũ: đang đấu thì không vào được).
  joinRoom({ roomId, username }) {
    return post('/api/join', { room_id: String(roomId).trim(), username });
  },
  // Phòng chờ: ghế nào ai ngồi, cấu hình, `started` (ván đầu đã chia chưa). Có player_id = "điểm danh" là mình còn ở phòng
  // (không điểm danh trong ~3 phút thì Backend coi là đã bỏ đi). Lỗi: code = closed (phòng đã đóng) | kicked (mất ghế).
  // Nhận phòng / ghế / tài khoản TƯỜNG MINH (mặc định lấy từ phiên hiện tại): màn phòng chờ hỏi ngay lúc vừa dựng, có thể
  // trước khi phiên API kịp chuyển sang phòng mới — không được hỏi nhầm phòng cũ.
  getLobby({ roomId = session.roomId, playerId = session.playerId, username = session.username } = {}) {
    const extra = { room_id: String(roomId) };
    if (playerId != null) extra.player_id = String(playerId);
    if (username) extra.username = username;
    return request(`/api/lobby?${new URLSearchParams(extra).toString()}`, { method: 'GET' });
  },
  // Ván ĐẦU TIÊN: chỉ chủ phòng được bắt đầu (truyền playerId = ghế chủ phòng); ghế còn trống thì bỏ trống (KHÔNG tự thêm Bot).
  // Các ván sau không truyền playerId: ai cũng gọi được, Backend chỉ chia khi đang không có ván chạy.
  // Bàn còn dưới 2 người thì Backend từ chối: { status:'error', code:'need_players' } (ván sau) -> chờ người vào / chủ phòng thêm Bot.
  async startGame({ playerId } = {}) {
    // start_new_match trả state theo góc nhìn ghế 0.
    const extra = playerId != null ? { player_id: String(playerId) } : {};
    return withState(await request(`/api/start?${query(extra)}`, { method: 'POST' }), 0);
  },
  // Báo Backend: animation chia/xếp bài đã xong -> bắt đầu tính giờ lượt chơi.
  introDone() {
    return request(`/api/intro_done?${query()}`, { method: 'POST' });
  },
  // `username` đi kèm để Backend tìm ghế THEO TÀI KHOẢN: giữa hai ván bàn có thể được dồn lại (ghế trống bị bỏ, số ghế đổi),
  // và `my_player_id` trong kết quả là ghế HIỆN TẠI của mình (GameSession tự đổi theo). Backend cũ bỏ qua tham số này.
  async getState(playerId = session.playerId) {
    const extra = { player_id: String(playerId) };
    if (session.username) extra.username = session.username;
    const res = await request(`/api/state?${query(extra)}`, { method: 'GET' });
    return withState(res, Number(playerId));
  },
  // KHÁN GIẢ (vào phòng đang đấu, POST /api/join trả `spectator: true`): state KHÔNG có bài trên tay (`my_hand` rỗng, `legal_actions`
  // rỗng, `my_player_id` null, `spectating: true`). Được ngồi vào bàn (ván sau) thì nhận state thường của ghế mới (`my_player_id` là số);
  // không còn là khán giả cũng không có ghế -> { status:'error', code:'not_spectating' }. Không cần số ghế.
  async getSpectatorState() {
    const extra = { spectate: '1' };
    if (session.username) extra.username = session.username;
    const res = await request(`/api/state?${query(extra)}`, { method: 'GET' });
    return withState(res, null);
  },
  async playAction({ cardsToPlay, chosenOptionIndex = null }) {
    const res = await post('/api/action', {
      room_id: session.roomId,
      player_id: session.playerId,
      username: session.username || undefined,
      cards_to_play: cardsToPlay,
      chosen_option_index: chosenOptionIndex,
    });
    return withState(res, session.playerId);
  },
  async triggerBotAction() {
    // state trả về theo góc nhìn của Bot vừa đánh; nơi gọi lấy lại state theo góc nhìn của mình.
    return withState(await request(`/api/bot_action?${query()}`, { method: 'POST' }), null);
  },
  // Thoát phòng (người chơi CHỦ ĐỘNG bấm "Thoát bàn"): Backend nhận room_id + player_id (số ghế) + username trong BODY JSON.
  //  - Phòng chờ: chủ phòng thoát = HUỶ phòng; khách thoát = trả ghế cho người khác.
  //  - Ván ĐANG diễn ra: ghế của người thoát tự chuyển thành Bot đánh thay (avatar/tên giữ nguyên, GIỮ CHỖ để vào lại), ván tiếp diễn.
  //  - Giữa hai ván: rời HẲN. Ghế thành ghế TRỐNG (avatar biến mất ngay trên bàn của mọi người, KHÔNG tự thay bằng Bot);
  //    ván sau vẫn tự bắt đầu nếu còn từ 2 người; hết người thật thì phòng đóng.
  quitGame({ playerId = session.playerId } = {}) {
    return post('/api/quit', { room_id: session.roomId, player_id: playerId, username: session.username || undefined });
  },
  // Chủ phòng thêm / bớt Bot ngay trong phòng (phòng chờ hoặc giữa hai ván, không làm được lúc đang đấu):
  //  action = 'add'    -> một Bot ngồi vào ghế TRỐNG số nhỏ nhất (hết ghế trống thì lỗi "Bàn đã đủ chỗ")
  //  action = 'remove' -> một Bot THẬT rời bàn, ghế đó thành ghế trống cho người nhập mã vào
  // Thành công: { status: 'success', message, lobby }; lỗi: { status: 'error', message }. Máy chủ bản cũ không có đường này
  // (404, không có `status`) nên nơi gọi coi như "chưa hỗ trợ".
  manageBots({ roomId = session.roomId, username = session.username, action }) {
    return post('/api/bots', { room_id: String(roomId), username, action });
  },
  // Kết nối lại: gọi NGAY SAU KHI ĐĂNG NHẬP (hoặc khi thấy Bot đang đánh thay mình). Nếu tài khoản này còn ghế trong một phòng
  // (bị văng giữa ván, mất mạng, lỡ đóng tab...) Backend trả { status:'success', resumed:true, room_id, seat, started, host_seat }
  // và trả lại ghế cho mình; không có phòng nào để vào thì { resumed:false } — đó là chuyện bình thường, không phải lỗi.
  // Người đang bị Bot đánh giúp (AFK) đã QUAY LẠI (chạm / bấm phím / mở lại tab): xin lại quyền đánh. Không bao giờ throw.
  //  -> { supported:boolean, cleared:boolean }. Backend cũ chưa có /api/afk_back (404 / 405 / 422) thì supported=false: nơi gọi
  //  không được tự ẩn lớp "Bot đang đánh" vì Bot vẫn đang đánh thật.
  async afkBack({ username = session.username } = {}) {
    try {
      const res = await fetch(`${BASE_URL}/api/afk_back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: session.roomId, username }),
      });
      if (res.status === 404 || res.status === 405 || res.status === 422) {
        afkBackSupport = false;
        return { supported: false, cleared: false };
      }
      const data = await res.json().catch(() => null);
      if (!data || data.status === 'error') return { supported: true, cleared: false };
      return { supported: true, cleared: Boolean(data.cleared) };
    } catch {
      return { supported: true, cleared: false };
    }
  },
  // Backend có /api/afk_back không? Dò qua /openapi.json của FastAPI (kết quả nhớ lại). true = có HOẶC chưa biết (không dò được):
  // khi chưa biết thì lần chạm đầu tiên sẽ cho câu trả lời (xem afkBack).
  async supportsAfkBack() {
    if (afkBackSupport !== null) return afkBackSupport;
    try {
      const res = await fetch(`${BASE_URL}/openapi.json`);
      if (!res.ok) return true;
      const spec = await res.json();
      if (!spec || typeof spec.paths !== 'object' || spec.paths === null) return true;
      afkBackSupport = Object.prototype.hasOwnProperty.call(spec.paths, '/api/afk_back');
      return afkBackSupport;
    } catch {
      return true;
    }
  },
  resumeRoom({ username = session.username } = {}) {
    return post('/api/resume', { username });
  },
  // Gọi lúc người chơi ĐÓNG TAB / tải lại trang / mất kết nối (phòng chờ, giữa ván, giữa hai ván): `keepalive` giữ request sống sau
  // khi trang đóng để Backend kịp trả ghế / cho Bot tiếp quản. `reason: 'disconnect'` báo đây là BỊ VĂNG chứ không phải chủ động
  // thoát: ở giữa ván hay giữa hai ván, Bot đánh thay nhưng GIỮ CHỖ để người đó đăng nhập lại là vào lại đúng phòng + ghế
  // (xem resumeRoom). Chỉ best-effort, không bao giờ throw.
  quitOnUnload() {
    const body = JSON.stringify({
      room_id: session.roomId,
      player_id: session.playerId,
      username: session.username || undefined,
      reason: 'disconnect',
    });
    try {
      // sendBeacon xếp hàng yêu cầu NGAY trong lúc trang đang đóng (đáng tin hơn fetch khi tab bị đóng sát một thao tác khác);
      // trả false / không có thì dùng fetch keepalive. Chỉ gửi ĐÚNG MỘT yêu cầu: quit lần hai sẽ đóng cả phòng.
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        if (navigator.sendBeacon(`${BASE_URL}/api/quit`, new Blob([body], { type: 'application/json' }))) return;
      }
      fetch(`${BASE_URL}/api/quit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      /* bỏ qua */
    }
  },
};
