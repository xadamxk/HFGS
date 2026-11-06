/**
 * Content script for every Hack Forums page except the Hack Game's own
 * (gamecp.php, which has the full panel): shows the Hack Game status card
 * while auto-play runs. Kept tiny, since it loads on every page.
 */
import { mountStatusCard } from "./hackgame/card";

if (window.top === window && !location.pathname.startsWith("/gamecp.php")) {
  mountStatusCard();
}
