/** HF card codes ("12h" = queen of hearts, "XX" = face down) as text. */

const RANKS: Record<string, string> = {
  "1": "A",
  "11": "J",
  "12": "Q",
  "13": "K",
};
const SUITS: Record<string, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };

/** "12h" -> "Q♥", "XX" -> "?" */
export function formatCard(card: string): string {
  if (card === "XX") return "?";
  const rank = card.slice(0, -1);
  return `${RANKS[rank] ?? rank}${SUITS[card.slice(-1)] ?? ""}`;
}

export const formatCards = (cards: string[]) => cards.map(formatCard).join(" ");

const cardList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((c) => typeof c === "string") : [];

/** A stored blackjack result's cards, e.g. "Q♥ 6♠ | 8♣ 8♦ vs A♣ 8♥". */
export function describeBlackjack(details: Record<string, unknown>): string {
  const player = cardList(details.player);
  const player2 = cardList(details.player2);
  const dealer = cardList(details.dealer);
  if (!player.length) return "";
  const hands = player2.length
    ? `${formatCards(player)} | ${formatCards(player2)}`
    : formatCards(player);
  return dealer.length ? `${hands} vs ${formatCards(dealer)}` : hands;
}
