# Phase 0 findings: live-site check

Checked 2026-11-05 in Chrome for Testing 157 (`npm run browser`, `npm run probe`), signed in.
Raw reports (selector checks only; the signed-in page HTML was dropped because it named the account): `fixtures/phase0/blackjack.json`, `fixtures/phase0/slots.json`.
Game logic below is read from HF's own client scripts (`/jscripts/blackjack/blackjack.js`, `/jscripts/slots/slots.js?ver=1`).

## Selectors

| Selector                                                                                       | Page      | Status      | Notes                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | --------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `#PageContainer`, `#PageContainerInner`                                                        | both      | OK          |                                                                                                                                           |
| `#balanceCounterBalance`                                                                       | blackjack | OK          | Siblings `#balanceCounterMin` (2) and `#balanceCounterMax` (1000) also exist                                                              |
| `#balanceCounterBalance`                                                                       | slots     | **Missing** | Not used by old slots code; use `#credits`                                                                                                |
| `#playerHand1`, `#playerHand2`, `#dealerHand`                                                  | blackjack | OK          | `#playerHand2` hidden until split                                                                                                         |
| `.cardsContainer`, `.cardsValueSign`, `.cardsOutcomeSign`, `.handOutcomeSign`, `.betValueSign` | blackjack | OK          | Also `.activeArrow`, `.betContainer`                                                                                                      |
| `#rules > ul`                                                                                  | blackjack | OK          | Holds HF's rule list (see below); old code overwrote it with advisor odds                                                                 |
| `.card` sprite                                                                                 | blackjack | OK          | `https://hackforums.net/images/blackjack/cards.png`                                                                                       |
| `#bet`, `#credits`, `#reel1..3`                                                                | slots     | OK          | Also `#lastWin`, `#lifetimeWinnings`, `#betSpinUp/Down`, `#spinButton`                                                                    |
| `[id^=trPrize_]`                                                                               | slots     | OK          | 9 prize rows; HF adds class `won` to the winning row                                                                                      |
| `strong:contains("Risk your Bytes for a chance to win more!")`                                 | both      | **Broken**  | HF now writes **"βytes"** (Greek beta). Anchor structurally instead: the `td.tcat` row of the `table.tborder` containing `#PageContainer` |
| `td:contains("Disclaimer:  This blackjack table uses HF Bytes…")`                              | blackjack | **Broken**  | "βytes" again, and the double space after "Disclaimer:" is gone. Anchor on the last `td.trow1[align=center]` of that same table           |

`:contains()` is jQuery-only anyway; the rewrite should use the structural anchors above, not text.

## Page globals (reachable from a MAIN-world script)

| Global              | Page      | Value seen                   | Use                                                                                                             |
| ------------------- | --------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `my_post_key`       | both      | 32-hex string                | CSRF token for every action. Also embedded in links (e.g. mark-read), so never log or save page HTML unredacted |
| `windowID`          | both      | number (string on blackjack) | Sent with slots spins                                                                                           |
| `blackjackPayout`   | blackjack | `2.5`                        | **Total return** on a blackjack (bet × 2.5), i.e. net +1.5×                                                     |
| `openGameState`     | blackjack | `null`                       | Non-null when an unfinished game exists on page load. The bot must resume it, not deal                          |
| `remaining_balance` | blackjack | number                       | HF's own balance after each response                                                                            |

## Endpoints (unchanged)

| Game      | Request                                              | Body                                       |
| --------- | ---------------------------------------------------- | ------------------------------------------ |
| Blackjack | `POST /blackjack/blackjack_action.php?action=deal`   | `bet, my_post_key`                         |
| Blackjack | `POST …?action=hit\|stand\|double\|split\|surrender` | `gameId, actionId, my_post_key`            |
| Slots     | `POST /slots/spin.php`                               | `bet, windowID, machine_name, my_post_key` |

Blackjack responses: `{ success, error?, data: { game_id, action_id, bet, is_split, turn, hand1, hand2?, dealer, outcome1, outcome2, ended, payout }, balance }`.
`error == "loggedOut"` means the session expired. HF's client uses a 10 s timeout.

## Table rules vs. the strategy table

HF's rules panel: _Blackjack pays 3 to 2 · Surrender gives 50% back · Dealer must hit soft 17 · Double any two cards · Split up to 2 hands._
From HF's `showAvailableButtons`: surrender, double and split are only offered on `hand1` while `hand1.action == "START"` (the first decision); split compares card **value** (10/J/Q/K all split with each other).

| Assumption in `scripts/generate-strategy-table.js` | Status                                                                                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dealer hits soft 17                                | Confirmed                                                                                                                                                                                                                  |
| Double any first two cards                         | Confirmed                                                                                                                                                                                                                  |
| No double after split                              | Confirmed (double only while `hand1.action == "START"`)                                                                                                                                                                    |
| One split, no resplit (2 hands max)                | Confirmed                                                                                                                                                                                                                  |
| Late surrender, first two cards only               | Confirmed (50% back, first decision only)                                                                                                                                                                                  |
| Split by value                                     | Confirmed; `strategy.js` already compares values                                                                                                                                                                           |
| Dealer peeks for blackjack                         | **Unknown**: server-side. Needs captured hands with an A/10 upcard                                                                                                                                                         |
| Split aces can be hit                              | Confirmed (`015`: split ace `1d,4c` hit to `1d,4c,3h`). Table regenerated with `splitAcesOneCard: false`                                                                                                                   |
| Ace + ten after a split is blackjack (3:2)         | Confirmed, and unusually generous (`014`/`017`: split hand `1s,11c` → `BLACKJACK`, `WIN-BLACKJACK`). Table regenerated with `blackjackAfterSplit: true`. Raises A,A split EV by +0.6 to +0.8 of a bet; no decision changes |

If HF does **not** peek, the table must be regenerated with a no-peek model (it changes doubling 10/11 vs 10/A, splitting vs 10/A and surrender).

## Old-code bugs confirmed by HF's client

- Blackjack win was logged as `wager × 2.5`; HF pays 2.5× **total**, so net gain is +1.5×.
- Doubled wins pay 2× only when not split (`!is_split && hand1.action == "DOUBLE"`).
- Martingale capped bets at 500; the table max is 1000 (`#balanceCounterMax`), min 2. Chips: 2/10/20/50.
- Slots logged `prize.payoutWinnings` as the gain. Captured win (bet 1): credits 2871 → 2874 with `payoutCredits: 4, payoutWinnings: 4`, so the payout is the **total return** and net gain is `payoutCredits − bet`. The old code overstated every win by the bet.
- Unfinished games (`openGameState`) were ignored; dealing over one would fail.

## Still to capture (`npm run capture` while playing by hand)

- [x] deal, hit, stand (`fixtures/responses/004-012`, 4 hands at bet 2)
- [x] split, both hands (`013-017`)
- [x] double (`018-019`)
- [ ] surrender (deferred to Phase 3 testing; HF's client shows it's a plain `action=surrender` with no extra fields)
- [ ] A hand where the dealer shows A or 10 **and has blackjack**: does the game end on the deal (peek)? One A-upcard hand was captured (`004`), but the dealer had no blackjack, so it doesn't settle this
- [ ] Split aces: does HF allow hitting them?
- [ ] An error response (e.g. action after the game ended)
- [x] Slots: a losing spin and a winning spin (`fixtures/responses/001-003-spin.json`)

Blackjack responses, captured:

- **Every number is a string**: `bet: "2.000000"`, `is_split: "0"`, `ended: "1"`, `hand_value: "16"`, `payout: "4.000000"`. Only `balance` is a number. Parse everything
- The bet is taken at the **deal**: `balance` drops by the bet in the deal response
- `payout` is the **total return** (`"4.000000"` on a 2 win, `"0.000000"` on a loss); net = payout − bet (×2 if doubled)
- `turn`: `"hand1"` while playing → `"ended"` when over (with `ended: "1"`)
- `outcome1/outcome2`: `null` mid-game; when ended, `outcome2` is `""` if not split
- `action_id` goes up by 1 per action; send the latest one back
- Dealer `hand_value` is **absent** while the hole card is `"XX"`
- Hand `action` values seen: `START`, `HIT`, `STAND` (player); `START`, `HIT` (dealer)
- **Split** (`014`): `is_split: "1"`, `hand1` and `hand2` both present, hand2 starts as `SPLIT_START`. A split hand that makes blackjack is finished automatically (`action: "BLACKJACK"`) and `turn` jumps straight to `"hand2"`. The bot must read `turn`, not assume hand1 is in play
- Split result (`017`): `outcome1: "WIN-BLACKJACK"`, `outcome2: "TIE"`, `payout: "7.000000"` = 5 (2 × 2.5) + 2 (push). Balance 2873 → 2880. `payout` is the total over both hands
- **Double** (`019`): one card, then the hand ends (`action: "DOUBLE"`, `turn: "ended"`). `bet` still reports the **original** stake (`"2.000000"`); `payout: "8.000000"` is the total on the doubled 4. Balance 2878 → 2884 (+8 after the second 2 was taken). So net for a doubled hand = payout − 2 × bet
- **A repeated action returns HTML, not JSON** (`016`): the same stand sent twice (same `actionId`) got a full HF page with status 200. The client must treat a non-JSON response as an error, never send an action twice, and re-sync from the last good `action_id`
- Cards are rank (1 = ace … 13 = king) + suit. The same card (`5d`) appeared in both hands of one deal, consistent with a multi-deck shoe

Slots spin response, captured:

- Loss: `{ reels: ["1.5","3.0","3.5"], prize: null, success: true, credits, dayWinnings, lifetimeWinnings }`
- Win: adds `prize: { id: "8", payoutCredits: 4, payoutWinnings: 4 }` and `lastWin: 4`. `prize.id` matches `#trPrize_<id>`
- Reel stops can be half positions ("1.5", "2.5")

## First live bot run (Phase 3, 2026-11-05)

- **HF has flood control.** An action sent ~1 s after the previous one gets a full HTML page: _"You are trying to submit this form too quickly. Please go back and try again."_ The rejected action is **not applied** (balance unchanged after a rejected deal; the hand stayed open after a rejected stand), so it is safe to resend. This was also the cause of the Phase 0 "duplicate stand" (`016`).
- `HfClient` now spaces requests from the end of the previous response, recognises the flood page (`kind: "flood"`), and retries it after 2 s, 4 s, 6 s. The "Delay between actions" default is 2000 ms (minimum 1000).
- At 2000 ms: 4 hands, 10 requests, **0 flood pages**. Every decision matched basic strategy (14 v 4 stand, soft 17 v 10 hit then stand, 17 v 5 stand, 20 v 3 stand).
- The interrupted hand from the 1 s run was resumed from `openGameState` and settled correctly.
- Accounting: 5 hands, wagered 10, returned 6, net −4; HF's balance went 2886 → 2882.

## First live slots run (Phase 4, 2026-11-05)

- HF's slots page globals: `minBet = 1`, `maxBet = 1000`, `machineName = 'default'`. HF's bet buttons step 1, 2, 3, 5, 10, 20, 25, 50, 100, then by 100 (the bet setting snaps to these).
- 5 spins at 1 with 2 s spacing: 0 flood pages, requests identical to HF's own client (`bet, windowID, machine_name, my_post_key`).
- All 5 lost (no prize), so the win path is covered by the replayed fixture (`002`), not live. Panel net −5 matched HF's credits 2882 → 2877 after a reload.
