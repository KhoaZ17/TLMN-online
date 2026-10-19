import { createElement } from 'react';

// Bộ hiển thị Markdown NHỎ cho bảng hướng dẫn (không thêm thư viện, không dùng dangerouslySetInnerHTML nên
// nội dung luôn an toàn). Hỗ trợ đúng những gì README dùng: tiêu đề #..####, đoạn văn, danh sách (* - 1.),
// trích dẫn (>), đường kẻ (---), khối mã (```), bảng (có thể KHÔNG có dòng tiêu đề, căn lề :-: / -:), và
// trong dòng: **đậm**, *nghiêng*, `mã`, [liên kết](url).

// ---------------------------------------------------------------------------------------------- inline
const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/;
const LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

const safeHref = (url) => (/^(https?:|mailto:|#)/i.test(url) ? url : '#');

export function renderInline(text, keyPrefix = 'i') {
  const out = [];
  let rest = String(text ?? '');
  let n = 0;
  while (rest) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (m[1]) {
      out.push(createElement('code', { key }, token.slice(1, -1)));
    } else if (m[2]) {
      out.push(createElement('strong', { key }, renderInline(token.slice(2, -2), key)));
    } else if (m[3]) {
      out.push(createElement('em', { key }, renderInline(token.slice(1, -1), key)));
    } else {
      const link = LINK_RE.exec(token);
      out.push(
        createElement('a', { key, href: safeHref(link[2]), target: '_blank', rel: 'noreferrer noopener' }, link[1])
      );
    }
    rest = rest.slice(m.index + token.length);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- blocks
const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const LIST_RE = /^\s*([*-]|\d+[.)])\s+(.*)$/;
const FENCE_RE = /^\s*```/;

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

const isTableSep = (line) => isTableRow(line) && splitRow(line).every((c) => /^:?-+:?$/.test(c));

const alignOf = (cell) => (cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');

/** "1. Tài khoản và chip" -> "tai-khoan-va-chip" (dùng làm id để nhảy tới mục). */
export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const startsBlock = (line) =>
  !line.trim() ||
  FENCE_RE.test(line) ||
  HEADING_RE.test(line) ||
  HR_RE.test(line) ||
  LIST_RE.test(line) ||
  /^\s*>/.test(line) ||
  isTableRow(line);

/** Tách văn bản Markdown thành danh sách khối. */
export function parseMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (FENCE_RE.test(line)) {
      const buf = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i])) buf.push(lines[i++]);
      i += 1;
      blocks.push({ type: 'code', text: buf.join('\n') });
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      const text = h[2].trim();
      blocks.push({ type: 'heading', level: h[1].length, text, id: slugify(text) });
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map(alignOf);
      const rows = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push({ type: 'table', head: head.every((c) => c === '') ? null : head, aligns, rows });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', text: buf.join(' ').trim() });
      continue;
    }

    const li = LIST_RE.exec(line);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items = [];
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i]);
        if (m && /\d/.test(m[1]) === ordered && !HR_RE.test(lines[i])) {
          items.push(m[2].trim());
          i += 1;
        } else if (items.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !LIST_RE.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`; // dòng nối tiếp (thụt lề)
          i += 1;
        } else break;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }

    const buf = [line.trim()];
    i += 1;
    while (i < lines.length && !startsBlock(lines[i])) buf.push(lines[i++].trim());
    blocks.push({ type: 'p', text: buf.join(' ') });
  }
  return blocks;
}

/** Các mục cấp 2 (##) để làm thanh nhảy nhanh: [{ id, title }]. Bỏ số thứ tự đầu tên mục. */
export function sectionsOf(blocks) {
  return blocks
    .filter((b) => b.type === 'heading' && b.level === 2)
    .map((b) => ({ id: b.id, title: b.text.replace(/^\d+[.)]\s*/, '') }));
}

// ---------------------------------------------------------------------------------------------- render
export function Markdown({ blocks, source }) {
  const list = blocks || parseMarkdown(source);
  return (
    <div className="tl-md">
      {list.map((b, k) => {
        const key = `b${k}`;
        switch (b.type) {
          case 'heading':
            return createElement(`h${Math.min(4, b.level + 1)}`, { key, id: b.id, className: `tl-md__h tl-md__h${b.level}` }, renderInline(b.text, key));
          case 'p':
            return (
              <p key={key} className="tl-md__p">
                {renderInline(b.text, key)}
              </p>
            );
          case 'quote':
            return (
              <blockquote key={key} className="tl-md__quote">
                {renderInline(b.text, key)}
              </blockquote>
            );
          case 'hr':
            return <hr key={key} className="tl-md__hr" />;
          case 'code':
            return (
              <pre key={key} className="tl-md__pre">
                <code>{b.text}</code>
              </pre>
            );
          case 'ul':
          case 'ol':
            return createElement(
              b.type,
              { key, className: `tl-md__list tl-md__list--${b.type}` },
              b.items.map((it, j) => <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>)
            );
          case 'table':
            return (
              <div key={key} className="tl-md__tablewrap">
                <table className="tl-md__table">
                  {b.head && (
                    <thead>
                      <tr>
                        {b.head.map((c, j) => (
                          <th key={j} style={{ textAlign: b.aligns[j] || 'left' }}>
                            {renderInline(c, `${key}-h${j}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((c, j) => (
                          <td key={j} style={{ textAlign: b.aligns[j] || 'left' }}>
                            {renderInline(c, `${key}-${r}-${j}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
