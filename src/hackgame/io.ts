/**
 * The two ways the bot reaches HF: from the background script (any time the
 * browser runs) or from an open HF tab. Both send HF's cookies.
 */
import { pageFetch } from "../core/HfClient";
import { HackIO } from "./cycle";

const ORIGIN = "https://hackforums.net/";
const TIMEOUT_MS = 30_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function makeIO(fetchImpl: typeof fetch): HackIO {
  const request = async (path: string, init: RequestInit = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(ORIGIN + path, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
        ...init,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    get: (path) => request(path),
    post: (path, form) =>
      request(path, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
      }),
    now: () => Date.now(),
    random: () => Math.random(),
    sleep,
  };
}

/** From the background script (needs the hackforums.net host permission). */
export const backgroundIO = (): HackIO => makeIO(fetch.bind(globalThis));

/** From a content script on an HF page. */
export const tabIO = (): HackIO => makeIO(pageFetch);
