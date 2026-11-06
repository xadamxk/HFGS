/**
 * Small helpers for the Hack Game's countdowns: HF's timer format, and
 * whether the extension is still loaded under a page.
 */

/** False once the extension has been updated or reloaded under this page. */
export function extensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

/** HF's format: mm:ss, or hh:mm:ss from an hour up. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const mm = pad(Math.floor(s / 60) % 60);
  const ss = pad(s % 60);
  return s >= 3600 ? `${pad(Math.floor(s / 3600))}:${mm}:${ss}` : `${mm}:${ss}`;
}
