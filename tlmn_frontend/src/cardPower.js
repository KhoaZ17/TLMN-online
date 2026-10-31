// Sức mạnh lá bài theo luật Tiến Lên: 3 < 4 < ... < K < A < 2, cùng hạng thì
// chất ♠ < ♣ < ♦ < ♥ (đúng bảng `tlmn_dict_deck` của Backend: 3♠ = 1 ... 2♥ = 52).
// Joker ("X♠"...) không có sức mạnh cố định nên trả 0 — nó thay thế cho lá khác.
const RANKS = '3456789TJQKA2';
const SUITS = '♠♣♦♥';

export const isJoker = (card) => typeof card === 'string' && card[0] === 'X';

export function cardPower(card) {
  if (typeof card !== 'string' || card.length < 2 || isJoker(card)) return 0;
  const rank = RANKS.indexOf(card.slice(0, -1));
  const suit = SUITS.indexOf(card.slice(-1));
  if (rank < 0 || suit < 0) return 0;
  return rank * 4 + suit + 1;
}

/** Chất của lá (♠ ♣ ♦ ♥) — dùng để biết Joker "biến hình" thành lá nào. */
export const cardSuit = (card) => (typeof card === 'string' && card.length >= 2 ? card.slice(-1) : '');
