import { defaultSettings, saveSettings } from "../settings";
import {
  CardActions,
  CardData,
  cardVisible,
  countdownText,
  GAME_URL,
  mountStatusCard,
  renderCard,
  tickCard,
} from "./card";
import { idleState, saveState } from "./store";

const NOW = new Date(2026, 10, 5, 22, 10, 29).getTime();

function data(over: Partial<CardData> = {}, state = {}): CardData {
  return {
    state: {
      ...idleState(),
      running: true,
      startedAt: NOW - 600_000,
      mode: "background",
      phase: "waiting",
      message: "Waiting for the cooldown.",
      nextAt: NOW + 91_000,
      power: 87,
      last: {
        at: NOW - 60_000,
        job: "Cracking a Public Wi-Fi Password",
        success: true,
        rate: 99,
        money: 0.44,
        xp: 0.238,
      },
      ...state,
    },
    settings: { ...defaultSettings().hackgame, runInBackground: true },
    prefs: { collapsed: false, dismissedRun: null },
    ...over,
  };
}

const actions = (): CardActions & Record<string, jest.Mock> => ({
  play: jest.fn(),
  stop: jest.fn(),
  start: jest.fn(),
  collapse: jest.fn(),
  dismiss: jest.fn(),
});
/** The big line's parts, spaced as they look (flex gap). */
const big = (card: HTMLElement) =>
  [...card.querySelector(".big")!.children].map((c) => c.textContent).join(" ");
const text = (node: HTMLElement | null) =>
  (node?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("status card", () => {
  it("shows just the status and countdown while waiting, with the title linking to the game", () => {
    const card = renderCard(data(), actions(), NOW)!;
    expect(card.querySelector(".chip")?.textContent).toBe("Waiting");
    expect(big(card)).toBe("Next job in 01:31");
    expect(card.querySelector(".detail")).toBeNull();
    expect(card.querySelector(".actions")).toBeNull();
    expect(text(card)).not.toMatch(/Last:|This run|That run|Stop|Open game/);
    const title = card.querySelector(".title") as HTMLAnchorElement;
    expect(title.tagName).toBe("A");
    expect(title.textContent).toBe("Hack Game");
    expect(title.href).toBe(GAME_URL);
  });

  it("shows power against the resume level while recharging", () => {
    const card = renderCard(
      data({}, { phase: "recharging", power: 4, nextAt: NOW + 2530_000 }),
      actions(),
      NOW
    )!;
    expect(big(card)).toBe("Resumes in 42:10");
    expect(card.querySelector(".detail")).toBeNull();
    const bar = card.querySelector(".bar") as HTMLElement;
    expect((bar.querySelector(".fill") as HTMLElement).style.width).toBe("4%");
    expect(bar.title).toMatch(/^Power 4% → resumes at 100% \(.+\)$/);
    expect(card.querySelector(".actions")).toBeNull();
  });

  it("labels playing and locked out", () => {
    const playing = renderCard(
      data(
        {},
        { phase: "playing", message: 'Playing "Spoofing a Caller ID" (90%).' }
      ),
      actions(),
      NOW
    )!;
    expect(big(playing)).toBe("Playing now…");
    expect(playing.querySelector(".detail")).toBeNull();
    expect(text(playing)).not.toMatch(/Spoofing/);
    const locked = renderCard(
      data(
        {},
        {
          phase: "locked",
          message: "Locked out by the FBI.",
          nextAt: NOW + 372_000,
        }
      ),
      actions(),
      NOW
    )!;
    expect(locked.querySelector(".chip")?.textContent).toBe("Locked out");
    expect(big(locked)).toBe("Checks again in 06:12");
    expect(locked.querySelector(".detail")).toBeNull();
  });

  it("is smaller in compact mode", () => {
    const settings = {
      ...defaultSettings().hackgame,
      runInBackground: true,
      compactCard: true,
    };
    const card = renderCard(data({ settings }), actions(), NOW)!;
    expect(card.classList.contains("compact")).toBe(true);
    expect(big(card)).toBe("Next job in 01:31");
  });

  it("shrinks to a pill and back", () => {
    const a = actions();
    const card = renderCard(data(), a, NOW)!;
    (card.querySelector(".icon") as HTMLButtonElement).click();
    expect(a.collapse).toHaveBeenCalledWith(true);

    const pill = renderCard(
      data({ prefs: { collapsed: true, dismissedRun: null } }),
      a,
      NOW
    )!;
    expect(text(pill)).toBe("HG01:31");
    pill.click();
    expect(a.collapse).toHaveBeenCalledWith(false);
  });

  it("shows why a run stopped on its own until dismissed, but not after your own Stop", () => {
    const stopped = {
      running: false,
      phase: "stopped",
      message:
        "HF showed a Cloudflare check. Open HF in a tab, then press Start again.",
    };
    const a = actions();
    const card = renderCard(data({}, stopped), a, NOW)!;
    expect(card.querySelector(".chip")?.className).toContain("s-error");
    expect(text(card.querySelector(".reason"))).toMatch(/Cloudflare check/);
    (card.querySelector(".actions button") as HTMLButtonElement).click();
    expect(a.start).toHaveBeenCalled();
    (card.querySelector(".icon") as HTMLButtonElement).click();
    expect(a.dismiss).toHaveBeenCalled();

    const d = data({}, stopped);
    expect(
      cardVisible({
        ...d,
        prefs: { collapsed: false, dismissedRun: d.state.startedAt },
      })
    ).toBe(false);
    expect(
      cardVisible(
        data({}, { running: false, phase: "stopped", message: "Stopped." })
      )
    ).toBe(false);
    expect(
      cardVisible(data({}, { running: false, phase: "idle", message: "" }))
    ).toBe(false);
  });

  it('says a run is overdue instead of counting "Any moment…" forever', () => {
    const late = { nextAt: NOW - 120_000 };
    const tab = { ...defaultSettings().hackgame, runInBackground: false };
    const card = renderCard(
      data({ settings: tab }, { ...late, mode: "tab" }),
      actions(),
      NOW
    )!;
    expect(card.dataset.stalled).toBe("1");
    expect(card.querySelector(".chip")?.textContent).toBe("Overdue");
    expect(card.querySelector(".big")).toBeNull();
    expect(card.querySelector(".actions")).toBeNull();
    expect(text(card.querySelector(".reason"))).toBe(
      "No Hack Game tab is playing. Open or reload a Hack Game page to continue."
    );
    const bg = renderCard(data({}, late), actions(), NOW)!;
    expect(text(bg.querySelector(".reason"))).toBe(
      "Waiting for the browser to wake the bot."
    );
    // Only after a grace period
    const soon = renderCard(
      data({}, { nextAt: NOW - 30_000 }),
      actions(),
      NOW
    )!;
    expect(soon.dataset.stalled).toBeUndefined();
    expect(big(soon)).toBe("Next job in Any moment…");
  });

  it("takes itself down once the extension is reloaded under the page", async () => {
    await chrome.storage.local.clear();
    document.body.replaceChildren();
    const background = defaultSettings();
    background.hackgame.runInBackground = true;
    await saveSettings(background);
    await saveState({ ...data().state, nextAt: Date.now() + 60_000 });
    const stop = mountStatusCard(document);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.getElementById("hfgs-hackgame-card")).not.toBeNull();
    const runtime = chrome.runtime as { id?: string };
    const id = runtime.id;
    runtime.id = undefined;
    try {
      await new Promise((r) => setTimeout(r, 1100));
      expect(document.getElementById("hfgs-hackgame-card")).toBeNull();
    } finally {
      runtime.id = id;
      stop();
    }
  });

  it("is hidden when the setting is off", () => {
    const settings = {
      ...defaultSettings().hackgame,
      runInBackground: true,
      statusCard: false,
    };
    expect(renderCard(data({ settings }), actions(), NOW)).toBeNull();
  });

  it("counts down every second", () => {
    const card = renderCard(data(), actions(), NOW)!;
    tickCard(card, NOW + 1000);
    expect(big(card)).toBe("Next job in 01:30");
    tickCard(card, NOW + 95_000);
    expect(big(card)).toBe("Next job in Any moment…");
    expect(countdownText(null, NOW)).toBe("Any moment…");
  });

  it("appears on the page while a run is going and goes away when stopped", async () => {
    await chrome.storage.local.clear();
    document.body.replaceChildren();
    const background = defaultSettings();
    background.hackgame.runInBackground = true;
    await saveSettings(background);
    const stop = mountStatusCard(document);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.getElementById("hfgs-hackgame-card")).toBeNull();

    await saveState({ ...data().state, nextAt: Date.now() + 60_000 });
    await new Promise((r) => setTimeout(r, 20));
    const host = document.getElementById("hfgs-hackgame-card")!;
    // Collapsed to a pill by default, until it's expanded
    const pill = host.shadowRoot?.querySelector(".pill") as HTMLElement;
    expect(pill.textContent).toMatch(/^HG\d\d:\d\d$/);
    pill.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(host.shadowRoot?.querySelector(".chip")?.textContent).toBe(
      "Waiting"
    );

    await saveState({
      ...data().state,
      running: false,
      phase: "stopped",
      message: "Stopped.",
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(document.getElementById("hfgs-hackgame-card")).toBeNull();
    stop();
  });
});

describe("manual status card (Run in background off)", () => {
  const manual = (
    state = {},
    prefs = { collapsed: false, dismissedRun: null }
  ): CardData => ({
    state: { ...idleState(), ...state },
    settings: defaultSettings().hackgame,
    prefs,
    job: { id: "28", name: "Cracking a Public Wi-Fi Password" },
  });

  it("shows Ready and a Hack button in one row when nothing is running", () => {
    const a = actions();
    const card = renderCard(manual(), a, NOW)!;
    expect(card.dataset.manual).toBe("1");
    expect(card.querySelector(".chip")?.textContent).toBe("Ready");
    const row = card.querySelector(".big")!;
    expect(card.querySelector(".body")!.children).toHaveLength(1);
    expect(row.querySelector(".label")?.textContent).toBe("Ready");
    const hack = row.querySelector("button.play") as HTMLButtonElement;
    expect(hack.textContent).toBe("Hack");
    expect(hack.disabled).toBe(false);
    expect(hack.title).toBe('Play "Cracking a Public Wi-Fi Password" once');
    hack.click();
    expect(a.play).toHaveBeenCalled();
  });

  it("shows the result and counts down to the next job, with the button off meanwhile", () => {
    const last = {
      at: NOW - 5000,
      job: "Spoofing a Caller ID",
      success: false,
      rate: 90,
      money: 0,
      xp: 0,
    };
    const card = renderCard(
      manual({ last, readyAt: NOW + 164_000 }),
      actions(),
      NOW
    )!;
    expect(card.querySelector(".chip")?.textContent).toBe("Fail");
    expect(big(card)).toBe("Next job in 02:44 Hack");
    expect(
      (card.querySelector("button.play") as HTMLButtonElement).disabled
    ).toBe(true);
    expect((card.querySelector(".big") as HTMLElement).title).toBe(
      "Last: Spoofing a Caller ID: Fail (90%)"
    );

    const won = { ...last, success: true, money: 0.44, xp: 0.238 };
    const ready = renderCard(
      manual({ last: won, readyAt: NOW - 1 }),
      actions(),
      NOW
    )!;
    expect(ready.querySelector(".chip")?.textContent).toBe("Success");
    expect(big(ready)).toBe("Ready Hack");
  });

  it("says why a job wasn't played, and shows Playing while it runs", () => {
    const blocked = renderCard(
      manual({ note: "Not enough power (4%)." }),
      actions(),
      NOW
    )!;
    expect(blocked.querySelector(".chip")?.textContent).toBe("Not played");
    expect(blocked.querySelector(".label")?.textContent).toBe(
      "Not enough power (4%)."
    );
    const busy = renderCard(manual({ busy: true }), actions(), NOW)!;
    expect(busy.querySelector(".chip")?.textContent).toBe("Playing");
    expect(
      (busy.querySelector("button.play") as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("keeps a ▶ button on the collapsed pill", () => {
    const a = actions();
    const pill = renderCard(
      manual({}, { collapsed: true, dismissedRun: null }),
      a,
      NOW
    )!;
    expect(pill.classList.contains("manual")).toBe(true);
    expect(text(pill)).toBe("HGReady▶");
    (pill.querySelector("button.play") as HTMLButtonElement).click();
    expect(a.play).toHaveBeenCalled();
    (pill.querySelector("button.pill-btn") as HTMLButtonElement).click();
    expect(a.collapse).toHaveBeenCalledWith(false);
  });

  it("offers the Hack button instead of a run left over from background mode", () => {
    const leftover = renderCard(
      manual({
        running: true,
        mode: "background",
        phase: "waiting",
        nextAt: NOW - 600_000,
      }),
      actions(),
      NOW
    )!;
    expect(leftover.dataset.manual).toBe("1");
    expect(leftover.querySelector("button.play")).not.toBeNull();
  });

  it("is the status card while a run goes, even with Run in background off", () => {
    const running = renderCard(
      manual({
        running: true,
        mode: "tab",
        phase: "waiting",
        message: "Waiting for the cooldown.",
        nextAt: NOW + 60_000,
      }),
      actions(),
      NOW
    )!;
    expect(running.dataset.manual).toBeUndefined();
    expect(running.querySelector(".chip")?.textContent).toBe("Waiting");
  });
});
