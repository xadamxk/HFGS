/*
 * Phase 0 probe: paste into DevTools (or run via browser automation) on
 * https://hackforums.net/blackjack.php or /slots.php while signed in.
 * Read-only: reports which selectors and page variables the extension depends on still exist.
 * It does not place bets or send any requests.
 */
(() => {
  const page = location.pathname.includes("slots") ? "slots" : "blackjack";
  const byText = (tag, text) =>
    [...document.querySelectorAll(tag)].filter((el) =>
      el.textContent.includes(text)
    );
  const sel = (s) => {
    const els = document.querySelectorAll(s);
    return {
      found: els.length,
      sample: els[0] ? els[0].outerHTML.slice(0, 160) : null,
    };
  };
  const shared = {
    "my_post_key in <head>": /my_post_key\s*=\s*"([^"]+)"/.test(
      document.head.innerHTML
    ),
    "window.my_post_key": typeof window.my_post_key,
    "#balanceCounterBalance": sel("#balanceCounterBalance"),
    "#PageContainer": sel("#PageContainer"),
    "#PageContainerInner": sel("#PageContainerInner"),
    'text "Risk your Bytes for a chance to win more!"': byText(
      "strong",
      "Risk your Bytes for a chance to win more!"
    ).length,
  };
  const games = {
    blackjack: {
      'text "Disclaimer:  This blackjack table uses HF Bytes"': byText(
        "td",
        "Disclaimer:  This blackjack table uses HF Bytes points"
      ).length,
      'text "This blackjack table uses HF Bytes" (single space)': byText(
        "td",
        "This blackjack table uses HF Bytes points"
      ).length,
      "#playerHand1": sel("#playerHand1"),
      "#playerHand2": sel("#playerHand2"),
      "#dealerHand": sel("#dealerHand"),
      "#playerHand1 .cardsContainer": sel("#playerHand1 .cardsContainer"),
      "#playerHand1 .cardsValueSign": sel("#playerHand1 .cardsValueSign"),
      "#playerHand1 .cardsOutcomeSign": sel("#playerHand1 .cardsOutcomeSign"),
      "#playerHand1 .handOutcomeSign": sel("#playerHand1 .handOutcomeSign"),
      "#playerHand1 .betValueSign": sel("#playerHand1 .betValueSign"),
      "#dealerHand .cardsValueSign": sel("#dealerHand .cardsValueSign"),
      "#rules > ul": sel("#rules > ul"),
      "rules text": (document.querySelector("#rules") || {}).innerText || null,
      ".card sprite background": (() => {
        const c = document.querySelector(".card");
        return c ? getComputedStyle(c).backgroundImage : null;
      })(),
      "inline scripts mentioning blackjack_action": [
        ...document.scripts,
      ].filter((s) => /blackjack_action/.test(s.textContent)).length,
      "external scripts": [...document.scripts]
        .filter((s) => s.src)
        .map((s) => s.src),
    },
    slots: {
      "#bet": sel("#bet"),
      "#credits": sel("#credits"),
      "#reel1": sel("#reel1"),
      "#reel2": sel("#reel2"),
      "#reel3": sel("#reel3"),
      "window.windowID": typeof window.windowID,
      "trPrize_ rows": document.querySelectorAll("[id^=trPrize_]").length,
      "inline scripts mentioning spin.php": [...document.scripts].filter((s) =>
        /spin\.php/.test(s.textContent)
      ).length,
      "external scripts": [...document.scripts]
        .filter((s) => s.src)
        .map((s) => s.src),
    },
  };
  return { url: location.href, page, shared, game: games[page] };
})();
