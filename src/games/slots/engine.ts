/**
 * The slots bot: one spin per round against HF's /slots/spin.php. Request and
 * response shapes come from captured spins (fixtures/responses/001-003).
 */

import { HfError } from "../../core/HfClient";
import { RoundResult } from "../../core/history";
import { GameEngine } from "../../core/Runner";
import { normalizeNumber } from "../../settings/definitions";
import { EngineContext, GameBot } from "../engine";
import { SLOTS_BETS, SlotsSettings } from "./definition";

export interface SlotsPrize {
  id: string;
  /** Total paid back for the spin (the bet included). */
  payoutCredits: number;
  payoutWinnings: number;
}

export interface SpinResponse {
  success: boolean;
  reels: string[];
  prize: SlotsPrize | null;
  credits: number;
  lastWin?: number;
  dayWinnings?: number;
  lifetimeWinnings?: number;
}

const SPIN_URL = "/slots/spin.php";

/** A valid bet for HF's machine, no more than the credits left (if known). */
export function slotsBet(setting: number, credits: number | null): number {
  const bet =
    normalizeNumber(
      { min: 1, max: 1000, step: 1, allowed: SLOTS_BETS },
      setting
    ) ?? 1;
  if (credits === null || credits >= bet) return bet;
  const affordable = SLOTS_BETS.filter((value) => value <= credits);
  if (!affordable.length) {
    throw new HfError("hfError", `Not enough βytes to spin (${credits} left)`);
  }
  return affordable[affordable.length - 1];
}

export function settleSpin(bet: number, response: SpinResponse): RoundResult {
  const returned = response.prize
    ? Number(response.prize.payoutCredits) || 0
    : 0;
  return {
    outcome: response.prize ? "WIN" : "LOSS",
    wagered: bet,
    returned,
    balance: response.credits,
    details: {
      reels: response.reels,
      ...(response.prize ? { prizeId: response.prize.id } : {}),
    },
  };
}

export function createSlotsEngine(context: EngineContext): GameEngine {
  let credits: number | null = null;
  return {
    async playRound() {
      if (!context.page.windowId) {
        throw new HfError(
          "hfError",
          "No windowID on the slots page; reload it and try again"
        );
      }
      const settings = context.gameSettings() as unknown as SlotsSettings;
      const bet = slotsBet(settings.bet, credits);
      const show = context.display?.() ?? null;
      context.status?.(`Spinning at ${bet} βyte${bet === 1 ? "" : "s"}…`);
      const response = await context.client.post<SpinResponse>(SPIN_URL, {
        bet,
        windowID: context.page.windowId,
        machine_name: context.page.machineName || "default",
      });
      if (
        !Array.isArray(response.reels) ||
        typeof response.credits !== "number"
      ) {
        throw new HfError(
          "nonJson",
          "HF's spin answer didn't look like a spin"
        );
      }
      credits = response.credits;
      await show?.("spin", response, bet);
      context.observe?.("spin", response);
      return settleSpin(bet, response);
    },
  };
}

export const slotsBot: GameBot = {
  createEngine: createSlotsEngine,
  summarize: (values) => {
    const s = values as unknown as SlotsSettings;
    const count = s.runUntilStopped
      ? "until stopped"
      : `${s.gamesPerSession} time${s.gamesPerSession === 1 ? "" : "s"}`;
    const bet = slotsBet(s.bet, null);
    return `Spin ${count} at ${bet} βyte${bet === 1 ? "" : "s"}?`;
  },
  fromPage: (_action, response, bet) => {
    const spin = response as SpinResponse | null;
    if (
      !spin?.success ||
      !Array.isArray(spin.reels) ||
      typeof spin.credits !== "number" ||
      bet === null
    )
      return null;
    return settleSpin(bet, spin);
  },
};
