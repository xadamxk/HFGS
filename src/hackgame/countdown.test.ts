import { extensionAlive, formatCountdown } from "./countdown";

describe("countdown helpers", () => {
  it("formats like HF's timer", () => {
    expect(formatCountdown(164)).toBe("02:44");
    expect(formatCountdown(59.2)).toBe("01:00");
    expect(formatCountdown(3725)).toBe("01:02:05");
    expect(formatCountdown(-5)).toBe("00:00");
  });

  it("tells when the extension has been reloaded under the page", () => {
    const runtime = chrome.runtime as { id?: string };
    const id = runtime.id;
    expect(extensionAlive()).toBe(true);
    runtime.id = undefined;
    expect(extensionAlive()).toBe(false);
    runtime.id = id;
  });
});
