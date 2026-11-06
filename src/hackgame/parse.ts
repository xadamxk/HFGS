/**
 * Reads HF's Hack Game pages (gamecp.php) from their HTML text. Text, not a
 * DOM, because the bot also runs in Chrome's service worker, which has no
 * DOMParser. Every reader is tested against saved pages in fixtures/hackgame/.
 * Checked against the live pages on 2026-11-05.
 */

export interface HackJob {
  /** HF's job_id (the radio button's value). */
  id: string;
  name: string;
  /** Success rate in percent, e.g. 85. */
  rate: number;
}

export type PageKind =
  /** An HF game page we can read. */
  | "game"
  /** HF's page, but signed out (no post key). */
  | "signedOut"
  /** Cloudflare's check page instead of HF's. */
  | "challenge"
  /** HF's "submitting too quickly" page. */
  | "flood"
  /** Something else. */
  | "unknown";

export interface JobResult {
  success: boolean;
  /** The success rate HF logged for the job. */
  rate: number;
  /** In-game cash earned ($), 0 on a fail. */
  money: number;
  xp: number;
  /** When HF logged it (ms), if the entry carries a timestamp. */
  at: number | null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const textOf = (html: string) =>
  decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** What kind of page this is. */
export function pageKind(html: string): PageKind {
  if (/submit\w* this form too quickly/i.test(html)) return "flood";
  if (
    /<title>\s*Just a moment/i.test(html) ||
    /id="challenge-(form|running|stage)"/i.test(html)
  )
    return "challenge";
  if (!/game_content_currentpage|game-top-right-icons/.test(html))
    return postKey(html) ? "unknown" : "signedOut";
  return postKey(html) ? "game" : "signedOut";
}

/** The post key HF requires on form posts, or null. */
export function postKey(html: string): string | null {
  const match =
    html.match(/name="my_post_key"\s+value="([^"]+)"/) ??
    html.match(/my_post_key\s*=\s*["']([^"']+)["']/);
  return match ? match[1] : null;
}

/** The Small Hack Jobs on offer, in HF's order. */
export function parseJobs(html: string): HackJob[] {
  const jobs: HackJob[] = [];
  // Each job: the radio input, its description, then the success rate cell
  const pattern =
    /<input\b[^>]*class="contract_checkbox"[^>]*>[\s\S]*?game_smallhack_desc">([\s\S]*?)<\/span>[\s\S]*?(\d{1,3})\s*%/g;
  for (const match of html.matchAll(pattern)) {
    const id = match[0].match(/\bvalue="(\d+)"/)?.[1];
    if (!id) continue;
    jobs.push({ id, name: textOf(match[1]), rate: Number(match[2]) });
  }
  return jobs;
}

/** Seconds until Small Hack Jobs can be played again; 0 when ready. */
export function cooldownSeconds(html: string): number {
  const match = html.match(
    /countdownTimer\(\s*['"]game-(?:countdown|button)-smallhacks['"]\s*,\s*(\d+)/
  );
  return match ? Number(match[1]) : 0;
}

/** Power (battery) in percent, from the icon on every game page; null if missing. */
export function powerPercent(html: string): number | null {
  const match = html.match(
    /<a\b[^>]*href="gamecp\.php\?action=battery"[^>]*\btitle="(\d{1,3})%"/
  );
  return match ? Number(match[1]) : null;
}

/** The FBI lock-out page. */
export function isLocked(html: string): boolean {
  return /fbi-interrogating/i.test(html);
}

/**
 * When the battery will be full (ms), from the Power Center page; null if the
 * page doesn't say (e.g. already full).
 */
export function fullChargeAt(html: string, now = Date.now()): number | null {
  const section = html.match(/Full Charge:([\s\S]{0,400})/)?.[1];
  if (!section) return null;
  const stamp = section.match(/data-timestamp="(\d+)"/);
  if (stamp) return Number(stamp[1]) * 1000;
  const inText = textOf(section).match(/In (\d+) (minute|hour|second)s?/i);
  if (!inText) return null;
  const unit =
    inText[2].toLowerCase() === "hour"
      ? 3600_000
      : inText[2].toLowerCase() === "minute"
        ? 60_000
        : 1000;
  return now + Number(inText[1]) * unit;
}

/** The newest Small Hack Job on the Logs page, or null. */
export function latestJobResult(html: string): JobResult | null {
  const start = html.indexOf("game_content_currentpage");
  const page = start >= 0 ? html.slice(start) : html;
  const index = page.indexOf(">Small Hack Job<");
  if (index < 0) return null;
  // The entry runs until the next log entry
  const rest = page.slice(index + 1);
  const next = rest.indexOf(">Small Hack Job<");
  const entry = next >= 0 ? rest.slice(0, next) : rest.slice(0, 3000);
  const stamp = entry.match(/data-timestamp="(\d+)"/);
  const text = textOf(entry);
  const outcome = text.match(
    /\b(Success|Fail)\s+(\d{1,3})%(?:\s+\$\s*([\d.,]+))?(?:\s+([\d.,]+)\s*xp)?/i
  );
  if (!outcome) return null;
  const number = (s?: string) => (s ? Number(s.replace(/,/g, "")) : 0);
  return {
    success: outcome[1].toLowerCase() === "success",
    rate: Number(outcome[2]),
    money: number(outcome[3]),
    xp: number(outcome[4]),
    at: stamp ? Number(stamp[1]) * 1000 : null,
  };
}

/** Same jobs (ids, names and rates, in order)? */
export function sameJobs(a: HackJob[], b: HackJob[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (job, i) =>
        job.id === b[i].id && job.name === b[i].name && job.rate === b[i].rate
    )
  );
}

export interface ReplyResult {
  success: boolean;
  /** HF's own words, e.g. "The owner had multi-signature security…". */
  message: string;
  /** Cash and xp, when HF's message states them (0 when it doesn't). */
  money: number;
  xp: number;
}

/**
 * The job's result from the page HF shows after Attempt Hack (it redirects to
 * Small Hack Jobs with a success or failure box above the job list). Seen
 * live on 2026-11-06 for a fail:
 * `<div class="failure"><p><em>Failed</em></p><ul><li>The owner had…</li></ul></div>`.
 * Null when the page has neither box (HF didn't play the job).
 */
export function replyResult(html: string): ReplyResult | null {
  const box = html.match(/<div class="(success|failure)">([\s\S]*?)<\/div>/i);
  if (!box) return null;
  const items = [...box[2].matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m) =>
    textOf(m[1])
  );
  const message = items.join(" ") || textOf(box[2]);
  const all = textOf(box[2]);
  const number = (s?: string) => (s ? Number(s.replace(/,/g, "")) : 0);
  return {
    success: box[1].toLowerCase() === "success",
    message,
    money: number(all.match(/\$\s*([\d.,]+)/)?.[1]),
    xp: number(all.match(/([\d.,]+)\s*xp\b/i)?.[1]),
  };
}

/** HF's error box on a page (e.g. a job it refused), as text, or null. */
export function errorMessage(html: string): string | null {
  const box = html.match(/<div class="error">([\s\S]*?)<\/div>/i);
  return box ? textOf(box[1]) || null : null;
}
