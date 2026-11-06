/**
 * The "Jobs to play" tick list, drawn from the job list the bot last read
 * from HF. Used on the game pages and the settings page; it follows changes
 * made anywhere else.
 */
import { el } from "../core/Dom";
import { STORAGE_KEYS } from "../core/storage";
import {
  ChosenJob,
  JobCache,
  loadChoice,
  loadJobCache,
  saveChoice,
} from "./store";

export interface JobsView {
  element: HTMLElement;
  dispose(): void;
}

/** `compact` lays the jobs out in columns, for the game page panel. */
export function jobsView(idPrefix: string, compact = false): JobsView {
  const element = el("div", { class: compact ? "hfgs-jobs" : "jobs" });
  let cache: JobCache | null = null;
  let choice: ChosenJob[] = [];

  const render = () => {
    if (!cache?.jobs.length) {
      element.replaceChildren(
        el(
          "p",
          { class: compact ? "hfgs-jobs-note" : "description" },
          "No jobs loaded yet. Open HF's Small Hack Jobs page once (or start the bot) and they'll appear here."
        )
      );
      return;
    }
    const ticked = (id: string, name: string) =>
      choice.some((c) => c.id === id && c.name === name);
    const rows = cache.jobs.map((job) => {
      const input = el("input", {
        type: "checkbox",
        id: `${idPrefix}-job-${job.id}`,
        checked: ticked(job.id, job.name),
      });
      input.addEventListener("change", () => {
        const others = choice.filter((c) => c.id !== job.id);
        choice = input.checked
          ? [...others, { id: job.id, name: job.name }]
          : others;
        saveChoice(choice).catch(() => undefined);
      });
      return el(
        "label",
        { class: compact ? "hfgs-job" : "choice", title: job.name },
        [
          input,
          el("span", { class: "hfgs-job-name" }, job.name),
          el("span", { class: "hfgs-job-rate" }, `${job.rate}%`),
        ]
      );
    });
    element.replaceChildren(
      el("div", { class: compact ? "hfgs-jobs-grid" : "choices" }, rows),
      cache.dropped.length
        ? el(
            "p",
            { class: compact ? "hfgs-jobs-note hfgs-warn" : "description" },
            `HF changed its job list, so these were unticked: ${cache.dropped.join(", ")}.`
          )
        : "",
      el(
        "p",
        { class: compact ? "hfgs-jobs-note" : "description" },
        `The bot picks one ticked job at random each time. List last changed ${new Date(
          cache.changedAt
        ).toLocaleString()}.`
      )
    );
  };

  const load = async () => {
    [cache, choice] = await Promise.all([loadJobCache(), loadChoice()]);
    render();
  };
  load().catch(() => undefined);

  const onChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => {
    if (
      area === "local" &&
      (changes[STORAGE_KEYS.hackgameJobs] ||
        changes[STORAGE_KEYS.hackgameChoice])
    )
      load().catch(() => undefined);
  };
  chrome.storage.onChanged.addListener(onChange);

  return {
    element,
    dispose: () => chrome.storage.onChanged.removeListener(onChange),
  };
}
