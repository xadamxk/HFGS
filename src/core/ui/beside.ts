import { el } from "../Dom";

export const BESIDE_CSS = `
.hfgs-beside { display: flex; justify-content: center; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.hfgs-beside > #PageContainer { flex: 0 0 auto; margin-left: 0; margin-right: 0; }
.hfgs-side { flex: 0 1 320px; min-width: 260px; max-width: 420px; box-sizing: border-box; text-align: left; padding: 10px 12px; border-radius: 6px; background: rgba(0, 0, 0, 0.35); font-size: 12px; }
.hfgs-side-title { font-weight: bold; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.15); }
`;

/**
 * Show `content` in a column to the right of `target` (HF's game box), by
 * wrapping the two in a centered flex row; it wraps underneath on narrow
 * windows. HF's game keeps its own nodes and handlers: it's only moved into
 * the wrapper. Returns a function that shows or hides the column, or null if
 * there's no target.
 */
export function mountBeside(
  target: HTMLElement | null,
  title: string,
  content: HTMLElement
): ((visible: boolean) => void) | null {
  if (!target?.parentElement) return null;
  const wrapper = el("div", { class: "hfgs-beside" });
  target.before(wrapper);
  wrapper.append(target);
  const side = el("aside", { class: "hfgs-side", "aria-label": title }, [
    el("div", { class: "hfgs-side-title" }, title),
    content,
  ]);
  wrapper.append(side);
  return (visible) => {
    side.hidden = !visible;
  };
}
