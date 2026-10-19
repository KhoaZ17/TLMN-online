import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const OUTPUT = 192; // ảnh cuối cùng vuông 192x192 -> gọn (~10-25KB): avatar của mọi người nằm trong state, được tải mỗi giây
const MAX_ZOOM = 4;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Cắt ảnh đại diện: ảnh gốc (kể cả ảnh chữ nhật) hiện trong khung vuông, có vòng tròn
 * "khung avatar" ở giữa. Kéo để dời, cuộn chuột / thanh trượt / chụm 2 ngón để phóng to,
 * phím mũi tên để tinh chỉnh. Bấm "Dùng ảnh này" -> trả về data URL JPEG vuông 192px đúng
 * phần nằm trong vòng tròn.
 *
 * Trạng thái lưu theo "điểm ảnh ở tâm khung" (cx, cy — toạ độ trên ảnh gốc) và zoom (>= 1,
 * 1 = vừa phủ kín vòng tròn) nên đổi cỡ khung / xoay màn hình không làm lệch vùng cắt.
 */
export default function AvatarCropper({ file, onCancel, onApply }) {
  const viewRef = useRef(null);
  const imgRef = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const [src, setSrc] = useState(null);
  const [nat, setNat] = useState(null); // { w, h } kích thước gốc
  const [view, setView] = useState(240); // cạnh khung vuông (px)
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [error, setError] = useState(null);

  // Nạp ảnh từ File
  useEffect(() => {
    if (!file) return undefined;
    if (!/^image\//.test(file.type || '')) {
      setError('Tệp đã chọn không phải là ảnh.');
      return undefined;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Ảnh quá lớn (tối đa 12MB). Hãy chọn ảnh nhỏ hơn.');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      setNat({ w: probe.naturalWidth, h: probe.naturalHeight });
      setCenter({ x: probe.naturalWidth / 2, y: probe.naturalHeight / 2 });
      setZoom(1);
      setSrc(url);
    };
    probe.onerror = () => setError('Không đọc được ảnh này. Hãy thử ảnh JPG hoặc PNG khác.');
    probe.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Đo cạnh khung (CSS quyết định, co theo màn hình)
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return undefined;
    const measure = () => setView(el.clientWidth || 240);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [src]);

  const circle = view * 0.8; // đường kính vòng tròn cắt
  const base = nat ? circle / Math.min(nat.w, nat.h) : 1; // tỉ lệ để ảnh vừa phủ kín vòng tròn
  const scale = base * zoom;

  const clampCenter = useCallback(
    (c, z = zoom) => {
      if (!nat) return c;
      const half = circle / (2 * base * z);
      return { x: clamp(c.x, half, nat.w - half), y: clamp(c.y, half, nat.h - half) };
    },
    [nat, circle, base, zoom]
  );

  const changeZoom = useCallback(
    (z) => {
      const next = clamp(z, 1, MAX_ZOOM);
      setZoom(next);
      setCenter((c) => clampCenter(c, next));
    },
    [clampCenter]
  );

  // Cuộn chuột để zoom (cần listener không-passive để chặn cuộn trang)
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      changeZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [changeZoom, zoom, src]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 0) changeZoom(pinch.current.zoom * (d / pinch.current.dist));
      return;
    }
    setCenter((c) => clampCenter({ x: c.x - (cur.x - prev.x) / scale, y: c.y - (cur.y - prev.y) / scale }));
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onKeyDown = (e) => {
    const step = 12 / scale;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      setCenter((c) => clampCenter({ x: c.x + moves[e.key][0], y: c.y + moves[e.key][1] }));
    } else if (e.key === '+' || e.key === '=') changeZoom(zoom * 1.1);
    else if (e.key === '-') changeZoom(zoom / 1.1);
  };

  const apply = () => {
    const img = imgRef.current;
    if (!img || !nat) return;
    const half = circle / (2 * scale); // nửa cạnh vùng cắt, tính theo điểm ảnh gốc
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    ctx.imageSmoothingQuality = 'high';
    const c = clampCenter(center);
    ctx.drawImage(img, c.x - half, c.y - half, half * 2, half * 2, 0, 0, OUTPUT, OUTPUT);
    let quality = 0.9;
    let data = canvas.toDataURL('image/jpeg', quality);
    while (data.length > 60_000 && quality > 0.5) {
      quality -= 0.1;
      data = canvas.toDataURL('image/jpeg', quality);
    }
    onApply(data);
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), onCancel());
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const imgStyle = useMemo(() => {
    if (!nat) return { display: 'none' };
    const c = clampCenter(center);
    return {
      width: nat.w * scale,
      height: nat.h * scale,
      transform: `translate(${view / 2 - c.x * scale}px, ${view / 2 - c.y * scale}px)`,
    };
  }, [nat, scale, view, center, clampCenter]);

  return (
    <div className="tl-modal tl-modal--top" role="dialog" aria-modal="true" aria-label="Cắt ảnh đại diện" onMouseDown={(e) => e.stopPropagation()}>
      <div className="tl-card tl-crop" data-testid="avatar-cropper">
        <h2 className="tl-card__title">Chọn vùng ảnh hiển thị</h2>
        <p className="tl-card__hint">Kéo để dời ảnh, cuộn chuột hoặc kéo thanh trượt để phóng to — phần trong vòng tròn sẽ là avatar.</p>

        {error ? (
          <p className="tl-redeem__msg tl-redeem__msg--error mt-4" role="alert">
            {error}
          </p>
        ) : (
          <div
            ref={viewRef}
            className="tl-crop__view"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            aria-label="Vùng chỉnh ảnh. Dùng phím mũi tên để dời, dấu cộng trừ để phóng to."
            data-testid="crop-view"
          >
            {src && <img ref={imgRef} className="tl-crop__img" src={src} alt="" draggable={false} style={imgStyle} />}
            <div className="tl-crop__mask" aria-hidden="true" />
            <div className="tl-crop__ring" aria-hidden="true" />
          </div>
        )}

        {!error && (
          <label className="tl-crop__zoom">
            <span aria-hidden="true">−</span>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => changeZoom(Number(e.target.value))}
              aria-label="Phóng to / thu nhỏ"
              data-testid="crop-zoom"
            />
            <span aria-hidden="true">+</span>
          </label>
        )}

        <div className="tl-card__actions">
          <button type="button" onClick={onCancel} className="tl-btn tl-btn--ghost">
            Huỷ
          </button>
          <button type="button" onClick={apply} disabled={!src || Boolean(error)} className="tl-btn tl-btn--primary" data-testid="crop-apply">
            Dùng ảnh này
          </button>
        </div>
      </div>
    </div>
  );
}
