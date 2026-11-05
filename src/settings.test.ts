import { BlackjackSettings } from "./games/blackjack/definition";
import { normalizeNumber } from "./settings/definitions";
import {
  defaultSettings,
  gameSettings,
  loadSettings,
  normalizeSettings,
  saveSettings,
  watchSettings,
} from "./settings";

describe("normalizeNumber", () => {
  const def = { min: 1.5, max: 3, step: 0.05 };

  it("rounds to the step from min without float noise", () => {
    expect(normalizeNumber(def, "2.27")).toBe(2.25);
    expect(normalizeNumber(def, 2.03)).toBe(2.05);
    expect(normalizeNumber({ min: 500, max: 10000, step: 100 }, 1049)).toBe(
      1000
    );
  });

  it("clamps to min and max", () => {
    expect(normalizeNumber(def, 0)).toBe(1.5);
    expect(normalizeNumber(def, 99)).toBe(3);
  });

  it("rejects non-numbers", () => {
    for (const input of ["", "abc", null, undefined, true, NaN, Infinity]) {
      expect(normalizeNumber(def, input)).toBeNull();
    }
  });
});

describe("normalizeSettings", () => {
  it("fills every global and game setting with defaults", () => {
    const settings = normalizeSettings(undefined);
    expect(settings).toEqual(defaultSettings());
    expect(settings.global.actionDelayMs).toBe(1000);
    expect(gameSettings<BlackjackSettings>(settings, "blackjack").baseBet).toBe(
      2
    );
    expect(settings.games.slots.bet).toBe(1);
  });

  it("keeps valid values and replaces invalid ones", () => {
    const settings = normalizeSettings({
      global: { confirmStart: false, actionDelayMs: "abc", stopLoss: 250.4 },
      games: {
        blackjack: {
          baseBet: 5000,
          martingale: "yes",
          martingaleMultiplier: 2.5,
        },
        retired: { anything: 1 },
      },
    });
    expect(settings.global.confirmStart).toBe(false);
    expect(settings.global.actionDelayMs).toBe(1000);
    expect(settings.global.stopLoss).toBe(250);
    expect(settings.games.blackjack.baseBet).toBe(1000);
    expect(settings.games.blackjack.martingale).toBe(false);
    expect(settings.games.blackjack.martingaleMultiplier).toBe(2.5);
    expect(settings.games).not.toHaveProperty("retired");
  });
});

describe("storage", () => {
  it("round-trips through chrome.storage.local", async () => {
    const settings = defaultSettings();
    settings.games.slots.bet = 7;
    await saveSettings(settings);
    expect((await loadSettings()).games.slots.bet).toBe(7);
  });

  it("notifies watchers with normalized settings, until unsubscribed", async () => {
    const listener = jest.fn();
    const stop = watchSettings(listener);
    const settings = defaultSettings();
    settings.global.takeProfit = 100;
    await saveSettings(settings);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        global: expect.objectContaining({ takeProfit: 100 }),
      })
    );

    stop();
    await saveSettings(defaultSettings());
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
