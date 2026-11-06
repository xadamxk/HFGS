/**
 * The job the bot plays: the one last picked in HF's own Small Hack Jobs list,
 * which HFGS remembers and keeps selected there. This shows it (with its
 * success rate) on the game page panel and the settings page, and follows
 * changes made anywhere else.
 */
import { el } from "../core/Dom";
import { STORAGE_KEYS } from "../core/storage";
import { GAME_URL } from "./card";
import { HackJob } from "./parse";
import {
  chosenJob,
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

/** "Job: Cracking a Public Wi-Fi Password (99%)", or how to pick one. */
export function jobsView(compact = false): JobsView {
  const element = el("div", { class: compact ? "hfgs-last" : "description" });
  let cache: JobCache | null = null;
  let choice: ChosenJob[] = [];

  const render = () => {
    const job = cache ? chosenJob(cache.jobs, choice) : null;
    const pickHere = /action=smallhacks/.test(location.search);
    const where = pickHere
      ? "in HF's list above"
      : el("a", { href: GAME_URL }, "in HF's Small Hack Jobs list");
    element.replaceChildren(
      ...(job
        ? [
            el("strong", null, "Job: "),
            `${job.name} (${job.rate}%). Pick another `,
            where,
            " to change it.",
          ]
        : [
            el("strong", null, "Job: "),
            "none yet. Pick one ",
            where,
            "; HFGS remembers it and keeps it selected.",
          ]),
      cache?.dropped.length
        ? el(
            "span",
            { class: compact ? "hfgs-warn" : "" },
            ` HF changed its job list, so "${cache.dropped.join(", ")}" was forgotten.`
          )
        : ""
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

/**
 * On HF's Small Hack Jobs page: select the remembered job, and remember the
 * job picked from now on. `jobs` is the page's list (for the names as stored).
 */
export async function rememberPickedJob(
  doc: Document,
  jobs: HackJob[]
): Promise<void> {
  const radios = [
    ...doc.querySelectorAll<HTMLInputElement>(
      'input.contract_checkbox[name="job_id"]'
    ),
  ];
  const picked = chosenJob(jobs, await loadChoice());
  if (picked) {
    const radio = radios.find((r) => r.value === picked.id);
    if (radio && !radio.checked) radio.checked = true;
  }
  for (const radio of radios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      const job = jobs.find((j) => j.id === radio.value);
      if (job)
        saveChoice([{ id: job.id, name: job.name }]).catch(() => undefined);
    });
  }
}
