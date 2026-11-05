# Privacy Policy

_Last updated: November 5, 2026_

HF Gaming Suite (HFGS) is a browser extension for Hack Forums' βytes games (blackjack and slots). It adds a panel with a bot, totals and recent results under each game. This policy explains what data it handles and where that data goes.

**In short: the extension only talks to Hack Forums. The developer receives no data at all.**

## What the extension handles

To work, the extension reads and sends the same data as Hack Forums' own game pages (blackjack.php and slots.php):

- **Your Hack Forums session.** It reads Hack Forums' post key and the game's page values (such as the slot machine's window ID and any unfinished blackjack hand) from the game page you have open, and uses your existing Hack Forums login to play. It never sees or stores your password.
- **Your games.** When you start a bot, it sends the same game actions as Hack Forums' own buttons (deal, hit, stand, double, split, surrender, spin) and reads Hack Forums' answers: cards, reels, payouts and your βytes balance. When you play with Hack Forums' own buttons, it reads Hack Forums' answers on the page the same way, to count those hands and spins in your stats.

## Where data goes

- **Only to Hack Forums** (`hackforums.net`), to the same addresses Hack Forums' own games use (`/blackjack/blackjack_action.php` and `/slots/spin.php`).
- **Nowhere else.** The extension has no analytics, tracking, ads or servers of its own, and sends nothing to the developer or any third party.

## What is stored on your device

All of this stays in your browser and is never uploaded:

- **Extension storage** (`chrome.storage.local`): your settings, and for each game your overall totals and up to 500 recent results (time, outcome, amounts wagered and returned, balance, and the cards or reels).

You can export your history or clear it from the extension's settings page. Removing the extension deletes its storage.

## Your data is not sold or shared

The developer does not collect, sell, transfer or share any user data, does not use it for advertising or credit decisions, and does not use it for any purpose other than the extension's single purpose: playing and tracking Hack Forums' βytes games on Hack Forums.

## Changes and contact

If this policy changes, the updated version will be published in this repository with a new date. Questions can be asked by opening an issue at <https://github.com/xadamxk/HFGS/issues>.

HF Gaming Suite is not affiliated with or endorsed by Hack Forums.
