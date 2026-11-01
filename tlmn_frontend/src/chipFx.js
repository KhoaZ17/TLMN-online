// HIỆU ỨNG CHIP: mỗi lần số dư đổi (chặt, hết ván, tới trắng...) chip bay từ người MẤT sang người ĐƯỢC, và SỐ DƯ CHẠY DẦN theo chip.
//  - planCoinFlows(deltas, ctx): hàm thuần, lên kế hoạch "ai gửi cho ai bao nhiêu chip (và bao nhiêu tiền)"        (test được bằng Node)
//  - planWaves(count): chia số chip của một luồng thành các ĐỢT ngẫu nhiên (vd 35 = 3 + 5 + 8 + 4 + 9 + 6)
//  - scheduleChips(...): xếp lịch bay + "làn bay" riêng cho từng chip để KHÔNG chồng nhau giữa đường (hàm thuần)
//  - buildMoneyEvents / pendingAt: lịch tiền theo từng chip -> số dư hiển thị giảm / tăng dần cùng nhịp chip bay (hàm thuần)
//  - runChipFx(layer, deltas, ctx): vẽ chip bay (WAAPI) trên lớp phủ cố định + nháy viền avatar xanh/đỏ
//
// SỐ CHIP BAY = SỐ TIỀN NGƯỜI THUA TRẢ, tính bằng "đơn vị chip":
//   Đếm lá     : 1 chip = 1 lần tiền cược      (trả 45 lần cược      -> 45 chip)
//   Nhất ăn tất: 1 tụ (= 1 lần cược) = 10 chip (trả 3,5 tụ = 3,5 lần cược -> 35 chip)
//
// THỜI GIAN: cả hiệu ứng kéo dài từ 0,5 giây (ít chip) tới 2 giây (từ 100 chip trở lên), tăng dần theo số chip của luồng đông nhất.
//
// CÁCH BAY: chip bay thành từng ĐỢT, số đợt và số chip mỗi đợt đều NGẪU NHIÊN. Mọi chip bay cùng một tốc độ trên các "làn" song song
// (đường thẳng hơi cong) nối avatar người trả với avatar người nhận; hai làn cách nhau ≥ 1 đường kính chip và hai chip trên cùng một làn
// xuất phát cách nhau đủ xa, nên GIỮA ĐƯỜNG chúng không bao giờ đè nhau. Chỉ ở ngay avatar xuất phát (các làn chụm lại) và avatar
// đích (các làn chụm về) chip mới được chồng lên nhau. Lịch bay được kiểm tra chính xác từng chip một (kể cả giữa hai khung hình) rồi mới vẽ.
//
// TIỀN: mỗi chip mang một phần tiền của luồng. Người trả bị trừ dần mỗi khi một chip rời avatar, người nhận được cộng dần mỗi khi một chip
// chạm avatar; tổng các phần khớp CHÍNH XÁC số tiền đổi, nên hết hiệu ứng thì số dư hiển thị đúng bằng số dư thật.
import { prefersReducedMotion } from './flight';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Số chip bay cho MỖI 1 lần tiền cược (1 tụ ở Nhất ăn tất), theo hình thức trả tiền. */
export const CHIPS_PER_STAKE = { count_cards: 1, winner_takes_all: 10 };

export const FX_MIN_MS = 500; // cả hiệu ứng ngắn nhất (rất ít chip)
export const FX_MAX_MS = 2000; // cả hiệu ứng dài nhất (từ FX_FULL_AT chip trở lên)
export const FX_FULL_AT = 70; // luồng có ngần này chip trở lên -> FX_MAX_MS
const FX_CURVE = 0.6; // <1: ít chip tăng thời gian nhanh hơn một chút so với đường thẳng (35 chip ≈ 1,3 giây)

// Chặn để máy yếu không phải vẽ hàng trăm chip (ván cóng + thối 3 bích nhân hệ số có thể ra mấy trăm đơn vị). Quá số này thì chip cũng
// không còn chỗ để bay mà không đè nhau trong tối đa 2 giây.
export const MAX_CHIPS_PER_FLOW = 70; // một người trả cho một người
export const MAX_CHIPS_TOTAL = 120; // cả lần đổi số dư; vượt thì thu nhỏ đều mọi luồng

export const GRID_MS = 8; // thời gian bay của một chip là bội số của bước này
export const SAMPLE_MS = 2; // bước lấy mẫu vị trí khi kiểm tra chip đè nhau
export const START_MS = 4; // bước nhỏ nhất khi dời giờ xuất phát của một chip
export const CLEARANCE = 1.1; // khoảng cách tâm tối thiểu giữa hai chip giữa đường = CLEARANCE × đường kính
const ZONE_PAD = 1.0; // chip còn cách mép avatar chưa tới 1 đường kính chip thì coi là "đang ở avatar" (được chồng nhau)
const EASE_K = 0.2; // chậm nhẹ ở hai đầu, nhanh hơn một chút ở giữa (tốc độ trong khoảng 0,8–1,2 lần trung bình)
const MAX_SIDE_LANES = 3; // tối đa số làn mỗi bên đường thẳng giữa hai avatar (bó tối đa 7 làn)
const MIN_FLIGHT_MS = 160; // chuyến bay không bao giờ ngắn hơn mức này (đông chip thì bay nhanh hơn để kịp hết đợt)
const SPEED_SAFETY = 1.15; // dư địa khi ước lượng sức chứa của một làn
const PARALLEL = 2.2; // số chip trung bình xuất phát song song (các làn cạnh nhau) khi ước lượng sức chứa
const TAPER = 0.6; // các làn xoè ra / chụm lại trong 0,6 bán kính vùng avatar (xong trước khi chip rời vùng nên các làn cạnh nhau không đè nhau)
const CROWD_AT = 24; // từ ngần này chip (cộng mọi luồng) trở lên thì rút ngắn thời gian bay của mỗi chip
const CROWD_MIN = 0.35; // ...nhưng không dưới ngần này lần thời gian bay ban đầu
const PLAN_BUDGET_MS = 160; // quá thời gian này khi xếp lịch (cực hiếm) thì các chip còn lại bị bỏ, không vẽ đè
const KEY_STEPS = 24; // số khung hình khoá của mỗi chip khi vẽ

/** Cả hiệu ứng (ms) khi luồng đông nhất có `maxFlowChips` chip: 500 -> 2000. */
export function fxDurationMs(maxFlowChips) {
  const n = Math.max(1, Number(maxFlowChips) || 1);
  const k = clamp((n - 1) / (FX_FULL_AT - 1), 0, 1);
  return Math.round(FX_MIN_MS + (FX_MAX_MS - FX_MIN_MS) * k ** FX_CURVE);
}

const floorGrid = (ms) => Math.floor(ms / GRID_MS) * GRID_MS;

/** Vòng sáng ở người nhận dành ra bao lâu (ms) ở cuối hiệu ứng. */
export const ringMsFor = (durationMs) => Math.round(clamp(durationMs * 0.14, 80, 260));

/** Mọi chip phải chạm đích trước mốc này (ms), để vòng sáng cuối còn chỗ trong tổng thời gian. */
export const landByMs = (durationMs) => durationMs - ringMsFor(durationMs);

/** Một chip bay hết đường mất bao lâu (ms): 256 (hiệu ứng 0,5 giây) -> 640 (hiệu ứng 2 giây). */
export function flightMsFor(durationMs) {
  return floorGrid(Math.min(clamp(durationMs * 0.4, 260, 640), landByMs(durationMs) * 0.8));
}

/** Chia `total` cho các phần theo tỉ lệ `weights`, tổng đúng bằng `total` (phần dư chia theo số lẻ lớn nhất). */
function allocate(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((s, v) => s + v, 0);
  raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .forEach(({ i }) => {
      if (left > 0) {
        out[i] += 1;
        left -= 1;
      }
    });
  return out;
}

/**
 * Chia `count` chip của một luồng thành các ĐỢT: số đợt ngẫu nhiên, số chip mỗi đợt ngẫu nhiên (≥ 1), tổng đúng bằng `count`.
 * Ví dụ 35 chip có thể ra [3, 5, 8, 4, 9, 6] (6 đợt) hay [11, 7, 17] (3 đợt). Trung bình mỗi đợt 4–8 chip, mỗi đợt lệch ±55% so với trung bình.
 */
export function planWaves(count, rng = Math.random) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return [];
  if (n === 1) return [1];
  const avg = 4 + Math.floor(rng() * 5); // 4..8
  const waves = clamp(Math.round(n / avg), 1, Math.min(n, 16));
  if (waves === 1) return n === 2 && rng() < 0.5 ? [1, 1] : [n];
  const weights = Array.from({ length: waves }, () => 0.45 + rng() * 1.1);
  return allocate(n - waves, weights).map((v) => v + 1);
}

function capFlows(flows) {
  flows.forEach((f) => {
    f.count = Math.min(f.count, MAX_CHIPS_PER_FLOW);
  });
  const total = flows.reduce((s, f) => s + f.count, 0);
  if (total > MAX_CHIPS_TOTAL) {
    const k = MAX_CHIPS_TOTAL / total;
    flows.forEach((f) => {
      f.count = Math.max(1, Math.floor(f.count * k));
    });
  }
  return flows;
}

/**
 * deltas: { [seatId]: số chip thay đổi }. ctx: { cost, paymentMode } (state.config) để quy ra "đơn vị chip".
 * Trả về mảng { from, to, count, amount }: from/to là id ghế hoặc 'table' (giữa bàn) khi chỉ có người được hoặc chỉ có người mất;
 * `amount` là số TIỀN của luồng (chia đều cho các chip của luồng khi chạy lịch tiền).
 * Mỗi người thua gửi ĐÚNG số đơn vị mình mất; nhiều người thắng thì chia theo phần ăn của từng người. Không biết `cost`
 * (Backend quá cũ không gửi config) thì dự phòng: số chip tỉ lệ với số tiền, từ 3 tới 10.
 */
export function planCoinFlows(deltas, { cost = 0, paymentMode = 'count_cards' } = {}) {
  const entries = Object.entries(deltas || {})
    .map(([id, d]) => ({ id, d: Number(d) }))
    .filter((e) => e.d !== 0 && Number.isFinite(e.d));
  const winners = entries.filter((e) => e.d > 0);
  const losers = entries.filter((e) => e.d < 0);
  const stake = Number(cost);
  const perStake = CHIPS_PER_STAKE[paymentMode] ?? CHIPS_PER_STAKE.count_cards;
  const maxAbs = Math.max(1, ...entries.map((e) => Math.abs(e.d)));
  const chipsFor = (amount) =>
    stake > 0
      ? Math.max(1, Math.round((Math.abs(amount) / stake) * perStake))
      : clamp(Math.round((Math.abs(amount) / maxAbs) * 10), 3, 10);

  const flows = [];
  if (winners.length && losers.length) {
    losers.forEach((l) => {
      const total = chipsFor(l.d);
      const shares = allocate(total, winners.map((w) => w.d));
      winners.forEach((w, i) => {
        if (shares[i] > 0) flows.push({ from: l.id, to: w.id, count: shares[i], amount: (Math.abs(l.d) * shares[i]) / total });
      });
    });
  } else if (winners.length) {
    winners.forEach((w) => flows.push({ from: 'table', to: w.id, count: chipsFor(w.d), amount: w.d }));
  } else {
    losers.forEach((l) => flows.push({ from: l.id, to: 'table', count: chipsFor(l.d), amount: Math.abs(l.d) }));
  }
  return capFlows(flows);
}

/** Cỡ đồng chip (px): theo cỡ avatar, sàn 24px, trần 38px. */
export function chipSizeFor(avatarSize) {
  return Math.round(clamp((Number(avatarSize) || 0) * 0.6, 24, 38));
}

// ---------------------------------------------------------------------------------------------------------------------
// HÌNH HỌC MỘT CHUYẾN BAY (hàm thuần, không đụng DOM)
//
// Chip đi dọc đường thẳng nối TÂM hai avatar (quãng đường s từ 0 tới len) với tốc độ gần như đều. Lệch ngang so với đường thẳng:
//     lat(s) = làn × ts(s) × te(s) + cung(s)
// trong đó ts / te đi từ 0 tới 1 trong vùng avatar xuất phát / đích (mọi làn chụm về tâm avatar) nên ở giữa đường các làn song song
// cách đều nhau; `cung` là độ cong CHUNG của cả luồng. Điểm xuất phát / đích hơi lệch ngẫu nhiên trong lòng avatar (nhìn tự nhiên hơn).
// ---------------------------------------------------------------------------------------------------------------------
const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Vị trí tâm chip `c` tại thời điểm chuẩn hoá u∈[0,1] của chuyến bay. Trả thêm:
 *   z  = mã vùng avatar (0 = giữa đường): chip cách tâm avatar xuất phát / đích chưa tới (bán kính vùng + 1 đường kính chip);
 *   zi = 1 nếu chip còn nằm TRONG vùng avatar (bán kính avatar + 1 đường kính chip), 0 nếu mới chỉ ở vành ngoài.
 * Hai chip được phép chồng nhau khi cùng mã vùng và ít nhất một chip còn trong vùng avatar (chip đang "chui ra" khỏi / "đáp xuống" avatar).
 */
export function chipPoint(c, u) {
  const g = c.g;
  const uu = clamp(u, 0, 1);
  const s = g.len * (uu - (EASE_K * Math.sin(2 * Math.PI * uu)) / (2 * Math.PI));
  const ts = smooth(clamp(s / g.tzs, 0, 1));
  const te = smooth(clamp((g.len - s) / g.tze, 0, 1));
  const lat = c.lane * ts * te + g.bow * Math.sin((Math.PI * s) / g.len);
  const ja = 1 - ts;
  const jb = 1 - te;
  const x = g.ax + g.dx * s + g.nx * lat + c.jax * ja + c.jbx * jb;
  const y = g.ay + g.dy * s + g.ny * lat + c.jay * ja + c.jby * jb;
  const ds = Math.hypot(x - g.ax, y - g.ay);
  if (ds < g.zsOut) return { x, y, z: g.zoneS, zi: ds < g.zs ? 1 : 0 };
  const de = Math.hypot(x - g.bx, y - g.by);
  if (de < g.zeOut) return { x, y, z: g.zoneE, zi: de < g.ze ? 1 : 0 };
  return { x, y, z: 0, zi: 0 };
}

/** Khoảng cách từ điểm p đi theo hướng (vx, vy) tới mép màn hình (đã chừa lề). */
function roomAlong(p, vx, vy, bounds, margin) {
  let m = Infinity;
  if (vx > 1e-9) m = Math.min(m, (bounds.w - margin - p.x) / vx);
  else if (vx < -1e-9) m = Math.min(m, (p.x - margin) / -vx);
  if (vy > 1e-9) m = Math.min(m, (bounds.h - margin - p.y) / vy);
  else if (vy < -1e-9) m = Math.min(m, (p.y - margin) / -vy);
  return Math.max(0, m);
}

function flowGeometry(flow, size, bounds, zoneIds, rng) {
  const { from, to } = flow;
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  if (len < 2) {
    dx = 0;
    dy = 1;
  } else {
    dx /= len;
    dy /= len;
  }
  const nx = -dy;
  const ny = dx;
  let zs = from.r + size * ZONE_PAD;
  let ze = to.r + size * ZONE_PAD;
  if (zs + ze > len * 0.7) {
    const k = (len * 0.7) / (zs + ze);
    zs *= k;
    ze *= k;
  }
  const margin = size * 0.6 + 4;
  const at = (s) => ({ x: from.x + dx * s, y: from.y + dy * s });
  const probes = [at(zs), at(len / 2), at(len - ze)];
  const room = (sgn) => Math.min(...probes.map((p) => roomAlong(p, sgn * nx, sgn * ny, bounds, margin)));
  // độ cong chung (nhỏ), không để vượt quá chỗ trống
  const rawBow = (rng() - 0.5) * 0.14 * len;
  const roomPos = room(1);
  const roomNeg = room(-1);
  const bow = clamp(rawBow, -roomNeg * 0.5, roomPos * 0.5);
  // làn: bội số của khoảng cách tối thiểu; tổng lệch ngang tại giữa đường = làn + cung phải nằm trong màn hình
  const step = size * CLEARANCE;
  const maxPos = Math.min(MAX_SIDE_LANES, Math.floor(Math.max(0, roomPos - bow) / step));
  const maxNeg = Math.min(MAX_SIDE_LANES, Math.floor(Math.max(0, roomNeg + bow) / step));
  const lanes = [];
  for (let i = -maxNeg; i <= maxPos; i++) lanes.push(i * step);
  return {
    ax: from.x,
    ay: from.y,
    bx: to.x,
    by: to.y,
    dx,
    dy,
    nx,
    ny,
    len,
    zs,
    ze,
    zsOut: zs + size,
    zeOut: ze + size,
    tzs: Math.max(1, zs * TAPER),
    tze: Math.max(1, ze * TAPER),
    bow,
    lanes,
    zoneS: zoneIds('S', from.key),
    zoneE: zoneIds('E', to.key),
    fromR: from.r,
    toR: to.r,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// XẾP LỊCH BAY
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Xếp lịch bay cho TẤT CẢ chip của một lần đổi số dư.
 *  - flows: [{ from: { x, y, r, key }, to: { x, y, r, key }, count }] (x, y = tâm avatar; r = bán kính avatar; key = tên ghế / 'table')
 *  - size: đường kính chip (px); durationMs: tổng thời gian hiệu ứng (fxDurationMs); bounds: { w, h } của màn hình
 * Mỗi luồng chia chip thành các đợt ngẫu nhiên (planWaves); các đợt rải ngẫu nhiên trong thời gian cho phép, đợt sớm nhất bắt đầu ở 0 ms và
 * đợt muộn nhất chạm đích đúng mốc landByMs. Mỗi chip được gán một làn (đợt bay thành một bó làn liền nhau) và, nếu cần, trễ thêm vài chục ms,
 * sao cho khoảng cách tâm với MỌI chip khác luôn ≥ CLEARANCE × size ở bất kỳ thời điểm nào (kiểm tra chính xác cả giữa hai mốc thời gian).
 * Trả về { chips, waves, flightMs, dropped, ... }: chip = { flow, wave, start, flightMs, lane, g, ... }; `dropped` = số chip không xếp được
 * (cực hiếm — chỉ khi quá đông chip mà không còn chỗ; chip đó bị BỎ chứ không vẽ đè).
 */
export function scheduleChips({ flows, size, durationMs, bounds = { w: 800, h: 400 }, rng = Math.random, budgetMs = PLAN_BUDGET_MS }) {
  const D = durationMs;
  const minDist = size * CLEARANCE;
  const min2 = minDist * minDist;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();

  const zoneIds = new Map();
  const zoneId = (kind, key) => {
    const k = `${kind}:${key}`;
    if (!zoneIds.has(k)) zoneIds.set(k, zoneIds.size + 1);
    return zoneIds.get(k);
  };
  const geo = flows.map((flow) => flowGeometry(flow, size, bounds, zoneId, rng));

  // Thời gian một chip bay (T): ít chip thì bay thong thả (flightMsFor); đông chip thì bay nhanh hơn để kịp "trả" hết trong thời gian cho phép
  // mà vẫn không đè nhau — một làn chứa được (cửa sổ xuất phát) / (khoảng cách tối thiểu / tốc độ) chip, và chỉ khoảng PARALLEL chip xuất phát song song được.
  const launchWindow = (t) => Math.max(0, floorGrid(landByMs(D) - t));
  const capacityOf = (g, t) => Math.min(g.lanes.length, PARALLEL) * (Math.floor(launchWindow(t) / ((SPEED_SAFETY * minDist * t) / g.len)) + 1);
  let T = flightMsFor(D);
  while (T > MIN_FLIGHT_MS && flows.some((f, i) => f.count > capacityOf(geo[i], T))) T -= GRID_MS;
  // Nhiều luồng cùng lúc dùng chung không gian bay: tổng chip càng đông thì mỗi chip càng phải bay nhanh để còn chỗ cho nhau.
  const totalChips = flows.reduce((sum, f) => sum + f.count, 0);
  if (totalChips > CROWD_AT) T = Math.max(MIN_FLIGHT_MS, floorGrid(T * Math.max(CROWD_MIN, CROWD_AT / totalChips)));
  const N = Math.round(T / SAMPLE_MS); // số khoảng lấy mẫu trong một chuyến bay
  const lastStartK = Math.floor(launchWindow(T) / SAMPLE_MS); // chip xuất phát muộn nhất ở mốc này (đơn vị: SAMPLE_MS)

  // các đợt của từng luồng
  const waves = []; // { flow, size, g, f, center }
  flows.forEach((flow, fi) => {
    const lanesN = geo[fi].lanes.length;
    planWaves(flow.count, rng).forEach((k) => {
      // g: chip kế tiếp trong đợt xuất phát trễ g mốc (8–16 ms)
      waves.push({ flow: fi, size: k, g: 4 + 2 * Math.floor(rng() * 5), f: rng(), center: Math.floor(rng() * lanesN) });
    });
  });
  const multi = waves.length > 1;
  const maxBurst = Math.max(0, Math.floor(lastStartK * 0.3));
  waves.forEach((w) => {
    if ((w.size - 1) * w.g > maxBurst) w.g = Math.max(0, Math.floor(maxBurst / Math.max(1, w.size - 1)));
    w.burst = (w.size - 1) * w.g;
  });
  if (multi) {
    let lo = 0;
    let hi = 0;
    waves.forEach((w, i) => {
      if (w.f < waves[lo].f) lo = i;
      if (w.f > waves[hi].f) hi = i;
    });
    waves[lo].f = 0; // đợt sớm nhất bắt đầu ngay ở 0 ms
    waves[hi].f = 1; // đợt muộn nhất kết thúc đúng mốc chạm đích cuối cùng
  }
  waves.forEach((w) => {
    w.startK = multi ? Math.round(w.f * Math.max(0, lastStartK - w.burst)) : 0;
  });

  // hàng đợi chip theo thứ tự xuất phát dự kiến
  const queue = [];
  waves.forEach((w, wi) => {
    for (let j = 0; j < w.size; j++) {
      const flow = flows[w.flow];
      const jitter = (r) => {
        const a = rng() * Math.PI * 2;
        const rr = r * 0.4 * Math.sqrt(rng());
        return [Math.cos(a) * rr, Math.sin(a) * rr];
      };
      const [jax, jay] = jitter(flow.from.r);
      const [jbx, jby] = jitter(flow.to.r);
      queue.push({ flow: w.flow, wave: wi, plannedK: Math.min(lastStartK, w.startK + j * w.g), jax, jay, jbx, jby, noise: rng() });
    }
  });
  queue.sort((a, b) => a.plannedK - b.plannedK || a.flow - b.flow || a.noise - b.noise);

  // lưới chiếm chỗ: occ[k] = các chip đang bay ở mốc k
  const slots = lastStartK + N + 4;
  const occ = Array.from({ length: slots }, () => []);
  const chips = [];
  let dropped = 0;

  // vị trí các mốc của một chip (theo làn): px/py/pz/pi[0..N]
  const samplesOf = (c) => {
    const px = new Float64Array(N + 1);
    const py = new Float64Array(N + 1);
    const pz = new Int16Array(N + 1);
    const pi = new Uint8Array(N + 1);
    for (let k = 0; k <= N; k++) {
      const p = chipPoint(c, k / N);
      px[k] = p.x;
      py[k] = p.y;
      pz[k] = p.z;
      pi[k] = p.zi;
    }
    return { px, py, pz, pi };
  };

  // Hai chip (tại cùng khoảng thời gian [k, k+1]) có đè nhau không? Chuyển động giữa hai mốc coi là thẳng đều -> tìm khoảng cách gần nhất.
  const clash = (a, ka, b, kb) => {
    const za0 = a.pz[ka];
    if (za0 !== 0 && za0 === b.pz[kb] && (a.pi[ka] | b.pi[kb])) return false;
    const za1 = a.pz[ka + 1];
    if (za1 !== 0 && za1 === b.pz[kb + 1] && (a.pi[ka + 1] | b.pi[kb + 1])) return false;
    const r0x = a.px[ka] - b.px[kb];
    const r0y = a.py[ka] - b.py[kb];
    const drx = a.px[ka + 1] - b.px[kb + 1] - r0x;
    const dry = a.py[ka + 1] - b.py[kb + 1] - r0y;
    const den = drx * drx + dry * dry;
    const tau = den > 1e-9 ? clamp(-(r0x * drx + r0y * dry) / den, 0, 1) : 0;
    const mx = r0x + drx * tau;
    const my = r0y + dry * tau;
    return mx * mx + my * my < min2;
  };
  // Kiểm tra một mốc k của ứng viên với mọi chip đang bay cùng lúc.
  const fitsAt = (cand, startK, k) => {
    const list = occ[startK + k];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.startK + N < startK + k + 1) continue; // o đã hạ cánh trước mốc kế
      if (clash(cand, k, o, startK + k - o.startK)) return false;
    }
    return true;
  };
  // Hai vòng: vòng thưa (cách COARSE mốc) loại nhanh phần lớn ứng viên hỏng, vòng dày mới kiểm tra từng mốc cho ứng viên còn lại.
  const COARSE = 5;
  const fits = (cand, startK) => {
    for (let k = 0; k < N; k += COARSE) if (!fitsAt(cand, startK, k)) return false;
    for (let k = 0; k < N; k++) if (k % COARSE !== 0 && !fitsAt(cand, startK, k)) return false;
    return true;
  };

  // thời điểm thử dời giờ xuất phát (đơn vị mốc SAMPLE_MS): dày lúc đầu, thưa dần, lần lượt trễ hơn rồi sớm hơn giờ dự kiến
  const SHIFTS = [0];
  [1, 2, 3, 4, 6, 8, 10, 13, 16, 20, 25, 31, 38, 46, 56, 68, 82, 100, 120, 145, 175, 210, 250, 300, 360].forEach((v) => {
    SHIFTS.push(v * (START_MS / SAMPLE_MS), -v * (START_MS / SAMPLE_MS));
  });

  for (let qi = 0; qi < queue.length; qi += 1) {
    const item = queue[qi];
    if (now() - t0 > budgetMs) {
      dropped += queue.length - qi;
      break;
    }
    const g = geo[item.flow];
    const center = waves[item.wave].center;
    const order = g.lanes
      .map((l, i) => ({ i, key: Math.abs(i - center) + rng() * 0.9 }))
      .sort((a, b) => a.key - b.key)
      .map((e) => e.i);
    const base = { flow: item.flow, wave: item.wave, flightMs: T, g, jax: item.jax, jay: item.jay, jbx: item.jbx, jby: item.jby };
    const cands = order.map((li) => {
      const c = { ...base, lane: g.lanes[li] };
      return { c, ...samplesOf(c) };
    });
    let placed = false;
    for (let si = 0; si < SHIFTS.length && !placed; si += 1) {
      const startK = item.plannedK + SHIFTS[si];
      if (startK > lastStartK || startK < 0) continue;
      for (let ci = 0; ci < cands.length; ci += 1) {
        if (fits(cands[ci], startK)) {
          const cand = cands[ci];
          const chip = { ...cand.c, start: startK * SAMPLE_MS };
          const rec = { startK, px: cand.px, py: cand.py, pz: cand.pz, pi: cand.pi };
          for (let k = 0; k <= N; k++) occ[startK + k].push(rec);
          chips.push(chip);
          placed = true;
          break;
        }
      }
    }
    if (!placed) dropped += 1;
  }

  chips.sort((a, b) => a.start - b.start);
  const waveList = waves
    .map((w, wi) => {
      const mine = chips.filter((c) => c.wave === wi);
      if (mine.length === 0) return null;
      return {
        flow: w.flow,
        size: mine.length,
        start: Math.min(...mine.map((c) => c.start)),
        arrive: Math.max(...mine.map((c) => c.start + c.flightMs)),
      };
    })
    .filter(Boolean);
  return { chips, waves: waveList, flightMs: T, durationMs: D, landBy: landByMs(D), ringMs: ringMsFor(D), dropped, size };
}

/**
 * Kiểm tra ĐỘC LẬP một lịch bay, bằng cách lấy mẫu dày (mỗi `stepMs`) vị trí thật của mọi chip: đếm số mốc mà hai chip đè nhau (khoảng
 * cách tâm < 1 đường kính chip) GIỮA ĐƯỜNG. Chồng nhau ở avatar xuất phát / avatar đích (kể cả thêm nửa đường kính chip bên ngoài avatar)
 * không tính. 0 nghĩa là đạt. Dùng cho test.
 */
export function countMidPathOverlaps(plan, stepMs = 2) {
  const lim2 = plan.size * plan.size;
  const pad = plan.size * 0.5;
  const alive = (t) => plan.chips.filter((c) => t >= c.start && t <= c.start + c.flightMs);
  // Mỗi chip có thể đồng thời thuộc vùng avatar xuất phát VÀ vùng avatar đích (đường ngắn thì hai vùng chạm nhau). Ghi lại cả hai.
  // Cùng định nghĩa với chipPoint nhưng nới thêm nửa đường kính chip (dung sai khi vẽ bằng các khung hình rời rạc).
  const zonesOf = (c, p) => {
    const g = c.g;
    const out = [];
    const ds = Math.hypot(p.x - g.ax, p.y - g.ay);
    if (ds < g.zsOut + pad) out.push({ z: g.zoneS, i: ds < g.zs + pad });
    const de = Math.hypot(p.x - g.bx, p.y - g.by);
    if (de < g.zeOut + pad) out.push({ z: g.zoneE, i: de < g.ze + pad });
    return out;
  };
  const shareZone = (za, zb) => za.some((a) => zb.some((b) => a.z === b.z && (a.i || b.i)));
  let bad = 0;
  const end = plan.chips.length ? Math.max(...plan.chips.map((c) => c.start + c.flightMs)) : 0;
  for (let t = 0; t <= end; t += stepMs) {
    const list = alive(t).map((c) => {
      const p = chipPoint(c, (t - c.start) / c.flightMs);
      return { x: p.x, y: p.y, zs: zonesOf(c, p) };
    });
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const dx = list[i].x - list[j].x;
        const dy = list[i].y - list[j].y;
        if (dx * dx + dy * dy < lim2 && !shareZone(list[i].zs, list[j].zs)) bad += 1;
      }
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------------------------------------------------
// LỊCH TIỀN (hàm thuần): số dư hiển thị chạy dần theo chip
// ---------------------------------------------------------------------------------------------------------------------

/** Chip chạm avatar đích ở thời điểm này của chuyến bay (≈ lúc chip vào tới avatar). */
const LAND_AT = 0.92;

/**
 * Lịch cộng / trừ tiền của từng ghế. `flows` = các luồng (theo thứ tự `chip.flow`) kèm { from, to, amount }; `deltas` = { ghế: tổng thay đổi }.
 * Người trả bị trừ khi chip RỜI avatar (start), người nhận được cộng khi chip CHẠM avatar (start + LAND_AT × bay). Mỗi chip mang một phần tiền
 * của luồng (chia đều theo số chip đã xếp được); rồi chuẩn hoá để tổng các phần của mỗi ghế đúng bằng `deltas[ghế]`.
 * Trả về { [ghế]: [{ t, amount }] } (amount có dấu, t tăng dần). Ghế không có chip nào -> một mục ở cuối hiệu ứng.
 */
export function buildMoneyEvents(plan, flows, deltas, durationMs = plan?.durationMs ?? 0) {
  const placed = new Map();
  (plan?.chips || []).forEach((c) => placed.set(c.flow, (placed.get(c.flow) || 0) + 1));
  const raw = {};
  const push = (id, t, w) => {
    (raw[id] = raw[id] || []).push({ t, w });
  };
  (plan?.chips || []).forEach((c) => {
    const f = flows[c.flow];
    const w = f.amount / placed.get(c.flow);
    if (f.from !== 'table') push(f.from, c.start, w);
    if (f.to !== 'table') push(f.to, c.start + c.flightMs * LAND_AT, w);
  });
  const out = {};
  Object.entries(deltas || {}).forEach(([id, total]) => {
    const list = raw[id];
    const delta = Number(total);
    if (!Number.isFinite(delta) || delta === 0) return;
    if (!list || list.length === 0) {
      out[id] = [{ t: durationMs, amount: delta }];
      return;
    }
    const sum = list.reduce((s, e) => s + e.w, 0);
    list.sort((a, b) => a.t - b.t);
    let acc = 0;
    out[id] = list.map((e, i) => {
      const amount = i === list.length - 1 ? delta - acc : (delta * e.w) / sum;
      acc += amount;
      return { t: e.t, amount };
    });
  });
  return out;
}

/** Số tiền CÒN CHƯA áp dụng (có dấu) của mỗi ghế tại thời điểm t (ms) của hiệu ứng: hiển thị = số dư thật − phần này. Hết hiệu ứng -> {}. */
export function pendingAt(events, deltas, t, durationMs = Infinity) {
  const out = {};
  if (t >= durationMs) return out;
  Object.entries(deltas || {}).forEach(([id, total]) => {
    const list = events?.[id];
    let left = Number(total) || 0;
    if (list) list.forEach((e) => {
      if (e.t <= t) left -= e.amount;
    });
    if (Math.abs(left) > 1e-9) out[id] = left;
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// VẼ (DOM)
// ---------------------------------------------------------------------------------------------------------------------

function centerOf(anchor) {
  const el =
    anchor === 'table'
      ? document.querySelector('.tl-table__center')
      : document.querySelector(`[data-avatar="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, r.height), table: anchor === 'table' };
}

function pulse(anchor, kind, duration) {
  const el = anchor === 'table' ? null : document.querySelector(`[data-avatar="${anchor}"]`);
  if (!el || !el.animate || duration < 30) return;
  const c = kind === 'gain' ? '52, 211, 153' : '248, 113, 113';
  el.animate(
    [
      { boxShadow: `0 0 0 0 rgba(${c}, 0.9)` },
      { boxShadow: `0 0 0 12px rgba(${c}, 0)`, offset: 1 },
    ],
    { duration, easing: 'ease-out' }
  );
}

/** Vẽ một chip theo lịch: các khung hình lấy thẳng từ chipPoint nên khớp đúng phép kiểm tra không đè nhau. */
function flyPlanned(layer, c, size) {
  const el = document.createElement('div');
  el.className = 'tl-coin';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.opacity = '0';
  layer.appendChild(el);
  const frames = [];
  for (let i = 0; i <= KEY_STEPS; i++) {
    const u = i / KEY_STEPS;
    const p = chipPoint(c, u);
    const scale = u < 0.1 ? 0.6 + (0.4 * u) / 0.1 : u > 0.9 ? 1 - (0.5 * (u - 0.9)) / 0.1 : 1;
    const opacity = u < 0.06 ? u / 0.06 : u > 0.93 ? Math.max(0, (1 - u) / 0.07) : 1;
    frames.push({
      transform: `translate(${(p.x - size / 2).toFixed(1)}px, ${(p.y - size / 2).toFixed(1)}px) scale(${scale.toFixed(3)})`,
      opacity,
      offset: u,
    });
  }
  const anim = el.animate(frames, { duration: c.flightMs, delay: c.start, easing: 'linear', fill: 'both' });
  const done = anim.finished.catch(() => undefined).then(() => el.remove());
  return { anim, done, el };
}

/** Xu bay thẳng (dùng ngoài bàn chơi: thưởng vốn hằng ngày, đổi mã quà tặng -> ô số dư ở menu). */
function flyCoin(layer, from, to, { delay, duration, size, arc }) {
  const el = document.createElement('div');
  el.className = 'tl-coin';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.opacity = '0';
  layer.appendChild(el);
  const pos = (p, dx = 0, dy = 0, s = 1) => `translate(${(p.x - size / 2 + dx).toFixed(1)}px, ${(p.y - size / 2 + dy).toFixed(1)}px) scale(${s})`;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const anim = el.animate(
    [
      { transform: pos(from, 0, 0, 0.5), opacity: 0 },
      { transform: pos(from, 0, 0, 1), opacity: 1, offset: 0.12 },
      { transform: pos({ x: mx, y: my }, arc.x, arc.y, 1.1), opacity: 1, offset: 0.55 },
      { transform: pos(to, 0, 0, 0.8), opacity: 1, offset: 0.92 },
      { transform: pos(to, 0, 0, 0.4), opacity: 0 },
    ],
    { duration, delay, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'both' }
  );
  const done = anim.finished.catch(() => undefined).then(() => el.remove());
  return { anim, done };
}

/**
 * Chạy hiệu ứng cho một lần đổi số dư. Trả về { done, cancel, duration, totalMs, flows, plan, money, deltas }.
 * `ctx` = { cost, paymentMode } lấy từ state.config. Chỉ gọi khi có DOM (GameScreen); giảm chuyển động -> chỉ nháy viền, không bay chip
 * (và `money` = null: số dư đổi ngay như bình thường).
 * Thời gian cả hiệu ứng = fxDurationMs(số chip của luồng đông nhất): 0,5 giây (ít chip) tới 2 giây (từ 100 chip).
 * `money` = lịch tiền theo từng chip (xem buildMoneyEvents); nơi hiển thị số dư dùng pendingAt(money, deltas, thời gian đã trôi, totalMs).
 * Kế hoạch bay (plan) được gắn vào `layer.__chipFx` để test đọc.
 */
export function runChipFx(layer, deltas, ctx = {}) {
  const flows = planCoinFlows(deltas, ctx);
  const maxFlow = flows.reduce((m, f) => Math.max(m, f.count), 0);
  const D = fxDurationMs(maxFlow);
  const running = [];
  const finish = [];
  const reduced = prefersReducedMotion();
  const ring = ringMsFor(D);

  const geos = flows.map((f) => ({ flow: f, from: centerOf(f.from), to: centerOf(f.to) })).filter((g) => g.from && g.to);
  const avatarSizes = geos.flatMap((g) => [g.from, g.to]).filter((p) => !p.table).map((p) => p.size);
  const size = chipSizeFor(avatarSizes.length ? Math.min(...avatarSizes) : 0);
  const radiusOf = (p) => (p.table ? size * 0.6 : p.size / 2);
  const keyOf = (anchor) => String(anchor);

  let plan = null;
  let money = null;
  if (!reduced && layer && geos.length > 0) {
    plan = scheduleChips({
      flows: geos.map((g) => ({
        from: { x: g.from.x, y: g.from.y, r: radiusOf(g.from), key: keyOf(g.flow.from) },
        to: { x: g.to.x, y: g.to.y, r: radiusOf(g.to), key: keyOf(g.flow.to) },
        count: g.flow.count,
      })),
      size,
      durationMs: D,
      bounds: { w: window.innerWidth, h: window.innerHeight },
    });
    plan.chips.forEach((c) => {
      const f = flyPlanned(layer, c, size);
      running.push(f.anim);
      finish.push(f.done);
    });
    money = buildMoneyEvents(plan, geos.map((g) => g.flow), deltas, D);
    // Vòng sáng: người nhận nháy xanh mỗi khi một đợt chạm đích; người trả nháy đỏ ở đợt đầu tiên.
    const firstWaveOf = new Map();
    plan.waves.forEach((w) => {
      const g = geos[w.flow];
      const arrive = Math.round(w.arrive - plan.flightMs * 0.08);
      const t = setTimeout(() => pulse(g.flow.to, 'gain', Math.min(260, Math.max(60, D - arrive))), arrive);
      running.push({ cancel: () => clearTimeout(t) });
      const seen = firstWaveOf.get(w.flow);
      if (seen == null || w.start < seen) firstWaveOf.set(w.flow, w.start);
    });
    firstWaveOf.forEach((start, fi) => {
      const t = setTimeout(() => pulse(geos[fi].flow.from, 'loss', Math.min(220, D)), Math.round(start));
      running.push({ cancel: () => clearTimeout(t) });
    });
    layer.__chipFx = { plan, durationMs: D, size, flows, money };
  } else {
    // giảm chuyển động / thiếu phần tử: chỉ nháy viền một nhịp ngắn
    geos.forEach((g) => {
      pulse(g.flow.to, 'gain', ring);
      pulse(g.flow.from, 'loss', ring);
    });
  }
  const totalMs = reduced ? ring : D;
  finish.push(new Promise((res) => setTimeout(res, totalMs)));

  return {
    done: Promise.all(finish),
    cancel: () => {
      running.forEach((a) => a.cancel?.());
    },
    duration: totalMs,
    totalMs,
    flows,
    plan,
    money,
    deltas: { ...deltas },
  };
}

/**
 * Xu bay từ phần tử `fromEl` tới `toEl` (dùng ngoài bàn chơi: thưởng vốn hằng ngày, đổi mã quà tặng -> ô số
 * dư ở menu). Chạm đích thì nháy sáng `toEl`. Giảm chuyển động hoặc thiếu phần tử -> không làm gì.
 */
export function flyCoinsBetween(layer, fromEl, toEl, { count = 9, gain = true } = {}) {
  const none = { done: Promise.resolve(), cancel() {} };
  if (!layer || !fromEl || !toEl || prefersReducedMotion()) return none;
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, r.height) };
  };
  const from = rect(fromEl);
  const to = rect(toEl);
  const size = 20;
  const flights = [];
  for (let k = 0; k < count; k++) {
    const arc = { x: (Math.random() - 0.5) * 90, y: -30 - Math.random() * 50 };
    flights.push(flyCoin(layer, from, to, { delay: k * 85, duration: 820, size, arc }));
  }
  const rgb = gain ? '52, 211, 153' : '248, 113, 113';
  const glow = setTimeout(() => {
    toEl.animate?.(
      [
        { boxShadow: `0 0 0 0 rgba(${rgb}, 0.85)` },
        { boxShadow: `0 0 0 14px rgba(${rgb}, 0)`, offset: 1 },
      ],
      { duration: 1000, easing: 'ease-out' }
    );
  }, 600 + count * 85);
  return {
    done: Promise.all(flights.map((f) => f.done)),
    cancel: () => {
      clearTimeout(glow);
      flights.forEach((f) => f.anim.cancel());
    },
  };
}
