import { defaultSettings, saveSettings } from "../settings";
import {
  CardActions,
  CardData,
  cardVisible,
  countdownText,
  freshResult,
  GAME_URL,
  mountStatusCard,
  renderCard,
  RESULT_SHOW_MS,
  tickCard,
} from "./card";
import { idleState, saveCardPrefs, saveState } from "./store";

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
    const card = renderCard(data({}, late), actions(), NOW)!;
    expect(card.dataset.stalled).toBe("1");
    expect(card.querySelector(".chip")?.textContent).toBe("Overdue");
    expect(card.querySelector(".big")).toBeNull();
    expect(card.querySelector(".actions")).toBeNull();
    expect(text(card.querySelector(".reason"))).toBe(
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
    await new Promise((r) => setTimeout(r, 60));
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

  it("shows the battery next to the title, in the normal and compact card", () => {
    const card = renderCard(data(), actions(), NOW)!;
    const batt = card.querySelector(".head .batt") as HTMLElement;
    expect(batt.textContent).toBe("87%");
    expect(batt.title).toBe("Power 87%");
    expect(batt.previousElementSibling?.className).toBe("title");
    expect(batt.classList.contains("high")).toBe(true);

    const settings = {
      ...defaultSettings().hackgame,
      runInBackground: true,
      compactCard: true,
    };
    const compact = renderCard(
      data({ settings }, { power: 35 }),
      actions(),
      NOW
    )!;
    expect(compact.querySelector(".head .batt.mid")?.textContent).toBe("35%");
    const low = renderCard(data({}, { power: 12 }), actions(), NOW)!;
    expect(low.querySelector(".head .batt.low")?.textContent).toBe("12%");
    // Stopped cards too
    const stopped = renderCard(
      data({}, { running: false, phase: "stopped", message: "No job picked." }),
      actions(),
      NOW
    )!;
    expect(stopped.querySelector(".head .batt")?.textContent).toBe("87%");
  });

  it("shows the battery on the pill only when power is low, and always in its tooltip", () => {
    const collapsed = { prefs: { collapsed: true, dismissedRun: null } };
    const full = renderCard(data(collapsed), actions(), NOW)!;
    expect(full.querySelector(".batt")).toBeNull();
    expect(full.title).toMatch(/\nPower 87%$/);
    const low = renderCard(
      data(collapsed, { phase: "recharging", power: 4, nextAt: NOW + 60_000 }),
      actions(),
      NOW
    )!;
    expect(text(low)).toBe("HG4%01:00");
  });

  it("shows a played job's result for a while, then the countdown", () => {
    const last = {
      at: NOW - 4000,
      doneAt: NOW - 1000,
      job: "Hijacking a Rideshare Driver's Account",
      success: true,
      rate: 50,
      money: 3.5,
      xp: 1.25,
    };
    const card = renderCard(data({}, { last }), actions(), NOW)!;
    expect(card.querySelector(".chip")?.textContent).toBe("Success");
    expect(card.querySelector(".chip")?.className).toContain("s-playing");
    expect(big(card)).toBe("Success +$3.50 · +1.25 xp");
    const row = card.querySelector(".big") as HTMLElement;
    expect(row.dataset.until).toBe(String(NOW - 1000 + RESULT_SHOW_MS));
    expect(row.title).toBe(
      "Hijacking a Rideshare Driver's Account (50%): Success, +$3.50 · +1.25 xp"
    );
    // The pill too
    const pill = renderCard(
      data({ prefs: { collapsed: true, dismissedRun: null } }, { last }),
      actions(),
      NOW
    )!;
    expect(text(pill)).toBe("HG+$3.50");

    // A fail names the job; one without amounts just says Success
    const fail = renderCard(
      data({}, { last: { ...last, success: false, money: 0, xp: 0 } }),
      actions(),
      NOW
    )!;
    expect(fail.querySelector(".chip")?.textContent).toBe("Fail");
    expect(big(fail)).toBe("Fail Hijacking a Rideshare Driver's Account");
    const unknown = renderCard(
      data({}, { last: { ...last, money: 0, xp: 0 } }),
      actions(),
      NOW
    )!;
    expect(big(unknown)).toBe("Success ");

    // Back to the countdown once it's been up long enough
    const later = renderCard(
      data({}, { last }),
      actions(),
      NOW - 1000 + RESULT_SHOW_MS
    )!;
    expect(later.querySelector(".chip")?.textContent).toBe("Waiting");
    expect(big(later)).toBe("Next job in 01:20");
  });

  it("doesn't show a result over Playing or a stopped run's reason", () => {
    const last = {
      at: NOW - 3000,
      doneAt: NOW - 1000,
      job: "Spoofing a Caller ID",
      success: true,
      rate: 90,
      money: 0.44,
      xp: 0.2,
    };
    const playing = renderCard(
      data({}, { last, phase: "playing" }),
      actions(),
      NOW
    )!;
    expect(big(playing)).toBe("Playing now…");
    const stopped = renderCard(
      data(
        {},
        { last, running: false, phase: "stopped", message: "Finished 1 job." }
      ),
      actions(),
      NOW
    )!;
    expect(text(stopped.querySelector(".reason"))).toBe("Finished 1 job.");
    expect(stopped.querySelector(".result")).toBeNull();
    // Results stored before doneAt was kept go by when the job was played
    expect(
      freshResult({ ...idleState(), last: { ...last, doneAt: undefined } }, NOW)
    ).not.toBeNull();
    expect(
      freshResult(
        { ...idleState(), last: { ...last, doneAt: undefined } },
        NOW - 3000 + RESULT_SHOW_MS
      )
    ).toBeNull();
  });

  it("puts the countdown back by itself once a result has been up long enough", async () => {
    await chrome.storage.local.clear();
    document.body.replaceChildren();
    const background = defaultSettings();
    background.hackgame.runInBackground = true;
    await saveSettings(background);
    await saveCardPrefs({ collapsed: false });
    const doneAt = Date.now() - RESULT_SHOW_MS + 1200;
    await saveState({
      ...data().state,
      nextAt: Date.now() + 60_000,
      last: { ...data().state.last!, at: doneAt - 3000, doneAt },
    });
    const stop = mountStatusCard(document);
    try {
      await new Promise((r) => setTimeout(r, 60));
      const shadow = document.getElementById("hfgs-hackgame-card")!.shadowRoot!;
      expect(shadow.querySelector(".chip")?.textContent).toBe("Success");
      await new Promise((r) => setTimeout(r, 2100));
      expect(shadow.querySelector(".chip")?.textContent).toBe("Waiting");
      expect(shadow.querySelector(".result")).toBeNull();
    } finally {
      stop();
    }
  });

  it("counts the battery up between reads at the stored charge speed", () => {
    const charging = {
      phase: "recharging",
      power: 40,
      powerAt: NOW - 25 * 60_000,
      msPerPercent: 10 * 60_000,
      nextAt: NOW + 3600_000,
    };
    const card = renderCard(data({}, charging), actions(), NOW)!;
    expect(card.querySelector(".head .batt")?.textContent).toBe("42%");
    const bar = card.querySelector(".bar") as HTMLElement;
    expect((bar.querySelector(".fill") as HTMLElement).style.width).toBe("42%");
    expect(bar.title).toMatch(/^Power 42% → /);
    // The pill's tooltip too
    const pill = renderCard(
      data({ prefs: { collapsed: true, dismissedRun: null } }, charging),
      actions(),
      NOW
    )!;
    expect(pill.title).toMatch(/\nPower 42%$/);
  });

  it("redraws by itself when the battery has charged another percent", async () => {
    await chrome.storage.local.clear();
    document.body.replaceChildren();
    const background = defaultSettings();
    background.hackgame.runInBackground = true;
    await saveSettings(background);
    await saveCardPrefs({ collapsed: false });
    await saveState({
      ...data().state,
      nextAt: Date.now() + 600_000,
      power: 50,
      powerAt: Date.now() - 60_000 + 1200,
      msPerPercent: 60_000,
    });
    const stop = mountStatusCard(document);
    try {
      await new Promise((r) => setTimeout(r, 60));
      const shadow = document.getElementById("hfgs-hackgame-card")!.shadowRoot!;
      expect(shadow.querySelector(".batt")?.textContent).toBe("50%");
      await new Promise((r) => setTimeout(r, 2100));
      expect(shadow.querySelector(".batt")?.textContent).toBe("51%");
    } finally {
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
    await new Promise((r) => setTimeout(r, 60));
    expect(document.getElementById("hfgs-hackgame-card")).toBeNull();

    await saveState({ ...data().state, nextAt: Date.now() + 60_000 });
    await new Promise((r) => setTimeout(r, 60));
    const host = document.getElementById("hfgs-hackgame-card")!;
    // Collapsed to a pill by default, until it's expanded
    const pill = host.shadowRoot?.querySelector(".pill") as HTMLElement;
    expect(pill.textContent).toMatch(/^HG\d\d:\d\d$/);
    pill.click();
    await new Promise((r) => setTimeout(r, 60));
    expect(host.shadowRoot?.querySelector(".chip")?.textContent).toBe(
      "Waiting"
    );

    await saveState({
      ...data().state,
      running: false,
      phase: "stopped",
      message: "Stopped.",
    });
    await new Promise((r) => setTimeout(r, 60));
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
    const state = { last, readyAt: NOW + 164_000 };
    // Just played: the result first, with the button off for the cooldown
    const card = renderCard(manual(state), actions(), NOW)!;
    expect(card.querySelector(".chip")?.textContent).toBe("Fail");
    expect(big(card)).toBe("Fail Spoofing a Caller ID Hack");
    expect(
      (card.querySelector("button.play") as HTMLButtonElement).disabled
    ).toBe(true);
    expect((card.querySelector(".big") as HTMLElement).title).toBe(
      "Spoofing a Caller ID (90%): Fail"
    );

    // Then the countdown, with the result kept in the tooltip
    const later = NOW + RESULT_SHOW_MS;
    const cooling = renderCard(manual(state), actions(), later)!;
    expect(cooling.querySelector(".chip")?.textContent).toBe("Cooldown");
    expect(big(cooling)).toBe("Next job in 02:32 Hack");
    expect(
      (cooling.querySelector("button.play") as HTMLButtonElement).disabled
    ).toBe(true);
    expect((cooling.querySelector(".big") as HTMLElement).title).toBe(
      "Last: Spoofing a Caller ID: Fail (90%)"
    );

    const won = {
      ...last,
      success: true,
      money: 0.44,
      xp: 0.238,
      reason: "You got in.",
      doneAt: NOW - 1000,
    };
    const ready = renderCard(
      manual({ last: won, readyAt: NOW - 1 }),
      actions(),
      NOW
    )!;
    expect(ready.querySelector(".chip")?.textContent).toBe("Success");
    expect(big(ready)).toBe("Success +$0.44 · +0.24 xp Hack");
    expect((ready.querySelector(".big") as HTMLElement).title).toBe(
      "Spoofing a Caller ID (90%): Success, +$0.44 · +0.24 xp\nYou got in."
    );
    const after = renderCard(
      manual({ last: won, readyAt: NOW - 1 }),
      actions(),
      NOW + RESULT_SHOW_MS
    )!;
    expect(after.querySelector(".chip")?.textContent).toBe("Ready");
    expect(big(after)).toBe("Ready Hack");
  });

  it("shows a result's short form on the pill, then the timer again", () => {
    const pill = (now: number) =>
      renderCard(
        manual(
          {
            readyAt: NOW + 164_000,
            last: {
              at: NOW - 3000,
              doneAt: NOW,
              job: "Spoofing a Caller ID",
              success: true,
              rate: 90,
              money: 3.5,
              xp: 1.25,
            },
          },
          { collapsed: true, dismissedRun: null }
        ),
        actions(),
        now
      )!;
    expect(text(pill(NOW + 1000))).toBe("HG+$3.50▶");
    expect(text(pill(NOW + RESULT_SHOW_MS))).toBe("HG02:32▶");
  });

  it("shows the battery in the header, and on the pill only when low", () => {
    const card = renderCard(manual({ power: 64 }), actions(), NOW)!;
    const batt = card.querySelector(".head .batt") as HTMLElement;
    expect(batt.textContent).toBe("64%");
    expect(batt.classList.contains("high")).toBe(true);
    expect((batt.querySelector(".lvl") as HTMLElement).style.width).toBe("64%");
    // Right after the title
    expect(batt.previousElementSibling?.className).toBe("title");

    const collapsed = { collapsed: true, dismissedRun: null };
    expect(
      renderCard(
        manual({ power: 64 }, collapsed),
        actions(),
        NOW
      )!.querySelector(".batt")
    ).toBeNull();
    const low = renderCard(manual({ power: 8 }, collapsed), actions(), NOW)!;
    expect(low.querySelector(".batt.low")?.textContent).toBe("8%");
    expect(text(low)).toBe("HG8%Ready▶");
    expect((low.querySelector(".pill-btn") as HTMLElement).title).toMatch(
      /\nPower 8%$/
    );
    // Unknown until a game page or a job has been read
    expect(
      renderCard(manual({ power: null }), actions(), NOW)!.querySelector(
        ".batt"
      )
    ).toBeNull();
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
    const busy = renderCard(
      manual({ busy: true, busyAt: NOW - 1000 }),
      actions(),
      NOW
    )!;
    expect(busy.querySelector(".chip")?.textContent).toBe("Playing");
    expect(
      (busy.querySelector("button.play") as HTMLButtonElement).disabled
    ).toBe(true);

    // A press cut off by a reload or a closed tab doesn't lock the button
    const stale = renderCard(
      manual({ busy: true, busyAt: NOW - 120_000 }),
      actions(),
      NOW
    )!;
    expect(stale.querySelector(".chip")?.textContent).toBe("Ready");
    expect(
      (stale.querySelector("button.play") as HTMLButtonElement).disabled
    ).toBe(false);
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

  it("offers the Hack button even if a run is marked going, since runs need Run in background", () => {
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
    expect(running.dataset.manual).toBe("1");
    expect(running.querySelector("button.play")).not.toBeNull();
  });
});
