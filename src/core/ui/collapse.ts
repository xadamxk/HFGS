/**
 * A "▲ Hide / ▼ Show" button for a section header. Whether the section is
 * collapsed is kept in chrome.storage.local, so it's the same on every page
 * and tab. Sections start expanded.
 */
import { el } from "../Dom";

export const COLLAPSE_CSS = `
.hfgs-collapse { background: none; border: 0; padding: 0 2px; color: inherit; font: inherit; font-size: 11px; font-weight: normal; opacity: 0.8; cursor: pointer; }
.hfgs-collapse:hover { opacity: 1; text-decoration: underline; }
`;

/**
 * The toggle button. `apply` hides or shows the section; it's called right
 * away (expanded), again once the stored state is read, and on each click.
 */
export function collapseToggle(
  storageKey: string,
  apply: (collapsed: boolean) => void,
  what = "this section"
): HTMLButtonElement {
  const button = el("button", { type: "button", class: "hfgs-collapse" });
  let collapsed = false;
  const set = (value: boolean) => {
    collapsed = value;
    button.textContent = collapsed ? "▼ Show" : "▲ Hide";
    button.title = `${collapsed ? "Show" : "Hide"} ${what}`;
    button.setAttribute("aria-expanded", String(!collapsed));
    apply(collapsed);
  };
  set(false);
  chrome.storage.local
    .get(storageKey)
    .then((stored) => set(stored?.[storageKey] === true))
    .catch(() => undefined);
  button.addEventListener("click", () => {
    set(!collapsed);
    chrome.storage.local
      .set({ [storageKey]: collapsed })
      .catch(() => undefined);
  });
  return button;
}
