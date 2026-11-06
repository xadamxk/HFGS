# Privacy Policy

_Last updated: November 6, 2026_

HF Gaming Suite (HFGS) is a browser extension for Hack Forums' βytes games (blackjack and slots) and the Hack Game's Small Hack Jobs. It adds a panel with a bot, totals and recent results under each game. This policy explains what data it handles and where that data goes.

**In short: the extension only talks to Hack Forums. The developer receives no data at all.**

## What the extension handles

To work, the extension reads and sends the same data as Hack Forums' own game pages (blackjack.php and slots.php):

- **Your Hack Forums session.** It reads Hack Forums' post key and the game's page values (such as the slot machine's window ID and any unfinished blackjack hand) from the game page you have open, and uses your existing Hack Forums login to play. It never sees or stores your password.
- **The Hack Game.** When you start Hack Game auto-play, the extension loads Hack Forums' Small Hack Jobs, Power Center and Logs pages (`gamecp.php`) to read the job list, cooldown, power and each job's result, and submits the job you chose with the same form as Hack Forums' Attempt Hack button. With "Run in background" on, it does this from the extension's background script using your Hack Forums login, even with no Hack Forums tab open; with it off, only from an open Hack Game page.
- **Your games.** When you start a bot, it sends the same game actions as Hack Forums' own buttons (deal, hit, stand, double, split, surrender, spin) and reads Hack Forums' answers: cards, reels, payouts and your βytes balance. When you play with Hack Forums' own buttons, it reads Hack Forums' answers on the page the same way, to count those hands and spins in your stats.

## Where data goes

- **Only to Hack Forums** (`hackforums.net`), to the same addresses Hack Forums' own games use (`/blackjack/blackjack_action.php`, `/slots/spin.php` and `/gamecp.php`).
- **Nowhere else.** The extension has no analytics, tracking, ads or servers of its own, and sends nothing to the developer or any third party.

## What is stored on your device

All of this stays in your browser and is never uploaded:

- **Extension storage** (`chrome.storage.local`): your settings, and for each game your overall totals and up to 500 recent results (time, outcome, amounts wagered and returned, balance, and the cards or reels). For the Hack Game: the job list last read from Hack Forums, the jobs you ticked, what auto-play is doing, and the jobs it played (time, job, success or fail, cash and xp earned).

You can export your history or clear it from the extension's settings page. Removing the extension deletes its storage.

## Your data is not sold or shared

The developer does not collect, sell, transfer or share any user data, does not use it for advertising or credit decisions, and does not use it for any purpose other than the extension's single purpose: playing and tracking Hack Forums' games on Hack Forums.

## Changes and contact

If this policy changes, the updated version will be published in this repository with a new date. Questions can be asked by opening an issue at <https://github.com/xadamxk/HFGS/issues>.

HF Gaming Suite is not affiliated with or endorsed by Hack Forums.
