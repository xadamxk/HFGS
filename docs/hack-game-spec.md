# Hack Game auto-play: spec

Status: built (2026-11-06) with the recommended answers to the open questions, plus a "Run in background" setting. The live result parser still needs one real job to confirm (see Unknowns). Later changes: the job is the one picked in HF's own list; "Run in background" is off by default, and with it off there are no runs, only the status card's and panel's Hack button (playing from an open tab was removed).

## Goal

Add HF's Hack Game (`gamecp.php`) to HF Gaming Suite with one feature: **automatically
play Small Hack Jobs**. When the cooldown ends, the bot runs a chosen job. It pauses
when power is low and starts again by itself once the battery has recharged, without
reloading pages.

Not in scope (the old userscript had these): the battery % label, the Logs and
Leaderboard shortcuts, and the Cooldown/Locked status box. PC Hack, Server Hack,
missions and the shop are also out of scope.

## What the live game looks like now (checked 2026-11-05, read only)

| Thing | Where it is | Notes |
|---|---|---|
| Job list | `gamecp.php?action=smallhacks`. Each job is `input.contract_checkbox[name=job_id]` with a value. Its name is in `.game_smallhack_desc` and its success rate is in the next `.gtd` | 16 jobs, ids **26–41**, success rates 99% down to 2%. The old script's ids (11–23) and names are all gone, so job choices must be read from the page, not hard-coded. |
| Running a job | Plain form `POST gamecp.php` with `job_id`, `my_post_key`, `action=do_smallhacks`, `submit` | It's a full page submit, not AJAX. The response page still needs to be checked (see Unknowns). |
| Cooldown | Every gamecp page runs `countdownTimer('game-countdown-smallhacks', <seconds>)` | 164 s was left when checked. The Attempt Hack button stays disabled until the countdown ends. |
| Power % | Every gamecp page has `.game-top-right-icons a[href*="action=battery"]` with `title="95%"` | |
| Full-charge time | `gamecp.php?action=battery` shows "Full Charge: In 49 minutes", with the exact time in a `span[title="Nov 5, 2026 09:56 PM"]` | Power was 95 / 100 kWh. It recharges slowly (about 5% in 49 minutes). |
| Results | `gamecp.php?action=logs` shows lines like "Success 92% $4.0696 2.0482 xp" or "Fail 50%" | Lower success rates pay much more: 99% pays about $0.45, 95% about $2.35, 92% about $4.07. |
| FBI lock | The old script checked for `img[src$="/game/fbi-interrogating.jpg"]` | I haven't seen it live. |

## Does a page need to stay open?

**No.** The extension can play in the background. The browser has to be running and
you have to be signed in to HF, but no HF tab needs to be open.

How it works: the background script (the service worker on Chrome, the event page on
Firefox) uses `chrome.alarms` to wake up when the cooldown ends. It then fetches the
small hacks page with your HF cookies, reads the post key, cooldown, power and jobs
from the HTML, posts the job, and reads the result. Alarms survive the service worker
being shut down, and in MV3 they can wake it as often as every 30 s, which is plenty
for cooldowns measured in minutes. Nothing reloads, because no page is involved. If an
HF game page *is* open, its panel updates live from storage.

Costs and risks:

- **New permissions:** `alarms` (no install warning) and `host_permissions` for
  `https://hackforums.net/*`. The content scripts already run on hackforums.net, so
  this shouldn't add a new warning, but I'll confirm on the build.
- **No DOM parser in the service worker:** Chrome's service worker has no
  `DOMParser`, so the parsers will work on the HTML string. They'll be tested against
  saved copies of the pages, with post keys removed. An offscreen document is the
  fallback if string parsing proves too fragile.
- **Cloudflare:** HF runs Cloudflare's bot checks. A background request could get a
  challenge page instead of HF's page, for example after the clearance cookie expires.
  The bot will detect that, pause, and say "Open HF in a tab to continue". It won't
  try to get past the challenge.
- **Asleep or closed:** while the computer is asleep or the browser is closed, nothing
  runs. On wake, the next alarm fires and play continues.

Alternative: play only while an HF game tab is open, from a content script, like
blackjack. It's simpler, since there's a DOM and no Cloudflare edge cases, but it
stops when the tab is closed or discarded. **I recommend the background approach**,
with the page panel as the place to watch it and control it.

## How a cycle runs

```
start ──► fetch smallhacks page ──► parse it
            │
            ├─ challenge or signed out ──► pause, show "Open HF to continue"
            ├─ FBI locked              ──► wait "locked wait", then check again
            ├─ cooldown N s            ──► alarm at N s + random extra wait
            ├─ power < pause level     ──► fetch battery page, alarm at the time
            │                              the resume level is reached, then check again
            └─ ready ──► pick a job from the current list ──► POST it
                          └─► record the result ──► next cooldown (from the response,
                              or fetch the page again)
```

- The bot fetches the page fresh before every job, so job ids, names and success rates
  are always current, and it never posts a job id that no longer exists.
- When power is low, the wait is worked out from the full-charge time (or the rate),
  so the bot doesn't keep polling. Before playing again, it checks the power again.
- It stops when you press Stop, after an optional job limit, or after 3 errors in a
  row (with backoff between them). It never loops quickly: there's at least 30 s
  between any two requests.

## Settings (with plain wording)

Hack Game section, on the settings page and on the game page's panel:

| Setting | Label | Hover text | Default |
|---|---|---|---|
| Job choice | **Jobs to play** (ticked list) | Ticks from the current job list, showing each job's success rate. Each cycle the bot picks one ticked job at random. | none ticked; Start says "Tick at least one job" |
| (alternative, see Q2) | **Or: any job at or above (% success)** | Works even when HF renames jobs or changes their rates. | off |
| `intervalVariableLow` | **Extra wait after cooldown, shortest (s)** | After a cooldown ends, the bot waits a random extra time between the shortest and longest before the next job, so it doesn't play like clockwork. | 30 |
| `intervalVariableHigh` | **Extra wait after cooldown, longest (s)** | | 180 |
| `batteryThreshold` | **Pause below power (%)** | When power drops below this, the bot stops playing until the battery recharges. | 5 |
| new | **Resume at power (%)** | Play starts again by itself once power is back to this. 100 waits for a full charge. | 100 |
| new | **When locked out, check again after (min)** | If the FBI locks your account in the game, wait this long before checking again. | 7 |
| new | **Stop after (jobs)** | 0 means keep going until you press Stop. | 0 |

Two notes on the old script:

- Its random wait was `random × high + low`, which gives a range from low to low + high.
  The new one uses a true random value between shortest and longest.
- If shortest is greater than longest, the two are swapped. Neither can go below 0 s
  or above 30 min.

### Keeping the job list current

- The bot keeps the last job list it read (id, name, success rate). Each cycle and each
  time the Small Hack Jobs page is opened, it compares HF's list with the stored one and
  only saves it when something changed (`updateJobs`).
- The game page panel and the settings page draw the tick list from that cache. If
  nothing has been read yet, they say "Open the Small Hack Jobs page once to load the
  jobs."
- Ticks are saved by job id, together with the name they were ticked under. If HF
  removes that id, or gives it a different name, the tick is dropped and the panel
  says "HF changed the job list; 2 of your jobs are gone." New jobs are never ticked
  automatically.

## Page panel (on `gamecp.php` pages)

It's a table in HF's style, like the blackjack panel:

- **Start / Stop** button, plus a status line, for example "Waiting for cooldown: next
  job at 8:14 PM (Phishing a Corporate Employee)", "Recharging: resumes at 9:56 PM",
  "Locked out: checking again at 8:40 PM" or "Paused: open HF to continue".
- **Settings** (grouped, like blackjack): Jobs, Timing, Power and Stop the bot.
- **Results:** totals for this run and overall (jobs, success rate, $ earned, xp), plus
  the latest jobs (time, job, success rate, result, $ and xp). These are stored the
  same way as the other games' history, under their own key.

The browser toolbar popup gets a one-line status as well, since play can run with no
HF tab open.

## Code layout (proposed)

- `src/games/hackgame/parse.ts`: pure string parsers for jobs, cooldown seconds, power
  %, full-charge time, lock, post key, a challenge or signed-out page, and the job
  result. Tested against fixtures saved under `fixtures/hackgame/`, with post keys
  removed.
- `src/games/hackgame/scheduler.ts`: the cycle above, driven by `chrome.alarms`. Run
  state lives in `chrome.storage.local`, so it survives the worker shutting down.
- `src/games/hackgame/panel.ts` and a content script for `gamecp.php*`.
- `src/background.ts`: registers the alarm handler.
- `src/manifest.json`: adds `alarms`, the host permission and the new content script
  match.
- Docs: README, PRIVACY (the background requests to HF and what's stored), and the
  store listing.

This doesn't fit the existing `Runner` and betting model (no stake, a time-based
cooldown), so it gets its own small scheduler. It reuses the history storage, the
settings form, `HfClient` spacing and the panel styling.

## What one live job showed (2026-11-06)

The 99% job was run once from the background script, with the user's OK:

1. The bot read the result from the newest Logs entry: Success, 99%, $0.4401,
   0.238 xp. Its `data-timestamp` was HF's time, about 2 s behind this computer.
   Jobs are now timed by this computer's clock, so they count toward "This run".
2. One job used **5% power** (97% → 92%).
3. **There was no cooldown after a success**: the countdown was gone right away. The
   earlier 3-minute countdown came after a failed job, so failures probably set the
   cooldown. After a job with no cooldown, the bot waits the 30 s minimum plus the
   random extra wait.
4. Not seen yet: the page during an FBI lock-out. The bot looks for the old
   `fbi-interrogating` image and otherwise treats an unknown page as an error.

## Open questions

1. **Background, or only while a tab is open?** I recommend background.
2. **Job choice:** a ticked list (like the old script), or a minimum success rate, or
   both? I recommend both, with the ticked list as the default.
3. **Which ticked job to pick:** at random (like the old script), always the
   highest-paying, or always the safest? I recommend random.
4. **After a browser restart:** carry on automatically if it was running, or wait for
   Start? I recommend waiting for Start.
5. **Notifications:** show a browser notification when it pauses for a lock or an
   error? It would need the `notifications` permission. I recommend not now.
