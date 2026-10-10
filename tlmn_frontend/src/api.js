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

export const api = {
  setupGame(payload) {
    return request('/api/setup', { method: 'POST', body: JSON.stringify(payload) });
  },
  startGame() {
    return request('/api/start', { method: 'POST' });
  },
  getState() {
    return request('/api/state', { method: 'GET' });
  },
  playAction({ playerId = 0, cardsToPlay, chosenOptionIndex = null }) {
    return request('/api/action', {
      method: 'POST',
      body: JSON.stringify({
        player_id: playerId,
        cards_to_play: cardsToPlay,
        chosen_option_index: chosenOptionIndex,
      }),
    });
  },
  triggerBotAction() {
    return request('/api/bot_action', { method: 'POST' });
  },
  quitGame() {
    return request('/api/quit', { method: 'POST' });
  },
  // [CLAUDE UPDATE - 2026]: Thêm phương thức gọi API báo hiệu animation mở màn (chia/xếp bài)
  // đã hoàn tất, giúp backend reset lại mốc thời gian đếm ngược lượt chơi một cách công bằng.
  introDone() {
    return request('/api/intro_done', { method: 'POST' });
  },
};