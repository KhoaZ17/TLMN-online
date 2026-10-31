// ÂM THANH bằng WebAudio (không cần file âm thanh). Mọi lỗi đều bị nuốt: trình duyệt chặn tự phát âm thanh hoặc không hỗ trợ
// thì chỉ đơn giản là im lặng.
//  - playChime(): tiếng "ding-dong" khi tới lượt thật của mình (kèm rung nhẹ trên điện thoại).
//  - playCardSound(n): TẠM KHÔNG DÙNG (chờ file âm thanh thật của chủ game; không nơi nào gọi). Tiếng lá bài đánh xuống bàn khi có người đánh một combo n lá — càng nhiều lá tiếng càng DÀI và LỚN hơn một chút
//    (vừa phải, không chói tai): 1 lá ≈ 0,15 giây, 13 lá ≈ 0,5 giây; âm lượng đỉnh tăng từ 0,16 lên tối đa 0,32.
//  - Bật / tắt âm thanh: cài đặt (bánh răng) gọi setSoundOn; lưu trong localStorage; useSyncExternalStore đọc qua subscribeSound.
let ctx = null;
let noiseBuf = null;

const STORAGE_KEY = 'tlmn.sound';
let soundOn = true;
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'off') soundOn = false;
} catch {
  /* không đọc được thì để mặc định bật */
}
const listeners = new Set();

/** Âm thanh đang bật? (mặc định bật) */
export const isSoundOn = () => soundOn;

/** Bật / tắt toàn bộ âm thanh của game (chuông + tiếng bài). Nhớ lại cho lần mở sau. */
export function setSoundOn(on) {
  soundOn = Boolean(on);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, soundOn ? 'on' : 'off');
  } catch {
    /* im lặng */
  }
  listeners.forEach((fn) => fn());
}

/** Dùng với React.useSyncExternalStore(subscribeSound, isSoundOn). */
export function subscribeSound(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function audio() {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  ctx = ctx || new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Tiếng chuông 2 nốt khi tới lượt (rung nhẹ trên điện thoại kể cả khi tắt âm thanh — rung không phải âm thanh). */
export function playChime() {
  try {
    if (typeof navigator !== 'undefined') navigator.vibrate?.([120, 60, 120]);
    if (!soundOn) return;
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime;
    [
      [880, 0],
      [1318.5, 0.16],
    ].forEach(([freq, at]) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.7);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.75);
    });
  } catch {
    /* im lặng */
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// TIẾNG BÀI ĐÁNH XUỐNG
// ---------------------------------------------------------------------------------------------------------------------
export const CARD_SOUND_MIN_S = 0.15; // 1 lá
export const CARD_SOUND_MAX_S = 0.5; // 13 lá trở lên
export const CARD_SOUND_MIN_GAIN = 0.16;
export const CARD_SOUND_MAX_GAIN = 0.32;
const MAX_TAPS = 6; // số "cú chạm" tối đa (combo dài thì kéo dài + lớn hơn chứ không dồn thành tràng liên thanh)
const TAP_GAP_S = 0.035;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Kế hoạch tiếng bài cho một combo `count` lá (hàm thuần, test được): số cú chạm, âm lượng đỉnh và tổng thời lượng (giây).
 * Càng nhiều lá -> càng dài và càng lớn, nhưng chỉ hơn vừa phải.
 */
export function cardSoundPlan(count) {
  const n = clamp(Math.round(Number(count) || 1), 1, 13);
  const k = (n - 1) / 12; // 0..1
  const taps = Math.min(n, MAX_TAPS);
  const duration = CARD_SOUND_MIN_S + (CARD_SOUND_MAX_S - CARD_SOUND_MIN_S) * k;
  const peak = CARD_SOUND_MIN_GAIN + (CARD_SOUND_MAX_GAIN - CARD_SOUND_MIN_GAIN) * k;
  return { n, taps, duration, peak, gap: TAP_GAP_S };
}

function noise(ac) {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 0.25);
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** Tiếng một combo `count` lá được đặt xuống bàn: tiếng "tạch" của giấy bài + tiếng đục nhẹ của mặt bàn. */
export function playCardSound(count = 1) {
  if (!soundOn) return;
  try {
    const ac = audio();
    if (!ac) return;
    const plan = cardSoundPlan(count);
    const t0 = ac.currentTime + 0.005;
    const tail = Math.max(0.08, plan.duration - (plan.taps - 1) * plan.gap); // thời gian vang của cú chạm cuối (combo càng dài càng lâu)
    const master = ac.createGain();
    master.gain.value = 1;
    master.connect(ac.destination);

    for (let i = 0; i < plan.taps; i++) {
      const at = t0 + i * plan.gap + (Math.random() - 0.5) * 0.006;
      const last = i === plan.taps - 1;
      const len = last ? tail : 0.07;
      const amp = plan.peak * (last ? 1 : 0.72 + Math.random() * 0.2);

      // "tạch": nhiễu qua bộ lọc băng thông (giấy bài chạm mặt bàn)
      const src = ac.createBufferSource();
      src.buffer = noise(ac);
      const band = ac.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1500 + Math.random() * 900;
      band.Q.value = 0.9;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(amp, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(0.12, len));
      src.connect(band).connect(g).connect(master);
      src.start(at);
      src.stop(at + Math.min(0.13, len + 0.02));

      // "cộp": âm trầm ngắn của mặt bàn; cú cuối kéo dài theo số lá
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(190 - i * 6, at);
      osc.frequency.exponentialRampToValueAtTime(95, at + len);
      const og = ac.createGain();
      og.gain.setValueAtTime(0.0001, at);
      og.gain.exponentialRampToValueAtTime(amp * 0.9, at + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, at + len);
      osc.connect(og).connect(master);
      osc.start(at);
      osc.stop(at + len + 0.02);
    }
  } catch {
    /* im lặng */
  }
}
