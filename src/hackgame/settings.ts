/**
 * The Hack Game's settings. Stored with the rest under `settings.hackgame`.
 * Which jobs to play is kept apart (see store.ts), because HF's job list
 * changes and the choice is a list, not a single value.
 */
import { SettingDefinition, STOP_GROUP } from "../settings/definitions";

export interface HackGameSettings {
  runInBackground: boolean;
  minRate: number;
  waitMin: number;
  waitMax: number;
  pauseBelow: number;
  resumeAt: number;
  lockedWaitMin: number;
  stopAfterJobs: number;
}

export const HACKGAME_SETTINGS: SettingDefinition<HackGameSettings>[] = [
  {
    type: "checkbox",
    id: "runInBackground",
    label: "Run in background",
    description:
      "Keep playing with no HF tab open, as long as the browser is running and you're signed in to HF. Turn it off to play only while a Hack Game page is open in a tab.",
    default: true,
  },
  {
    type: "number",
    id: "minRate",
    group: "Jobs",
    label: "Also any job at or above (%)",
    description:
      "Besides the jobs you tick, play any job with at least this success rate, so new or renamed jobs count too. 0 turns it off.",
    default: 0,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    type: "number",
    id: "waitMin",
    group: "Timing",
    label: "Extra wait, shortest (s)",
    description:
      "After each cooldown ends, the bot waits a random extra time between the shortest and longest before the next job, so it doesn't play like clockwork.",
    default: 30,
    min: 0,
    max: 1800,
    step: 1,
  },
  {
    type: "number",
    id: "waitMax",
    group: "Timing",
    label: "Extra wait, longest (s)",
    description:
      "The longest random extra wait after a cooldown. If it's below the shortest, the two are swapped.",
    default: 180,
    min: 0,
    max: 1800,
    step: 1,
  },
  {
    type: "number",
    id: "pauseBelow",
    group: "Power",
    label: "Pause below power (%)",
    description:
      "When power drops below this, the bot stops playing until the battery has recharged.",
    default: 5,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    type: "number",
    id: "resumeAt",
    group: "Power",
    label: "Resume at power (%)",
    description:
      "After a pause for power, play starts again by itself once power is back to this. 100 waits for a full charge.",
    default: 100,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    type: "number",
    id: "lockedWaitMin",
    group: STOP_GROUP,
    label: "Locked out, check again after (min)",
    description:
      "If the FBI locks you out of the game, wait this long before checking again.",
    default: 7,
    min: 1,
    max: 240,
    step: 1,
  },
  {
    type: "number",
    id: "stopAfterJobs",
    group: STOP_GROUP,
    label: "Stop after (jobs)",
    description:
      "Stop once this many jobs have been played since you pressed Start. 0 keeps going until you press Stop.",
    default: 0,
    min: 0,
    max: 100000,
    step: 1,
  },
];

/** The random extra wait range in ms, shortest first. */
export function waitRange(settings: HackGameSettings): [number, number] {
  const a = settings.waitMin * 1000;
  const b = settings.waitMax * 1000;
  return a <= b ? [a, b] : [b, a];
}
