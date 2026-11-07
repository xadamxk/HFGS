<div align="center">
  <h1>HF Gaming Suite</h1>
  A blackjack strategy assistant, slots auto-spin and a Hack Game card on every page, for Hack Forums' games
  <br>
  <br>
  <img src="https://github.com/xadamxk/HFGS/blob/main/assets/banners/banner-large.png?raw=true" title="Logo" />
  <br>
  <a href="https://chrome.google.com/webstore/detail/hf-gaming-suite/gkncdlncbppkmojddfcncglmelgljcal">
    <img src="https://github.com/xadamxk/HF-Userscripts/blob/master/Avatars-Signatures/browser%20icons/chrome.png?raw=true" title="Download for Chrome" />
  </a>
</div>

## What it does

HFGS adds three tools to Hack Forums' games, and live stats and history for each. βytes are Hack Forums' internal points; they have no cash value.

- **Blackjack: Strategy Assistant.** Beside the table, the strategy table's inputs (your cards, the dealer's upcard, what HF offers) and output (the best play and every option's expected value), with bust odds, the dealer's final-total odds and the chart row. It's built for HF's table rules (dealer hits soft 17, double any two cards, one split, late surrender) from a lookup table in the extension, matched against the published basic strategy chart. It updates live as you play and checks each decision against the table.
- **Slots: Auto-Spin.** Spins at a fixed bet, using HF's own bet steps, and never bets more than your credits. Each run plays a number of spins (or until you stop it), stops by itself at a stop-loss or take-profit, and asks before it starts (can be turned off). **Headless Mode** (on by default) spins in the background and only updates HF's balance; turn it off to watch HF's own reel animations.
- **Hack Game: a card on every page.** A **status card** in the corner of every HF page counts down your cooldown and gives you a **Hack** button, which plays your job once and then shows Success or Fail and the time until the next job, so you never need the game open. It plays the Small Hack Job you pick in HF's own list, which HFGS remembers and keeps selected (if HF renames or removes it, it's forgotten and you're told). With **Run in background** on, press Start on any Hack Game page and it plays automatically, with no HF tab open as long as the browser is running: whenever the cooldown is over, after a random extra wait, pausing when power runs low and starting again by itself once the battery has recharged; the card then shows what the run is doing with a live countdown. The card can be made compact, shrunk to a pill (still with its ▶ button), or turned off. It sits bottom right, or bottom left when [HF Convo Anywhere](https://github.com/xadamxk/HF-Convo-Anywhere)'s chat dock is on the right, so the two never overlap.
- **Stats and history:** live stats under Blackjack and Slots for this visit and overall (win rate, net, biggest win and loss, streaks), a chart of your βytes over recent results, and your recent results. Every result, including hands and spins you play yourself, is kept in your browser, with totals per game on the settings page and CSV/JSON export.
- **Gentle on HF:** one request at a time, at least 2 seconds apart by default. HF's flood control ("submitting too quickly") is detected and retried, and anything unexpected stops a run instead of guessing.

Change settings right on the game page, in the panel's **Settings** section, or on the settings page (toolbar button or the panel's **Settings** link). Either way they save at once, show up on the other, and apply from the next round, even during a run.

## Install

- **Chrome:** [Chrome Web Store](https://chrome.google.com/webstore/detail/hf-gaming-suite/gkncdlncbppkmojddfcncglmelgljcal)
- **Firefox (140+):** coming to Firefox Add-ons. Until then, see [BUILDING.md](BUILDING.md).

## Privacy

HFGS only talks to Hack Forums, and keeps your settings and history in your browser. The developer receives no data. See [PRIVACY.md](PRIVACY.md).

## Development

```bash
npm ci
npm run dev          # build to dist/ and rebuild on changes
npm test             # Jest
npm run typecheck
npm run lint
npm run package      # release zips in releases/ (Chrome, Firefox, Firefox source)
npm run assets:png   # store screenshots, thread header and buttons from their HTML (needs npm run browser)
```

Load `dist/` as an unpacked extension (Chrome: `chrome://extensions`, Developer mode, **Load unpacked**).

`npm run browser` opens Chrome for Testing with `dist/` loaded and its own saved profile, so a Hack Forums sign-in survives restarts. Scripts can drive it on `127.0.0.1:9222`:

- `npm run probe` checks that every selector and page variable HFGS relies on still exists on the live pages (read-only).
- `npm run capture` records HF's game requests and responses into `fixtures/responses/` while you play by hand, with session tokens removed.

`npm run browser:firefox` does the same in Firefox, with the extension as a temporary add-on.

What HFGS knows about HF's games (endpoints, response shapes, table rules, flood control) is written up in [docs/phase0-findings.md](docs/phase0-findings.md), backed by the captured fixtures.

### Adding a game

1. Add `src/games/<game>/definition.ts`: name, page path, settings (the settings page is generated from them) and how to describe a result.
2. Add `src/games/<game>/engine.ts`: `playRound()` plays one round through `HfClient` and returns what was wagered and returned. The shared runner handles limits, stopping, history and the panel.
3. Register them in `src/games/registry.ts` and `src/games/bots.ts`, and add the page to both content scripts in `src/manifest.json` (a test checks they match).

The blackjack strategy table is generated by `npm run strategy:generate` from the rules at the top of `scripts/generate-strategy-table.js`.

## License

[GPL-3.0](LICENSE). HF Gaming Suite is not affiliated with or endorsed by Hack Forums.
