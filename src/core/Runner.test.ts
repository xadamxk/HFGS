import { HfError } from "./HfClient";
import { RoundResult } from "./history";
import { GameEngine, Runner, RunLimits } from "./Runner";

const NO_LIMITS: RunLimits = { maxRounds: null, stopLoss: 0, takeProfit: 0 };

/** An engine that plays the given results in order, then repeats the last. */
function engine(
  results: (RoundResult | Error)[]
): GameEngine & { played: number } {
  const fake = {
    played: 0,
    async playRound() {
      const result = results[Math.min(fake.played, results.length - 1)];
      fake.played++;
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return fake;
}

const win = (n = 2): RoundResult => ({
  outcome: "WIN",
  wagered: n,
  returned: n * 2,
});
const loss = (n = 2): RoundResult => ({
  outcome: "LOSE",
  wagered: n,
  returned: 0,
});
const push = (n = 2): RoundResult => ({
  outcome: "TIE",
  wagered: n,
  returned: n,
});

describe("Runner", () => {
  it("plays the set number of rounds and keeps session totals", async () => {
    const onRound = jest.fn();
    const runner = new Runner(engine([win(), loss(), push(), win(4)]), {
      onRound,
    });
    const reason = await runner.start({ ...NO_LIMITS, maxRounds: 4 });
    expect(reason).toEqual({ kind: "rounds", rounds: 4 });
    expect(onRound).toHaveBeenCalledTimes(4);
    expect(runner.session).toMatchObject({
      rounds: 4,
      wins: 2,
      losses: 1,
      pushes: 1,
      wagered: 10,
      returned: 14,
      net: 4,
      biggestWin: 4,
    });
  });

  it("stops at the stop-loss", async () => {
    const runner = new Runner(engine([loss(5)]));
    expect(await runner.start({ ...NO_LIMITS, stopLoss: 12 })).toEqual({
      kind: "stopLoss",
      net: -15,
    });
    expect(runner.session.rounds).toBe(3);
  });

  it("stops at the take-profit", async () => {
    const runner = new Runner(engine([win(3)]));
    expect(await runner.start({ ...NO_LIMITS, takeProfit: 5 })).toEqual({
      kind: "takeProfit",
      net: 6,
    });
  });

  it("finishes the current round when asked to stop", async () => {
    let resolveRound: (r: RoundResult) => void = () => undefined;
    const states: string[] = [];
    const slow: GameEngine = {
      playRound: () => new Promise((resolve) => (resolveRound = resolve)),
    };
    const runner = new Runner(slow, { onState: (s) => states.push(s) });
    const done = runner.start(NO_LIMITS);
    await Promise.resolve();
    runner.stop();
    expect(runner.currentState).toBe("stopping");
    resolveRound(win());
    expect(await done).toEqual({ kind: "user" });
    expect(runner.session.rounds).toBe(1);
    expect(states).toEqual(["running", "stopping", "idle"]);
  });

  it("stops with the error when a round fails", async () => {
    const onStop = jest.fn();
    const runner = new Runner(
      engine([win(), new HfError("loggedOut", "HF says you're signed out")]),
      { onStop }
    );
    const reason = await runner.start(NO_LIMITS);
    expect(reason).toEqual({
      kind: "error",
      message: "HF says you're signed out",
      errorKind: "loggedOut",
    });
    expect(onStop).toHaveBeenCalledWith(
      reason,
      expect.objectContaining({ rounds: 1 })
    );
    expect(runner.currentState).toBe("idle");
  });

  it("won't start twice", async () => {
    let resolveRound: (r: RoundResult) => void = () => undefined;
    const runner = new Runner({
      playRound: () => new Promise((r) => (resolveRound = r)),
    });
    const first = runner.start({ ...NO_LIMITS, maxRounds: 1 });
    await expect(runner.start(NO_LIMITS)).rejects.toThrow("already running");
    resolveRound(win());
    await first;
  });
});
