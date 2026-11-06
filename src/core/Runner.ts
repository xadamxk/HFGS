/**
 * The bot loop every game shares: play rounds one after another until a stop
 * condition is met. Games only implement GameEngine.playRound; the runner owns
 * starting, stopping, limits and session totals.
 *
 * Stopping is graceful: the round in progress always finishes, so the bot
 * never walks away from a half-played hand.
 */

import { HfError } from "./HfClient";
import {
  addToTotals,
  emptyTotals,
  HistoryEntry,
  RoundResult,
  toEntry,
  Totals,
} from "./history";

/** What playRound reports: the result to record, and whether the round goes on. */
export interface PlayedRound extends RoundResult {
  /**
   * This play is part of a longer round that isn't over yet (a martingale set
   * still waiting for its win), so it doesn't count toward the round limit.
   * Not stored in the history.
   */
  continues?: boolean;
}

export interface GameEngine {
  /** Play one full round (a hand, a spin) and report what happened. */
  playRound(signal: { stopRequested: boolean }): Promise<PlayedRound>;
}

export interface RunLimits {
  /**
   * Stop after this many finished rounds; null means no round limit. Plays
   * that continue a round (`PlayedRound.continues`) don't count.
   */
  maxRounds: number | null;
  /** Stop once the session has lost at least this much; 0 turns it off. */
  stopLoss: number;
  /** Stop once the session is up at least this much; 0 turns it off. */
  takeProfit: number;
}

export type RunnerState = "idle" | "running" | "stopping";

export type StopReason =
  /** `played`: every play, including those that continued a round. */
  | { kind: "rounds"; rounds: number; played: number }
  | { kind: "stopLoss"; net: number }
  | { kind: "takeProfit"; net: number }
  | { kind: "user" }
  | { kind: "error"; message: string; errorKind?: string };

export interface RunnerEvents {
  onState?: (state: RunnerState) => void;
  onRound?: (entry: HistoryEntry, session: Totals) => void | Promise<void>;
  onStop?: (reason: StopReason, session: Totals) => void;
}

export function describeStop(reason: StopReason): string {
  switch (reason.kind) {
    case "rounds":
      return `Finished ${reason.rounds} round${reason.rounds === 1 ? "" : "s"}.`;
    case "stopLoss":
      return `Stop-loss reached (${reason.net}).`;
    case "takeProfit":
      return `Take-profit reached (+${reason.net}).`;
    case "user":
      return "Stopped.";
    case "error":
      return `Stopped: ${reason.message}`;
  }
}

/**
 * When a run with these limits stops, in a sentence, for the settings.
 * `unit` names a round: ["hand", "hands"], ["set", "sets"]…
 * `warn` is set when nothing caps the losses.
 */
export function describeLimits(
  limits: RunLimits,
  unit: [string, string] = ["round", "rounds"]
): { text: string; warn: boolean } {
  const parts: string[] = [];
  if (limits.maxRounds !== null)
    parts.push(
      `after ${limits.maxRounds} ${unit[limits.maxRounds === 1 ? 0 : 1]}`
    );
  if (limits.takeProfit > 0)
    parts.push(`once it's up ${limits.takeProfit} βytes`);
  if (limits.stopLoss > 0)
    parts.push(`once it's down ${limits.stopLoss} βytes`);
  const list =
    parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}, whichever comes first`
      : parts[0];
  const text = list
    ? `Each run stops ${list}, or when you press Stop.`
    : "Each run only stops when you press Stop (or HF refuses a bet).";
  if (limits.stopLoss > 0) return { text, warn: false };
  return {
    text: `${text} There's no stop-loss, so nothing caps the losses.`,
    warn: limits.maxRounds === null,
  };
}

export class Runner {
  private state: RunnerState = "idle";
  private signal = { stopRequested: false };
  session: Totals = emptyTotals();
  /** Rounds finished this session (`session.rounds` counts every play). */
  private completed = 0;

  constructor(
    private readonly engine: GameEngine,
    private readonly events: RunnerEvents = {}
  ) {}

  get currentState(): RunnerState {
    return this.state;
  }

  /** Start a session. Resolves when it ends, with the reason. */
  async start(limits: RunLimits): Promise<StopReason> {
    if (this.state !== "idle") throw new Error("The bot is already running");
    this.session = emptyTotals();
    this.completed = 0;
    this.signal = { stopRequested: false };
    this.setState("running");

    let reason: StopReason;
    try {
      reason = await this.loop(limits);
    } catch (error) {
      reason = {
        kind: "error",
        message: (error as Error)?.message || String(error),
        errorKind: error instanceof HfError ? error.kind : undefined,
      };
    }
    this.setState("idle");
    this.events.onStop?.(reason, this.session);
    return reason;
  }

  /** Ask the bot to stop after the current round. */
  stop(): void {
    if (this.state !== "running") return;
    this.signal.stopRequested = true;
    this.setState("stopping");
  }

  private async loop(limits: RunLimits): Promise<StopReason> {
    for (;;) {
      const early = this.checkLimits(limits);
      if (early) return early;

      const { continues, ...result } = await this.engine.playRound(this.signal);
      if (!continues) this.completed++;
      const entry = toEntry(result);
      this.session = addToTotals(this.session, entry);
      await this.events.onRound?.(entry, this.session);
    }
  }

  private checkLimits(limits: RunLimits): StopReason | null {
    const { net } = this.session;
    if (this.signal.stopRequested) return { kind: "user" };
    if (limits.stopLoss > 0 && net <= -limits.stopLoss)
      return { kind: "stopLoss", net };
    if (limits.takeProfit > 0 && net >= limits.takeProfit)
      return { kind: "takeProfit", net };
    if (limits.maxRounds !== null && this.completed >= limits.maxRounds)
      return {
        kind: "rounds",
        rounds: this.completed,
        played: this.session.rounds,
      };
    return null;
  }

  private setState(state: RunnerState): void {
    this.state = state;
    this.events.onState?.(state);
  }
}
