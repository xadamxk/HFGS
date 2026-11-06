import { defaultSettings, saveSettings } from "../settings";
import { resumeTabMode } from "./background";
import { idleState, saveState } from "./store";

describe("resumeTabMode", () => {
  const tabs = {
    query: jest.fn(async () => [{ id: 7 }, { id: 9 }]),
    reload: jest.fn(async () => undefined),
  };

  beforeEach(async () => {
    await chrome.storage.local.clear();
    (globalThis.chrome as unknown as { tabs: typeof tabs }).tabs = tabs;
    tabs.query.mockClear();
    tabs.reload.mockClear();
  });

  async function setMode(runInBackground: boolean, running: boolean) {
    const settings = defaultSettings();
    settings.hackgame.runInBackground = runInBackground;
    await saveSettings(settings);
    await saveState({ ...idleState(), running });
  }

  it("reloads the open Hack Game tabs after an update, so a tab-mode run carries on", async () => {
    await setMode(false, true);
    expect(await resumeTabMode()).toBe(2);
    expect(tabs.query).toHaveBeenCalledWith({
      url: "https://hackforums.net/gamecp.php*",
    });
    expect(tabs.reload.mock.calls).toEqual([[7], [9]]);
  });

  it("leaves tabs alone in background mode or when nothing is running", async () => {
    await setMode(true, true);
    expect(await resumeTabMode()).toBe(0);
    await setMode(false, false);
    expect(await resumeTabMode()).toBe(0);
    expect(tabs.reload).not.toHaveBeenCalled();
  });
});

describe("background wake-up", () => {
  it("follows the stored next step when it changes, in background mode", async () => {
    await chrome.storage.local.clear();
    const listeners: ((c: Record<string, unknown>, a: string) => void)[] = [];
    const alarms = {
      create: jest.fn(),
      clear: jest.fn(async () => true),
      onAlarm: { addListener: jest.fn() },
    };
    const g = globalThis.chrome as unknown as Record<string, unknown>;
    g.alarms = alarms;
    g.runtime = {
      ...(g.runtime as object),
      onInstalled: { addListener: jest.fn() },
      onStartup: { addListener: jest.fn() },
    };
    const realOnChanged = chrome.storage.onChanged.addListener;
    chrome.storage.onChanged.addListener = ((fn: never) => {
      listeners.push(fn);
      realOnChanged(fn);
    }) as never;
    const { registerHackGame } = await import("./background");
    registerHackGame();
    chrome.storage.onChanged.addListener = realOnChanged;

    const settings = defaultSettings();
    settings.hackgame.runInBackground = true;
    await saveSettings(settings);
    // Let the step the settings change starts finish first
    await new Promise((r) => setTimeout(r, 20));
    const nextAt = Date.now() + 120_000;
    listeners.forEach((fn) =>
      fn(
        {
          "hackgame:state": {
            oldValue: {
              ...idleState(),
              running: true,
              nextAt: nextAt + 999_000,
            },
            newValue: { ...idleState(), running: true, nextAt },
          },
        },
        "local"
      )
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(alarms.create).toHaveBeenCalledWith("hfgs-hackgame", {
      when: nextAt,
    });
  });
});
