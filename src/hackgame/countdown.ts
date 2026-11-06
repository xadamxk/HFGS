/**
 * While auto-play runs from an open tab ("Run in background" off), HF's Small
 * Hack Jobs countdown in the game menu shows when the bot's next step is due
 * instead of HF's own cooldown. HF's own timer (page world) keeps running on
 * its element; it's hidden, and the bot's countdown sits beside it in the same
 * style, so the two never fight over the text.
 */
import { STORAGE_KEYS } from "../core/storage";
import { loadSettings } from "../settings";
import { HackState, loadState } from "./store";

/** False once the extension has been updated or reloaded under this page. */
export function extensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

const HF_COUNTDOWN = "game-countdown-smallhacks";
const OURS = "hfgs-countdown-smallhacks";

/** HF's format: mm:ss, or hh:mm:ss from an hour up. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const mm = pad(Math.floor(s / 60) % 60);
  const ss = pad(s % 60);
  return s >= 3600 ? `${pad(Math.floor(s / 3600))}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** The menu link for Small Hack Jobs, or null on a page without the game menu. */
function menuLink(doc: Document): HTMLAnchorElement | null {
  return doc.querySelector<HTMLAnchorElement>(
    '.game_nav_content_system_container a[href*="action=smallhacks"]'
  );
}

/**
 * Show `nextAt` (ms) in the menu, or put HF's own countdown back when it's
 * null or past.
 */
export function renderCountdown(
  doc: Document,
  nextAt: number | null,
  now = Date.now()
): void {
  const link = menuLink(doc);
  if (!link) return;
  const icon = link.querySelector(".game-nav-smallhacks");
  let ours = link.querySelector<HTMLElement>(`.${OURS}`);
  const hf = link.querySelectorAll<HTMLElement>(`.${HF_COUNTDOWN}`);

  if (nextAt === null || nextAt <= now) {
    ours?.remove();
    hf.forEach((el) => (el.style.display = ""));
    // HF greys the icon only while its own countdown is still there
    if (!hf.length) icon?.classList.remove("game-nav-icon-nongreen");
    return;
  }
  hf.forEach((el) => (el.style.display = "none"));
  if (!ours) {
    ours = doc.createElement("span");
    ours.className = `game-nav-countdown ${OURS}`;
    ours.title = "When HF Gaming Suite plays its next Small Hack Job";
    const color = doc.createElement("span");
    color.style.color = "#ff4710";
    ours.append(color);
    link.append(ours);
  }
  (ours.firstElementChild as HTMLElement).textContent = formatCountdown(
    (nextAt - now) / 1000
  );
  icon?.classList.add("game-nav-icon-nongreen");
}

/** Keep the menu countdown in step with the bot while this page is open. */
export function startMenuCountdown(doc: Document = document): () => void {
  let state: HackState | null = null;
  let tabMode = false;
  const draw = () =>
    renderCountdown(doc, state?.running && tabMode ? state.nextAt : null);
  const load = async () => {
    const [s, settings] = await Promise.all([loadState(), loadSettings()]);
    state = s;
    tabMode = !settings.hackgame.runInBackground;
    draw();
  };
  load().catch(() => undefined);
  const onChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => {
    if (
      area === "local" &&
      (changes[STORAGE_KEYS.hackgameState] || changes[STORAGE_KEYS.settings])
    )
      load().catch(() => undefined);
  };
  chrome.storage.onChanged.addListener(onChange);
  const timer = setInterval(() => {
    // Extension updated or reloaded: put HF's own countdown back and stop
    if (!extensionAlive()) {
      clearInterval(timer);
      renderCountdown(doc, null);
      return;
    }
    draw();
  }, 1000);
  return () => {
    clearInterval(timer);
    chrome.storage.onChanged.removeListener(onChange);
    renderCountdown(doc, null);
  };
}
