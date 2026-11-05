/**
 * What each game's page module does in HF's own JavaScript world, where HF's
 * game objects (`Blackjack`, `slotMachine`) and jQuery live.
 */

/** A game request HF's own page script sent (the user playing by hand). */
export interface PageRound {
  action: string;
  response: unknown;
  bet: number | null;
}

export interface PageGame {
  /**
   * Draw a response the bot already received with HF's own animations, as if
   * HF's page had sent the request. Resolves when the animation has finished.
   */
  show(action: string, response: unknown, bet: number | null): Promise<void>;
  /** Headless mode: bring HF's counters and page variables up to date. */
  sync(balance: number, details: Record<string, unknown>): void;
  /** Report the game requests HF's page sends while the user plays by hand. */
  watch(report: (round: PageRound) => void): void;
}

/** HF's page globals, loosely typed: they're HF's code, not ours. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any;

export function hfWindow(): Loose {
  return window as Loose;
}

/**
 * Call `report` with each successful jQuery request whose URL contains
 * `urlPart`. HF's game scripts use $.ajax, whose global ajaxSuccess event
 * fires on `document`. The bot's own requests use fetch and don't show up here.
 */
export function onHfAjax(
  urlPart: string,
  report: (response: unknown, requestData: URLSearchParams) => void
): void {
  const $ = hfWindow().jQuery;
  if (typeof $ !== "function") return;
  $(document).ajaxSuccess((_event: unknown, xhr: Loose, settings: Loose) => {
    if (!String(settings?.url ?? "").includes(urlPart)) return;
    let response = xhr?.responseJSON;
    if (response === undefined) {
      try {
        response = JSON.parse(xhr?.responseText ?? "");
      } catch {
        return;
      }
    }
    const data = typeof settings?.data === "string" ? settings.data : "";
    report(response, new URLSearchParams(data));
  });
}
