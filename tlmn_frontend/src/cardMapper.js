// Backend (tlmn_rules.py: default_deck / tlmn_joker_cards) trả về lá bài dạng:
//   <Hạng><Ký hiệu chất Unicode>
// Ví dụ THẬT lấy từ default_deck: "3♠", "T♥", "A♦", "2♣"...
// Joker (tlmn_joker_cards):        "X♠", "X♣", "X♦", "X♥"
//
// Hạng: 3 4 5 6 7 8 9 T J Q K A 2, và "X" cho Joker (khớp đề bài).
// Chất: ♠ ♣ ♦ ♥ — ĐÂY LÀ KÝ HIỆU UNICODE, không phải chữ cái S/C/D/H như mô
// tả ban đầu. app_controller.py trả thẳng self.env.hands (và mọi log/last_combo)
// ra API mà không chuyển đổi, nên "my_hand", "legal_actions", "table.last_combo_cards"
// đều chứa các chuỗi kiểu "3♠", không phải "3S". Xem README để biết thêm.
//
// getCardImagePath() bên dưới xử lý đúng theo dữ liệu thật này: đổi ký hiệu
// chất Unicode -> chữ cái trước, rồi mới áp dụng 2 quy tắc đã nêu trong đề bài
// (hạng "T" -> "10", Joker "X<chất>" -> "Joker<chất>").

const SUIT_SYMBOL_TO_LETTER = {
  '♠': 'S',
  '♣': 'C',
  '♦': 'D',
  '♥': 'H',
};

const SUIT_LETTER_TO_NAME = {
  S: 'Bích',
  C: 'Chuồn',
  D: 'Rô',
  H: 'Cơ',
};

export const ASSET_BASE = '/assets/cards';

/**
 * Tách một chuỗi lá bài thành { rank, suit, raw }.
 * `suit` luôn được chuẩn hoá về chữ cái S/C/D/H để ghép tên file ảnh.
 * Nếu backend đổi sang gửi thẳng chữ cái chất bài, hàm này vẫn chạy đúng
 * (chỉ đổi khi gặp đúng 1 trong 4 ký hiệu Unicode, còn lại giữ nguyên).
 */
export function parseCard(cardStr) {
  if (!cardStr || cardStr.length < 2) return null;
  const suitSymbol = cardStr.slice(-1);
  const rank = cardStr.slice(0, -1);
  const suit = SUIT_SYMBOL_TO_LETTER[suitSymbol] || suitSymbol;
  return { rank, suit, raw: cardStr };
}

/**
 * Chuyển 1 chuỗi lá bài từ Backend thành đường dẫn ảnh .png (đặt trong
 * public/assets/cards/, xem README).
 * - 2..9, J, Q, K, A: nối thẳng rank + suit + ".png"
 * - Hạng 10 (Backend gửi "T"): đổi "T" -> "10"  (VD "T♣" -> "10C.png")
 * - Joker (Backend gửi "X" + chất): đổi thành "Joker" + chất (VD "X♦" -> "JokerD.png")
 */
export function getCardImagePath(cardStr) {
  const parsed = parseCard(cardStr);
  if (!parsed) return cardBackImagePath();

  let { rank, suit } = parsed;

  if (rank === 'X') {
    return `${ASSET_BASE}/Joker${suit}.png`;
  }
  if (rank === 'T') {
    rank = '10';
  }
  return `${ASSET_BASE}/${rank}${suit}.png`;
}

export function cardBackImagePath() {
  return `${ASSET_BASE}/card_back.png`;
}

export function displayRank(rank) {
  if (rank === 'T') return '10';
  if (rank === 'X') return 'Joker';
  return rank;
}

/** Mô tả tiếng Việt ngắn gọn cho 1 lá bài — dùng làm alt text (hỗ trợ screen reader). */
export function describeCard(cardStr) {
  const parsed = parseCard(cardStr);
  if (!parsed) return 'Lá úp';
  const suitName = SUIT_LETTER_TO_NAME[parsed.suit] || '';
  if (parsed.rank === 'X') return `Joker ${suitName}`.trim();
  return `${displayRank(parsed.rank)} ${suitName}`.trim();
}
