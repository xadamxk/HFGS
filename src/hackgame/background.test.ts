import { defaultSettings, saveSettings } from "../settings";
import { idleState } from "./store";
import { registerHackGame } from "./background";

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
