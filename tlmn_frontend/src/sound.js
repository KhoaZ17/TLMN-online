// Tiếng "ding-dong" ngắn bằng WebAudio (không cần file âm thanh). Mọi lỗi đều bị nuốt:
// trình duyệt chặn tự phát âm thanh hoặc không hỗ trợ thì chỉ đơn giản là im lặng.
let ctx = null;

export function playChime() {
  try {
    if (typeof navigator !== 'undefined') navigator.vibrate?.([120, 60, 120]);
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    [
      [880, 0],
      [1318.5, 0.16],
    ].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.7);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.75);
    });
  } catch {
    /* im lặng */
  }
}
