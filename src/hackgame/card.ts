/**
 * The Hack Game status card: a small card in the corner of every other Hack
 * Forums page. While auto-play runs, it shows what it's doing and a countdown
 * to its next step, from stored state only. With "Run in background" off and
 * nothing running, it's a manual control instead: a Hack button that plays the
 * picked job once, the result, and the time until HF allows the next job. Drawn in a
 * shadow root so HF's styles can't reach it. Design: docs/mocks/. It sits in
 * the bottom-right corner, or the bottom-left one when HF Convo Anywhere's chat
 * dock is on the right.
 */
import { el } from "../core/Dom";
import { STORAGE_KEYS } from "../core/storage";
import { loadSettings } from "../settings";
import { extensionAlive, formatCountdown } from "./countdown";
import { tabIO } from "./io";
import { playOnceLocked } from "./manual";
import { HackGameSettings } from "./settings";
import {
  CardPrefs,
  ChosenJob,
  HACKGAME_KEYS,
  loadChoice,
  HackState,
  loadCardPrefs,
  loadState,
  saveCardPrefs,
  startRun,
  stalledReason,
  STALLED_AFTER_MS,
  stopRun,
} from "./store";

export const GAME_URL = "https://hackforums.net/gamecp.php?action=smallhacks";

export const CARD_CSS = `
:host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 9000; font: 12px/1.4 Verdana, Arial, sans-serif; color: #ddd; }
* { box-sizing: border-box; }
.card { width: 280px; background: #1f1f1f; border: 1px solid #2b2b2b; border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,.55); overflow: hidden; }
.card.compact { width: 220px; }
.head { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 10px; background: #3d2a4b; }
.compact .head { padding: 4px 6px 4px 8px; }
.title { font-weight: bold; flex: 1; color: #fff; text-decoration: none; }
.title:hover { text-decoration: underline; }
.chip { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; padding: 1px 6px; border-radius: 9px; border: 1px solid currentColor; }
.icon { background: none; border: 0; color: #bbb; cursor: pointer; font: 14px/1 Verdana, Arial, sans-serif; padding: 2px 4px; }
.icon:hover { color: #fff; }
.body { padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.compact .body { padding: 6px 8px; gap: 4px; }
.big { display: flex; align-items: baseline; gap: 8px; }
.big .label { color: #aaa; }
.time { font-size: 22px; font-weight: bold; font-variant-numeric: tabular-nums; }
.compact .time { font-size: 16px; }
.detail, .muted { color: #999; }
.muted { color: #888; }
.bar { height: 6px; background: #2c2c2c; border-radius: 3px; position: relative; overflow: hidden; }
.compact .bar { height: 4px; }
.fill { position: absolute; top: 0; bottom: 0; left: 0; background: #e0a000; border-radius: 3px; }
.goal { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #ddd; }
.actions { display: flex; gap: 8px; align-items: center; }
.btn { background: #2d2d2d; color: #ddd; border: 1px solid #3a3a3a; border-radius: 3px; padding: 3px 10px; font: inherit; cursor: pointer; }
.compact .btn { padding: 1px 8px; }
.btn:hover { background: #383838; }
.actions a { color: #b48fd4; text-decoration: none; margin-left: auto; }
.actions a:hover { text-decoration: underline; }
.reason { padding: 6px 8px; border-radius: 4px; background: #262626; }
.reason.error { background: #3a1a1a; color: #ffb3b3; }
.ok { color: #4AD635; } .bad { color: #ff2121; }
.s-playing { color: #4AD635; } .s-waiting { color: #ff4710; } .s-recharging { color: #e0a000; }
.s-locked { color: #ff2121; } .s-stopped { color: #aaa; } .s-error { color: #ff2121; }
.pill { display: inline-flex; align-items: center; gap: 6px; background: #1f1f1f; border: 1px solid #2b2b2b; border-radius: 14px; padding: 4px 10px 4px 8px; box-shadow: 0 4px 14px rgba(0,0,0,.5); cursor: pointer; font: inherit; font-variant-numeric: tabular-nums; }
.pill .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.pill b { color: #fff; }
.pill .time { font-size: inherit; font-weight: normal; color: #ddd; }
.big .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.big .play { margin-left: auto; align-self: center; flex: none; }
.btn:disabled { opacity: .45; cursor: default; }
.btn:disabled:hover { background: #2d2d2d; }
.pill.manual { cursor: default; padding: 2px 4px 2px 8px; }
.pill-btn { background: none; border: 0; padding: 0; color: inherit; font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.pill .play { background: #2d2d2d; border: 1px solid #3a3a3a; border-radius: 10px; color: #ddd; font: 10px/1 Verdana, Arial, sans-serif; padding: 3px 6px; cursor: pointer; }
.pill .play:disabled { opacity: .45; cursor: default; }
`;

/** What the card needs to draw itself. */
export interface CardData {
  state: HackState;
  settings: HackGameSettings;
  prefs: CardPrefs;
  /** The job picked in HF's list, for the Hack button's tooltip. */
  job?: ChosenJob | null;
}

/** With Run in background off and nothing running, the card is a manual control. */
export function isManual(data: CardData): boolean {
  return !data.state.running && !data.settings.runInBackground;
}

interface ManualStatus {
  chip: string;
  tone: string;
  label: string;
  /** Count down to when HF allows the next job. */
  cooling: boolean;
  canPlay: boolean;
  /** Tooltip with the last result or why it didn't play. */
  title: string;
}

/** What the manual card shows: the last result, or why it didn't play, and the timer. */
export function manualStatus(state: HackState, now: number): ManualStatus {
  const cooling = state.readyAt !== null && state.readyAt > now;
  const last = state.last;
  const lastText = last
    ? `Last: ${last.job}: ${last.success ? "Success" : "Fail"} (${last.rate}%)${
        last.success
          ? `, $${last.money.toFixed(2)}, ${last.xp.toFixed(2)} xp`
          : ""
      }`
    : "";
  if (state.busy)
    return {
      chip: "Playing",
      tone: "s-playing",
      label: "Playing…",
      cooling: false,
      canPlay: false,
      title: "",
    };
  const [chip, tone] = state.note
    ? ["Not played", "s-error"]
    : last
      ? last.success
        ? ["Success", "s-playing"]
        : ["Fail", "s-error"]
      : cooling
        ? ["Cooldown", "s-waiting"]
        : ["Ready", "s-playing"];
  return {
    chip,
    tone,
    label: state.note ?? (cooling ? "Next job in" : "Ready"),
    cooling,
    canPlay: !cooling,
    title: state.note
      ? `${state.note}${lastText ? `\n${lastText}` : ""}`
      : lastText,
  };
}

const PHASES = {
  playing: { chip: "Playing", label: "" },
  waiting: { chip: "Waiting", label: "Next job in" },
  recharging: { chip: "Recharging", label: "Resumes in" },
  locked: { chip: "Locked out", label: "Checks again in" },
} as const;

const ERROR = /error|signed out|Cloudflare|post key|recognize|couldn't/i;

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** The countdown text for `nextAt`. */
export function countdownText(nextAt: number | null, now: number): string {
  return nextAt && nextAt > now
    ? formatCountdown((nextAt - now) / 1000)
    : "Any moment…";
}

/** Whether the card shows at all. */
export function cardVisible(data: CardData): boolean {
  const { state, settings, prefs } = data;
  if (!settings.statusCard) return false;
  if (state.running || isManual(data)) return true;
  // A run that stopped on its own (not by your Stop) shows why, until dismissed
  return (
    state.phase === "stopped" &&
    Boolean(state.message) &&
    state.message !== "Stopped." &&
    state.startedAt !== null &&
    prefs.dismissedRun !== state.startedAt
  );
}

export interface CardActions {
  /** Play the picked job once (the manual card's Hack button). */
  play(): void;
  stop(): void;
  start(): void;
  collapse(collapsed: boolean): void;
  dismiss(): void;
}

/** The card for this data, or null when it's hidden. */
export function renderCard(
  data: CardData,
  actions: CardActions,
  now = Date.now()
): HTMLElement | null {
  if (!cardVisible(data)) return null;
  const { state, settings, prefs } = data;
  const stopped = !state.running;
  const error = stopped && ERROR.test(state.message);
  const phase =
    stopped || state.phase === "idle" || state.phase === "stopped"
      ? null
      : PHASES[state.phase];
  const tone = stopped ? (error ? "s-error" : "s-stopped") : `s-${state.phase}`;
  const stalled = stalledReason(state, settings.runInBackground, now);
  const chipText = stalled ? "Overdue" : (phase?.chip ?? "Stopped");

  const button = (text: string, onClick: () => void, cls = "btn") => {
    const b = el("button", { type: "button", class: cls }, text);
    b.addEventListener("click", onClick);
    return b;
  };

  if (isManual(data)) return renderManual(data, actions, button, now);

  if (prefs.collapsed) {
    const pill = button("", () => actions.collapse(false), `pill ${tone}`);
    pill.title = "Hack Game auto-play: click to expand";
    pill.append(
      el("span", { class: "dot" }),
      el("b", null, "HG"),
      stalled
        ? el("span", null, "Overdue")
        : phase && phase.label
          ? el(
              "span",
              { class: "time", "data-next": state.nextAt ?? "" },
              countdownText(state.nextAt, now)
            )
          : el("span", null, chipText)
    );
    return pill;
  }

  const compact = settings.compactCard;

  const body: (HTMLElement | null)[] = [];
  if (stopped) {
    body.push(
      el("div", { class: `reason${error ? " error" : ""}` }, state.message)
    );
  } else if (state.phase === "playing") {
    body.push(
      el(
        "div",
        { class: "big" },
        el("span", { class: `time ${tone}` }, "Playing now…")
      )
    );
  } else if (stalled) {
    body.push(
      el(
        "div",
        { class: "reason error" },
        stalled.replace(/^Overdue: (\w)/, (_, c: string) => c.toUpperCase())
      )
    );
  } else {
    body.push(
      el("div", { class: "big" }, [
        el("span", { class: "label" }, phase?.label ?? ""),
        el(
          "span",
          { class: `time ${tone}`, "data-next": state.nextAt ?? "" },
          countdownText(state.nextAt, now)
        ),
      ])
    );
    if (state.phase === "recharging" && state.power !== null) {
      body.push(
        el(
          "div",
          {
            class: "bar",
            title: `Power ${state.power}% → resumes at ${settings.resumeAt}% (${state.nextAt ? clock(state.nextAt) : "soon"})`,
          },
          [
            el("div", {
              class: "fill",
              style: `width: ${Math.min(100, state.power)}%`,
            }),
            el("div", {
              class: "goal",
              style: `left: calc(${settings.resumeAt}% - 2px)`,
            }),
          ]
        )
      );
    }
  }
  // Only a stopped card has buttons; the title links to the game on every card
  if (stopped) {
    body.push(
      el("div", { class: "actions" }, [
        button("Start again", actions.start),
        el("a", { href: GAME_URL }, compact ? "Open ›" : "Open game ›"),
      ])
    );
  }

  return el(
    "div",
    {
      class: `card${compact ? " compact" : ""}`,
      "data-stalled": stalled ? "1" : null,
      role: "status",
      "aria-label": `Hack Game: ${chipText}`,
    },
    [
      el("div", { class: "head" }, [
        el(
          "a",
          { class: "title", href: GAME_URL, title: "Open Small Hack Jobs" },
          "Hack Game"
        ),
        el("span", { class: `chip ${tone}` }, chipText),
        stopped
          ? button("×", actions.dismiss, "icon")
          : button("–", () => actions.collapse(true), "icon"),
      ]),
      el("div", { class: "body" }, body),
    ]
  );
}

type ButtonMaker = (
  text: string,
  onClick: () => void,
  cls?: string
) => HTMLButtonElement;

/** The manual card: status, the timer and the Hack button, in one row. */
function renderManual(
  data: CardData,
  actions: CardActions,
  button: ButtonMaker,
  now: number
): HTMLElement {
  const { state, settings, prefs, job } = data;
  const status = manualStatus(state, now);
  const playTitle = job
    ? `Play "${job.name}" once`
    : "Pick a job in HF's Small Hack Jobs list first";
  const play = (cls: string, text: string) => {
    const b = button(text, actions.play, cls);
    b.disabled = !status.canPlay;
    b.title = playTitle;
    return b;
  };
  const time = () =>
    el(
      "span",
      { class: `time ${status.tone}`, "data-next": state.readyAt ?? "" },
      countdownText(state.readyAt, now)
    );

  if (prefs.collapsed) {
    const expand = button("", () => actions.collapse(false), "pill-btn");
    expand.title = "Hack Game: click to expand";
    expand.append(
      el("span", { class: "dot" }),
      el("b", null, "HG"),
      status.cooling && !state.busy ? time() : el("span", null, status.chip)
    );
    return el(
      "div",
      {
        class: `pill manual ${status.tone}`,
        "data-manual": "1",
        title: status.title || null,
      },
      [expand, play("play", "▶")]
    );
  }

  const compact = settings.compactCard;
  return el(
    "div",
    {
      class: `card${compact ? " compact" : ""}`,
      "data-manual": "1",
      role: "status",
      "aria-label": `Hack Game: ${status.chip}`,
    },
    [
      el("div", { class: "head" }, [
        el(
          "a",
          { class: "title", href: GAME_URL, title: "Open Small Hack Jobs" },
          "Hack Game"
        ),
        el(
          "span",
          { class: `chip ${status.tone}`, title: status.title || null },
          status.chip
        ),
        button("–", () => actions.collapse(true), "icon"),
      ]),
      el("div", { class: "body" }, [
        el("div", { class: "big", title: status.title || null }, [
          el("span", { class: "label" }, status.label),
          status.cooling ? time() : null,
          play("btn play", "Hack"),
        ]),
      ]),
    ]
  );
}

/** Keep the countdowns in a drawn card current. */
export function tickCard(root: ParentNode, now = Date.now()): void {
  root.querySelectorAll<HTMLElement>("[data-next]").forEach((node) => {
    const next = Number(node.dataset.next) || null;
    node.textContent = countdownText(next, now);
  });
}

async function loadCardData(): Promise<CardData> {
  const [state, settings, prefs, choice] = await Promise.all([
    loadState(),
    loadSettings(),
    loadCardPrefs(),
    loadChoice(),
  ]);
  return { state, settings: settings.hackgame, prefs, job: choice[0] ?? null };
}

/** HF Convo Anywhere's chat dock (a separate extension), if it's on the page. */
export const CONVO_DOCK_ID = "hfx-chat-dock";

/**
 * Which bottom corner the card goes in: the right, unless HF Convo Anywhere's
 * dock is there. Its dock and chat windows take the bottom edge on their side
 * (right by default, left with its "hfx-chat-left" class), so the card goes
 * to the other corner.
 */
export function cardCorner(doc: Document): "left" | "right" {
  const dock = doc.getElementById(CONVO_DOCK_ID);
  if (!dock) return "right";
  return dock.classList.contains("hfx-chat-left") ? "right" : "left";
}

/** Put the card in its corner. */
export function placeCard(host: HTMLElement, doc: Document): void {
  const corner = cardCorner(doc);
  host.dataset.corner = corner;
  host.style.left = corner === "left" ? "16px" : "auto";
  host.style.right = corner === "right" ? "16px" : "auto";
}

/**
 * Keep the card clear of HF Convo Anywhere's dock: move it when the dock
 * appears, goes away, or switches sides. Returns a function that stops.
 */
export function followConvoDock(host: HTMLElement, doc: Document): () => void {
  let watchedDock: HTMLElement | null = null;
  const dockObserver = new MutationObserver(() => placeCard(host, doc));
  const check = () => {
    const dock = doc.getElementById(CONVO_DOCK_ID);
    if (dock !== watchedDock) {
      dockObserver.disconnect();
      watchedDock = dock;
      if (dock)
        dockObserver.observe(dock, {
          attributes: true,
          attributeFilter: ["class"],
        });
    }
    placeCard(host, doc);
  };
  // Convo adds its dock to <body> once it has loaded
  const bodyObserver = new MutationObserver(check);
  bodyObserver.observe(doc.body, { childList: true });
  check();
  return () => {
    bodyObserver.disconnect();
    dockObserver.disconnect();
  };
}

/** Put the card on this page and keep it up to date. */
export function mountStatusCard(doc: Document = document): () => void {
  const host = doc.createElement("div");
  host.id = "hfgs-hackgame-card";
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = CARD_CSS;
  const slot = doc.createElement("div");
  shadow.append(style, slot);
  const stopFollowing = followConvoDock(host, doc);

  const actions: CardActions = {
    play: () => playOnceLocked(tabIO()).catch(() => undefined),
    stop: () => stopRun("Stopped.").catch(() => undefined),
    start: () => startRun().catch(() => undefined),
    collapse: (collapsed) =>
      saveCardPrefs({ collapsed }).catch(() => undefined),
    dismiss: () => {
      loadState()
        .then((s) => saveCardPrefs({ dismissedRun: s.startedAt }))
        .catch(() => undefined);
    },
  };

  const draw = async () => {
    const card = renderCard(await loadCardData(), actions);
    slot.replaceChildren(...(card ? [card] : []));
    if (card && !host.isConnected) doc.body.append(host);
    if (!card) host.remove();
  };
  draw().catch(() => undefined);

  const onChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => {
    if (
      area === "local" &&
      (changes[STORAGE_KEYS.settings] ||
        HACKGAME_KEYS.some((k) => k in changes))
    )
      draw().catch(() => undefined);
  };
  chrome.storage.onChanged.addListener(onChange);
  const timer = setInterval(() => {
    // The extension was updated or reloaded: this copy can't read storage any
    // more, so take the card down rather than leave it frozen (the next page
    // load shows a fresh one).
    if (!extensionAlive()) {
      clearInterval(timer);
      host.remove();
      return;
    }
    tickCard(shadow);
    // Redraw when a countdown runs out: the manual card turns Ready (and its
    // button comes back), a long-overdue step says why instead of "Any moment…"
    const manual = Boolean(shadow.querySelector("[data-manual]"));
    const due = [...shadow.querySelectorAll<HTMLElement>("[data-next]")].some(
      (node) => {
        const next = Number(node.dataset.next);
        const late = Date.now() - next;
        return next > 0 && (manual ? late >= 0 : late >= STALLED_AFTER_MS);
      }
    );
    if (due) draw().catch(() => undefined);
  }, 1000);
  return () => {
    clearInterval(timer);
    stopFollowing();
    chrome.storage.onChanged.removeListener(onChange);
    host.remove();
  };
}
