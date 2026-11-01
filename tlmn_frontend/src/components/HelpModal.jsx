import { useEffect, useMemo, useRef, useState } from 'react';
import guideSource from '../content/guide.md?raw';
import { Markdown, parseMarkdown, sectionsOf } from '../markdown';

/**
 * BẢNG HƯỚNG DẪN dạng cửa sổ NỔI (mở bằng nút tròn "?" ở góc trên bên phải, ở menu lẫn trong bàn chơi).
 *  - KHÔNG phủ nền tối và KHÔNG chặn thao tác phía sau: ván vẫn chạy, đồng hồ lượt vẫn đếm, bạn vẫn đánh
 *    bài được khi đang đọc. Đóng bằng nút ×, phím Esc hoặc bấm lại nút "?".
 *  - Có thanh nhảy nhanh tới từng mục (Tài khoản, Phòng chơi, Luật đánh, Tiền phạt...).
 *  - Nội dung lấy từ src/content/guide.md (sửa file đó là đổi hướng dẫn).
 *  - Khi tới lượt bạn mà bảng đang mở, GameScreen hiện thêm biển báo "Đã đến lượt bạn đánh bài!" nằm TRÊN bảng.
 */
export default function HelpModal({ open, onClose }) {
  const blocks = useMemo(() => parseMarkdown(guideSource), []);
  const sections = useMemo(() => sectionsOf(blocks), [blocks]);
  const bodyRef = useRef(null);
  const [active, setActive] = useState(sections[0]?.id || null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Đánh dấu mục đang đọc trên thanh nhảy nhanh theo vị trí cuộn.
  useEffect(() => {
    const body = bodyRef.current;
    if (!open || !body) return undefined;
    const onScroll = () => {
      let current = sections[0]?.id || null;
      sections.forEach((s) => {
        const el = body.querySelector(`#${CSS.escape(s.id)}`);
        if (el && el.offsetTop <= body.scrollTop + 24) current = s.id; // body là position:relative nên offsetTop tính từ đỉnh nội dung
      });
      setActive(current);
    };
    onScroll();
    body.addEventListener('scroll', onScroll, { passive: true });
    return () => body.removeEventListener('scroll', onScroll);
  }, [open, sections]);

  if (!open) return null;

  const jump = (id) => {
    const body = bodyRef.current;
    const el = body?.querySelector(`#${CSS.escape(id)}`);
    if (!body || !el) return;
    body.scrollTo({ top: Math.max(0, el.offsetTop - 4), behavior: 'smooth' });
  };

  return (
    <aside className="tl-help" role="dialog" aria-label="Hướng dẫn chơi" data-testid="help-modal">
      <header className="tl-help__head">
        <h2 className="tl-help__title">Hướng dẫn chơi</h2>
        <button type="button" className="tl-help__close" onClick={onClose} aria-label="Đóng hướng dẫn" data-testid="help-close">
          ×
        </button>
      </header>
      <nav className="tl-help__nav" aria-label="Các mục hướng dẫn">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`tl-help__chip ${active === s.id ? 'tl-help__chip--on' : ''}`}
            onClick={() => jump(s.id)}
          >
            {s.title}
          </button>
        ))}
      </nav>
      <div className="tl-help__body" ref={bodyRef} data-testid="help-body">
        <Markdown blocks={blocks} />
      </div>
    </aside>
  );
}
