import { describeState } from "./panel";
import { idleState } from "./store";

describe("describeState", () => {
  it("adds a countdown after the next step's time", () => {
    const nextAt = new Date(2026, 10, 5, 22, 12).getTime();
    const state = {
      ...idleState(),
      running: true,
      message: "Waiting for the cooldown.",
      nextAt,
    };
    const text = describeState(state, nextAt - 91_000);
    expect(text).toMatch(
      /^Waiting for the cooldown\. Next step at .+ \(01:31\)\.$/
    );
    expect(text).toContain(
      new Date(nextAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    );
    expect(describeState(state, nextAt - 90_000)).toMatch(/\(01:30\)\.$/);
  });

  it("leaves the time out once it's due, and when stopped", () => {
    const state = {
      ...idleState(),
      running: true,
      message: "Playing.",
      nextAt: 1000,
    };
    expect(describeState(state, 1000)).toBe("Playing.");
    expect(describeState({ ...idleState(), message: "Stopped." })).toBe(
      "Stopped."
    );
  });
});
