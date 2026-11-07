/**
 * The Hack Game's settings. Stored with the rest under `settings.hackgame`.
 * Which jobs to play is kept apart (see store.ts), because HF's job list
 * changes and the choice is a list, not a single value.
 */
import { SettingDefinition } from "../settings/definitions";

export interface HackGameSettings {
  runInBackground: boolean;
  statusCard: boolean;
  compactCard: boolean;
  waitMin: number;
  waitMax: number;
  pauseBelow: number;
  resumeAt: number;
  lockedWaitMin: number;
  stopAfterJobs: number;
}

/** The heading for running in the background and the settings it uses. */
export const BACKGROUND_GROUP = "Run in background";

export const HACKGAME_SETTINGS: SettingDefinition<HackGameSettings>[] = [
  {
    type: "checkbox",
    id: "statusCard",
    group: "Status card",
    label: "Status card on HF pages",
    description:
      "Show a small card in the corner of every Hack Forums page: what a run is doing and the time to its next step, or, with Run in background off, a Hack button and the time until the next job.",
    default: true,
  },
  {
    type: "checkbox",
    id: "compactCard",
    group: "Status card",
    label: "Compact card",
    description:
      "A narrower status card with tighter spacing and a smaller countdown.",
    default: false,
    enabledBy: "statusCard",
  },
  {
    type: "checkbox",
    id: "runInBackground",
    group: BACKGROUND_GROUP,
    label: "Run in background",
    description:
      "Play automatically: press Start on a Hack Game page and it keeps playing with no HF tab open, as long as the browser is running and you're signed in to HF. The settings below set how a run plays. Off (the default): the Hack button (on the status card or the Hack Game panel) plays your job once.",
    default: false,
  },
  {
    type: "number",
    id: "waitMin",
    group: BACKGROUND_GROUP,
    enabledBy: "runInBackground",
    label: "Extra wait, shortest (s)",
    description:
      "After each cooldown ends, a run waits a random extra time between the shortest and longest before the next job, so it doesn't play like clockwork. The Hack button doesn't wait.",
    default: 30,
    min: 0,
    max: 1800,
    step: 1,
  },
  {
    type: "number",
    id: "waitMax",
    group: BACKGROUND_GROUP,
    enabledBy: "runInBackground",
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
    group: BACKGROUND_GROUP,
    enabledBy: "runInBackground",
    label: "Pause below power (%)",
    description:
      "When power drops below this, a run stops playing until the battery has recharged.",
    default: 5,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    type: "number",
    id: "resumeAt",
    group: BACKGROUND_GROUP,
    enabledBy: "runInBackground",
    label: "Resume at power (%)",
    description:
      "After a pause for power, a run starts playing again by itself once power is back to this. 100 waits for a full charge.",
    default: 100,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    type: "number",
    id: "lockedWaitMin",
    group: BACKGROUND_GROUP,
    enabledBy: "runInBackground",
    label: "Locked out, check again after (min)",
    description:
      "If the FBI locks you out of the game, a run waits this long before checking again.",
    default: 7,
    min: 1,
    max: 240,
    step: 1,
  },
  {
    type: "number",
    id: "stopAfterJobs",
    group: BACKGROUND_GROUP,
    enabledBy: "runInBackground",
    label: "Stop after (jobs)",
    description:
      "Stop a run once it has played this many jobs. 0 keeps going until you press Stop.",
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
