import fs from "fs";
import path from "path";
import { estimatePower, powerReading } from "./store";

const battery = fs.readFileSync(
  path.join(__dirname, "../../fixtures/hackgame/battery.html"),
  "utf8"
);
const FULL = 1793937411 * 1000;
const MIN = 60_000;

describe("power between reads", () => {
  it("counts up from the last reading at the stored charge speed, to 100%", () => {
    const state = { power: 40, powerAt: 0, msPerPercent: 10 * MIN };
    expect(estimatePower(state, 0)).toBe(40);
    expect(estimatePower(state, 9 * MIN)).toBe(40);
    expect(estimatePower(state, 10 * MIN)).toBe(41);
    expect(estimatePower(state, 255 * MIN)).toBe(65);
    expect(estimatePower(state, 24 * 60 * MIN)).toBe(100);
  });

  it("is just the last reading until the charge speed is known", () => {
    expect(estimatePower({ power: 40, powerAt: 0 }, 60 * MIN)).toBe(40);
    expect(
      estimatePower({ power: 40, powerAt: null, msPerPercent: MIN }, 60 * MIN)
    ).toBe(40);
    expect(
      estimatePower({ power: null, powerAt: 0, msPerPercent: MIN }, 60 * MIN)
    ).toBeNull();
  });
});

describe("power readings from HF's pages", () => {
  it("takes the percent from any game page, and the charge speed from the Power Center", () => {
    const now = FULL - 2640_000;
    expect(powerReading(battery, now)).toEqual({
      power: 95,
      powerAt: now,
      msPerPercent: 528_000,
    });
    const page = battery.replace(/Full Charge:/, "");
    expect(powerReading(page, now)).toEqual({ power: 95, powerAt: now });
    // No battery icon: nothing to store
    expect(powerReading("<p>HF</p>", now)).toEqual({});
  });

  it("keeps a known speed over a reading that's too close to full to trust", () => {
    const nearlyFull = battery.replace("95 / 100 kWh", "98 / 100 kWh");
    const now = FULL - 600_000;
    expect(powerReading(nearlyFull, now, 500_000).msPerPercent).toBeUndefined();
    // With nothing known yet, it's better than nothing
    expect(powerReading(nearlyFull, now).msPerPercent).toBe(300_000);
    // An upgrade read with plenty missing replaces the old speed
    expect(powerReading(battery, FULL - 1320_000, 528_000).msPerPercent).toBe(
      264_000
    );
  });
});
