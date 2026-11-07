# Hack Game status card: spec

Status: built (2026-11-06). Decisions: the card shows whenever a run is going (runs only happen in background mode since tab-mode runs were removed); it's on by default (Q2); it has Stop and Open game (Q3). The corner setting was replaced by a **Compact card** setting (smaller, without the last job and totals); the card sits bottom right. The mock is in
[mocks/hack-game-status-card.html](mocks/hack-game-status-card.html).

## Goal

While Hack Game auto-play runs in the background, show a small **status card** on
every Hack Forums page, so you can see what the bot is doing (playing, waiting for
the cooldown, recharging, locked out, stopped) and how long until its next step,
without opening the game.

## Is it possible?

Yes, and it needs no new permission:

- A small content script runs on all `https://hackforums.net/*` pages. The extension
  already has host access to hackforums.net, so this adds no install warning.
- The card only **reads** the bot's state from extension storage (`hackgame:state`,
  which the background script already writes). It never contacts HF, so it adds no
  requests and costs nothing on HF's side.
- It updates live: from `chrome.storage.onChanged` when the state changes, and with a
  1-second local timer for the countdown.

It's kept separate from the game-page scripts: its own small bundle
(`statuscard.js`), with no settings form and no game code, so loading it on every
page stays cheap.

## When the card shows

| Situation | Card |
|---|---|
| Setting off | Never |
| Auto-play isn't running and never stopped with a message | Hidden |
| Running in the background | Shown, with live countdown |
| Stopped with a reason (finished, error, Cloudflare, signed out) | Shown once with the reason, until you dismiss it or press Start again |
| On Hack Game pages (`gamecp.php`) | Hidden: the full panel is already there |
| In frames | Never (top page only) |
| Run in background off | The manual card with the Hack button (see Manual mode) |

## What it shows

Expanded card (about 280 px wide, fixed to a bottom corner):

- **Header:** "Hack Game", a coloured status chip (Playing, Waiting, Recharging,
  Locked out or Stopped), a minimize button and, for a stopped card, a dismiss button.
- **Main line:** the time left, large, in HF's mm:ss style (hh:mm:ss over an hour),
  with what it's for: "Next job in 01:31", "Resumes in 42:10", "Checks again in
  06:12". While a job is being played: "Playing now…"
- **Detail line:** "at 10:12 PM · Waiting for the cooldown". When recharging, a power
  bar from the current power to the resume level ("Power 4% → resumes at 100%").
- **Last job:** "Cracking a Public Wi-Fi Password · Success · $0.44 · 0.24 xp", in
  green for a success and red for a fail.
- **This run:** "3 jobs · 3 succeeded · $1.32".
- **Actions:** **Stop**, and **Open game** (a link to Small Hack Jobs). A stopped card
  shows **Start again** instead of Stop.

Collapsed card: a small pill, for example "● HG 01:31", with the dot in the status
colour. Clicking it expands the card. Whether the card is collapsed is remembered
across pages.

## Look

- HF's dark theme: card background `#1f1f1f`, border `#2b2b2b`, header in HF's purple
  `#3d2a4b`, text `#ddd`. It uses the page's own font.
- Status colours: Playing green `#4AD635` (HF's battery green), Waiting orange
  `#ff4710` (HF's countdown orange), Recharging amber `#e0a000`, Locked out red
  `#ff2121`, Stopped grey (red when it stopped on an error).
- A soft shadow; `z-index` high enough to sit above HF's page but below its modals.
- It mustn't cover HF's own bottom-corner widgets. The corner is a setting.

## Settings (Hack Game, Mode group)

| Setting | Label | Hover text | Default |
|---|---|---|---|
| `statusCard` | **Status card on HF pages** | While auto-play runs in the background, show a small card on every Hack Forums page with what it's doing and the time to its next step. | on |
| `statusCardCorner` | **Card position** (radio: Bottom right, Bottom left) | Which corner of the page the card sits in. | Bottom right |

Both are disabled while "Run in background" is off, unless Q1 says otherwise.

## Manual mode (Run in background off)

With "Run in background" off (the default) and no run going, the card is a manual control,
on every HF page including the Hack Game's own. It keeps to one row: the status label shows
Ready, Cooldown, Playing, Success, Fail or Not played; the row shows "Ready", "Next job in
02:44" or why a job wasn't played (for example "Not enough power (4%)."), with a **Hack**
button at its end. Hack plays the job picked in HF's list once (`playOnce`), then the card
shows the result and counts down to when HF allows the next job. The button is off during
a cooldown or while a job plays. The collapsed pill keeps a ▶ button. The last job's
details are in the row's tooltip. While a run is going, the card is the status card above.

## Next to HF Convo Anywhere

HF Convo Anywhere (a separate extension) keeps its chat dock, bubbles or list, and its chat
windows along the bottom edge on one side: right by default, left with its "Dock side"
setting (`#hfx-chat-dock`, plus the `hfx-chat-left` class when on the left). The card goes in
the opposite bottom corner and follows the dock live with a MutationObserver: when it
appears, switches sides or goes away. Without Convo Anywhere, the card stays bottom right.
The card's z-index (9000) is below the dock's (100000), so on a narrow screen with several
chat windows open, Convo covers the card rather than the other way round.

## Behaviour details

- **Countdown:** it's worked out from `state.nextAt` and redrawn every second. At 0 it
  shows "Any moment…" until the next state arrives.
- **Screen readers:** the card has `role="status"`. Only changes of status are
  announced, not every second of the countdown.
- **Stop** and **Start again** write the same state as the panel's buttons
  (`stopRun` / `startRun`), so the background script reacts as usual.
- **Dismiss** hides a stopped card until the next run starts. It's stored, so it stays
  hidden on other pages and tabs.
- **No layout shift:** the card is `position: fixed` and doesn't change HF's page.
- **Fails quietly:** if storage can't be read, no card is shown.

## Code layout (proposed)

- `src/hackgame/card.ts`: builds and updates the card from state, settings and totals.
  The rendering is a pure function of those, so it's unit-tested per state in jsdom.
- `src/statuscard.ts`: the entry point. It exits on `gamecp.php` and in frames, then
  mounts the card.
- `src/manifest.json`: adds a content script for `https://hackforums.net/*` that
  excludes `gamecp.php*`.
- `src/hackgame/settings.ts`: the two settings. `src/hackgame/store.ts`: the card's
  collapsed and dismissed state (`hackgame:card`).
- Docs: README and the store listing.

## Open questions

1. **Tab mode:** show the card on other HF pages while auto-play runs from a tab too?
   I recommend yes, since it's just as useful there, but you asked for background.
2. **Default:** card on or off by default? I recommend on, since it only appears while
   a run is going.
3. **Controls on the card:** Stop and Open game, or status only? I recommend Stop and
   Open game.
4. **Corners:** bottom right and bottom left only, or all four? I recommend the two
   bottom corners.
