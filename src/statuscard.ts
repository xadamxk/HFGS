/**
 * Content script for every Hack Forums page, Hack Game pages included: shows
 * the Hack Game status card. Kept small, since it loads on every page.
 */
import { mountStatusCard } from "./hackgame/card";

if (window.top === window) {
  mountStatusCard();
}
