/**
 * HF's game sounds, in the page world. Both games have a #soundOffButton that
 * toggles SoundManager 2 (`soundManager.mute()` / `unmute()`) and an "off"
 * class; HF doesn't remember it between visits. HFGS applies the saved
 * setting on load and saves the button's state whenever the user clicks it.
 */
import { hfWindow } from "./types";

const BUTTON = "soundOffButton";

function isMuted(): boolean {
  return document.getElementById(BUTTON)?.classList.contains("off") ?? false;
}

/** Mute or unmute HF's sounds and show it on HF's button, like a click would. */
export function applyMuted(muted: boolean): void {
  const sm = hfWindow().soundManager;
  const button = document.getElementById(BUTTON);
  if (!sm || !button) return;
  if (muted) sm.mute?.();
  else sm.unmute?.();
  button.classList.toggle("off", muted);
  // HF creates its sounds once SoundManager is ready: mute those too.
  if (muted) sm.onready?.(() => isMuted() && sm.mute?.());
}

/** Call `report` with the new state each time the user clicks HF's button. */
export function watchMuteButton(report: (muted: boolean) => void): void {
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (!target?.closest?.(`#${BUTTON}`)) return;
    // HF's own click handler toggles the class; read it after that runs.
    setTimeout(() => report(isMuted()), 0);
  });
}
